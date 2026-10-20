import { describe, expect, it } from "vitest"

import { actionEn, actionZhHK, actionZhTW } from "@/lib/copy-action"
import { copy } from "@/lib/copy"

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [p, v] of leaves(value, path)) out.set(p, v)
  }
  return out
}

const en = leaves(actionEn as unknown as Tree)
const locales = { "zh-HK": leaves(actionZhHK as unknown as Tree), "zh-TW": leaves(actionZhTW as unknown as Tree) }
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
// Product terms written the same way in every locale.
const SHARED = new Set(["history.agent"])

describe("action copy", () => {
  it("is registered as copy[locale].action", () => {
    expect(copy.en.action).toBe(actionEn)
    expect(copy["zh-HK"].action).toBe(actionZhHK)
    expect(copy["zh-TW"].action).toBe(actionZhTW)
  })

  it.each(Object.entries(locales))("%s has the same keys and placeholders as en", (_, zh) => {
    expect([...zh.keys()].sort()).toEqual([...en.keys()].sort())
    for (const [key, value] of en) expect(placeholders(zh.get(key)!), key).toEqual(placeholders(value))
  })

  it.each(Object.entries(locales))("%s strings are written in Chinese", (_, zh) => {
    for (const [key, value] of zh) {
      if (SHARED.has(key)) continue
      expect(value, key).toMatch(/[一-鿿]/)
    }
  })

  it("no string is empty", () => {
    for (const tree of [en, ...Object.values(locales)]) for (const [key, value] of tree) expect(value.trim(), key).not.toBe("")
  })
})
