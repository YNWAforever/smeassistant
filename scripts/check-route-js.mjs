#!/usr/bin/env node
/**
 * First-load JavaScript budget per app route, read from a production build.
 *
 * A route's first load is the root main files plus the entry chunks of every
 * layout and page on its path (error, loading and not-found boundaries load
 * only when needed). Sizes are gzipped. Run after `next build`:
 *
 *   node scripts/check-route-js.mjs [.next]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

/** Budgets in KB (gzipped). The first matching prefix wins. */
export const BUDGETS = [
  { prefix: "/[locale]/owner/[workspaceSlug]", kb: 300 },
  { prefix: "", kb: 240 },
];

export function budgetFor(route) {
  return BUDGETS.find((b) => route.startsWith(b.prefix)).kb;
}

function readManifest(file) {
  const store = {};
  new Function("globalThis", readFileSync(file, "utf8"))({ __RSC_MANIFEST: store });
  const [route, manifest] = Object.entries(store)[0];
  return { route: route.replace(/\/page$/, "") || "/", manifest };
}

/** Segments a route is built from: "/a/(g)/b" -> ["", "/a", "/a/(g)", "/a/(g)/b"]. */
function segments(route) {
  const parts = route.split("/").filter(Boolean);
  return ["", ...parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"))];
}

export function measureRoutes(nextDir) {
  const root = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8")).rootMainFiles;
  const sizes = new Map();
  const gz = (f) => {
    if (!sizes.has(f)) sizes.set(f, gzipSync(readFileSync(join(nextDir, f))).length);
    return sizes.get(f);
  };
  const results = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === "page_client-reference-manifest.js") {
        const { route, manifest } = readManifest(path);
        const files = new Set(root);
        const onPath = new Set(segments(route));
        for (const [key, chunks] of Object.entries(manifest.entryJSFiles ?? {})) {
          const match = /^\[project\]\/app(.*)\/(layout|page)$/.exec(key);
          if (match && onPath.has(match[1])) chunks.forEach((f) => files.add(f));
        }
        const kb = Math.round([...files].reduce((sum, f) => sum + gz(f), 0) / 1024);
        results.push({ route, kb, budget: budgetFor(route) });
      }
    }
  };
  walk(join(nextDir, "server/app"));
  return results.sort((a, b) => b.kb - a.kb);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nextDir = process.argv[2] ?? ".next";
  if (!existsSync(join(nextDir, "build-manifest.json"))) {
    console.error(`No production build in ${nextDir}; run next build first.`);
    process.exit(2);
  }
  const results = measureRoutes(nextDir);
  const over = results.filter((r) => r.kb > r.budget);
  for (const r of results) console.log(`${r.kb > r.budget ? "OVER" : "ok  "} ${String(r.kb).padStart(4)} / ${r.budget} KB  ${r.route}`);
  if (over.length) {
    console.error(`\n${over.length} route(s) over their first-load JS budget.`);
    process.exit(1);
  }
}
