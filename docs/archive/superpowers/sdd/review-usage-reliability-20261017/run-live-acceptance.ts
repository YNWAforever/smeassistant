import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startLiveEnvironment } from "./live-environment";
import { directory, ledger, MODEL, record, scriptDirectory, holdNextResponse, releaseResponse } from "./live-relay";

type Environment = Awaited<ReturnType<typeof startLiveEnvironment>>;
type Merchant = ReturnType<Environment["seed"]>;
const path = (merchant: Merchant) => `/${merchant.language}/owner/${merchant.slug}/actions/${merchant.actionId}`;
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const startedAt = new Date().toISOString();
const firstCase = Number(process.argv.find(value => value.startsWith("--from-case="))?.split("=")[1] ?? "1");
assert.ok(Number.isInteger(firstCase) && firstCase >= 1 && firstCase <= 5, "Explicit first case must be in range 1..5");
const results: Record<string, any>[] = [];
const merchants: Merchant[] = [];
const forbidden: string[] = [];
let env: Environment | undefined, browser: Browser | undefined;

async function context(): Promise<BrowserContext> {
  const value = await browser!.newContext({ baseURL: env!.app, viewport: { width: 1280, height: 900 } });
  await value.route("**/*", route => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort("blockedbyclient"));
  value.on("request", request => {
    if (request.method() !== "GET" && /\/(?:approve|export|publish|schedule|applied)(?:\/|$)/.test(new URL(request.url()).pathname))
      forbidden.push(new URL(request.url()).pathname);
  });
  return value;
}
async function signIn(page: Page, merchant: Merchant) {
  const callback = `/auth/callback?locale=${merchant.language}&method=email&returnTo=${encodeURIComponent(path(merchant))}`;
  const response = await page.request.post("/api/auth/sign-in/magic-link", { data: { email: merchant.email, callbackURL: callback } });
  assert.equal(response.status(), 200);
  let link: string | undefined;
  for (let attempt = 0; attempt < 20 && !link; attempt++) {
    const list = await (await fetch(`${env!.mail}/api/v1/messages`)).json();
    const message = list.messages.find((row: any) => row.To.some((recipient: any) => recipient.Address === merchant.email));
    if (message) {
      const body = await (await fetch(`${env!.mail}/api/v1/message/${message.ID}`)).json();
      link = [...body.HTML.matchAll(/href=["']([^"']+)["']/g)].map((match: RegExpMatchArray) => match[1].replaceAll("&amp;", "&"))
        .find((value: string) => value.startsWith(`${env!.app}/api/auth/verify?`));
    }
    if (!link) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(link, "Local fixture sign-in link must exist");
  await page.goto(link);
  // Let the normal client completion finish before opening a protected page.
  // Early navigation can cancel completion and correctly leave membership absent.
  await page.waitForURL(new RegExp(`/owner/${merchant.slug}(?:/|\\?|$)`), { timeout: 60_000 });
  await page.goto(path(merchant));
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}
async function brand(page: Page, merchant: Merchant, facts: Record<string, string> = {}, voice = "professional") {
  const read = await page.request.get(`/api/workspaces/${merchant.workspaceId}/brand`);
  assert.equal(read.status(), 200, "Brand read must succeed under the completed fixture session");
  const current = await read.json();
  assert.ok(current.brand, "Brand API must return its persisted profile");
  const saved = await page.request.put(`/api/workspaces/${merchant.workspaceId}/brand`, {
    data: { voice, approved_claims: [], prohibited_terms: ["Guaranteed"], languages: [merchant.language], facts, expectedRevisionId: current.brand.revisionId ?? null },
  });
  assert.equal(saved.status(), 200);
  return (await saved.json()).brand;
}
function latest(merchant: Merchant) {
  const text = env!.sql(`select row_to_json(v) from (select id,version_no,body,approval_state,approved_at,first_exported_at,meta,action_run_id from output_versions where action_id='${merchant.actionId}' order by version_no desc limit 1) v;`);
  return text ? JSON.parse(text) : null;
}
function databaseReceipt(merchant: Merchant) {
  const text = env!.sql(`select json_build_object(
    'workspaceId','${merchant.workspaceId}',
    'versions',(select coalesce(json_agg(v),'[]'::json) from (select id,version_no,approval_state,approved_at,first_exported_at,action_run_id from output_versions where action_id='${merchant.actionId}' order by version_no) v),
    'runs',(select coalesce(json_agg(r),'[]'::json) from (select id,state,model,input_tokens,output_tokens,cost_usd,started_at,finished_at,input->'provider_usage' as provider_usage from action_runs where action_id='${merchant.actionId}' order by created_at) r),
    'deliveries',(select count(*) from deliveries where workspace_id='${merchant.workspaceId}'),
    'deliveryUsage',(select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}')
  );`);
  return JSON.parse(text);
}
async function generate(page: Page, merchant: Merchant, inputs?: Record<string, unknown>) {
  const began = Date.now();
  const request = async (confirmedInputs: Record<string, unknown> | undefined, attempt: number) => {
    const response = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: merchant.language, ...(confirmedInputs ? { inputs: confirmedInputs } : {}) }, timeout: 80_000 });
    assert.equal(response.status(), 200);
    const result = await response.json();
    record(`case-${merchant.caseNumber}-generation-attempt-${attempt}`, { observedAt: new Date().toISOString(), result, elapsedMs: Date.now() - began });
    record(`case-${merchant.caseNumber}-generation-database-attempt-${attempt}`, databaseReceipt(merchant));
    return result;
  };
  const result = await request(inputs, 1);
  const repeatedKnownReviewConfirmation = false;
  record(`case-${merchant.caseNumber}-last-generation`, { observedAt: new Date().toISOString(), result,
    elapsedMs: Date.now() - began, repeatedKnownReviewConfirmation });
  if (!result.versionId) throw new Error(`generation_not_saved_${result.error ?? result.state ?? "unknown"}`);
  assert.equal(latest(merchant).id, result.versionId);
  return { ...result, elapsedMs: Date.now() - began, repeatedKnownReviewConfirmation };
}
async function revise(page: Page, merchant: Merchant, intent: string) {
  const base = latest(merchant);
  const response = await page.request.post("/api/assistant/run", { data: {
    mode: "live", surface: "action", intentId: intent, locale: merchant.language,
    context: { workspaceId: merchant.workspaceId, locationId: merchant.locationId, actionId: merchant.actionId, versionId: base.id },
  }, timeout: 80_000 });
  assert.equal(response.status(), 200);
  const preview = await response.json();
  record(`case-${merchant.caseNumber}-${intent}`, preview);
  assert.ok(preview.draftRunId, "A real model preview must be persisted");
  const saved = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { assistant_run_id: preview.draftRunId, base_version_id: base.id },
  });
  assert.equal(saved.status(), 201);
  const result = await saved.json();
  const replay = await page.request.post(`/api/actions/${merchant.actionId}/versions`, {
    data: { assistant_run_id: preview.draftRunId, base_version_id: base.id },
  });
  assert.equal(replay.status(), 201);
  assert.deepEqual(await replay.json(), result);
  assert.equal(latest(merchant).id, result.versionId);
  return result;
}
async function readback(page: Page, merchant: Merchant, number: number) {
  const saved = latest(merchant);
  assert.ok(saved?.body?.trim());
  assert.equal(saved.approval_state, "draft");
  assert.equal(saved.approved_at, null); assert.equal(saved.first_exported_at, null);
  await page.goto(path(merchant)); await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await expect(page.locator("#draft-content")).toHaveValue(saved.body);
  await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  await expect(page.locator("#draft-content")).toHaveValue(saved.body);
  const fresh = await context();
  try {
    const other = await fresh.newPage();
    if (merchant.language === "zh-HK") await other.setViewportSize({ width: 390, height: 844 });
    await signIn(other, merchant);
    await expect(other.locator("#draft-content")).toHaveValue(saved.body);
    await other.screenshot({ path: `${directory}/draft-${number}-readback.png`, fullPage: true });
  } finally { await fresh.close(); }
  assert.equal(env!.sql(`select count(*) from deliveries where workspace_id='${merchant.workspaceId}';`), "0");
  assert.equal(env!.sql(`select coalesce(sum(approved_deliveries),0) from workspace_usage where workspace_id='${merchant.workspaceId}';`), "0");
  return saved;
}
function flush() {
  record("real-ai-results", { sourceSha: sha, startedAt, observedAt: new Date().toISOString(), model: MODEL,
    budgetUsd: 0, results, providerCalls: ledger.length, forbidden, humanRatings: "PENDING: user",
    deployed: false, productionDataChanged: false });
  const cards = results.map(result => `## 草稿 ${result.case}: ${result.title}\n\n合成商戶：${result.business}；語言：${result.language}；品牌語氣：${result.voice}。\n\n評論：${result.review}\n\n已確認資料／限制：${result.factScope}\n\n版本：${result.version.version_no}；狀態：未批准；保存、重載及新 fixture session 讀回一致。\n\n${result.version.body}\n\n評核（由使用者填寫）：可直接使用／只需少量修改／需大幅修改／不可用\n\n需要修改及事實問題：＿＿＿＿\n`).join("\n");
  writeFileSync(`${directory}/five-drafts-for-review.md`, `# 真實 LongCat 草稿：使用者評核\n\nSource ${sha}；合成商戶、本機隔離 DB/Auth；真實 ${MODEL} 回覆。未批准、未發佈、未部署。\n\n${cards}\n\n真人 4/5 品質門檻：待使用者評核，沒有模型自評。\n`);
}

async function main() {
  if (existsSync(`${directory}/real-ai-results.json`)) throw new Error("refusing_to_overwrite_live_run");
  record("live-run-source", { startedAt, sourceSha: sha, firstCase, scripts: ["live-relay.ts", "live-environment.ts", "run-live-acceptance.ts"].map(file => ({
    file, sha256: createHash("sha256").update(readFileSync(`${scriptDirectory}/${file}`)).digest("hex"),
  })), trackedDiffSha256: createHash("sha256").update(execFileSync("git", ["diff", "--binary"])).digest("hex"),
    newSource: ["lib/agents/review-source.ts", "lib/workspace/provider-attempt.ts", "lib/workspace/provider-usage.ts"]
      .map(file => ({ file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") })) });
  env = await startLiveEnvironment();
  browser = await chromium.launch({ headless: true, args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"] });
  const cases = [
    { title: "已有品牌：第一份回覆", language: "en", review: "The team explained the options clearly and were patient with my questions. Thank you.", factScope: "Professional voice; no confirmed address, prices, offers, hours or operational promises." },
    { title: "資料不完整：只用已知評論", language: "zh-HK", review: "等咗一陣，但職員有耐心解答問題。", factScope: "未設定地址、電話、營業時間、優惠或改善承諾；必要評論先追問，非必要資料省略。" },
    { title: "指定分店：不混用其他店資料", language: "en", review: "Thank you to the staff for answering my questions.", factScope: "Selected Branch B; Branch A's confirmed 12 Branch A Road and imported 99 Imported B Street are not authorized facts for this reply." },
    { title: "修改保存：縮短、語氣及 CTA", language: "zh-HK", review: "職員解釋清楚，態度友善，多謝你哋。", factScope: "目前品牌語氣 direct；只可邀請在評論留言補充意見，沒有實體到訪許可或優惠。" },
    { title: "舊分頁衝突後保存正確版本", language: "en", review: "I appreciate the clear explanation and friendly support.", factScope: "Professional voice; no confirmed operational promises. A stale-tab edit is explicitly compared and saved over the new base." },
  ];
  for (const [index, item] of cases.entries()) {
    if (index + 1 < firstCase) continue;
    console.log(`Starting real AI case ${index + 1}/5`);
    const merchant = env.seed(index + 1, item.language, item.review);
    merchants.push(merchant);
    const ctx = await context();
    try {
      const page = await ctx.newPage();
      await signIn(page, merchant);
      let savedBrand = await brand(page, merchant, index === 2 ? { location_id: merchant.locationId, address: "12 Branch A Road" } : {});
      if (index === 2) {
        env.sql(`update locations set address='99 Imported B Street' where id='${merchant.otherLocationId}';update actions set location_id='${merchant.otherLocationId}' where id='${merchant.actionId}';`);
      }
      if (index === 1) {
        env.sql(`update actions set provided_inputs='{"language":"zh-HK"}',required_inputs='["reviews_without_response"]'::jsonb where id='${merchant.actionId}';`);
        const calls = ledger.length;
        const missing = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: merchant.language } });
        assert.equal(missing.status(), 200);
        assert.ok((await missing.json()).factsNeeded?.includes("reviews_without_response"));
        assert.equal(ledger.length, calls);
      }
      const callStart = ledger.length;
      const first = await generate(page, merchant, index === 1 ? { reviews_without_response: item.review } : undefined);
      let voice = "professional";
      if (index === 3) {
        savedBrand = await brand(page, merchant, {}, "direct"); voice = "direct";
        for (const intent of ["shorten_review_reply", "friendlier_review_reply", "contact_review_reply"]) await revise(page, merchant, intent);
      }
      if (index === 4) {
        const base = latest(merchant), stale = await ctx.newPage();
        await stale.goto(path(merchant)); await stale.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
        const retained = `${base.body}\nThank you for taking the time to share your feedback.`;
        const newer = await page.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: `${base.body}\nWe appreciate your feedback.`, base_version_id: base.id } });
        assert.equal(newer.status(), 201);
        const head = latest(merchant);
        const conflict = await stale.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: retained, base_version_id: base.id } });
        assert.equal(conflict.status(), 409);
        assert.equal(latest(merchant).id, head.id);
        const explicit = await stale.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: retained, base_version_id: head.id } });
        assert.equal(explicit.status(), 201);
        const replay = await stale.request.post(`/api/actions/${merchant.actionId}/versions`, { data: { body: retained, base_version_id: head.id } });
        assert.equal(replay.status(), 201); assert.deepEqual(await replay.json(), await explicit.json());
        await stale.close();
      }
      const saved = await readback(page, merchant, index + 1);
      record(`case-${index + 1}-final-database`, databaseReceipt(merchant));
      if (index === 2) {
        assert.ok(!saved.body.includes("12 Branch A Road") && !saved.body.includes("99 Imported B Street"));
        assert.ok(ledger.slice(callStart).every(row => !(row.factChecks as any).includesBranchA && !(row.factChecks as any).includesImportedAddress));
      }
      results.push({ case: index + 1, ...item, business: `Synthetic UAT Merchant ${index + 1}`, voice,
        workspaceId: merchant.workspaceId, locationId: index === 2 ? merchant.otherLocationId : merchant.locationId,
        actionId: merchant.actionId, brandRevision: savedBrand.revisionId, firstSaveMs: first.elapsedMs,
        repeatedKnownReviewConfirmation: first.repeatedKnownReviewConfirmation,
        version: saved, persistedAndReloaded: true, freshFixtureSessionReadback: true, providerCalls: ledger.length - callStart,
        state: "PASS persistence; human quality pending", manualTailAdded: index === 4 });
      assert.deepEqual(forbidden, []);
      flush();
      console.log(`Saved and reread case ${index + 1}/5, version ${saved.version_no}`);
    } finally { await ctx.close(); }
  }
  assert.equal(results.length, 6 - firstCase); assert.deepEqual(forbidden, []);
  // A real response is held by the local relay to deterministically exercise
  // the unchanged output deadline. Its usage/content are never fabricated.
  const merchant = env.seed(6, "en", "Thank you for answering my questions clearly.");
  merchants.push(merchant);
  const ctx = await context();
  try {
    const page = await ctx.newPage();
    await signIn(page, merchant); await brand(page, merchant);
    const original = "Existing synthetic draft. Thank you for your feedback.";
    assert.equal((await page.request.post(`/api/actions/${merchant.actionId}/versions`,
      { data: { body: original, base_version_id: null } })).status(), 201);
    const before = ledger.length;
    holdNextResponse();
    const began = Date.now();
    const response = await page.request.post(`/api/actions/${merchant.actionId}/run`,
      { data: { locale: "en" }, timeout: 65_000 });
    assert.equal(response.status(), 200);
    const outcome = await response.json();
    const outputElapsedMs = Date.now() - began;
    assert.ok(outputElapsedMs >= 45_000 && outputElapsedMs < 55_000, "Output deadline remains bounded");
    assert.equal(outcome.state, "failed"); assert.equal(outcome.usagePending, true);
    assert.equal(ledger.length, before + 1);
    assert.equal(ledger[before].heldForLateUsageRegression, true, "Real response must have arrived before being held");
    const refused = await page.request.post(`/api/actions/${merchant.actionId}/run`, { data: { locale: "en" } });
    assert.equal(refused.status(), 409); assert.equal((await refused.json()).error, "provider_usage_pending");
    releaseResponse();
    let receipt: ReturnType<typeof databaseReceipt>;
    for (let attempt = 0; ; attempt++) {
      receipt = databaseReceipt(merchant);
      if (receipt.runs[0].provider_usage?.status === "complete") break;
      assert.ok(attempt < 30, "Late usage must settle within the existing bounded window");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal(receipt.runs[0].state, "failed");
    assert.equal(receipt.versions.length, 1);
    assert.equal(latest(merchant).body, original);
    const attempts = Object.values(receipt.runs[0].provider_usage.attempts) as any[];
    assert.equal(attempts.length, 1); assert.equal(attempts[0].late, true);
    assert.equal(receipt.runs[0].input_tokens, (ledger[before].usage as any).prompt_tokens);
    assert.equal(receipt.runs[0].output_tokens, (ledger[before].usage as any).completion_tokens);
    await readback(page, merchant, 6);
    record("real-late-usage", { result: "PASS", outputElapsedMs, totalElapsedMs: Date.now() - began, output: outcome,
      actualFreeModelResponseHeldLocally: true, inferenceCalls: 1, retryStatus: refused.status(), receipt });
  } finally { releaseResponse(); await ctx.close(); }
  const receipts = merchants.map(merchant => databaseReceipt(merchant));
  const runs = receipts.flatMap(receipt => receipt.runs);
  const providerIn = ledger.reduce((total, entry) => total + Number((entry.usage as any)?.prompt_tokens ?? NaN), 0);
  const providerOut = ledger.reduce((total, entry) => total + Number((entry.usage as any)?.completion_tokens ?? NaN), 0);
  assert.ok(Number.isFinite(providerIn) && Number.isFinite(providerOut), "Unknown provider usage cannot count as zero");
  assert.ok(runs.every(run => !run.provider_usage || run.provider_usage.status === "complete"));
  assert.equal(runs.reduce((total, run) => total + run.input_tokens, 0), providerIn);
  assert.equal(runs.reduce((total, run) => total + run.output_tokens, 0), providerOut);
  assert.ok(runs.every(run => Number(run.cost_usd) === 0));
  assert.ok(receipts.every(receipt => receipt.deliveries === 0 && receipt.deliveryUsage === 0
    && receipt.versions.every((version: any) => version.approved_at === null && version.first_exported_at === null)));
  record("usage-reconciliation", { result: "PASS", providerRequests: ledger.length, providerIn, providerOut,
    applicationIn: providerIn, applicationOut: providerOut, unresolvedAttempts: 0, applicationEstimatedCostUsd: 0,
    pricingBasis: "Exact free model, current official pricing gate before every request; invoice not checked",
    productionChanged: false, fallback: false, approvedOrPublished: false });
}
main().then(() => {
  record("live-run-result", { result: "PASS", sourceSha: sha, cases: results.length, providerCalls: ledger.length, humanQuality: "PENDING" });
}).catch(error => {
  const safe = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "acceptance_assertion_or_runtime_failure";
  record("live-run-result", { result: "FAIL", sourceSha: sha, cases: results.length, providerCalls: ledger.length, error: safe,
    errorName: error instanceof Error ? error.name : "unknown",
    frames: error instanceof Error ? error.stack?.split("\n").filter(line => /^\s+at /.test(line) && /run-live-acceptance|live-environment|live-relay/.test(line)).slice(0, 8) : [],
    message: error instanceof Error ? error.message.replace(/([?&](?:token|code|state|secret)=)[^\s&]+/gi, "$1[REDACTED]").slice(0, 600) : "unknown" });
  console.error("Live acceptance did not complete:", safe);
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (env) record("final-database-receipts", merchants.map(merchant => databaseReceipt(merchant)));
  } finally {
    try { await browser?.close(); } finally { await env?.stop(); }
  }
});
