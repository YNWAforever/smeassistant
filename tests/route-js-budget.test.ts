import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { budgetFor, measureRoutes } from "../scripts/check-route-js.mjs"

function fakeBuild(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "route-js-"))
  mkdirSync(path.join(dir, "static/chunks"), { recursive: true })
  const chunk = (name: string, bytes: number) => writeFileSync(path.join(dir, "static/chunks", name), "x".repeat(bytes))
  chunk("root.js", 10)
  chunk("layout.js", 10)
  chunk("page.js", 10)
  chunk("other.js", 400_000)
  writeFileSync(path.join(dir, "build-manifest.json"), JSON.stringify({ rootMainFiles: ["static/chunks/root.js"] }))
  const pageDir = path.join(dir, "server/app/[locale]/owner/[workspaceSlug]/(today)")
  mkdirSync(pageDir, { recursive: true })
  const manifest = {
    entryJSFiles: {
      "[project]/app/[locale]/owner/[workspaceSlug]/layout": ["static/chunks/layout.js"],
      "[project]/app/[locale]/owner/[workspaceSlug]/(today)/page": ["static/chunks/page.js"],
      // A sibling route's page and an error boundary are not part of this first load.
      "[project]/app/[locale]/owner/[workspaceSlug]/insights/page": ["static/chunks/other.js"],
      "[project]/app/[locale]/owner/[workspaceSlug]/error": ["static/chunks/other.js"],
    },
  }
  writeFileSync(path.join(pageDir, "page_client-reference-manifest.js"),
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST["/[locale]/owner/[workspaceSlug]/(today)/page"] = ${JSON.stringify(manifest)};`)
  return dir
}

describe("route JS budget", () => {
  it("counts only the root files and the layouts and page on the route's own path", () => {
    const [today] = measureRoutes(fakeBuild())
    expect(today.route).toBe("/[locale]/owner/[workspaceSlug]/(today)")
    expect(today.kb).toBeLessThan(5)
    expect(today.budget).toBe(300)
  })

  it("gives workspace routes their own budget and every other route the default", () => {
    expect(budgetFor("/[locale]/owner/[workspaceSlug]/insights")).toBe(300)
    expect(budgetFor("/[locale]/pricing")).toBe(240)
    expect(budgetFor("/")).toBe(240)
  })
})
