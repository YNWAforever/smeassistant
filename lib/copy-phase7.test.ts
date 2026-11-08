import { describe, expect, it } from "vitest"

import { copy } from "@/lib/copy"
import { accessRequestEn, accessRequestZhHK, accessRequestZhTW } from "@/lib/copy-access-request"
import { actionTabsEn, actionTabsZhHK, actionTabsZhTW } from "@/lib/copy-action-tabs"
import { assistantSheetEn, assistantSheetZhHK, assistantSheetZhTW } from "@/lib/copy-assistant"
import { demoWorkspaceEn, demoWorkspaceZhHK, demoWorkspaceZhTW } from "@/lib/copy-demo-workspace"
import { pricingPageEn, pricingPageZhHK, pricingPageZhTW } from "@/lib/copy-pricing"
import { productEn, productZhHK, productZhTW } from "@/lib/copy-product"
import { workspaceLabelsEn, workspaceLabelsZhHK, workspaceLabelsZhTW } from "@/lib/copy-workspace-labels"

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
// English shows the evidence's own fact type; Chinese pages have always read 已觀察.
const OWN_PLACEHOLDERS = new Set(["assistantSheet.evidenceCard.factBadge"])
// Product names and punctuation-only joins, written the same way in every locale.
const NOT_CHINESE = new Set(["workspaceLabels.actors.agent", "workspaceLabels.actors.system", "pricingPage.plans.growth.cadence"])

const namespaces = {
  accessRequest: [accessRequestEn, accessRequestZhHK, accessRequestZhTW],
  assistantSheet: [assistantSheetEn, assistantSheetZhHK, assistantSheetZhTW],
  demoWorkspace: [demoWorkspaceEn, demoWorkspaceZhHK, demoWorkspaceZhTW],
  pricingPage: [pricingPageEn, pricingPageZhHK, pricingPageZhTW],
  product: [productEn, productZhHK, productZhTW],
  actionTabs: [actionTabsEn, actionTabsZhHK, actionTabsZhTW],
  workspaceLabels: [workspaceLabelsEn, workspaceLabelsZhHK, workspaceLabelsZhTW],
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
      if (OWN_PLACEHOLDERS.has(`${name}.${key}`)) continue
      expect(placeholders(zh.get(key)!), key).toEqual(placeholders(value))
    }
  })

  it.each(Object.entries(locales))("%s strings are written in Chinese", (_, zh) => {
    for (const [key, value] of zh) {
      if (NOT_CHINESE.has(`${name}.${key}`)) continue
      expect(value, key).toMatch(/[一-鿿]/)
    }
  })

  it("no string is empty", () => {
    for (const tree of [en, ...Object.values(locales)]) for (const [key, value] of tree) expect(value.trim(), key).not.toBe("")
  })
})
