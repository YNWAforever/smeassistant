import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { conversationCopy } from "../../lib/copy-conversation";

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
{path.pathname.endsWith("/conversation")?<ConversationView locale={locale} workspaceSlug={slug} workspaceName={ws.name} location={branch} locationName={branch==="central"?"Central":"East"} scope={{userId:user,workspaceId:slug,locationId:branch}} initialThreadId={q.get("thread")??undefined} actions={actions}/>:path.pathname.includes("/actions/")?<section><h1>Existing task surface</h1><p>Version {q.get("version")}</p></section>:<h1>{copy[locale].shell.nav.today}</h1>}
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
    const server = createServer((req, res) => {
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
async function save(page: Page, text: string) {
  await page.getByLabel("Your note", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Save local note", exact: true }).click();
  await expect(page.locator(".conversation-note").filter({ hasText: text })).toBeVisible();
}

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
