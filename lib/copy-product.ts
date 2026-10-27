/**
 * Shared product components (components/product/*), reached as copy[locale].product:
 * the capability and fact-type badges, the score dial and loop ribbon, and the
 * language selector. Fact types are the six labels every claim carries (guardrail 4).
 * {score}, {coverage} and {delta} are filled with lib/copy-ui.ts `fill`.
 */

export type ProductCopy = {
  capability: {
    Live: string
    Beta: string
    Demo: string
    "Requires connection": string
    Planned: string
  }
  factType: {
    Observed: string
    Inference: string
    Recommended: string
    Attributed: string
    Estimated: string
    Unknown: string
  }
  score: {
    aria: string
    ariaCoverage: string
    ariaChange: string
    coverage: string
    sinceComparable: string
  }
  loop: {
    label: string
    steps: string[]
  }
  language: string
}

export const productEn: ProductCopy = {
  capability: {
    Live: "Live",
    Beta: "Beta",
    Demo: "Demo",
    "Requires connection": "Requires connection",
    Planned: "Planned",
  },
  factType: {
    Observed: "Observed",
    Inference: "Inference",
    Recommended: "Recommended",
    Attributed: "Attributed",
    Estimated: "Estimated",
    Unknown: "Unknown",
  },
  score: {
    aria: "Visibility score {score} out of 100.",
    ariaCoverage: " Coverage {coverage} percent.",
    ariaChange: " Change {delta}.",
    coverage: "coverage",
    sinceComparable: "since comparable scan",
  },
  loop: {
    label: "Visibility improvement loop",
    steps: ["Discover", "Diagnose", "Prioritise", "Draft", "Approve", "Export", "Re-scan", "Prove change"],
  },
  language: "Language",
}

export const productZhHK: ProductCopy = {
  capability: {
    Live: "已啟用",
    Beta: "測試版",
    Demo: "示範",
    "Requires connection": "需要連接",
    Planned: "計劃中",
  },
  factType: {
    Observed: "已觀察",
    Inference: "推論",
    Recommended: "建議",
    Attributed: "可能相關",
    Estimated: "估算",
    Unknown: "未知",
  },
  score: {
    aria: "分數 {score}，滿分 100。",
    ariaCoverage: "呢次查到 {coverage}% 資料。",
    ariaChange: "同上次可以比，變咗 {delta}。",
    coverage: "今次資料",
    sinceComparable: "（可以同上次比）",
  },
  loop: {
    label: "能見度改善循環",
    steps: ["發現", "診斷", "排序", "擬稿", "確認", "匯出／發佈", "重新掃描", "證明改善"],
  },
  language: "介面語言",
}

export const productZhTW: ProductCopy = {
  capability: {
    Live: "已啟用",
    Beta: "測試版",
    Demo: "示範",
    "Requires connection": "需要連接",
    Planned: "計劃中",
  },
  factType: {
    Observed: "已觀察",
    Inference: "推論",
    Recommended: "建議",
    Attributed: "可能相關",
    Estimated: "估算",
    Unknown: "未知",
  },
  score: {
    aria: "能見度評分 {score} 分（滿分 100）。",
    ariaCoverage: "覆蓋率 {coverage}%。",
    ariaChange: "可比較變化 {delta}。",
    coverage: "涵蓋率",
    sinceComparable: "（自上次可比較掃描）",
  },
  loop: {
    label: "能見度改善循環",
    steps: ["發現", "診斷", "排序", "擬稿", "確認", "匯出／發佈", "重新掃描", "證明改善"],
  },
  language: "介面語言",
}
