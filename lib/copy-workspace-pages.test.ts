import { describe, expect, it } from "vitest"

import { copy } from "@/lib/copy"
import { workspaceActionsEn, workspaceActionsZhHK, workspaceActionsZhTW } from "@/lib/copy-workspace-actions"
import { workspaceBusinessEn, workspaceBusinessZhHK, workspaceBusinessZhTW } from "@/lib/copy-workspace-business"
import { workspaceHomeEn, workspaceHomeZhHK, workspaceHomeZhTW } from "@/lib/copy-workspace-home"

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

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
// English writes the day as an ordinal ("12th"); Chinese writes the plain day number.
const ORDINAL_DAY = new Set(["home.monthlyOn", "calendar.monthlyAround"])
// Product names written the same way in every locale.
const SHARED = new Set(["activity.providers.instagram", "activity.providers.ga4"])

const namespaces = {
  workspaceHome: [workspaceHomeEn, workspaceHomeZhHK, workspaceHomeZhTW],
  workspaceActions: [workspaceActionsEn, workspaceActionsZhHK, workspaceActionsZhTW],
  workspaceBusiness: [workspaceBusinessEn, workspaceBusinessZhHK, workspaceBusinessZhTW],
} as const

describe.each(Object.entries(namespaces))("%s copy", (name, [enTree, hkTree, twTree]) => {
  const en = leaves(enTree as unknown as Tree)
  const locales = { "zh-HK": leaves(hkTree as unknown as Tree), "zh-TW": leaves(twTree as unknown as Tree) }

  it(`is registered as copy[locale].${name}`, () => {
    expect(copy.en[name as keyof typeof namespaces]).toBe(enTree)
    expect(copy["zh-HK"][name as keyof typeof namespaces]).toBe(hkTree)
    expect(copy["zh-TW"][name as keyof typeof namespaces]).toBe(twTree)
  })

  it.each(Object.entries(locales))("%s has the same keys and placeholders as en", (_, zh) => {
    expect([...zh.keys()].sort()).toEqual([...en.keys()].sort())
    for (const [key, value] of en) {
      if (ORDINAL_DAY.has(key)) expect(placeholders(zh.get(key)!), key).toEqual(["day"])
      else expect(placeholders(zh.get(key)!), key).toEqual(placeholders(value))
    }
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
