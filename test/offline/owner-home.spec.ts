import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import type { OwnerCheckCommand, OwnerCheckRecord } from "../../lib/workspace/owner-review-check";
const id = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const WS = id(1), ACTION = id(2), V2 = id(3), V3 = id(4), LOCATION = id(5);
type Saved = { command: OwnerCheckCommand; record: OwnerCheckRecord };
type State = { saved: Saved[]; calls: OwnerCheckCommand[]; role: "owner" | "viewer"; loseNext: boolean;
  foreign: boolean; empty: boolean; usage: number; forbiddenWrites: number };
type App = { origin: string; state: State };
const root = process.cwd(), staticRoot = resolve(root, ".next/static");
const require = createRequire(import.meta.url);
const viteRequire = createRequire(createRequire(require.resolve("vitest")).resolve("vite"));
const entry = `
import React,{useEffect,useState} from "react";import{createRoot}from"react-dom/client";
import{HomeBriefView}from"./components/workspace/home-brief";
import{ActionDetailClient}from"./components/workspace/action-detail-client";
import{selectHomeReviewFollowUp}from"./lib/workspace/home-review-follow-up";
import{buildActionOverview}from"./lib/workspace/overview";
function App(){const[d,setD]=useState(window.__OWNER_HOME__);
useEffect(()=>{const refresh=async()=>{const r=await fetch("/fixture/state");if(r.ok)setD(await r.json());};
window.addEventListener("fixture:refresh",refresh);return()=>window.removeEventListener("fixture:refresh",refresh);},[]);
const locale=location.pathname.startsWith("/zh-HK")?"zh-HK":"en", zh=locale!=="en";
const title={en:"Synthetic review reply","zh-HK":"合成評論回覆","zh-TW":"合成評論回覆"};
const common={locale,workspaceSlug:"test-shop",workspaceId:d.workspaceId,timezone:"Asia/Hong_Kong",
role:d.role,locations:[{slug:"central",name:"Synthetic Central"}]};
const action=buildActionOverview({id:d.actionId,workspace_id:d.workspaceId,location_id:d.locationId,
template_key:"review-response",source:"system",source_finding_keys:[],title,summary:title,evidence:{},
priority:"medium",priority_score:50,priority_factors:[],effort_minutes:10,required_inputs:[],provided_inputs:{},
assignee_user_id:null,due_at:null,action_state:"completed",measurement_state:"awaiting_comparable_scan",
capability:"Live",created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-02T00:00:00Z"},
{location:{id:d.locationId,slug:"central",name:title},latestRun:null,latestVersion:d.versions[0],
applied:true,appliedOn:"2026-10-02T00:00:00Z",verified:false,verifiedOn:null});
const follow=selectHomeReviewFollowUp(d.candidates,{workspaceId:d.workspaceId,locationId:d.locationId,
allowedLocationIds:null,role:d.role});
const brief={locationSlug:"central",location:{id:d.locationId,slug:"central",name:"Synthetic Central"},
snapshot:null,changed:{factType:"Unknown",delta:null,base:null,head:null,reason:null,comparable:false},
priority:null,openActions:[],openActionCount:0,reviewFollowUp:follow,proof:null,
month:{resolved:0,regressed:0,awaitingApproval:follow?1:0,completed:follow?1:0,measured:0},
rescanCadenceDay:null,drafts:follow?1:0,agentStrip:{scout:false,priority:false,drafts:follow?1:0,awaiting:follow?1:0},
ledger:{resolved:[],regressed:[],decayed:[]},evidence:[],
integrations:{google:{status:"not_connected",expiresAt:null,updatedAt:null},
instagram:{handle:null,state:"unknown",limitationCode:null},website:{state:"unknown",checksPassed:null,checksEvaluated:null,observedAt:null}}};
return <main><aside className="fixture-label">OFFLINE SYNTHETIC · mock session / memory HTTP · no real DB, Auth or Google</aside>
<p data-testid="fixture-usage">Usage {d.usage}/3 · fixture period 2026-10</p>
{location.pathname.includes("/actions/")?<ActionDetailClient {...common} inScope location="central"
detail={{action,versions:d.versions,offerId:null,runs:[],measurements:[],scanInputs:[],businessContext:[],faqQuestions:[]}}
initialVersionId={new URLSearchParams(location.search).get("version")} auditRows={[]} approvedAssets={[]}
ownerCheck={d.context} ownerCheckIdentity="Synthetic merchant · Synthetic Central"/>
:<HomeBriefView {...common} workspaceName="Synthetic merchant" tier="lite" brief={brief} consentPolicyVersion="2026-07-28"/>}</main>}
createRoot(document.getElementById("root")).render(<App/>);`;
let bundle = "";
base.beforeEach(async ({ page }) => {
  page.on("pageerror", error => console.error("OFFLINE_BROWSER_ERROR", error.message));
});
base.beforeAll(async () => {
  const esbuild = viteRequire("esbuild");
  const result = await esbuild.build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true,
    platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: resolve(root, "tsconfig.json"),
    alias: { "next/link": resolve("test/offline/owner-home-navigation.tsx"),
      "next/navigation": resolve("test/offline/owner-home-navigation.tsx") },
    // Next normally substitutes client environment reads. This offline bundle
    // has no ambient configuration or credentials; optional flags are unset.
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } });
  bundle = result.outputFiles[0].text;
});
async function cssFiles(path: string) {
  return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.endsWith(".css"))
    .map(entry => resolve(path, entry.name));
}
const test = base.extend<{ app: App }>({
  app: async ({}, runFixture) => {
    const state: State = { saved: [], calls: [], role: "owner", loseNext: false, foreign: false, empty: false, usage: 2, forbiddenWrites: 0 };
    const bootstrap = () => {
      const versions = [3, 2].map(n => ({
        id: n === 2 ? V2 : V3, action_id: ACTION, version_no: n,
        body: n === 2 ? "Thank you for your review. Your feedback helps our team." : "Separate unapproved draft.",
        alt_text: null, author_type: "user", author_user_id: null, approval_state: n === 2 ? "approved" : "draft",
        delivery_state: n === 2 ? "exported" : "not_requested", approved_at: n === 2 ? "2026-10-01T00:00:00Z" : null,
        reviewer_comment: null, created_at: "2026-10-01T00:00:00Z", first_exported_at: n === 2 ? "2026-10-01T00:00:00Z" : null,
        origin: "agent_run", agentKey: null, checked: false, guardrails: [], agentNotes: [], acceptanceCriteria: [], offerRevision: null,
      }));
      const saved = state.saved[0];
      const candidate = {
        workspace_id: state.foreign ? id(8) : WS, action_id: ACTION, location_id: LOCATION,
        action_state: "completed", title: { en: state.foreign ? "Foreign secret" : "Synthetic review reply", "zh-HK": "合成評論回覆", "zh-TW": "合成評論回覆" },
        version_id: V2, version_no: 2, approval_state: "approved", delivery_state: "exported",
        applied_at: "2026-10-02T00:00:00Z", latest_version_id: V3, latest_version_no: 3, latest_approval_state: "draft",
        owner_check: saved ? { id: saved.record.id, workspace_id: WS, location_id: LOCATION,
          actor_type: "user", actor_id: id(6), event: "action.owner_review_check_recorded", entity_type: "action",
          entity_id: ACTION, created_at: saved.record.recordedAt, payload: { owner_check: saved.command } } : null,
      };
      return { workspaceId: WS, locationId: LOCATION, actionId: ACTION, role: state.role, versions,
        candidates: state.empty ? [] : [candidate], usage: state.usage,
        context: { records: state.saved.map(row => row.record), appliedVersionIds: [V2] } };
    };
    let port = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      res.setHeader("cache-control", "no-store");
      if (req.method === "POST") {
        if (url.pathname !== `/api/actions/${ACTION}/owner-check`) { state.forbiddenWrites++; res.writeHead(403).end(); return; }
        if (state.calls.length >= 8) { res.writeHead(429).end(); return; }
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const command = JSON.parse(Buffer.concat(chunks).toString()) as OwnerCheckCommand;
        state.calls.push(command); res.setHeader("content-type", "application/json");
        if (state.role !== "owner") { res.writeHead(403).end('{"error":"forbidden"}'); return; }
        const prior = state.saved.find(row => row.command.requestId === command.requestId);
        if (prior) { res.writeHead(JSON.stringify(prior.command) === JSON.stringify(command) ? 200 : 409)
          .end(JSON.stringify({ record: prior.record, duplicate: true })); return; }
        if (command.versionId !== V2 || command.latestVersionId !== V3) { res.writeHead(409).end('{"error":"stale_version"}'); return; }
        if (command.expectedRecordId !== (state.saved[0]?.record.id ?? null)) { res.writeHead(409).end('{"error":"stale_check"}'); return; }
        const record: OwnerCheckRecord = { id: String(state.saved.length + 1), versionId: V2, decision: command.decision,
          reviewReference: command.reviewReference, note: command.note, evidenceAssetId: null, evidenceLabel: null,
          previousId: command.expectedRecordId, recordedAt: `2026-10-19T03:00:0${state.saved.length + 1}.000Z`, independent: false };
        state.saved.unshift({ command, record });
        if (state.loseNext) { state.loseNext = false; res.writeHead(503).end('{"error":"unavailable"}'); return; }
        await new Promise(resolve => setTimeout(resolve, 150));
        if (!res.destroyed) res.writeHead(201).end(JSON.stringify({ record, duplicate: false }));
        return;
      }
      if (url.pathname === "/fixture/state") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(bootstrap())); return; }
      if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
      if (url.pathname === "/style.css") {
        const files = [...await cssFiles(resolve(staticRoot, "css")).catch(() => []), ...await cssFiles(resolve(staticRoot, "chunks")).catch(() => [])];
        res.setHeader("content-type", "text/css");
        res.end((await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n") +
          "body{margin:0;padding:16px;background:#fff8f2}main{max-width:1100px;margin:auto}.fixture-label{padding:10px;background:#fff1b8;border:1px solid #b87900;margin-bottom:12px}"); return;
      }
      if (url.pathname.startsWith("/_next/static/")) {
        const file = resolve(staticRoot, url.pathname.slice("/_next/static/".length));
        if (!file.startsWith(staticRoot + sep)) { res.writeHead(403).end(); return; }
        try { res.end(await readFile(file)); } catch { res.writeHead(404).end(); } return;
      }
      if (!/^\/(?:en|zh-HK)\/owner\/test-shop(?:\/actions\/[a-f0-9-]+)?$/.test(url.pathname)) { res.writeHead(403).end("Unavailable"); return; }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.__OWNER_HOME__=${JSON.stringify(bootstrap()).replaceAll("<", "\\u003c")}</script><script src="/bundle.js"></script></body></html>`);
    });
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); port = (server.address() as { port: number }).port;
    try { await runFixture({ origin: `http://127.0.0.1:${port}`, state }); }
    finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  },
});
async function fill(page: Page, zh = false, note = "Synthetic checked reply") {
  await page.getByLabel(zh ? "評論識別資料" : "Review reference", { exact: true }).fill("Synthetic reviewer · date · helpful");
  await page.getByLabel(zh ? "備註（可選）" : "Notes (optional)", { exact: true }).fill(note);
  for (const label of zh ? ["商戶及分店相符", "已找到並比對指定評論", "回覆與此已儲存版本相符"] : ["Business and branch match", "I found and matched the specified review", "The reply matches this saved version"]) {
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  }
}
for (const locale of ["en", "zh-HK"] as const) for (const width of [1440, 390]) {
  test(`${locale} ${width}px home → exact V2 check → home stays completed with V3 separate`, async ({ page, context, app }, info) => {
    const external: string[] = [], errors: string[] = [];
    await context.route("**/*", route => new URL(route.request().url()).origin === app.origin
      ? route.continue() : (external.push("blocked"), route.abort("blockedbyclient")));
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const zh = locale === "zh-HK", home = `${app.origin}/${locale}/owner/test-shop?location=central`;
    await page.goto(home);
    const card = page.getByTestId("home-review-followup");
    await expect(card).toContainText(zh ? "第 2 版" : "Version 2");
    await page.screenshot({ path: info.outputPath("home-before.png"), fullPage: true });
    const next = card.locator("a[data-next-check]");
    await next.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`version=${V2}`));
    await expect(page.getByRole("heading", { name: zh ? "店主核對 · 第 2 版" : "Owner check · Version 2" })).toBeVisible();
    await fill(page, zh);
    const save = page.getByRole("button", { name: zh ? "儲存核對" : "Save check", exact: true });
    await save.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: zh ? "返回今日首頁" : "Return to today", exact: true })).toBeDisabled();
    await expect(page.locator(".owner-review-check [role=status]")).toHaveText(zh ? "已儲存" : "Saved");
    await page.screenshot({ path: info.outputPath("version2-saved.png"), fullPage: true });
    await page.getByRole("link", { name: zh ? "返回今日首頁" : "Return to today", exact: true }).click();
    await expect(page.getByTestId("home-owner-check-status")).toHaveText(zh ? "店主已核對 · 店主聲明" : "Owner checked · statement only");
    await page.reload();
    await expect(page.getByTestId("home-review-followup")).toContainText(zh ? "已完成" : "Completed");
    await expect(page.getByTestId("fixture-usage")).toContainText("2/3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("home-saved-reloaded.png"), fullPage: true });
    await page.locator("a[data-newer-draft]").click();
    await expect(page).toHaveURL(new RegExp(`version=${V3}`));
    await expect(page.getByTestId("current-owner-check")).toContainText(zh ? "此版本尚未有店主核對" : "No owner check for this version");
    await expect(page.getByRole("button", { name: zh ? "儲存核對" : "Save check", exact: true })).toBeDisabled();
    expect(app.state.saved).toHaveLength(1); expect(app.state.saved[0].record.versionId).toBe(V2);
    expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0); expect(external).toEqual([]); expect(errors).toEqual([]);
    await writeFile(info.outputPath("result.json"), JSON.stringify({ layer: "OFFLINE mock session / memory HTTP; real product components and client validator", locale, viewport: { width, height: width === 390 ? 844 : 900 }, exactV2: true, v3Separate: true, completed: true, usage: "2/3", aiRuns: 0, unexpectedWrites: 0, errors }, null, 2));
  });
}
test("lost save response retains input and request identity before return and reload", async ({ page, app }) => {
  app.state.loseNext = true;
  await page.goto(`${app.origin}/en/owner/test-shop/actions/${ACTION}?version=${V2}&location=central`);
  await fill(page); await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.locator(".owner-review-check [role=alert]")).toContainText("not saved");
  await expect(page.getByRole("button", { name: "Return to today", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Notes (optional)", { exact: true })).toHaveValue("Synthetic checked reply");
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.locator(".owner-review-check [role=status]")).toHaveText("Saved");
  await page.getByRole("link", { name: "Return to today", exact: true }).click();
  await page.reload(); await expect(page.getByTestId("home-owner-check-status")).toContainText("Owner checked");
  expect(app.state.calls[0].requestId).toBe(app.state.calls[1].requestId);
  expect(app.state.saved).toHaveLength(1); expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0);
});
test("stale tab reloads explicitly before adding a correction; home shows the current saved check", async ({ page, context, app }) => {
  const path = `${app.origin}/en/owner/test-shop/actions/${ACTION}?version=${V2}&location=central`;
  await page.goto(path); const old = await context.newPage(); await old.goto(path);
  await fill(page); await fill(old, false, "Synthetic correction");
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.locator(".owner-review-check [role=status]")).toHaveText("Saved");
  await old.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(old.locator(".owner-review-check [role=alert]")).toContainText("Another tab");
  await old.getByRole("button", { name: "Reload saved records", exact: true }).click();
  await expect(old.locator(".owner-review-check [role=alert]")).toHaveCount(0);
  await expect(old.getByLabel("Notes (optional)", { exact: true })).toHaveValue("Synthetic correction");
  await old.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(old.locator(".owner-review-check [role=status]")).toHaveText("Saved");
  await old.getByRole("link", { name: "Return to today", exact: true }).click();
  await expect(old.getByTestId("home-owner-check-status")).toContainText("Owner checked");
  expect(app.state.saved).toHaveLength(2);
  expect(app.state.saved[0].record.previousId).toBe(app.state.saved[1].record.id);
  expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0);
});
test("empty, viewer and foreign workspace summaries cannot expose or mutate another merchant", async ({ page, app }) => {
  app.state.empty = true;
  await page.goto(`${app.origin}/en/owner/test-shop`);
  await expect(page.getByTestId("home-review-followup")).toHaveCount(0);
  app.state.empty = false; app.state.foreign = true;
  await page.reload(); await expect(page.getByTestId("home-review-followup")).toHaveCount(0);
  await expect(page.getByText("Foreign secret")).toHaveCount(0);
  app.state.foreign = false; app.state.role = "viewer"; await page.reload();
  await expect(page.locator("a[data-next-check]")).toHaveText("View saved check");
  await page.locator("a[data-next-check]").click();
  await expect(page.getByRole("button", { name: "Save check", exact: true })).toBeDisabled();
  expect(app.state.calls).toHaveLength(0); expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0);
});
for (const locale of ["en", "zh-HK"] as const) {
  test(`${locale} invalid query recovery retains unsaved draft and owner-check input`, async ({ page, app }, info) => {
    const zh = locale === "zh-HK", errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${app.origin}/${locale}/owner/test-shop/actions/${ACTION}?version=${V2}&location=central`);
    await fill(page, zh, "Synthetic unsaved owner check");
    await page.locator("#draft-content").fill("Synthetic unsaved draft revision");
    await page.evaluate((url: string) => {
      history.replaceState(null, "", url);
      window.dispatchEvent(new Event("fixture:refresh"));
    }, `/${locale}/owner/test-shop/actions/${ACTION}?version=${id(9)}&location=central`);
    await expect(page.getByTestId("invalid-action-version")).toBeVisible();
    await expect(page.locator("[data-retained-action-editor]")).toHaveAttribute("inert", "");
    await expect(page.locator("#draft-content")).toBeHidden();
    await expect(page.locator(".owner-review-check")).toBeHidden();
    await expect(page.getByRole("link", { name: zh ? "返回今日首頁" : "Return to today", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: zh ? "返回上一個畫面" : "Return to the previous view", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`version=${V2}`));
    await expect(page.getByTestId("invalid-action-version")).toHaveCount(0);
    await expect(page.locator("#draft-content")).toHaveValue("Synthetic unsaved draft revision");
    await expect(page.getByLabel(zh ? "備註（可選）" : "Notes (optional)", { exact: true })).toHaveValue("Synthetic unsaved owner check");
    await expect(page.getByRole("button", { name: zh ? "返回今日首頁" : "Return to today", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: zh ? "儲存核對" : "Save check", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("version-recovered-unsaved.png"), fullPage: true });
    expect(app.state.calls).toHaveLength(0); expect(app.state.saved).toHaveLength(0);
    expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0); expect(errors).toEqual([]);
  });
  test(`${locale} invalid exact-version links never fall back to another saved draft`, async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${app.origin}/${locale}/owner/test-shop/actions/${ACTION}?version=${id(9)}&location=central`);
    const unavailable = page.getByTestId("invalid-action-version");
    await expect(unavailable).toContainText(locale === "en" ? "This saved version is unavailable" : "無法讀取指定的已儲存版本");
    await expect(page.locator("#draft-content, .owner-review-check")).toHaveCount(0);
    await expect(page.getByText("Separate unapproved draft.", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(unavailable).toBeVisible();
    await unavailable.getByRole("link").click();
    await expect(page.getByTestId("home-review-followup")).toContainText(locale === "en" ? "Version 2" : "第 2 版");
    expect(app.state.calls).toHaveLength(0); expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0);
  });
}
