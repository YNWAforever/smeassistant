import { beforeAll, afterAll, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { request, type APIRequestContext, type APIResponse } from "@playwright/test";
import { ownerReviewCheckRepository } from "@/lib/repositories/owner-review-check";
import { OWNER_REVIEW_CHECK_EVENT, type OwnerCheckCommand } from "@/lib/workspace/owner-review-check";
import { assertOwnerCheckTarget } from "./owner-check-target";
import type { OwnerCheckTarget } from "./owner-check-contract";

let target: OwnerCheckTarget, owner: Pool, runtime: Pool;
let repository: ReturnType<typeof ownerReviewCheckRepository>;
let baseline: unknown;
const checks: Array<{ id: string; status: string; milliseconds: number; diagnostic?: string }> = [];
const sessions = new Map<string, Promise<APIRequestContext>>();
let counters = { ownerOperations: 0, reads: 0, syntheticAuthPosts: 0 };
let counterWrites = Promise.resolve();
let runNumber = "0";
const safe = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  return `${value?.code ?? "assertion"}:${String(value?.message ?? "unknown").split("\n")[0]}`
    .replace(/(?:https?|postgresql):\/\/\S+/g, "[redacted-url]")
    .replace(/(?:cookie|authorization|password|token)\s*[:=].*/gi, "[redacted]").slice(0, 240);
};
async function persist() {
  if (!target) return;
  await writeFile(resolve(target.evidencePath, `run-${runNumber}.json`), JSON.stringify({
    source: "Actual owned PostgreSQL16 + actual local Next API; synthetic identity provider only",
    recordedAt: new Date().toISOString(), checks, counters, realAuth: "NOT_RUN", realGoogle: "NOT_RUN",
  }, null, 2));
}
async function bump(kind: keyof typeof counters) {
  const caps = { ownerOperations: 30, reads: 60, syntheticAuthPosts: 20 };
  if (counters[kind] >= caps[kind]) throw new Error(`approved_budget_exhausted:${kind}`);
  counters[kind]++;
  counterWrites = counterWrites.then(() => writeFile(resolve(target.evidencePath, "counters.json"), JSON.stringify(counters)));
  await counterWrites;
}
async function call(context: APIRequestContext, path: string, method = "GET", data?: unknown): Promise<APIResponse> {
  const url = new URL(path, target.app);
  if (![target.app, target.mail].includes(url.origin)) throw new Error("unapproved_http_target");
  if (method === "GET") await bump("reads");
  else if (method === "POST" && /^\/api\/actions\/[^/]+\/owner-check$/.test(url.pathname)) await bump("ownerOperations");
  else if (method === "POST" && ["/api/auth/sign-in/magic-link", "/api/owner/sign-in/complete"].includes(url.pathname)) await bump("syntheticAuthPosts");
  else throw new Error("unapproved_mutation_endpoint");
  try {
    return await context.fetch(url.href, { method, data, maxRedirects: 0, timeout: 90_000,
      headers: method === "POST" ? { origin: target.app, "sec-fetch-site": "same-origin" } : undefined });
  } catch { throw new Error(`owned_http_failed:${method}:${url.pathname}`); }
}
async function signIn(email: string) {
  const context = await request.newContext({ baseURL: target.app,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" } });
  try {
    const returnTo = `/en/owner/${email === target.b.emails.owner ? target.b.slug : target.a.slug}`;
    const callback = `/auth/callback?locale=en&returnTo=${encodeURIComponent(returnTo)}&method=email`;
    const sent = await call(context, "/api/auth/sign-in/magic-link", "POST", { email, callbackURL: callback });
    if (sent.status() !== 200) throw new Error(`synthetic_sign_in_send:${sent.status()}`);
    const messages = await (await call(context, `${target.mail}/api/v1/messages`)).json();
    const message = messages.messages.find((value: { To: Array<{ Address: string }> }) => value.To.some(to => to.Address === email));
    if (!message) throw new Error("synthetic_mail_missing");
    const full = await (await call(context, `${target.mail}/api/v1/message/${message.ID}`)).json();
    const links = [...String(full.HTML).matchAll(/href=["']([^"']+)["']/g)].map(match => match[1].replaceAll("&amp;", "&"));
    let href = links.find(value => value.startsWith(`${target.app}/api/auth/verify?`));
    if (!href) throw new Error("synthetic_verify_link_missing");
    for (let count = 0; count < 8; count++) {
      const response = await call(context, href);
      if (response.status() < 300 || response.status() >= 400) break;
      const location = response.headers().location;
      if (!location) throw new Error("synthetic_callback_missing");
      href = new URL(location, target.app).href;
      if (count === 7) throw new Error("synthetic_redirect_loop");
    }
    const completed = await call(context, "/api/owner/sign-in/complete", "POST", { locale: "en", method: "email", returnTo });
    const completion = await completed.json();
    if (completed.status() !== 200 || completion.kind !== "redirect") throw new Error(`synthetic_completion:${completed.status()}:${completion.kind}:${completion.reason ?? "none"}`);
    return context;
  } catch (error) { await context.dispose(); throw error; }
}
function session(email: string) {
  if (!sessions.has(email)) sessions.set(email, signIn(email));
  return sessions.get(email)!;
}
const scope = () => ({ workspaceId: target.a.workspaceId, actionId: target.a.actionId, locationId: target.a.locationId });
async function command(overrides: Partial<OwnerCheckCommand> = {}): Promise<OwnerCheckCommand> {
  const state = await repository.load(scope());
  const latest = (await owner.query("SELECT id FROM output_versions WHERE workspace_id=$1 AND action_id=$2 ORDER BY version_no DESC LIMIT 1", [target.a.workspaceId, target.a.actionId])).rows[0].id;
  return { versionId: target.ids.v2, latestVersionId: latest, expectedRecordId: state.records.find(row => row.versionId === target.ids.v2)?.id ?? null,
    requestId: randomUUID(), decision: "checked", reviewReference: "Synthetic reviewer/date/excerpt",
    note: "Synthetic member checked the saved reply", evidenceAssetId: null,
    confirmBusiness: true, confirmReview: true, confirmReply: true, ...overrides };
}
async function post(context: APIRequestContext, body: unknown) {
  return call(context, `/api/actions/${target.a.actionId}/owner-check`, "POST", body);
}
async function direct(body: OwnerCheckCommand, action = target.a.actionId) {
  await bump("ownerOperations");
  return repository.record({ ...scope(), actionId: action, actorId: target.ownerId, locale: "en", ipHash: null, command: body });
}
async function coreSnapshot() {
  const ids = target.ids;
  return (await owner.query(`SELECT jsonb_build_object(
    'versions',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM output_versions v WHERE id=ANY($1::uuid[])),
    'deliveries',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM deliveries d WHERE workspace_id=$2),
    'applications',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM action_applications p WHERE workspace_id=$2 AND action_id=ANY($3::uuid[])),
    'actions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM actions a WHERE id=ANY($3::uuid[])),
    'usage',(SELECT jsonb_agg(to_jsonb(u) ORDER BY period) FROM workspace_usage u WHERE workspace_id=$2),
    'original_audit',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM audit_events e WHERE workspace_id=$2 AND event<>$4),
    'runs',(SELECT count(*) FROM action_runs WHERE workspace_id=$2),
    'verified_applications',(SELECT count(*) FROM action_applications WHERE workspace_id=$2 AND source='verified')
  ) AS data`, [[ids.v1, ids.v2, ids.secondVersion, ids.foreignVersion, ids.retractVersion],
    target.a.workspaceId, [target.a.actionId, ids.secondAction], OWNER_REVIEW_CHECK_EVENT])).rows[0].data;
}
function check(id: string, run: () => Promise<void>) {
  it(id, async () => {
    const started = Date.now();
    try {
      await run();
      expect(await coreSnapshot()).toEqual(baseline);
      checks.push({ id, status: "PASS", milliseconds: Date.now() - started });
      console.log(`SAFE_CASE:${JSON.stringify(checks.at(-1))}`);
    } catch (error) {
      checks.push({ id, status: "FAIL", milliseconds: Date.now() - started, diagnostic: safe(error) });
      console.log(`SAFE_CASE:${JSON.stringify(checks.at(-1))}`);
      throw new Error(`${id} failed; see sanitized receipt`);
    } finally { await persist(); }
  });
}
beforeAll(async () => {
  if (!process.env.OWNER_CHECK_APPROVED_TARGET) throw new Error("explicit_owned_fixture_required");
  target = JSON.parse(process.env.OWNER_CHECK_APPROVED_TARGET);
  runNumber = process.env.OWNER_CHECK_RUN_NUMBER ?? "0";
  const inspected = JSON.parse(execFileSync("docker", ["inspect", target.containerId], { encoding: "utf8", windowsHide: true }))[0];
  assertOwnerCheckTarget({ databaseUrl: target.ownerUrl, databaseName: target.databaseName,
    containerName: target.containerName, containerId: target.containerId, stop: () => { throw new Error("child_cannot_cleanup"); } }, inspected, target.imageId);
  const a = new URL(target.ownerUrl), b = new URL(target.runtimeUrl);
  if (a.host !== b.host || a.pathname !== b.pathname || b.username !== "fixture_runtime") throw new Error("runtime_target_drift");
  counters = await readFile(resolve(target.evidencePath, "counters.json"), "utf8").then(JSON.parse).catch(error => {
    if (error?.code === "ENOENT") return counters;
    throw new Error("counter_receipt_unreadable");
  });
  if (!Object.values(counters).every(value => Number.isSafeInteger(value) && value >= 0) ||
    counters.ownerOperations > 30 || counters.reads > 60 || counters.syntheticAuthPosts > 20) throw new Error("counter_receipt_invalid");
  owner = new Pool({ connectionString: target.ownerUrl, max: 5, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  const identity = (await owner.query("SELECT current_database() AS database,current_setting('server_version_num')::int AS version")).rows[0];
  if (identity.database !== target.databaseName || identity.version < 160000 || identity.version >= 170000) throw new Error("sql_target_drift");
  runtime = new Pool({ connectionString: target.runtimeUrl, max: 4, connectionTimeoutMillis: 10_000, statement_timeout: 30_000, application_name: "owner-check-real-runtime" });
  repository = ownerReviewCheckRepository(runtime);
  baseline = await coreSnapshot();
  await writeFile(resolve(target.evidencePath, `baseline-${runNumber}.json`), JSON.stringify(baseline, null, 2));
});
afterAll(async () => {
  await Promise.all([...sessions.values()].map(value => value.then(context => context.dispose()).catch(() => undefined)));
  await runtime?.end(); await owner?.end(); await persist();
});

check("sql-runtime-and-receipt", async () => {
  const role = (await runtime.query("SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  expect(role).toEqual({ role: "fixture_runtime", rolsuper: false, rolbypassrls: false });
  const body = await command({ evidenceAssetId: target.ids.assetA });
  const result = await direct(body);
  expect(result).toMatchObject({ ok: true, duplicate: false, record: { versionId: target.ids.v2, independent: false, evidenceLabel: "synthetic-existing-proof.png" } });
  const fresh = new Pool({ connectionString: target.runtimeUrl, connectionTimeoutMillis: 10_000 });
  try {
    const restored = await ownerReviewCheckRepository(fresh).load(scope());
    expect(restored.records.some(row => result.ok && row.id === result.record.id && row.versionId === target.ids.v2)).toBe(true);
  } finally { await fresh.end(); }
});
check("sql-untrusted-role-denied", async () => {
  const conn = await owner.connect();
  try {
    await conn.query("BEGIN"); await conn.query("SET LOCAL ROLE pg_read_all_settings");
    let code = "";
    try { await conn.query("SELECT id FROM audit_events LIMIT 1"); } catch (error) { code = String((error as { code?: string }).code); }
    expect(code).toBe("42501");
  } finally { await conn.query("ROLLBACK"); conn.release(); }
});
check("concurrency-duplicate-http", async () => {
  const context = await session(target.a.emails.owner), body = await command();
  const results = await Promise.all([post(context, body), post(context, body)]);
  expect(results.map(row => row.status()).sort()).toEqual([200, 201]);
  const data = await Promise.all(results.map(row => row.json()));
  expect(data[0].record.id).toBe(data[1].record.id);
  const count = (await owner.query("SELECT count(*) FROM audit_events WHERE workspace_id=$1 AND event=$2 AND payload#>>'{owner_check,requestId}'=$3", [target.a.workspaceId, OWNER_REVIEW_CHECK_EVENT, body.requestId])).rows[0].count;
  expect(Number(count)).toBe(1);
});
check("concurrency-conflicting-http", async () => {
  const context = await session(target.a.emails.owner), body = await command();
  const results = await Promise.all([
    post(context, { ...body, requestId: randomUUID(), decision: "later" }),
    post(context, { ...body, requestId: randomUUID(), decision: "not_found", note: "Synthetic mismatch" }),
  ]);
  expect(results.map(row => row.status()).sort()).toEqual([201, 409]);
  const loser = results.find(row => row.status() === 409)!;
  expect(await loser.json()).toMatchObject({ error: "stale_check" });
});
check("sql-row-lock-and-rollback", async () => {
  const conn = await owner.connect(), body = await command();
  let pending: ReturnType<typeof direct> | undefined;
  try {
    await conn.query("BEGIN"); await conn.query("SELECT id FROM actions WHERE workspace_id=$1 AND id=$2 FOR UPDATE", [target.a.workspaceId, target.a.actionId]);
    pending = direct(body);
    await expect.poll(async () => Number((await owner.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='owner-check-real-runtime' AND wait_event_type='Lock'")).rows[0].count), { timeout: 10_000 }).toBeGreaterThan(0);
  } finally { await conn.query("ROLLBACK"); conn.release(); }
  expect(await pending).toMatchObject({ ok: true });
  const broken = await command({ note: "\u0000" });
  let code = "";
  try { await direct(broken); } catch (error) { code = String((error as { code?: string }).code); }
  expect(code).toBe("22P05");
  expect(Number((await owner.query("SELECT count(*) FROM audit_events WHERE workspace_id=$1 AND payload#>>'{owner_check,requestId}'=$2", [target.a.workspaceId, broken.requestId])).rows[0].count)).toBe(0);
  expect((await runtime.query("SELECT 1 AS alive")).rows[0].alive).toBe(1);
});
check("permissions-api-membership-and-location", async () => {
  const entries = [
    { name: "manager-in", email: target.managerInEmail, status: 201 },
    { name: "manager-out", email: target.a.emails.manager, status: 403 },
    { name: "viewer", email: target.a.emails.viewer, status: 403 },
    { name: "foreign-owner", email: target.b.emails.owner, status: 403 },
  ];
  const matrix: unknown[] = [];
  for (const entry of entries) {
    const context = await session(entry.email);
    const before = (await repository.load(scope())).records.length;
    const response = await post(context, await command());
    expect(response.status()).toBe(entry.status);
    const after = (await repository.load(scope())).records.length;
    expect(after - before).toBe(entry.status === 201 ? 1 : 0);
    const page = await call(context, `/en/owner/${target.a.slug}/actions/${target.a.actionId}`);
    if (entry.name === "foreign-owner") {
      expect([403, 404, 303, 307, 308]).toContain(page.status());
      expect(await page.text()).not.toContain("Synthetic exact saved reply A");
    } else expect(page.status()).toBe(200);
    matrix.push({ role: entry.name, post: response.status(), read: page.status() });
  }
  const anonymous = await request.newContext({ proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" } });
  try { expect([401, 403]).toContain((await post(anonymous, await command())).status()); } finally { await anonymous.dispose(); }
  await writeFile(resolve(target.evidencePath, "permissions.json"), JSON.stringify({ identity: "Synthetic provider, real app membership/location guard and real PostgreSQL", matrix }, null, 2));
});
check("permissions-foreign-version-and-evidence", async () => {
  const context = await session(target.a.emails.owner);
  expect((await post(context, await command({ versionId: target.ids.foreignVersion }))).status()).toBe(409);
  expect((await post(context, await command({ evidenceAssetId: target.ids.assetB }))).status()).toBe(409);
  expect((await post(context, { ...await command(), verified: true })).status()).toBe(400);
  expect(await repository.load({ workspaceId: target.b.workspaceId, actionId: target.a.actionId, locationId: target.a.locationId })).toEqual({ records: [], appliedVersionIds: [] });
});
check("readback-fresh-synthetic-session-and-usage", async () => {
  const fresh = await signIn(target.a.emails.owner);
  try {
    for (const locale of ["en", "zh-HK"]) {
      const page = await call(fresh, `/${locale}/owner/${target.a.slug}/actions/${target.a.actionId}`);
      expect(page.status()).toBe(200);
      expect(await page.text()).toContain("Synthetic exact saved reply A");
    }
    const billing = await call(fresh, `/en/owner/${target.a.slug}/settings/billing`);
    expect(billing.status()).toBe(200);
    const html = await billing.text(), start = html.indexOf('class="usage-large"');
    expect(start).toBeGreaterThan(-1);
    const text = html.slice(start, start + 1800).replace(/<[^>]+>/g, " ");
    expect(text).toMatch(/2\s*\/\s*3/); expect(text).toContain("2026-10");
  } finally { await fresh.dispose(); }
  const usage = (await owner.query("SELECT period,approved_deliveries,allowance FROM workspace_usage WHERE workspace_id=$1", [target.a.workspaceId])).rows;
  expect(usage).toEqual([{ period: "2026-10", approved_deliveries: 2, allowance: 3 }]);
});
check("version-new-draft-rejects-old-tab-and-inheritance", async () => {
  const old = await command();
  await owner.query("INSERT INTO output_versions(id,workspace_id,action_id,version_no,body,author_type,approval_state) VALUES($1,$2,$3,3,'Synthetic new draft A','user','draft') ON CONFLICT(id) DO NOTHING", [target.ids.staleVersion, target.a.workspaceId, target.a.actionId]);
  const context = await session(target.a.emails.owner);
  expect((await post(context, old)).status()).toBe(409);
  expect((await post(context, await command({ versionId: target.ids.staleVersion }))).status()).toBe(409);
  const state = await repository.load(scope());
  expect(state.appliedVersionIds).not.toContain(target.ids.staleVersion);
  expect(state.records.some(row => row.versionId === target.ids.staleVersion)).toBe(false);
});
check("history-retraction-after-application-withdrawal", async () => {
  const body = await command({ versionId: target.ids.retractVersion, latestVersionId: target.ids.retractVersion, expectedRecordId: null });
  const first = await direct(body, target.ids.retractAction);
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error("historical_check_failed");
  await owner.query("UPDATE action_applications SET retracted_at=clock_timestamp(),retracted_by=$1 WHERE workspace_id=$2 AND action_id=$3", [target.ownerId, target.a.workspaceId, target.ids.retractAction]);
  await owner.query("UPDATE actions SET action_state='in_progress',completed_at=NULL WHERE workspace_id=$1 AND id=$2", [target.a.workspaceId, target.ids.retractAction]);
  const result = await direct({ ...body, requestId: randomUUID(), expectedRecordId: first.record.id, decision: "retracted", note: "Synthetic withdrawal correction" }, target.ids.retractAction);
  expect(result).toMatchObject({ ok: true, record: { decision: "retracted", previousId: first.record.id, independent: false } });
  expect((await owner.query("SELECT action_state,completed_at FROM actions WHERE workspace_id=$1 AND id=$2", [target.a.workspaceId, target.ids.retractAction])).rows[0]).toEqual({ action_state: "in_progress", completed_at: null });
  const after = await coreSnapshot();
  await writeFile(resolve(target.evidencePath, "invariants.json"), JSON.stringify({ equal: JSON.stringify(after) === JSON.stringify(baseline),
    beforeHash: createHash("sha256").update(JSON.stringify(baseline)).digest("hex"), afterHash: createHash("sha256").update(JSON.stringify(after)).digest("hex"),
    preserved: ["original versions and approvals", "two deliveries", "original applied claim/completion", "original audit", "2/3 period 2026-10", "zero runs/verified applications"] }, null, 2));
});
