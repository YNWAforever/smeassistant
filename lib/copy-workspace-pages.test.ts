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

describe("zh-HK Today and Insights shop language", () => {
  const home = workspaceHomeZhHK.home
  const insights = workspaceHomeZhHK.insights
  const joined = Object.values(home).flatMap((value) => typeof value === "string" ? [value] : Object.values(value)).concat(Object.values(insights)).join("\n")

  it("leads with shop language instead of the old measurement jargon", () => {
    expect(home.noActionNeedsYour).toBe("而家冇嘢要你決定")
    expect(home.scoreWithheldTooLittle).toBe("資料未夠，暫時未評")
    expect(home.coverageMissingSourcesLower).toBe("呢次查到 {coverage}% 資料。")
    expect(home.snapshot).toBe("今次掃描結果")
    expect(home.noFabricatedAggregateScore).toBe("各舖分開睇分")
    expect(home.teamFinishedOne).toContain("Kinnso 幫你準備咗")
    expect(insights.noInventedAggregateScore).toBe("各舖分開睇分")
    expect(insights.coverageLead).toBe("呢次查到")
    expect(insights.eligibility).toBe("可唔可以同上次比")
    expect(copy["zh-HK"].home.trust).toBe("點解咁講")
    expect(copy["zh-HK"].home.title).toBe("而家最應做")
    expect(copy["zh-HK"].home.quietTitle).toBe("而家冇嘢要你決定")
    expect(insights.leadTitle).toBe("有冇好啲")
    expect(insights.missingFirst).toContain("再掃一次同一間舖")
    expect(insights.betterResolved).toContain("{n}")
    for (const jargon of ["覆蓋率", "快照", "比較資格", "可比較掃描", "AI 能見度團隊", "不製造合併平均分", "已量度", "專員"]) {
      expect(joined, jargon).not.toContain(jargon)
    }
  })

  it("keeps the honesty rules reachable in the disclosure copy", () => {
    expect(home.everyNumberComesFrom).toContain("唔會當零分")
    expect(home.everyNumberComesFrom).toContain("唔代表帶嚟收入或者訂座")
    expect(home.neverAutoPublishedOne).toContain("唔會自動發佈")
    expect(home.temporalAssociationOnlyNo).toContain("唔代表帶嚟收入或者訂座")
    expect(insights.unmeasuredSourcesAreNot).toContain("唔會當零分")
    expect(insights.unmeasuredSourcesAreNot).toContain("唔會拉低分數")
    expect(insights.unmeasuredSourcesAreNot).toContain("唔會畫成一條線")
    expect(insights.theDenominatorIsThe).toContain("唔會當 0%")
    expect(insights.locationsHaveDifferentCoverage).toContain("唔會砌一個總分")
    expect(insights.noTrendIsShown).toContain("唔會畫走勢")
  })
})
