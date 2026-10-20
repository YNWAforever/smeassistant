import { describe, expect, it } from "vitest"

import { diffText, tokenize } from "./text-diff"

describe("diffText", () => {
  it("marks added and removed words and keeps the rest", () => {
    expect(diffText("Thank you for visiting", "Thank you so much for visiting")).toEqual([
      { kind: "same", text: "Thank you " },
      { kind: "added", text: "so much " },
      { kind: "same", text: "for visiting" },
    ])
  })

  it("compares Han text character by character", () => {
    expect(tokenize("多謝光臨")).toEqual(["多", "謝", "光", "臨"])
    const parts = diffText("多謝光臨", "多謝再次光臨")
    expect(parts.filter((p) => p.kind === "added").map((p) => p.text).join("")).toBe("再次")
    expect(parts.filter((p) => p.kind === "removed")).toEqual([])
  })

  it("reports identical text as unchanged and handles empty sides", () => {
    expect(diffText("same", "same")).toEqual([{ kind: "same", text: "same" }])
    expect(diffText("", "new")).toEqual([{ kind: "added", text: "new" }])
    expect(diffText("old", "")).toEqual([{ kind: "removed", text: "old" }])
  })

  it("falls back to replace for very large drafts instead of freezing", () => {
    const big = Array.from({ length: 800 }, (_, i) => `w${i}`).join(" ")
    const parts = diffText(big, `${big} end`)
    expect(parts.map((p) => p.kind)).toEqual(["removed", "added"])
  })
})
