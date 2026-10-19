import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import type { OwnerCheckCommand, OwnerCheckRecord } from "../../lib/workspace/owner-review-check";

const id = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
type State = { records: OwnerCheckRecord[]; commands: OwnerCheckCommand[]; lostResponse: boolean; usage: number; forbiddenWrites: number };
type App = { origin: string; state: State };
const root = process.cwd(), staticRoot = resolve(root, ".next/static");
const require = createRequire(import.meta.url);
const viteRequire = createRequire(createRequire(require.resolve("vitest")).resolve("vite"));

const entry = `
import React,{useState} from "react"; import {createRoot} from "react-dom/client";
import {OwnerReviewCheckPanel} from "./components/workspace/owner-review-check-panel";
function App(){const d=window.__OWNER_FIXTURE__;const [context,setContext]=useState(d.context);
const refresh=async()=>setContext(await(await fetch("/fixture/state")).json());
return <main><aside className="fixture-label">OFFLINE SYNTHETIC FIXTURE · no real Auth / DB / Google</aside>
<p data-testid="usage">Usage 2/3 · fixture period 2026-10</p>
<OwnerReviewCheckPanel {...d} context={context} onSaved={refresh} onReload={refresh}/></main>}
createRoot(document.getElementById("root")).render(<App/>);
`;
async function cssFiles(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true })).flatMap(entry => entry.isDirectory() ? [] : entry.name.endsWith(".css") ? [resolve(path, entry.name)] : []);
}
let bundle: string;
base.beforeAll(async () => {
  const esbuild = viteRequire("esbuild");
  const result = await esbuild.build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true,
    platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: resolve(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' } });
  bundle = result.outputFiles[0].text;
});

const test = base.extend<{ app: App }>({
  app: async ({}, runFixture) => {
    const state: State = { records: [], commands: [], lostResponse: false, usage: 2, forbiddenWrites: 0 };
    const remembered = new Map<string, { command: OwnerCheckCommand; record: OwnerCheckRecord }>();
    let port = 0;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const context = () => ({ records: state.records, appliedVersionIds: [id(3)] });
      res.setHeader("cache-control", "no-store");
      if (req.method === "POST") {
        if (url.pathname !== `/api/actions/${id(2)}/owner-check`) { state.forbiddenWrites++; res.writeHead(403).end(); return; }
        if (state.commands.length >= 12) { res.writeHead(429).end(); return; }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        // Only the HTTP port is doubled. The browser runs the real component,
        // client helper and command validator; real API validation is covered
        // separately by route tests. No product module is loaded into this server.
        const command = JSON.parse(Buffer.concat(chunks).toString()) as OwnerCheckCommand;
        res.setHeader("content-type", "application/json");
        state.commands.push(command);
        const prior = remembered.get(command.requestId);
        if (prior) {
          res.writeHead(JSON.stringify(prior.command) === JSON.stringify(command) ? 200 : 409)
            .end(JSON.stringify({ record: prior.record, duplicate: true })); return;
        }
        const current = state.records.find(row => row.versionId === command.versionId);
        if ((current?.id ?? null) !== command.expectedRecordId) { res.writeHead(409).end('{"error":"stale_check"}'); return; }
        const record: OwnerCheckRecord = { id: String(state.records.length + 1), versionId: command.versionId,
          decision: command.decision, reviewReference: command.reviewReference, note: command.note,
          evidenceAssetId: command.evidenceAssetId, evidenceLabel: null, previousId: command.expectedRecordId,
          recordedAt: `2026-10-19T02:00:0${state.records.length + 1}.000Z`, independent: false };
        state.records.unshift(record); remembered.set(command.requestId, { command, record });
        if (state.lostResponse) { state.lostResponse = false; res.writeHead(503).end('{"error":"unavailable"}'); return; }
        res.writeHead(201).end(JSON.stringify({ record, duplicate: false })); return;
      }
      if (url.pathname === "/fixture/state") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(context())); return; }
      if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
      if (url.pathname === "/style.css") {
        const files = [...await cssFiles(resolve(staticRoot, "css")).catch(() => []), ...await cssFiles(resolve(staticRoot, "chunks")).catch(() => [])];
        res.setHeader("content-type", "text/css");
        res.end((await Promise.all(files.map(file => readFile(file, "utf8")))).join("\n") +
          "body{margin:0;padding:16px;background:#fff8f2}main{max-width:900px;margin:auto}.fixture-label{padding:12px;background:#fff1b8;border:1px solid #b87900;margin-bottom:16px}"); return;
      }
      if (url.pathname.startsWith("/_next/static/")) {
        const file = resolve(staticRoot, url.pathname.slice("/_next/static/".length));
        if (!file.startsWith(staticRoot + sep)) { res.writeHead(403).end(); return; }
        try { res.end(await readFile(file)); } catch { res.writeHead(404).end(); } return;
      }
      const newer = url.searchParams.get("version") === "new";
      const data = { locale: url.searchParams.get("locale") === "zh-HK" ? "zh-HK" : "en",
        workspaceId: id(1), actionId: id(2), version: { id: newer ? id(7) : id(3), version_no: newer ? 3 : 2, body: newer ? "Synthetic new draft." : "Thank you for your review. Your comments help our team." },
        latestVersionId: newer ? id(7) : id(3), identity: "Synthetic Shop · Central test branch",
        timezone: "Asia/Hong_Kong", mapsUrl: "https://www.google.com/maps/place/Synthetic",
        context: context(), approvedAssets: [], canEdit: true, offline: false, dirty: false };
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.__OWNER_FIXTURE__=${JSON.stringify(data).replaceAll("<", "\\u003c")}</script><script src="/bundle.js"></script></body></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    try { await runFixture({ origin: `http://127.0.0.1:${port}`, state }); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  },
});
async function fill(page: Page, zh = false) {
  await page.getByLabel(zh ? "評論識別資料" : "Review reference", { exact: true }).fill("Synthetic reviewer · 2026-10-01 · helpful");
  await page.getByLabel(zh ? "備註（可選）" : "Notes (optional)", { exact: true }).fill("Synthetic saved check.");
  for (const label of zh ? ["商戶及分店相符", "已找到並比對指定評論", "回覆與此已儲存版本相符"] : ["Business and branch match", "I found and matched the specified review", "The reply matches this saved version"]) {
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  }
}
for (const locale of ["en", "zh-HK"] as const) for (const width of [1440, 390]) {
  test(`${locale} ${width}px saves and restores the exact version's owner check with usage 2/3`, async ({ page, context, browser, app }, info) => {
    const external: string[] = [];
    await context.route("**/*", route => new URL(route.request().url()).origin === app.origin
      ? route.continue() : (external.push("blocked"), route.abort("blockedbyclient")));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`${app.origin}/?locale=${locale}`);
    const zh = locale === "zh-HK";
    await expect(page.getByText(zh ? /沒有精確評論連結/ : /No exact review link/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("before.png"), fullPage: true });
    await fill(page, zh);
    await page.getByRole("button", { name: zh ? "儲存核對" : "Save check", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(zh ? "已儲存" : "Saved");
    await page.reload();
    await expect(page.getByTestId("current-owner-check")).toHaveText(zh ? "店主已核對 · 店主聲明" : "Owner checked · statement only");
    await expect(page.getByTestId("usage")).toContainText("2/3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("saved-reloaded.png"), fullPage: true });
    const fresh = await browser.newContext({ viewport: { width, height: 844 }, proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1" } });
    try {
      const readback = await fresh.newPage();
      await readback.goto(`${app.origin}/?locale=${locale}`);
      await expect(readback.getByTestId("current-owner-check")).toHaveText(zh ? "店主已核對 · 店主聲明" : "Owner checked · statement only");
    } finally { await fresh.close(); }
    expect(app.state.records).toHaveLength(1);
    expect(app.state.records[0].versionId).toBe(id(3));
    expect(app.state.records[0].independent).toBe(false);
    expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0); expect(external).toEqual([]);
    await writeFile(info.outputPath("result.json"), JSON.stringify({ layer: "OFFLINE memory HTTP fixture; no real DB/Auth/Google", locale, width, usage: "2/3", exactVersion: true, independent: false, reload: true, freshContextRead: true, mutations: app.state.commands.length, externalRequests: external.length }, null, 2));
  });
}
test("lost save response retries once with the same identity and no duplicate record or usage", async ({ page, app }) => {
  app.state.lostResponse = true;
  await page.goto(app.origin); await fill(page);
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("not saved");
  await expect(page.getByLabel("Notes (optional)", { exact: true })).toHaveValue("Synthetic saved check.");
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(app.state.commands[0].requestId).toBe(app.state.commands[1].requestId);
  expect(app.state.records).toHaveLength(1); expect(app.state.usage).toBe(2);
});
test("a stale tab explicitly reloads before correcting; a new draft inherits no owner check", async ({ page, context, app }) => {
  await page.goto(app.origin);
  const old = await context.newPage(); await old.goto(app.origin);
  await fill(page); await fill(old);
  await page.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await old.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(old.getByRole("alert")).toContainText("Another tab");
  await old.getByRole("button", { name: "Reload saved records", exact: true }).click();
  await expect(old.getByRole("alert")).toHaveCount(0);
  await old.getByLabel("Notes (optional)", { exact: true }).fill("Synthetic correction after comparing.");
  await old.getByRole("button", { name: "Save check", exact: true }).click();
  await expect(old.getByRole("status")).toHaveText("Saved");
  expect(app.state.records).toHaveLength(2);
  expect(app.state.records[0].previousId).toBe(app.state.records[1].id);
  await old.goto(`${app.origin}/?version=new`);
  await expect(old.getByTestId("current-owner-check")).toContainText("No owner check for this version");
  await expect(old.getByRole("button", { name: "Save check", exact: true })).toBeDisabled();
  expect(app.state.usage).toBe(2); expect(app.state.forbiddenWrites).toBe(0);
});
