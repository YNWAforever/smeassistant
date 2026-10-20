/**
 * Strings for the Kinnso OS component kit (components/kinnso/*), reached as
 * copy[locale].ui. Three full dictionaries; zh-HK is Hong Kong written
 * Chinese, zh-TW uses Taiwan terms (CLAUDE.md §5 copy hygiene).
 */
import type { FactTypeName, ProviderStateName } from "@/lib/domain-labels"
import { visualEn, visualZhHK, visualZhTW, type VisualCopy } from "@/lib/copy-visual"

export type UiCopy = {
  factTypes: Record<FactTypeName, { label: string; description: string }>
  factLegend: string
  providerStates: Record<ProviderStateName, string>
  sources: { google_search: string; google_business: string; search_ai: string; instagram: string; website: string }
  score: { outOf: string; noScore: string; noScoreBody: string; coverage: string; coverageOf: string }
  evidence: { observed: string; source: string; dateUnknown: string }
  stat: { unknown: string; notComparable: string; sinceComparable: string }
  action: { impact: string; effort: string; minutes: string; levels: { low: string; medium: string; high: string }; open: string }
  approval: { versionLabel: string; locked: string; approve: string; requestChanges: string; viewerOnly: string }
  diff: { title: string; before: string; after: string; added: string; removed: string; unchanged: string }
  states: {
    emptyTitle: string
    errorTitle: string
    errorBody: string
    retry: string
    partialTitle: string
    partialBody: string
    deniedTitle: string
    deniedBody: string
    /** Shown under an error with Next's digest, so the owner can quote it to Fimmick. */
    reference: string
    loading: string
    home: string
    today: string
    notFoundTitle: string
    notFoundBody: string
  }
  table: { empty: string }
  confirm: { cancel: string; confirm: string }
  command: { label: string; placeholder: string; empty: string; shortcut: string }
  /** Visual explanation components (lib/copy-visual.ts). */
  visual: VisualCopy
}

export const uiEn: UiCopy = {
  factTypes: {
    Observed: { label: "Observed", description: "Seen directly in a public source at the time shown." },
    Inference: { label: "Inference", description: "Our reading of the evidence, not a measurement." },
    Recommended: { label: "Recommended", description: "A suggested next step. Nothing happens until you approve it." },
    Attributed: { label: "Attributed", description: "Changed after an action. Timing only, not proof it caused the change." },
    Estimated: { label: "Estimated", description: "Worked out from a sample, so it may differ from the full picture." },
    Unknown: { label: "Unknown", description: "We cannot measure this from public evidence." },
  },
  factLegend: "What these labels mean",
  providerStates: { measured: "Measured", pending: "Checking", unavailable: "Not available", unsupported: "Not supported", failed: "Check failed" },
  sources: { google_search: "Google Search", google_business: "Google Maps", search_ai: "AI search", instagram: "Instagram", website: "Website" },
  score: {
    outOf: "out of 100",
    noScore: "No score yet",
    noScoreBody: "Too little measured evidence to score fairly.",
    coverage: "coverage",
    coverageOf: "{measured} of {total} sources measured",
  },
  evidence: { observed: "Observed {date}", source: "Source", dateUnknown: "Date not recorded" },
  stat: { unknown: "Unknown", notComparable: "Not comparable", sinceComparable: "since last comparable scan" },
  action: {
    impact: "Impact",
    effort: "Effort",
    minutes: "{n} min",
    levels: { low: "Low", medium: "Medium", high: "High" },
    open: "Open",
  },
  approval: {
    versionLabel: "Version {n}",
    locked: "Approval locks this exact version",
    approve: "Approve",
    requestChanges: "Request changes",
    viewerOnly: "View only: your role cannot approve",
  },
  diff: { title: "Changes between versions", before: "Before", after: "After", added: "Added", removed: "Removed", unchanged: "No changes" },
  states: {
    emptyTitle: "Nothing here yet",
    errorTitle: "Something went wrong",
    errorBody: "We could not load this. Your work is safe.",
    retry: "Try again",
    partialTitle: "Partial evidence",
    partialBody: "Some sources could not be checked. Missing sources lower coverage, not the score.",
    deniedTitle: "You can view, not change",
    deniedBody: "Your role or location scope does not allow this. Ask the workspace owner.",
    reference: "Reference: {code}",
    loading: "Loading…",
    home: "Go to the home page",
    today: "Back to Today",
    notFoundTitle: "We could not find that page",
    notFoundBody: "It may have moved, or the link is out of date.",
  },
  table: { empty: "No rows to show" },
  confirm: { cancel: "Cancel", confirm: "Confirm" },
  command: { label: "Search and jump", placeholder: "Type a page or action…", empty: "No matches", shortcut: "Ctrl K" },
  visual: visualEn,
}

export const uiZhHK: UiCopy = {
  factTypes: {
    Observed: { label: "已觀察", description: "於所示時間直接在公開來源看到。" },
    Inference: { label: "推論", description: "根據證據作出的解讀，並非量度結果。" },
    Recommended: { label: "建議", description: "建議的下一步；你核准前不會發生任何事。" },
    Attributed: { label: "可能相關", description: "行動之後出現的變化；只代表時間先後，不證明由行動造成。" },
    Estimated: { label: "估算", description: "由樣本推算，可能與完整情況有出入。" },
    Unknown: { label: "未知", description: "無法從公開證據量度。" },
  },
  factLegend: "標籤說明",
  providerStates: { measured: "已量度", pending: "檢查中", unavailable: "暫未能取得", unsupported: "不支援", failed: "檢查失敗" },
  sources: { google_search: "Google 搜尋", google_business: "Google 地圖", search_ai: "AI 搜尋", instagram: "Instagram", website: "網站" },
  score: {
    outOf: "滿分 100",
    noScore: "暫未評分",
    noScoreBody: "已量度的證據太少，未能公平評分。",
    coverage: "覆蓋率",
    coverageOf: "{total} 個來源中已量度 {measured} 個",
  },
  evidence: { observed: "觀察於 {date}", source: "來源", dateUnknown: "未有記錄日期" },
  stat: { unknown: "未知", notComparable: "未能比較", sinceComparable: "自上次可比較掃描" },
  action: {
    impact: "影響",
    effort: "工夫",
    minutes: "{n} 分鐘",
    levels: { low: "低", medium: "中", high: "高" },
    open: "開啟",
  },
  approval: {
    versionLabel: "第 {n} 版",
    locked: "核准會鎖定這個版本",
    approve: "核准",
    requestChanges: "要求修改",
    viewerOnly: "只供查看：你的角色不能核准",
  },
  diff: { title: "版本之間的改動", before: "修改前", after: "修改後", added: "新增", removed: "刪除", unchanged: "沒有改動" },
  states: {
    emptyTitle: "暫時未有內容",
    errorTitle: "出現問題",
    errorBody: "未能載入此頁。你的工作不受影響。",
    retry: "再試一次",
    partialTitle: "部分證據",
    partialBody: "部分來源未能檢查。缺少的來源只會降低覆蓋率，不會拉低評分。",
    deniedTitle: "你只能查看，不能修改",
    deniedBody: "你的角色或地點範圍不允許此操作。請聯絡工作台擁有人。",
    reference: "參考編號：{code}",
    loading: "載入中…",
    home: "前往首頁",
    today: "返回今日",
    notFoundTitle: "找不到此頁",
    notFoundBody: "此頁可能已搬遷，或連結已過時。",
  },
  table: { empty: "沒有資料" },
  confirm: { cancel: "取消", confirm: "確認" },
  command: { label: "搜尋及前往", placeholder: "輸入頁面或行動…", empty: "沒有相符結果", shortcut: "Ctrl K" },
  visual: visualZhHK,
}

export const uiZhTW: UiCopy = {
  factTypes: {
    Observed: { label: "已觀察", description: "於所示時間直接在公開來源看到。" },
    Inference: { label: "推論", description: "依據證據所做的解讀，並非量測結果。" },
    Recommended: { label: "建議", description: "建議的下一步；你核准前不會執行任何動作。" },
    Attributed: { label: "可能相關", description: "行動之後出現的變化；僅代表時間先後，不證明由行動造成。" },
    Estimated: { label: "估算", description: "由樣本推算，可能與完整情況有落差。" },
    Unknown: { label: "未知", description: "無法從公開證據量測。" },
  },
  factLegend: "標籤說明",
  providerStates: { measured: "已量測", pending: "檢查中", unavailable: "暫時無法取得", unsupported: "不支援", failed: "檢查失敗" },
  sources: { google_search: "Google 搜尋", google_business: "Google 地圖", search_ai: "AI 搜尋", instagram: "Instagram", website: "網站" },
  score: {
    outOf: "滿分 100",
    noScore: "尚未評分",
    noScoreBody: "已量測的證據太少，無法公平評分。",
    coverage: "涵蓋率",
    coverageOf: "{total} 個來源中已量測 {measured} 個",
  },
  evidence: { observed: "觀察於 {date}", source: "來源", dateUnknown: "未記錄日期" },
  stat: { unknown: "未知", notComparable: "無法比較", sinceComparable: "自上次可比較掃描" },
  action: {
    impact: "影響",
    effort: "工作量",
    minutes: "{n} 分鐘",
    levels: { low: "低", medium: "中", high: "高" },
    open: "開啟",
  },
  approval: {
    versionLabel: "第 {n} 版",
    locked: "核准會鎖定這個版本",
    approve: "核准",
    requestChanges: "要求修改",
    viewerOnly: "僅供檢視：你的角色無法核准",
  },
  diff: { title: "版本之間的變更", before: "變更前", after: "變更後", added: "新增", removed: "刪除", unchanged: "沒有變更" },
  states: {
    emptyTitle: "目前沒有內容",
    errorTitle: "發生問題",
    errorBody: "無法載入此頁。你的工作不受影響。",
    retry: "再試一次",
    partialTitle: "部分證據",
    partialBody: "部分來源無法檢查。缺少的來源只會降低涵蓋率，不會拉低評分。",
    deniedTitle: "你只能檢視，無法修改",
    deniedBody: "你的角色或據點範圍不允許此操作。請聯絡工作台擁有者。",
    reference: "參考編號：{code}",
    loading: "載入中…",
    home: "前往首頁",
    today: "返回今日",
    notFoundTitle: "找不到這個頁面",
    notFoundBody: "這個頁面可能已移動，或連結已過期。",
  },
  table: { empty: "沒有資料" },
  confirm: { cancel: "取消", confirm: "確認" },
  command: { label: "搜尋並前往", placeholder: "輸入頁面或行動…", empty: "沒有符合的結果", shortcut: "Ctrl K" },
  visual: visualZhTW,
}

/** Fills `{name}` placeholders; missing values stay visible rather than becoming empty. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
