import type { PrototypeLocale } from "@/lib/copy";
import { actions, merchant, providers } from "@/lib/demo-data";

import type { ReportModuleRow, ReportPriorityRow, ReportProps } from "./report-props";

/**
 * /sample-report renders the same ReportPage as a real report, fed from the
 * fixed, sanitised Kam Man House demo data (guardrail 12). Nothing here reads
 * the database; the zh strings are the prototype's original sample copy.
 */

const actionLabels: Record<string, { title: string; summary: string; reason: string }> = {
  "review-response": { title: "回覆 7 則未回覆的 Google 評論", summary: "7 則近期顧客評論仍等待店主回覆。", reason: "最新退步 · 高意向接觸點 · 草稿已準備" },
  "social-post": { title: "處理 Instagram 16 日內容空檔", summary: "最近可取得的公開帖文距今 16 日。", reason: "內容新鮮度下降 · 所需資料已齊" },
  "visibility-content": { title: "新增私人宴會常見問題", summary: "網站未有清楚交代私人宴會的基本查詢。", reason: "高意向問題 · 可由現有商戶資料安全擬稿" },
}

const providerZh: Record<string, { name: string; value: string; detail: string }> = {
  "Google Business & Maps": { name: "Google 商戶與地圖", value: "回覆率 18%", detail: "7 則近期評論沒有店主回覆。" },
  "Public website": { name: "公開網站", value: "15 項中通過 12 項", detail: "餐牌及營業時間可讀；常見問題覆蓋有限。" },
  "Google Search & AI surfaces": { name: "Google 搜尋與 AI 版面", value: "5 個查詢中出現 2 次", detail: "商戶在地圖及一次 AI Overview 出現；其餘 3 個可比較查詢沒有出現。" },
  "Instagram public evidence": { name: "Instagram 公開證據", value: "不計分", detail: "來源未能提供完整公開快照，因此不會降低評分。" },
}

const priorityTone = { Urgent: "urgent", High: "high", Medium: "medium", Low: "low" } as const

export function sampleReportProps(locale: PrototypeLocale): ReportProps {
  const isChinese = locale !== "en"
  const priorities: ReportPriorityRow[] = actions.slice(0, 3).map((action, index) => {
    const zh = actionLabels[action.id]
    const providerName = isChinese ? (providerZh[action.source]?.name ?? action.source) : action.source
    return {
      key: action.id,
      rank: index + 1,
      label: isChinese && zh ? zh.title : action.title,
      module: action.source,
      moduleLabel: providerName,
      severity: action.priority.toLowerCase(),
      severityLabel: isChinese ? (index === 0 ? "緊急" : "高") : action.priority,
      tone: priorityTone[action.priority],
      scoreImpact: null,
      overallImpact: null,
      summary: isChinese && zh ? zh.summary : action.summary,
      action: isChinese && zh ? zh.reason : action.reason,
      evidence: {
        source: providerName,
        excerpt: isChinese && index === 0 ? "回覆率由 31% 降至 18%；本地比較值為 61%。" : action.evidence,
        observedAt: isChinese ? "觀察於 2026 年 8 月 25 日 · 示範" : action.observedAt,
      },
      effort: action.effort,
    }
  })

  const modules: ReportModuleRow[] = providers.map((provider) => {
    const zh = providerZh[provider.name]
    return {
      key: provider.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: isChinese && zh ? zh.name : provider.name,
      state: provider.state,
      value: isChinese && zh ? zh.value : provider.value,
      detail: isChinese && zh ? zh.detail : provider.detail,
      observedAt: isChinese ? "2026 年 8 月 25 日 · 香港時間 · 示範" : provider.observedAt,
      limitationCode: null,
    }
  })

  return {
    locale,
    access: "sample",
    sample: true,
    slug: "sample-report",
    market: "hk",
    businessName: merchant.name,
    district: isChinese ? "跑馬地" : "Happy Valley",
    industry: isChinese ? "餐飲" : "F&B",
    status: "partial",
    subtitle: isChinese
      ? "香港市場 · scan_kmh_20260825 · 觀察於 2026 年 8 月 25 日 09:42 HKT · 示範證據"
      : "Hong Kong market · scan_kmh_20260825 · Observed 25 Aug 2026, 09:42 HKT · Sample evidence",
    score: 62,
    coverage: 78,
    comparison: {
      kind: "comparable",
      delta: -4,
      title: isChinese ? "可比較掃描顯示能見度轉弱" : "Visibility weakened on a comparable scan",
      body: isChinese
        ? "兩次合資格掃描之間，評分由 66 降至 62。4 個主要來源中有 3 個已量度；未能取得的 Instagram 證據被排除，不會當成表現欠佳。"
        : "The score moved from 66 to 62 across two eligible scans. Three of four primary sources were measured; unavailable Instagram evidence was excluded rather than counted as poor performance.",
    },
    modules,
    priorities,
    locked: null,
    summary: null,
    findingGroups: [],
    proof: null,
    evidence: [],
    ctas: [],
  }
}
