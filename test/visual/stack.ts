/**
 * Visual state stack (manual tool, not run in CI; see README.md).
 *
 * Starts the owned acceptance environment (disposable Docker PostgreSQL, local
 * identity and LLM fixtures, `next dev`), seeds one merchant with the states the
 * workspace screens can show, signs each role in, writes test-results/visual/stack.json
 * and keeps running until interrupted. Captures taken before and after a CSS
 * change then read the same rows, so any pixel difference comes from the change.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext } from "@playwright/test";
import { startEnvironment, sql, type AcceptanceEnvironment } from "../e2e/environment";
import { seedMerchant, type MerchantSeed } from "../e2e/seed";
import { LEGAL_POLICY_VERSION } from "../../lib/legal/policy";
import { BROWSER_ARGS, STACK_FILE, VISUAL_DIR, type Role, type VisualStack } from "./shared";

const quote = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;
const text = (en: string, zh: string) => quote({ en, "zh-HK": zh, "zh-TW": zh });
// Fixed instants keep every rendered date identical between captures.
const AT = { scan: "2026-10-12T02:00:00Z", v1: "2026-10-13T03:00:00Z", v2: "2026-10-14T04:00:00Z", run: "2026-10-13T02:58:00Z" };

/** Runs the fixture scan through the public API, then attaches it to the merchant's primary location. */
async function attachScan(env: AcceptanceEnvironment, merchant: MerchantSeed): Promise<string> {
  const start = await fetch(`${env.app}/api/scan/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    locale: "en", market: "HK", business_name: "Kam Man House (visual fixture)", continue_without_place: true, website_url: "",
    industry: "restaurant", district: "Central", objective: "more_leads", public_evidence_consent: true, consent_policy_version: LEGAL_POLICY_VERSION,
  }) });
  if (!start.ok) throw new Error(`scan_start_failed:${start.status}:${await start.text()}`);
  const { jobId } = await start.json() as { jobId: string };
  const processed = await fetch(`${env.app}/api/scan/process`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(300_000) });
  if (!processed.ok) throw new Error(`scan_process_failed:${processed.status}`);
  sql(env.db, `update audit_jobs set workspace_id='${merchant.workspaceId}', location_id='${merchant.locationId}', completed_at='${AT.scan}' where id='${jobId}';`);
  return jobId;
}

/** Actions, versions, runs, usage and notifications for the states listed in states.ts. */
function seedStates(env: AcceptanceEnvironment, merchant: MerchantSeed): VisualStack["ids"] {
  const ids = { approved: merchant.actionId, draft: randomUUID(), needsInput: randomUUID(), completed: randomUUID() };
  const owner = sql(env.db, `select id from app_users where email='${merchant.emails.owner}';`);
  const action = (id: string, template: string, title: [string, string], priority: string, score: number, state: string, inputs = "{}") =>
    `insert into actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state,provided_inputs,required_inputs) values ('${id}','${merchant.workspaceId}','${merchant.locationId}','${template}',${text(...title)},${text("Visual fixture", "視覺測試資料")},'{}','${priority}',${score},'{}',8,'Live','${id}','${state}','${inputs}','[]');`;
  sql(env.db, [
    action(ids.draft, "social-post", ["Post this week's special", "發佈本週推介"], "urgent", 72, "in_progress", '{"text_only":true}'),
    action(ids.needsInput, "gbp-profile-fix", ["Complete opening hours", "補齊營業時間"], "medium", 30, "needs_input"),
    action(ids.completed, "ig-bio", ["Update Instagram bio", "更新 Instagram 簡介"], "low", 12, "completed"),
    `update actions set action_state='in_progress' where id='${ids.approved}';`,
    `insert into action_runs(workspace_id,action_id,agent_key,state,error,created_at,started_at,finished_at) values
      ('${merchant.workspaceId}','${ids.approved}','review_reply','failed','llm_unavailable','${AT.run}','${AT.run}','${AT.run}'),
      ('${merchant.workspaceId}','${ids.approved}','review_reply','succeeded',null,'${AT.v1}','${AT.v1}','${AT.v1}'),
      ('${merchant.workspaceId}','${ids.draft}','social_post','succeeded',null,'${AT.v1}','${AT.v1}','${AT.v1}');`,
    `insert into output_versions(workspace_id,action_id,version_no,body,author_type,approval_state,created_at) values
      ('${merchant.workspaceId}','${ids.approved}',1,'Thank you for visiting us. We are glad you enjoyed the noodles.','agent','superseded','${AT.v1}'),
      ('${merchant.workspaceId}','${ids.draft}',1,'This week: braised beef brisket noodles. Visit us in Central.','agent','draft','${AT.v1}');
     insert into output_versions(workspace_id,action_id,version_no,body,author_type,author_user_id,approval_state,approved_by,approved_at,delivery_state,created_at) values
      ('${merchant.workspaceId}','${ids.approved}',2,'Thank you for visiting us. We are glad you enjoyed the noodles, and we will pass your kind words to the kitchen.','user','${owner}','approved','${owner}','${AT.v2}','export_ready','${AT.v2}');`,
    `insert into workspace_notifications(workspace_id,user_id,kind,title,body,href,read_at,created_at) values
      ('${merchant.workspaceId}','${owner}','version.approved',${text("Reply approved", "回覆已批准")},${text("Version 2 is ready to export.", "第 2 版可以匯出。")},null,null,'${AT.v2}'),
      ('${merchant.workspaceId}','${owner}','scan.completed',${text("Scan finished", "掃描完成")},null,null,'${AT.scan}','${AT.scan}');`,
  ].join("\n"));
  return ids;
}

async function signIn(context: BrowserContext, env: AcceptanceEnvironment, merchant: MerchantSeed, role: Role) {
  const page = await context.newPage();
  const callback = `/auth/callback?locale=en&returnTo=${encodeURIComponent(`/en/owner/${merchant.slug}`)}&method=email`;
  const sent = await page.request.post(`${env.app}/api/auth/sign-in/magic-link`, { data: { email: merchant.emails[role], callbackURL: callback } });
  if (sent.status() !== 200) throw new Error(`magic_link_failed:${role}:${sent.status()}`);
  let link = "";
  for (let i = 0; i < 30 && !link; i++) {
    const list = await (await fetch(`${env.mail}/api/v1/messages`)).json() as { messages: { ID: string; To: { Address: string }[] }[] };
    const message = list.messages.find((m) => m.To.some((to) => to.Address === merchant.emails[role]));
    if (message) {
      const full = await (await fetch(`${env.mail}/api/v1/message/${message.ID}`)).json() as { HTML: string };
      link = [...full.HTML.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1].replaceAll("&amp;", "&")).find((v) => v.startsWith(`${env.app}/api/auth/verify?`)) ?? "";
    }
    if (!link) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!link) throw new Error(`magic_link_missing:${role}`);
  await page.goto(link);
  await page.waitForURL(new RegExp(`/owner/${merchant.slug}`), { timeout: 120_000 });
  await page.close();
  return context.storageState();
}

// The fixture's health check allows 60 s; a cold `next dev` compile on a slow disk can exceed it.
// A second start reuses the warm .next/dev cache.
async function start(): Promise<AcceptanceEnvironment> {
  for (let attempt = 1; ; attempt++) {
    try { return await startEnvironment(); } catch (error) {
      if (attempt === 3) throw error;
      console.log(`stack start attempt ${attempt} failed (${error instanceof Error ? error.message : error}); retrying with the warm cache`);
    }
  }
}
const env = await start();
const stop = async () => { try { await env.stop(); } finally { process.exit(0); } };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const merchant = await seedMerchant(env, "hk");
  sql(env.db, `update workspaces set business_name='錦汶館 (visual fixture)' where id='${merchant.workspaceId}';`);
  const jobId = await attachScan(env, merchant);
  const ids = seedStates(env, merchant);
  const browser = await chromium.launch({ args: BROWSER_ARGS });
  const sessions = {} as VisualStack["sessions"];
  for (const role of ["owner", "manager", "viewer"] as const) {
    const context = await browser.newContext({ baseURL: env.app });
    sessions[role] = await signIn(context, env, merchant, role);
    await context.close();
  }
  await browser.close();
  const database = sql(env.db, "select current_database();");
  const stack: VisualStack = { app: env.app, container: env.db, database, slug: merchant.slug, workspaceId: merchant.workspaceId, jobId, ids, sessions };
  mkdirSync(VISUAL_DIR, { recursive: true });
  writeFileSync(STACK_FILE, JSON.stringify(stack, null, 1));
  console.log(`visual stack ready at ${env.app} (Ctrl-C to stop)`);
} catch (error) {
  console.error(error);
  await stop();
}
