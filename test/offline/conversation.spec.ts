import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { conversationDesignCopy } from "../../lib/copy-conversation-design";
import { resourceCopy } from "../../lib/copy-conversation-resources";
import { conversationCopy } from "../../lib/copy-conversation";
import { postDraftCopy } from "../../lib/copy-conversation-post-draft";
import { POST_DRAFT_FIXTURES } from "../../lib/workspace/post-draft-fixture";
import { searchCopy } from "../../lib/copy-search-gap";
import { buildSearchBriefs, observeSearch, type SearchRecord } from "../../lib/workspace/search-gap";
import { gapFixture, gscFixture } from "../fixtures/conversation-search";

const root = process.cwd();
const require = createRequire(import.meta.url);
const viteRequire = createRequire(createRequire(require.resolve("vitest")).resolve("vite"));
const ACTION = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const entry = `
import React,{useEffect,useState} from "react";
import{createRoot}from"react-dom/client";
import{WorkspacePageFrame}from"./components/workspace-shell";
import{ConversationView}from"./components/workspace/conversation-view";
import{copy}from"./lib/copy";
function App(){const [url,setUrl]=useState(location.href);
useEffect(()=>{const update=()=>setUrl(location.href);window.addEventListener("fixture:refresh",update);window.addEventListener("popstate",update);return()=>{window.removeEventListener("fixture:refresh",update);window.removeEventListener("popstate",update);};},[]);
const path=new URL(url),q=path.searchParams,locale=path.pathname.split("/")[1],slug=path.pathname.split("/")[3],branch=q.get("location")||"central",user=q.get("user")||"owner";
const ws={slug,name:"Synthetic shop",avatarInitial:"S",locations:[{slug:"central",name:"Central"},{slug:"east",name:"East"}],defaultLocationSlug:"central",usage:{approvedDeliveries:2,allowance:3},account:{name:user,email:user+"@example.test",roleLabel:"Owner"},unreadNotifications:0,demo:false,assistant:{workspaceId:slug,locationId:branch},...(q.get("flag")!=="off"?{conversationEnabled:true}:{})};
const actions=q.get("empty")==="1"?[]:[{id:"${ACTION}",title:"Existing synthetic task",versionId:"${VERSION}"}];
return <><aside className="fixture-label">OFFLINE SYNTHETIC · real product components · no DB, Auth or model</aside><WorkspacePageFrame locale={locale} workspace={ws}>
{path.pathname.endsWith("/conversation")?<ConversationView locale={locale} timezone="Asia/Singapore" workspaceSlug={slug} workspaceName={ws.name} location={branch} locationName={branch==="all"?"":branch==="central"?"Central":"East"} scope={{userId:user,workspaceId:slug,locationId:branch}} initialThreadId={q.get("thread")??undefined} actions={actions} today={{open:actions.length,drafts:actions.length,completed:2}} resources={{canManage:q.get("role")!=="manager"}}/>:path.pathname.includes("/actions/")?<section><h1>Existing task surface</h1><p>Version {q.get("version")}</p></section>:<h1>{copy[locale].shell.nav.today}</h1>}
</WorkspacePageFrame></>}
createRoot(document.getElementById("root")).render(<App/>);`;
let bundle = "", css = "";
base.beforeAll(async () => {
  const result = await viteRequire("esbuild").build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, bundle: true,
    platform: "browser", format: "iife", write: false, jsx: "automatic", tsconfig: resolve(root, "tsconfig.json"),
    alias: { "next/link": resolve(root, "test/offline/owner-home-navigation.tsx"), "next/navigation": resolve(root, "test/offline/owner-home-navigation.tsx") },
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } });
  bundle = result.outputFiles[0].text;
  // Compile the actual app styles independently of .next and the owned acceptance stack.
  const postcss = createRequire(require.resolve("@tailwindcss/postcss"))("postcss");
  css = (await postcss([require("@tailwindcss/postcss")()]).process(await readFile(resolve(root, "app/globals.css"), "utf8"), { from: resolve(root, "app/globals.css") })).css;
});
const test = base.extend<{ app: { origin: string; writes: string[] } }>({
  app: async ({ page }, runFixture) => {
    const writes: string[] = [];
    const documents=new Map<string,Array<{id:string;documentId:string;assetId:string;version:number;title:string;createdAt:string;text:string;truncated:boolean;sha256:string}>>();
    const searchRecords = new Map<string, SearchRecord[]>(), observeReads = new Map<string, number>();
    const server = createServer(async (req, res) => {
      const requestUrl=new URL(req.url??"/","http://fixture.test");
      const documentRoute=/^\/api\/workspaces\/([^/]+)\/conversation\/documents$/.exec(requestUrl.pathname);
      const connectorRoute=/^\/api\/workspaces\/([^/]+)\/conversation\/connectors$/.exec(requestUrl.pathname);
      const searchRoute=/^\/api\/workspaces\/([^/]+)\/conversation\/search$/.exec(requestUrl.pathname);
      const json=(body:unknown,status=200)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(body));};
      if (searchRoute) {
        if (req.method === "GET") { json({ records: searchRecords.get(`${searchRoute[1]}:${requestUrl.searchParams.get("location_id")}`) ?? [] }); return; }
        if (req.method === "POST") {
          const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString()), key = `${searchRoute[1]}:${body.location_id}`, rows = searchRecords.get(key) ?? [];
          if (body.location_id === "all") { json({ error: "invalid_location" }, 400); return; }
          if (body.operation === "read") {
            // Explicit synthetic GSC evidence; real providers are blocked by this harness.
            const gap = gapFixture(body.location_id === "east" ? gscFixture({ items: [{ title: "lunch NYC", metrics: { impressions: 500, clicks: 0 } }] }) : gscFixture());
            const record: SearchRecord = rows[0] ?? { id: crypto.randomUUID(), workspaceId: searchRoute[1], locationId: body.location_id, gap, brief: buildSearchBriefs(gap), createdAt: "2026-10-28T00:00:00Z", approvedAt: null, actionId: null };
            searchRecords.set(key, [record]); json({ record }, 201); return;
          }
          const record = rows.find(row => row.id === body.id); if (!record) { json({ error: "not_found" }, 404); return; }
          if (body.operation === "approve") {
            if (body.confirmed !== true || !record.brief) { json({ error: "approval_required" }, 409); return; }
            record.approvedAt ??= "2026-10-28T12:00:00Z"; record.actionId ??= ACTION; json({ record }); return;
          }
          if (body.operation === "observe") {
            if (!record.approvedAt) { json({ error: "approval_required" }, 409); return; }
            const count = observeReads.get(record.id) ?? 0; observeReads.set(record.id, count + 1);
            const source = gscFixture();
            if (count > 0) { source.observedAt = "2026-11-29T12:00:00Z"; source.analytics = { ...source.analytics!, startDate: "2026-10-29", endDate: "2026-11-25" }; source.items = [{ title: "午餐餐牌", metrics: { impressions: 100, clicks: 3 } }]; }
            json({ observation: observeSearch(record, gapFixture(source)), source }); return;
          }
          json({ error: "invalid_request" }, 400); return;
        }
      }
      if(documentRoute){
        if(req.method==="GET"){
          const rows=documents.get(`${documentRoute[1]}:${requestUrl.searchParams.get("location_id")}`)??[];
          const ids=requestUrl.searchParams.get("ids")?.split(",");
          json({versions:ids?rows.filter(v=>ids.includes(v.id)):rows.filter(v=>!rows.some(other=>other.documentId===v.documentId&&other.version>v.version))});return;
        }
        if(req.method==="POST"){
          const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
          const form=await new Request(requestUrl,{method:"POST",headers:{"content-type":req.headers["content-type"]??""},body:Buffer.concat(chunks)}).formData();
          const file=form.get("file") as File,key=`${documentRoute[1]}:${form.get("location_id")}`,rows=documents.get(key)??[],parent=form.get("document_id");
          const documentId=typeof parent==="string"?parent:crypto.randomUUID(),version=1+Math.max(0,...rows.filter(v=>v.documentId===documentId).map(v=>v.version));
          const text=await file.text(),saved={id:crypto.randomUUID(),documentId,assetId:crypto.randomUUID(),version,title:file.name,createdAt:new Date().toISOString(),text:text.slice(0,20000),truncated:text.length>20000,sha256:"a".repeat(64)};
          documents.set(key,[...rows,saved]);json({version:saved},201);return;
        }
      }
      if(connectorRoute){
        const base={scope:"https://synthetic.example.test/",items:[],observedAt:null};
        const connectors=[{...base,source:"gsc",status:"disconnected"},{...base,source:"firecrawl",status:"blocked",budget:{workspaceRemainingUsd:0,accountRemainingUsd:1,reservedUsd:0}},{...base,source:"dataforseo",status:"empty"}];
        if(req.method==="GET"){json({connectors});return;}
        if(req.method==="POST"){
          const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());
          json({context:{...base,source:body.provider,status:"failed",reason:"timeout"}});return;
        }
      }
      if (req.method !== "GET") { writes.push(req.url ?? ""); res.writeHead(403).end(); return; }
      res.setHeader("cache-control", "no-store");
      if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle); return; }
      if (req.url === "/style.css") { res.setHeader("content-type", "text/css"); res.end(css); return; }
      if (req.url?.startsWith("/api/assistant/suggestions?")) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ suggestions: [] })); return; }
      if (req.url?.startsWith("/api/")) { writes.push(req.url); res.writeHead(403).end(); return; }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
    });
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const errors: string[] = [], external: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort("blockedbyclient")));
    try { await runFixture({ origin, writes }); expect(errors).toEqual([]); expect(external).toEqual([]); expect(writes).toEqual([]); }
    finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  },
});
async function openTool(page: Page, id: string) {
  const details = page.locator(`#conversation-${id}`);
  if (!await details.evaluate(node => (node as HTMLDetailsElement).open)) await details.locator(":scope > summary").click();
}
async function save(page: Page, text: string) {
  await page.getByLabel("Your note", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Save local note", exact: true }).click();
  await expect(page.locator(".conversation-note").filter({ hasText: text })).toBeVisible();
}
async function expectReadable(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const contrasts = await page.locator(selector).evaluateAll(nodes => {
      const context = document.createElement("canvas").getContext("2d")!;
      const luminance = (color: string) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
          const srgb = value / 255;
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return nodes.map(node => {
        let surface: Element | null = node;
        while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
        const foreground = luminance(getComputedStyle(node).color);
        const background = luminance(getComputedStyle(surface!).backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
    });
    expect(contrasts.length, selector).toBeGreaterThan(0);
    for (const contrast of contrasts) expect.soft(contrast, selector).toBeGreaterThanOrEqual(4.5);
  }
}

for (const locale of ["zh-HK", "en", "zh-TW"] as const) {
  for (const role of ["manager", "owner"] as const) {
    test(`honesty: ${locale} ${role} opening docs/search stays idle until an explicit failed load`, async ({ page, app }) => {
      const rt = resourceCopy[locale], st = searchCopy[locale];
      const attempts: string[] = [];
      await page.route(/\/conversation\/(documents|search)(?:\?|$)/, async route => {
        attempts.push(`${route.request().method()} ${new URL(route.request().url()).pathname.split("/").pop()}`);
        await route.fulfill({ status: 503, json: { error: "unavailable" } });
      });
      await page.goto(`${app.origin}/${locale}/owner/test-shop/conversation?location=central&role=${role}`);
      const tools = page.getByRole("region", { name: conversationDesignCopy[locale].tools, exact: true });
      await expect(tools.getByRole("heading", { name: conversationDesignCopy[locale].tools, exact: true })).toBeVisible();
      for (const id of ["documents", "search", "sources"]) await openTool(page, id);
      const documents = page.getByRole("region", { name: rt.documents, exact: true });
      const search = page.getByRole("region", { name: st.title, exact: true });
      await expect(documents.getByText(rt.notLoaded, { exact: true })).toBeVisible();
      await expect(documents.getByText(rt.empty, { exact: true })).toHaveCount(0);
      await expect(search.getByLabel(st.records, { exact: true })).toBeDisabled();
      await expect(search.locator("option")).toHaveText(st.notLoaded);
      await expect(tools.getByRole("alert")).toHaveCount(0);
      await expect(tools.getByText(rt.states.disconnected, { exact: true })).toBeVisible();
      if (role === "manager") {
        await expect(documents.getByText(rt.readOnly, { exact: true })).toBeVisible();
        await expect(documents.getByRole("button", { name: rt.save, exact: true })).toHaveCount(0);
        await expect(search.getByRole("button", { name: st.read, exact: true })).toBeDisabled();
      } else {
        await expect(search.getByRole("button", { name: st.read, exact: true })).toBeEnabled();
      }
      for (const id of ["documents", "search"]) {
        await page.locator(`#conversation-${id} > summary`).click();
        await openTool(page, id);
      }
      await expect(tools.getByRole("alert")).toHaveCount(0);
      expect(attempts).toEqual([]);
      if (locale === "zh-HK" && role === "manager") {
        await page.screenshot({ path: test.info().outputPath("honesty-idle-panels-zh-HK-manager.png"), fullPage: true });
      }
      await documents.getByRole("button", { name: rt.retry, exact: true }).click();
      await expect(documents.getByRole("alert")).toHaveText(rt.failed);
      await search.getByRole("button", { name: st.retry, exact: true }).click();
      await expect(search.getByRole("alert")).toHaveText(st.failed);
      expect(attempts).toEqual(["GET documents", "GET search"]);
    });
  }
}

test.describe("Stage A Preview polish", () => {
  // Exercise a 12-hour difference between the browser in New York and the workspace in Singapore.
  test.use({ timezoneId: "America/New_York" });
  for (const [locale, eyebrow, timestamp] of [
    ["zh-HK", "舖頭工作，由一句開始", "2026年10月31日 上午4:09"],
    ["zh-TW", "店裡工作，從一句開始", "2026年10月31日 凌晨4:09"],
  ] as const) {
    test(`${locale} localizes the eyebrow, labels local saves and uses workspace time`, async ({ page, app }) => {
      await page.clock.setFixedTime(new Date("2026-10-30T20:09:08.000Z"));
      await page.goto(`${app.origin}/${locale}/owner/test-shop/conversation?location=central`);
      const t = conversationCopy[locale];
      await expect(page.locator(".conversation-eyebrow")).toHaveText(eyebrow);
      await expect(page.getByRole("heading", { name: t.title, exact: true })).toBeVisible();
      const save = page.getByRole("button", { name: t.save, exact: true });
      await expect(save).toHaveText(t.save);
      await expect(save).toBeDisabled();
      await expect(page.locator(".conversation-local-note")).toHaveText(conversationDesignCopy[locale].localNote);
      await page.screenshot({ path: test.info().outputPath(`conversation-stage-a-${locale}.png`), fullPage: true });
      await page.getByLabel(t.note, { exact: true }).fill("Stage A 本機筆記");
      await expect(save).toHaveText(t.save);
      await expect(save).toBeEnabled();
      await save.click();
      const time = page.locator("#conversation-recent time");
      await expect(time).toHaveAttribute("datetime", "2026-10-30T20:09:08.000Z");
      await expect(time).toHaveText(timestamp);
      await expect(save).toHaveText(t.save);
      await expect(save).toBeDisabled();
      await page.reload();
      await expect(page.locator(".conversation-note")).toHaveText("Stage A 本機筆記");
      await expect(time).toHaveText(timestamp);
      await page.screenshot({ path: test.info().outputPath(`conversation-stage-a-local-note-${locale}.png`), fullPage: true });
      await page.getByRole("button", { name: t.newThread, exact: true }).click();
      await expect(save).toHaveText(t.save);
      await expect(save).toBeDisabled();
    });
  }
});

test("dark preference keeps cream-home controls and honesty copy readable", async ({ page, app }) => {
  await page.goto(`${app.origin}/en/owner/test-shop/conversation?location=central`);
  await page.locator(".theme-button").click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".workspace-shell--conversation")).toHaveCSS("background-color", "rgb(255, 251, 246)");
  await expect(page.locator(".workspace-shell--conversation")).toHaveCSS("color-scheme", "light");
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("background-color", "rgb(248, 246, 241)");
  await page.getByLabel("Your note", { exact: true }).fill("Readability check");
  await openTool(page, "search");
  await openTool(page, "documents");
  const targets = [
    ".conversation-composer [type=submit]",
    ".conversation-threads [data-slot=button]",
    ".workspace-topbar .assistant-launcher",
    ".workspace-topbar [data-slot=select-trigger]",
    ".conversation-boundaries .limitation-note",
    "#conversation-search .limitation-note",
    "#conversation-documents .limitation-note",
  ];
  await expectReadable(page, targets);
  await page.screenshot({ path: test.info().outputPath("conversation-dark-preference.png"), fullPage: true });
  // Model a client navigation: the chosen global theme must survive the local palette.
  await page.evaluate(() => {
    const next = new URL(location.href);
    next.pathname = next.pathname.replace(/\/conversation$/, "");
    next.searchParams.set("flag", "off");
    history.pushState(null, "", next);
    dispatchEvent(new Event("fixture:refresh"));
  });
  await expect(page.locator(".workspace-shell--conversation, .conversation-switch")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.locator(".workspace-shell").evaluate(node => getComputedStyle(node).colorScheme)).toBe("dark");
});

test("Stage B expanded work surfaces retain readable gates and form state in the boutique shell", async ({ page, app }) => {
  const locale = "zh-HK", t = conversationCopy[locale], rt = resourceCopy[locale], st = searchCopy[locale];
  await page.clock.setFixedTime(new Date("2026-10-31T04:00:00Z"));
  await page.goto(`${app.origin}/${locale}/owner/test-shop/conversation?location=central`);
  await page.locator(".theme-button").click();
  await page.getByRole("menuitemradio", { name: "深色", exact: true }).click();
  await page.getByLabel(t.note, { exact: true }).fill("本機筆記：核對舖頭餐牌同網站資料（離線合成示例）");
  await page.getByRole("button", { name: t.save, exact: true }).click();
  await page.getByLabel(t.note, { exact: true }).fill("價錢同服務要先確認，唔好當作已發布。\n" + "synthetic-long-note-".repeat(12));
  await page.getByRole("button", { name: t.save, exact: true }).click();
  await expect(page.locator(".conversation-note")).toHaveCount(2);
  await page.getByLabel(t.linkAction, { exact: true }).selectOption(ACTION);
  await expect(page.locator(".conversation-linked-actions").getByRole("link", { name: t.openVersion })).toHaveAttribute("href", `/${locale}/owner/test-shop/actions/${ACTION}?location=central&version=${VERSION}`);
  await page.getByRole("button", { name: conversationDesignCopy[locale].attach, exact: true }).click();
  const filename = "synthetic-confirmed-menu-".repeat(4) + ".txt";
  await page.locator("input[type=file]").and(page.getByLabel(rt.file, { exact: true })).setInputFiles({ name: filename, mimeType: "text/plain", buffer: Buffer.from("離線合成餐牌 · 只供版面驗證\n" + "synthetic-source-".repeat(30)) });
  await page.getByRole("button", { name: rt.save, exact: true }).click();
  const cite = page.getByRole("button", { name: rt.cite, exact: true });
  await expect(cite).toBeEnabled(); await cite.click(); await expect(cite).toBeDisabled();
  await page.locator(".conversation-citations summary").click();
  await expect(page.locator(".conversation-citations pre")).toBeVisible();
  await expectReadable(page, [".conversation-note", ".conversation-thread-heading > span", ".conversation-thread-heading time", "#conversation-documents .limitation-note", ".conversation-citations h3", ".conversation-citations pre"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("stage-b-thread-documents-zh-HK.png"), fullPage: true });
  await page.locator("#conversation-documents > summary").click();

  await openTool(page, "search");
  const search = page.getByRole("region", { name: st.title, exact: true });
  await search.getByRole("button", { name: st.read, exact: true }).click();
  await search.getByRole("button", { name: st.createBrief, exact: true }).click();
  const confirm = search.getByRole("checkbox", { name: st.confirmLabel }), approve = search.getByRole("button", { name: st.approve, exact: true });
  await expect(approve).toBeDisabled();
  await confirm.focus(); await page.keyboard.press("Space");
  await page.locator("#conversation-search > summary").click(); await openTool(page, "search");
  await expect(confirm).toBeChecked(); await expect(approve).toBeEnabled();
  await expectReadable(page, [".search-confirm", ".search-confirm-actions button", ".search-brief-state", ".search-provenance", ".search-result > [role=status]", "#conversation-search .limitation-note"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("stage-b-search-confirm-zh-HK.png"), fullPage: true });
  await approve.click();
  await expect(search.getByText(st.approved, { exact: true })).toBeVisible();
  await search.getByRole("button", { name: st.observe, exact: true }).click();
  await expect(search.getByText(st.observations.later_window_required, { exact: true })).toBeVisible();
  await expectReadable(page, [".search-approved-actions .limitation-note", ".search-observation > [role=status]"]);
  await page.locator("#conversation-search > summary").click();

  await openTool(page, "sources");
  await expect(page.getByText(rt.states.blocked, { exact: true })).toBeVisible();
  const keyword = page.getByLabel(rt.keyword, { exact: true });
  await keyword.fill("synthetic plain phrase");
  await page.locator("#conversation-sources > summary").click(); await openTool(page, "sources");
  await expect(keyword).toHaveValue("synthetic plain phrase");
  await expectReadable(page, [".conversation-connector [role=status]", ".conversation-budget", ".conversation-source-meta dt", ".conversation-source-meta dd", "#conversation-sources .limitation-note", ".conversation-resource-actions > a"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("stage-b-connectors-zh-HK.png"), fullPage: true });
  await openTool(page, "documents");
  await expect(page.locator(".conversation-citations pre")).toBeVisible();
  await expect(page.locator(".usage-mini strong")).toHaveText("2 / 3");
});

test("Today remains default and the optional switch works in every locale; existing Ask Kinnso opens", async ({ page, app }) => {
  for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
    const home = `${app.origin}/${locale}/owner/test-shop?location=east`;
    await page.goto(`${home}&flag=off`); await expect(page.locator(".conversation-switch")).toHaveCount(0);
    await expect(page.locator(".mobile-bottom-nav a")).toHaveCount(4);
    await page.goto(home); await page.locator('.conversation-switch a[href*="/conversation"]').click();
    await expect(page.getByRole("heading", { name: conversationCopy[locale].title })).toBeVisible();
    await expect(page).toHaveURL(/location=east/);
    await expect(page.locator(".conversation-templates button")).toHaveCount(6);
    await expect(page.getByText(conversationCopy[locale].privacy)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (locale === "en") await page.screenshot({ path: test.info().outputPath("conversation.png"), fullPage: true });
    await page.locator('.conversation-switch a').first().click();
    await expect(page).toHaveURL(`${home}`);
  }
  await page.goto(`${app.origin}/en/owner/test-shop?location=central`);
  await page.getByRole("button", { name: "Ask Kinnso", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

for (const [locale, privacy, limits] of [
  ["en", ["only in this browser on this device", "do not sync to other devices", "no cloud backup", "Anyone using this browser profile can read them", "clearing site data deletes them"], ["Per account, workspace and location", "50 threads", "40 notes per thread", "4,000 characters per note"]],
  ["zh-HK", ["只留喺呢部裝置嘅呢個瀏覽器", "唔會同步去其他裝置", "冇雲端備份", "同一瀏覽器設定檔嘅人可以讀到", "清除網站資料會刪除筆記"], ["每個帳戶、工作空間同分店範圍", "50 個討論串", "每串最多 40 則筆記", "每則最多 4,000 字元"]],
  ["zh-TW", ["只留在這台裝置的這個瀏覽器", "不會同步到其他裝置", "沒有雲端備份", "同一瀏覽器設定檔的人可以讀到", "清除網站資料會刪除筆記"], ["每個帳戶、工作空間和分店範圍", "50 個討論串", "每串最多 40 則筆記", "每則最多 4,000 字元"]],
] as const) {
  test(`Stage C Park ${locale} discloses device-only notes and limits before saving and after reload`, async ({ page, app }) => {
    await page.goto(`${app.origin}/${locale}/owner/test-shop/conversation?location=central`);
    const t = conversationCopy[locale];
    const privacyNote = page.locator(".conversation-boundaries .limitation-note").first();
    const localNote = page.locator(".conversation-local-note");
    for (const state of ["new", "restored"] as const) {
      for (const text of privacy) await expect(privacyNote).toContainText(text);
      for (const text of limits) await expect(localNote).toContainText(text);
      await expect(privacyNote).toBeVisible();
      await expect(localNote).toBeVisible();
      await expect(page.getByText(t.boundary, { exact: true })).toBeVisible();
      await expect(page.locator(".conversation-tool[open]")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (state === "new") {
        await page.getByLabel(t.note, { exact: true }).fill("Stage C local note");
        await page.getByRole("button", { name: t.save, exact: true }).click();
        await expect(page.getByText(t.saved, { exact: true })).toBeVisible();
        await page.reload();
        await expect(page.locator(".conversation-note")).toHaveText("Stage C local note");
      }
    }
    await expect(page.locator(".usage-mini strong")).toHaveText("2 / 3");
  });
}

test("templates only prefill; local threads stay separate through reload and link real action/version routes", async ({ page, app }) => {
  const url = `${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url);
  await page.locator(".conversation-templates button").first().click();
  await expect(page.getByLabel("Your note", { exact: true })).toHaveValue("Reply to unanswered Google reviews");
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("kinnso:conversation:")))).toEqual([]);
  await save(page, "First local task notes");
  await expect(page.getByText("Saved in this browser", { exact: true })).toBeVisible();
  const firstThreadURL = page.url();
  await page.getByLabel("Link existing task", { exact: true }).selectOption(ACTION);
  await expect(page.locator(".conversation-linked-actions").getByRole("link", { name: "Open saved version" })).toHaveAttribute("href", `/en/owner/test-shop/actions/${ACTION}?location=central&version=${VERSION}`);
  await page.getByRole("button", { name: "New thread", exact: true }).click();
  await save(page, "Second separate task notes");
  await expect(page.locator(".conversation-note")).toHaveText("Second separate task notes");
  await page.reload(); await expect(page.locator(".conversation-note")).toHaveText("Second separate task notes");
  await page.getByRole("button", { name: "First local task notes", exact: true }).click();
  await expect(page.locator(".conversation-note")).toHaveText("First local task notes");
  await page.locator(".conversation-linked-actions").getByRole("link", { name: "Open saved version" }).click();
  await expect(page.getByRole("heading", { name: "Existing task surface" })).toBeVisible();
  await expect(page.getByText(`Version ${VERSION}`, { exact: true })).toBeVisible();
  await page.goto(firstThreadURL);
  await expect(page.locator(".conversation-note")).toHaveText("First local task notes");
  await expect(page.locator(".usage-mini strong")).toHaveText("2 / 3");
  const data = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("kinnso:conversation:")).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(data[0].threads).toHaveLength(2);
  expect(data[0].threads.find((thread: { actionIds: string[] }) => thread.actionIds.length)?.actionIds).toEqual([ACTION]);
});

test("scope transitions and stale thread IDs never show another account, workspace or location's notes", async ({ page, app }) => {
  const url = `${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url); await save(page, "Scope isolated note");
  const thread = new URL(page.url()).searchParams.get("thread")!;
  for (const target of [`${url}&user=another`, `${app.origin}/en/owner/another-shop/conversation?location=central`, `${app.origin}/en/owner/test-shop/conversation?location=east`]) {
    await page.goto(`${target}&thread=${thread}`);
    await expect(page.getByText(conversationCopy.en.missing, { exact: true })).toBeVisible();
    await expect(page.locator(".conversation-note")).toHaveCount(0);
  }
  await page.goto(`${url}&thread=${thread}`); await expect(page.locator(".conversation-note")).toHaveText("Scope isolated note");
  // Model a location query transition on a mounted route, keeping the stale thread query.
  await page.evaluate(() => { const next = new URL(location.href); next.searchParams.set("location", "east"); history.replaceState(null, "", next); dispatchEvent(new Event("fixture:refresh")); });
  await expect(page.getByText(conversationCopy.en.missing, { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-note")).toHaveCount(0);
  await expect(page.locator(".conversation-sidebar-recent a")).toHaveCount(0);
});

test("blocked storage retains notes on screen, reports failure, and never claims refresh persistence", async ({ page, app }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Blocked", "QuotaExceededError"); }; });
  await page.goto(`${app.origin}/en/owner/test-shop/conversation?location=central`);
  await save(page, "Unsaved local note");
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(page.getByText("Saved in this browser", { exact: true })).toHaveCount(0);
  await page.evaluate(() => dispatchEvent(new Event("fixture:refresh")));
  await expect(page.locator(".conversation-note")).toHaveText("Unsaved local note");
  await page.reload(); await expect(page.getByText(conversationCopy.en.missing, { exact: true })).toBeVisible();
});

test("unreadable notes and missing linked actions show honest empty/error states", async ({ page, app }) => {
  const url = `${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url); await save(page, "Local link note");
  await page.getByLabel("Link existing task", { exact: true }).selectOption(ACTION);
  const selected = page.url();
  await page.goto(`${selected}&empty=1`);
  await expect(page.getByText(conversationCopy.en.actionUnavailable, { exact: true })).toBeVisible();
  await expect(page.getByText(conversationCopy.en.noActions, { exact: true })).toBeVisible();
  await expect(page.locator(".conversation-linked-actions a")).toHaveCount(0);
  await page.evaluate(() => { const key = Object.keys(localStorage).find(key => key.startsWith("kinnso:conversation:"))!; localStorage.setItem(key, "corrupt"); });
  await page.goto(url);
  await expect(page.getByRole("alert")).toHaveText(conversationCopy.en.corrupt);
  await expect(page.getByLabel("Your note", { exact: true })).toBeDisabled();
});

test("a stale tab preserves a different thread saved by another tab", async ({ page, app }) => {
  const second = await page.context().newPage();
  const url = `${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url); await second.goto(url);
  await expect(page.getByText(conversationCopy.en.empty, { exact: true })).toBeVisible();
  await expect(second.getByText(conversationCopy.en.empty, { exact: true })).toBeVisible();
  await save(page, "Thread from tab A"); await save(second, "Thread from tab B");
  await page.reload(); await second.reload();
  for (const tab of [page, second]) {
    await expect(tab.getByRole("button", { name: "Thread from tab A", exact: true })).toBeVisible();
    await expect(tab.getByRole("button", { name: "Thread from tab B", exact: true })).toBeVisible();
  }
  await second.close();
});

test("long unbroken note titles stay inside the viewport", async ({ page, app }) => {
  await page.goto(`${app.origin}/en/owner/test-shop/conversation?location=central`);
  await save(page, "x".repeat(200));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("Stage 2 documents cite immutable versions across refresh; source context stays honest",async({page,app})=>{
  const url=`${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url);await save(page,"Synthetic private thread with source");
  await openTool(page,"documents");
  await page.getByLabel("Shop document",{exact:true}).setInputFiles({name:"menu.txt",mimeType:"text/plain",buffer:Buffer.from("Synthetic confirmed menu v1")});
  await page.getByRole("button",{name:"Save document version",exact:true}).click();
  await expect(page.getByText("Document version saved",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Cite this version",exact:true}).click();
  await expect(page.locator(".conversation-citations")).toContainText("menu.txt · v1");
  const threadUrl=page.url();await page.reload();await openTool(page,"documents");await page.getByRole("button",{name:"Refresh",exact:true}).click();await expect(page.locator(".conversation-citations")).toContainText("menu.txt · v1");
  const parentValue=await page.locator("#conversation-document-parent option").nth(1).getAttribute("value");await page.getByLabel("Add a version of",{exact:true}).selectOption(parentValue!);
  await page.getByLabel("Shop document",{exact:true}).setInputFiles({name:"menu.txt",mimeType:"text/plain",buffer:Buffer.from("Synthetic corrected menu v2")});
  await page.getByRole("button",{name:"Save document version",exact:true}).click();
  await expect(page.locator(".conversation-document-list")).toContainText("menu.txt · v2");
  await expect(page.locator(".conversation-citations")).toContainText("menu.txt · v1");
  await page.locator(".conversation-citations summary").click();await expect(page.locator(".conversation-citations")).toContainText("Synthetic confirmed menu v1");
  const stored=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("kinnso:conversation:")).map(k=>localStorage.getItem(k)).join(""));
  expect(stored).not.toContain("Synthetic confirmed menu v1");expect(stored).not.toContain("Synthetic corrected menu v2");
  await openTool(page,"sources");
  await expect(page.getByRole("link",{name:"Connect Google Search Console",exact:true})).toBeVisible();
  await expect(page.getByText("Budget reached. No paid request was sent.",{exact:true})).toBeVisible();
  const paid=page.locator(".conversation-connector").filter({has:page.getByRole("heading",{name:"DataForSEO",exact:true})});
  await paid.getByLabel("Search phrase").fill("synthetic query");await paid.getByRole("button",{name:"Read context"}).click();
  await expect(paid).toContainText("The source took too long");
  await page.goto(threadUrl.replace("location=central","location=east"));await expect(page.locator(".conversation-citations")).toHaveCount(0);await expect(page.locator(".conversation-document-list")).toHaveCount(0);
  await expect(page.getByText(conversationCopy.en.missing,{exact:true})).toBeVisible();
});

test("Stage 2 availability refresh releases a temporary account block without a paid request",async({page,app})=>{
  const methods:string[]=[];
  await page.route("**/conversation/connectors?*",async route=>{
    methods.push(route.request().method());
    const blocked=methods.length===1;
    await route.fulfill({json:{connectors:[{source:"firecrawl",status:blocked?"blocked":"empty",reason:blocked?"account_reconciliation_pending":"research_available",scope:"https://synthetic.example.test/",items:[],observedAt:null}]}});
  });
  const url=`${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url);
  await openTool(page,"sources");
  const connector=page.locator(".conversation-connector");
  await expect(connector.getByRole("button",{name:"Read context",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Refresh availability",exact:true}).click();
  await expect(connector.getByRole("button",{name:"Read context",exact:true})).toBeEnabled();
  await expect(connector).toContainText("Ready to read on request. No source data has been fetched on this screen.");
  await expect(page).toHaveURL(url);
  expect(methods).toEqual(["GET","GET"]);
});

test("Stage 3 synthetic gap → brief → explicit confirm → observe retains the approved snapshot and delivery count", async ({ page, app }) => {
  const url = `${app.origin}/en/owner/test-shop/conversation?location=central`;
  await page.goto(url); await save(page, "Private note must not enter the search brief");
  await openTool(page,"search");
  const panel = page.getByRole("region", { name: searchCopy.en.title, exact: true });
  await panel.getByRole("button", { name: searchCopy.en.read, exact: true }).click();
  await expect(panel.getByText("午餐餐牌 · Impressions: 80 · Clicks: 0", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: searchCopy.en.openAction })).toHaveCount(0);
  await panel.getByRole("button", { name: searchCopy.en.createBrief, exact: true }).click();
  const approve = panel.getByRole("button", { name: searchCopy.en.approve, exact: true });
  await expect(approve).toBeDisabled();
  await expect(panel.locator(".search-brief")).not.toContainText("Private note");
  await panel.getByRole("checkbox", { name: searchCopy.en.confirmLabel }).check(); await approve.click();
  await expect(panel.getByText(searchCopy.en.approved, { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: searchCopy.en.openAction })).toHaveAttribute("href", `/en/owner/test-shop/actions/${ACTION}?location=central`);
  const savedBrief = await panel.locator(".search-brief h3").textContent();
  await page.locator("#conversation-search > summary").click();
  await openTool(page, "search");
  await expect(panel.locator(".search-brief h3")).toHaveText(savedBrief!);
  await save(page, "Later chat cannot overwrite the confirmed brief");
  await expect(panel.locator(".search-brief h3")).toHaveText(savedBrief!);
  await panel.getByRole("button", { name: searchCopy.en.observe, exact: true }).click();
  await expect(panel.getByText(searchCopy.en.observations.later_window_required, { exact: true })).toBeVisible();
  await expect(panel.getByRole("table")).toHaveCount(0);
  // The second synthetic observation advances the fixture by a full post-confirmation window.
  await panel.getByRole("button", { name: searchCopy.en.observe, exact: true }).click();
  await expect(panel.getByRole("table")).toBeVisible();
  await expect(panel.getByRole("row", { name: "午餐餐牌 0 3 80 100", exact: true })).toBeVisible();
  await expect(page.locator(".usage-mini strong")).toHaveText("2 / 3");
  const recordId = await panel.locator("select").inputValue();
  await page.reload(); await openTool(page,"search"); await panel.getByRole("button", { name: searchCopy.en.retry, exact: true }).click(); await panel.getByLabel(searchCopy.en.records, { exact: true }).selectOption(recordId);
  await expect(panel.getByText(searchCopy.en.approved, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: searchCopy.en.approve, exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: searchCopy.en.refresh, exact: true }).click();
  await expect(panel.locator("select")).toHaveValue(recordId);
  await expect(panel.locator("select option")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("conversation-stage-3.png"), fullPage: true });
});

test("Stage 3 English-only HK fixture remains partial in every locale and all never picks a shop", async ({ page, app }) => {
  for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
    const t = searchCopy[locale];
    await page.goto(`${app.origin}/${locale}/owner/test-shop/conversation?location=east`);
    await openTool(page,"search");
    const panel = page.getByRole("region", { name: t.title, exact: true });
    await panel.getByRole("button", { name: t.read, exact: true }).click();
    await expect(panel.getByText(t.reasons.language_limited, { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: t.createBrief, exact: true })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: t.openAction })).toHaveCount(0);
  }
  await page.goto(`${app.origin}/en/owner/test-shop/conversation?location=all`);
  await openTool(page,"search");
  await openTool(page,"search");
  const panel = page.getByRole("region", { name: searchCopy.en.title, exact: true });
  await expect(panel.getByText(searchCopy.en.selectLocation, { exact: true })).toBeVisible();
  await expect(panel.getByRole("button")).toHaveCount(0);
  await page.goto(`${app.origin}/en/owner/test-shop?location=central&flag=off`);
  await expect(page.getByRole("region", { name: searchCopy.en.title, exact: true })).toHaveCount(0);
});


test("boutique home keeps Today above the composer, filters seed-only cards and opens existing attachments", async ({ page, app }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() !== "GET") mutations.push(request.url()); });
  await page.goto(`${app.origin}/zh-HK/owner/test-shop/conversation?location=central`);
  const d = conversationDesignCopy["zh-HK"];
  await expect(page.locator(".workspace-shell--conversation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "想為間舖做啲咩？", exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: d.today, exact: true });
  await expect(summary.locator("dd")).toHaveText(["1", "1", "2"]);
  expect(await summary.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector(".conversation-composer")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(summary.getByRole("link")).toHaveAttribute("href", "/zh-HK/owner/test-shop?location=central");
  await expect(page.locator(".conversation-templates button")).toHaveCount(6);
  await expect(page.locator(".conversation-tool[open]")).toHaveCount(0);
  const filters = page.getByRole("group", { name: d.filters });
  for (const [category, count] of [["start", 2], ["content", 3], ["search", 1]] as const) {
    await filters.getByRole("button", { name: d.categories[category], exact: true }).click();
    await expect(page.locator(".conversation-templates button")).toHaveCount(count);
  }
  await page.locator(".conversation-templates button").click();
  await expect(page.getByLabel(conversationCopy["zh-HK"].note, { exact: true })).not.toHaveValue("");
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("kinnso:conversation:")))).toEqual([]);
  expect(mutations).toEqual([]);
  await filters.getByRole("button", { name: d.categories.all, exact: true }).click();
  await expect(page.locator(".conversation-templates button")).toHaveCount(6);
  await page.getByRole("button", { name: d.attach, exact: true }).click();
  await expect(page.locator("#conversation-document")).toBeVisible();
  await expect(page.getByText(resourceCopy["zh-HK"].createThread, { exact: true })).toBeVisible();
  await expect(page.locator("#conversation-documents")).toHaveAttribute("open", "");
  expect(mutations).toEqual([]);
  await page.locator("#conversation-documents > summary").click();
  await page.locator("#conversation-note").fill("");
  await page.locator("#conversation-note").blur();
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("conversation-design-parity-zh-HK.png"), fullPage: true });
  await page.getByLabel(conversationCopy["zh-HK"].note, { exact: true }).fill("本機討論：舖頭網站常見問題");
  await page.getByRole("button", { name: conversationCopy["zh-HK"].save, exact: true }).click();
  await page.getByRole("button", { name: conversationCopy["zh-HK"].newThread, exact: true }).click();
  await expect(page.locator("#conversation-recent").getByRole("button", { name: "本機討論：舖頭網站常見問題", exact: true })).toBeVisible();
  await expect(page.locator(".conversation-sidebar-recent a")).toContainText(["本機討論：舖頭網站常見問題"]);
  if (test.info().project.name === "desktop") {
    await page.locator(".conversation-sidebar-recent a").click();
    await expect(page.locator(".conversation-note")).toHaveText("本機討論：舖頭網站常見問題");
    await page.locator('.workspace-sidebar a[href$="#conversation-templates"]').click();
    await expect(page.locator(".conversation-templates button")).toHaveCount(6);
  }
  await page.goto(`${app.origin}/zh-HK/owner/test-shop?location=central&flag=off`);
  await expect(page.locator(".workspace-shell--conversation, .conversation-sidebar-new, .conversation-tools, .conversation-today")).toHaveCount(0);
});

test("Wave 1 post coach keeps draft → confirm → copy in-thread with no post or schedule affordance", async ({ page, app }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as unknown as { __copied?: string }).__copied = text; } },
    });
  });
  const t = postDraftCopy["zh-HK"], fixture = POST_DRAFT_FIXTURES["zh-HK"][0];
  await page.goto(`${app.origin}/zh-HK/owner/test-shop/conversation?location=central`);
  await page.getByRole("button", { name: t.examples.weeklyIg, exact: true }).click();
  await page.getByRole("button", { name: t.coach.startCta, exact: true }).click();
  const channels = page.getByRole("group", { name: t.clarify.channel.question });
  await expect(channels.getByRole("button", { name: new RegExp(t.channel.googleBusinessProfile) })).toContainText(t.channel.notConnected);
  await channels.getByRole("button", { name: new RegExp(t.channel.instagram) }).click();
  await page.getByRole("button", { name: t.clarify.tone.skip, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.card.heading, exact: true })).toBeVisible();
  await expect(page.getByText(t.card.status.draft, { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.title, { exact: true })).toBeVisible();
  await expect(page.getByText(t.honesty.aiDraftsOnly, { exact: true })).toBeVisible();
  await expect(page.getByText(t.card.imageSlotHint, { exact: true })).toBeVisible();
  for (const name of [/排程/, /發佈/, /Publish/i, /Schedule/i, /Connect/i]) await expect(page.locator(".post-coach").getByRole("button", { name })).toHaveCount(0);
  await page.getByRole("button", { name: t.confirm.primaryCta, exact: true }).click();
  await expect(page.getByText(t.confirmed.status, { exact: true })).toBeVisible();
  await expect(page.getByText(t.confirmed.done, { exact: true })).toBeVisible();
  await expect(page.getByText(t.honesty.aiDraftsOnly, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: t.actions.copy, exact: true }).click();
  await expect(page.getByText(t.actions.copied.replace("{channel}", t.channel.instagram), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toBe(`${fixture.title}\n\n${fixture.body}`);
  await page.getByRole("button", { name: t.actions.saveTodo, exact: true }).click();
  await expect(page.getByText(t.actions.savedTodo, { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("kinnso:conversation-post-draft:")).map(key => localStorage.getItem(key)).join(""));
  expect(stored).toContain(fixture.title);
});
