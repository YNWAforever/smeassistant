/**
 * Captures every state in states.ts against a running visual stack (see README.md).
 *
 *   corepack pnpm exec tsx test/visual/capture.ts <tag>
 *
 * Options (environment): VISUAL_ONLY=name,name  VISUAL_LOCALES=en,zh-HK  VISUAL_WIDTHS=390,1440
 * VISUAL_SCHEMES=light,dark. Writes test-results/visual/<tag>/<state>-<locale>-<width>-<scheme>.png
 * and manifest.json (status, overflow, page errors per capture).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { LAUNCH, STACK_FILE, VISUAL_DIR, stackSql, type VisualStack } from "./shared";
import { visualStates } from "./states";

const tag = process.argv[2];
if (!tag || !/^[\w.-]+$/.test(tag)) throw new Error("Usage: tsx test/visual/capture.ts <tag>");
const list = (name: string, fallback: string) => (process.env[name] ?? fallback).split(",").map((v) => v.trim()).filter(Boolean);
const stack = JSON.parse(readFileSync(STACK_FILE, "utf8")) as VisualStack;
const only = list("VISUAL_ONLY", "");
const states = visualStates(stack).filter((s) => !only.length || only.includes(s.name));
const locales = list("VISUAL_LOCALES", "en,zh-HK"), widths = list("VISUAL_WIDTHS", "390,1440").map(Number), schemes = list("VISUAL_SCHEMES", "light,dark");
const out = `${VISUAL_DIR}/${tag}`;
mkdirSync(out, { recursive: true });

// Hide what changes between identical runs: the dev overlay, the caret and running animations.
const STILL = "nextjs-portal{display:none!important}*,*::before,*::after{caret-color:transparent!important;animation-play-state:paused!important;transition:none!important}";
const browser = await chromium.launch(LAUNCH);
const manifest: Record<string, { status: number; url: string; overflow: boolean; errors: string[] }> = {};
try {
  for (const state of states) {
    if (state.sql) stackSql(stack, state.sql(stack));
    try {
      for (const locale of locales) for (const width of widths.filter((w) => !state.widths || state.widths.includes(w))) for (const scheme of schemes) {
        const context = await browser.newContext({ baseURL: stack.app, viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: scheme === "dark" ? "dark" : "light", storageState: stack.sessions[state.role] });
        await context.addCookies([{ name: "kinnso-theme", value: scheme, url: stack.app }]);
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
        const path = state.path.startsWith("~") ? `/${locale}/owner/${stack.slug}${state.path.slice(1)}` : `/${locale}${state.path}`;
        const response = await page.goto(path, { waitUntil: "networkidle", timeout: 240_000 });
        await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 60_000 }).catch(() => errors.push("not hydrated"));
        await page.addStyleTag({ content: STILL });
        await state.setup?.(page, stack);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const name = `${state.name}-${locale}-${width}-${scheme}`;
        await page.screenshot({ path: `${out}/${name}.png`, fullPage: true, animations: "disabled" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        manifest[name] = { status: response?.status() ?? 0, url: new URL(page.url()).pathname, overflow, errors };
        console.log(name, manifest[name].status, overflow ? "OVERFLOW" : "", errors.length ? errors.join(" / ") : "");
        await context.close();
      }
    } finally {
      if (state.undo) stackSql(stack, state.undo(stack));
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
}
