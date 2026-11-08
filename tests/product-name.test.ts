import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * The product is Kinnso OS and its paid plan is the Growth plan (decisions
 * 2026-10-19 and 2026-10-20). Old names must not come back into anything a
 * person reads. Package and repo names (@sme-scanner/*) are code, not copy.
 */
const OLD = /SME Scanner|SME Assistant|Visibility Workspace|Growth Workspace|增長工作台|成長工作台/

describe("product and plan names", () => {
  it("no user-facing source uses an old name", () => {
    const files = execSync("git ls-files -- app components lib public", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(tsx?|json)$/.test(f) && !/\.test\.tsx?$|__snapshots__/.test(f))
    const hits = files.filter((f) => OLD.test(readFileSync(f, "utf8")))
    expect(hits).toEqual([])
  })
})
