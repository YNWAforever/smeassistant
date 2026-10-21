/**
 * Pixel comparison of two capture tags (see README.md).
 *
 *   corepack pnpm exec tsx test/visual/compare.ts <before> <after>
 *
 * Exact comparison: any differing pixel counts. Writes test-results/visual/diff-<before>-<after>/
 * with a red-on-grey diff image per changed capture and summary.json. Exits 1 when anything differs.
 * Decoding runs in Chromium (canvas), so the tool needs no image library.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { LAUNCH, VISUAL_DIR } from "./shared";

const [before, after] = process.argv.slice(2);
if (!before || !after) throw new Error("Usage: tsx test/visual/compare.ts <before> <after>");
const dirA = `${VISUAL_DIR}/${before}`, dirB = `${VISUAL_DIR}/${after}`, out = `${VISUAL_DIR}/diff-${before}-${after}`;
mkdirSync(out, { recursive: true });
const names = [...new Set([...readdirSync(dirA), ...readdirSync(dirB)])].filter((n) => n.endsWith(".png")).sort();
const browser = await chromium.launch(LAUNCH);
const page = await browser.newPage();
const summary: Record<string, string> = {};
let changed = 0;
for (const name of names) {
  if (!existsSync(`${dirA}/${name}`) || !existsSync(`${dirB}/${name}`)) { summary[name] = existsSync(`${dirA}/${name}`) ? "missing after" : "missing before"; changed++; continue; }
  const a = readFileSync(`${dirA}/${name}`), b = readFileSync(`${dirB}/${name}`);
  if (a.equals(b)) continue;
  const result = await page.evaluate(async ([srcA, srcB]) => {
    const load = async (src: string) => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const [ia, ib] = await Promise.all([load(srcA), load(srcB)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const read = (img: HTMLImageElement) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d")!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = read(ia), db = read(ib);
    const c = new OffscreenCanvas(w, h), x = c.getContext("2d")!, diff = x.createImageData(w, h);
    let pixels = 0;
    for (let i = 0; i < da.length; i += 4) {
      const same = da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2] && da[i + 3] === db[i + 3];
      if (!same) pixels++;
      const grey = (da[i] + da[i + 1] + da[i + 2]) / 3 * 0.3 + 178;
      diff.data.set(same ? [grey, grey, grey, 255] : [220, 0, 0, 255], i);
    }
    x.putImageData(diff, 0, 0);
    const blob = await c.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { pixels, size: `${ia.width}x${ia.height} → ${ib.width}x${ib.height}`, png: btoa(binary) };
  }, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]);
  if (result.pixels === 0) continue;
  changed++;
  summary[name] = `${result.pixels} px (${result.size})`;
  writeFileSync(`${out}/${name}`, Buffer.from(result.png, "base64"));
}
await browser.close();
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
for (const [name, detail] of Object.entries(summary)) console.log(name, detail);
console.log(`${names.length} captures, ${changed} differ`);
process.exit(changed ? 1 : 0);
