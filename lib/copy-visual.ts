/**
 * Strings for the visual explanation components (components/visual/*),
 * reached as copy[locale].ui.visual. zh-HK is Hong Kong written Chinese,
 * zh-TW uses Taiwan terms (CLAUDE.md §5 copy hygiene). Text budgets from the
 * UX brief: headings ≤ 8 words, supporting lines ≤ 20 words.
 */

export const incomparableReasons = ["first", "SCORING_VERSION_MISMATCH", "SCORING_VERSION_UNKNOWN", "NO_SHARED_MEASURED_MODULE", "INSUFFICIENT_INDEPENDENT_CHANNELS"] as const
export type IncomparableReason = (typeof incomparableReasons)[number]

export const loopSteps = ["scan", "decide", "approve", "deliver", "prove"] as const
export type LoopStep = (typeof loopSteps)[number]

export const approvalFlowSteps = ["draft", "needsApproval", "approved", "delivered"] as const
export type ApprovalFlowStep = (typeof approvalFlowSteps)[number]

export const illustrationKinds = ["noData", "noActions", "allDone", "error", "denied"] as const
export type IllustrationKind = (typeof illustrationKinds)[number]

type EmptyCopy = { title: string; body: string; action: string }

export type VisualCopy = {
  trend: {
    up: string
    down: string
    flat: string
    notComparable: string
    reasons: Record<IncomparableReason, string>
    summary: string
    summaryUnknown: string
    gapNote: string
    unknown: string
    breakBefore: string
  }
  matrix: {
    title: string
    impact: string
    effort: string
    high: string
    low: string
    quadrants: { quickWins: string; plan: string; fillIns: string; later: string }
    note: string
    empty: string
  }
  compare: { title: string; before: string; after: string; attributed: string; slider: string; notComparable: string }
  loop: { label: string; steps: Record<LoopStep, string>; stepOf: string }
  approvalFlow: { label: string; steps: Record<ApprovalFlowStep, string>; lock: string; current: string }
  scan: { label: string; progress: string; complete: string }
  explainer: { open: string }
  empty: Record<"noData" | "noActions" | "allDone", EmptyCopy>
  feedback: {
    approved: string
    copy: string
    copied: string
    export: string
    exported: string
    working: string
    failed: string
    copiedToast: string
    exportedToast: string
    usage: string
    usageUnlimited: string
    counted: string
    firstApproval: string
  }
  evidence: { limitation: string; viewSource: string }
}

export const visualEn: VisualCopy = {
  trend: {
    up: "Up {n}",
    down: "Down {n}",
    flat: "No change",
    notComparable: "Not comparable",
    reasons: {
      first: "First scan, so there is nothing to compare yet.",
      SCORING_VERSION_MISMATCH: "The scoring method changed between these scans.",
      SCORING_VERSION_UNKNOWN: "The scoring method of one scan is not recorded.",
      NO_SHARED_MEASURED_MODULE: "No source was measured in both scans.",
      INSUFFICIENT_INDEPENDENT_CHANNELS: "Too few sources were measured in both scans.",
    },
    summary: "{label}: {count} scans, latest {value}",
    summaryUnknown: "{label}: {count} scans, latest unknown",
    gapNote: "A break in the line means those scans cannot be compared.",
    unknown: "Unknown",
    breakBefore: "not comparable with the scan before",
  },
  matrix: {
    title: "Impact and effort",
    impact: "Impact",
    effort: "Effort",
    high: "High",
    low: "Low",
    quadrants: { quickWins: "Quick wins", plan: "Worth planning", fillIns: "Fill-ins", later: "Later" },
    note: "Our prioritisation from your evidence, not a measured result.",
    empty: "No open actions",
  },
  compare: {
    title: "Before and after",
    before: "Before",
    after: "After",
    attributed: "Attributed, not proven",
    slider: "Slide to compare before and after",
    notComparable: "These scans cannot be compared",
  },
  loop: {
    label: "Your progress",
    steps: { scan: "Scan", decide: "Decide", approve: "Approve", deliver: "Deliver", prove: "Prove" },
    stepOf: "Step {n} of {total}",
  },
  approvalFlow: {
    label: "How approval works",
    steps: { draft: "Draft", needsApproval: "Needs approval", approved: "Approved", delivered: "Delivered" },
    lock: "You stay in control: nothing goes out until you approve.",
    current: "Now",
  },
  scan: { label: "Scan progress", progress: "{done} of {total} sources checked", complete: "All sources checked" },
  explainer: { open: "What is {label}?" },
  empty: {
    noData: { title: "No evidence yet", body: "Run a scan to see what customers can find.", action: "Start a scan" },
    noActions: { title: "No actions yet", body: "Actions appear after your first scan.", action: "See your report" },
    allDone: { title: "All caught up", body: "Nothing needs your approval right now.", action: "View insights" },
  },
  feedback: {
    approved: "Approved",
    copy: "Copy text",
    copied: "Copied",
    export: "Export",
    exported: "Exported",
    working: "Working…",
    failed: "That did not work. Try again.",
    copiedToast: "Copied. Paste it where you publish.",
    exportedToast: "Exported. Nothing is published automatically.",
    usage: "{used} of {allowance} approved deliveries this month",
    usageUnlimited: "{used} approved deliveries this month",
    counted: "Delivery counted",
    firstApproval: "Your first approved action",
  },
  evidence: { limitation: "Limitation", viewSource: "View source" },
}

export const visualZhHK: VisualCopy = {
  trend: {
    up: "上升 {n}",
    down: "下跌 {n}",
    flat: "沒有變化",
    notComparable: "未能比較",
    reasons: {
      first: "這是第一次掃描，暫時未有比較對象。",
      SCORING_VERSION_MISMATCH: "兩次掃描之間評分方法有變。",
      SCORING_VERSION_UNKNOWN: "其中一次掃描未有記錄評分方法。",
      NO_SHARED_MEASURED_MODULE: "沒有來源在兩次掃描中都量度到。",
      INSUFFICIENT_INDEPENDENT_CHANNELS: "兩次掃描都量度到的來源太少。",
    },
    summary: "{label}：共 {count} 次掃描，最新 {value}",
    summaryUnknown: "{label}：共 {count} 次掃描，最新數值未知",
    gapNote: "線條中斷代表那幾次掃描未能比較。",
    unknown: "未知",
    breakBefore: "未能與上一次掃描比較",
  },
  matrix: {
    title: "影響與工夫",
    impact: "影響",
    effort: "工夫",
    high: "高",
    low: "低",
    quadrants: { quickWins: "快速見效", plan: "值得安排", fillIns: "有空才做", later: "稍後再做" },
    note: "這是我們根據你的證據作出的排序，並非量度結果。",
    empty: "沒有待處理的行動",
  },
  compare: {
    title: "前後對比",
    before: "之前",
    after: "之後",
    attributed: "可能相關，未經證實",
    slider: "拖動以比較前後",
    notComparable: "這兩次掃描未能比較",
  },
  loop: {
    label: "你的進度",
    steps: { scan: "掃描", decide: "決定", approve: "確認", deliver: "交付", prove: "驗證" },
    stepOf: "第 {n} 步，共 {total} 步",
  },
  approvalFlow: {
    label: "確認流程",
    steps: { draft: "草稿", needsApproval: "待確認", approved: "已確認", delivered: "已交付" },
    lock: "一切由你決定：未經你確認，不會發出任何內容。",
    current: "目前",
  },
  scan: { label: "掃描進度", progress: "{total} 個來源中已檢查 {done} 個", complete: "所有來源已檢查" },
  explainer: { open: "甚麼是{label}？" },
  empty: {
    noData: { title: "暫時未有證據", body: "進行掃描，看看顧客能找到甚麼。", action: "開始掃描" },
    noActions: { title: "暫時未有行動", body: "完成第一次掃描後會出現行動。", action: "查看報告" },
    allDone: { title: "全部處理好了", body: "目前沒有需要你確認的內容。", action: "查看洞察" },
  },
  feedback: {
    approved: "已確認",
    copy: "複製文字",
    copied: "已複製",
    export: "匯出",
    exported: "已匯出",
    working: "處理中…",
    failed: "未能完成，請再試一次。",
    copiedToast: "已複製，可貼到你發佈的地方。",
    exportedToast: "已匯出，系統不會自動發佈。",
    usage: "本月已用 {used} / {allowance} 次",
    usageUnlimited: "本月已用 {used} 次",
    counted: "已計算一次交付",
    firstApproval: "你第一個確認的行動",
  },
  evidence: { limitation: "限制", viewSource: "查看來源" },
}

export const visualZhTW: VisualCopy = {
  trend: {
    up: "上升 {n}",
    down: "下降 {n}",
    flat: "沒有變化",
    notComparable: "無法比較",
    reasons: {
      first: "這是第一次掃描，目前沒有比較對象。",
      SCORING_VERSION_MISMATCH: "兩次掃描之間評分方式有變更。",
      SCORING_VERSION_UNKNOWN: "其中一次掃描未記錄評分方式。",
      NO_SHARED_MEASURED_MODULE: "沒有來源在兩次掃描中都量測到。",
      INSUFFICIENT_INDEPENDENT_CHANNELS: "兩次掃描都量測到的來源太少。",
    },
    summary: "{label}：共 {count} 次掃描，最新 {value}",
    summaryUnknown: "{label}：共 {count} 次掃描，最新數值未知",
    gapNote: "線條中斷代表那幾次掃描無法比較。",
    unknown: "未知",
    breakBefore: "無法與上一次掃描比較",
  },
  matrix: {
    title: "影響與工作量",
    impact: "影響",
    effort: "工作量",
    high: "高",
    low: "低",
    quadrants: { quickWins: "快速見效", plan: "值得規劃", fillIns: "有空再做", later: "稍後處理" },
    note: "這是我們依據你的證據做出的排序，並非量測結果。",
    empty: "沒有待處理的行動",
  },
  compare: {
    title: "前後比較",
    before: "之前",
    after: "之後",
    attributed: "可能相關，未經證實",
    slider: "拖曳以比較前後",
    notComparable: "這兩次掃描無法比較",
  },
  loop: {
    label: "你的進度",
    steps: { scan: "掃描", decide: "決定", approve: "確認", deliver: "交付", prove: "驗證" },
    stepOf: "第 {n} 步，共 {total} 步",
  },
  approvalFlow: {
    label: "確認流程",
    steps: { draft: "草稿", needsApproval: "待確認", approved: "已確認", delivered: "已交付" },
    lock: "一切由你決定：未經你確認，不會送出任何內容。",
    current: "目前",
  },
  scan: { label: "掃描進度", progress: "{total} 個來源中已檢查 {done} 個", complete: "所有來源皆已檢查" },
  explainer: { open: "什麼是{label}？" },
  empty: {
    noData: { title: "目前沒有證據", body: "進行掃描，看看顧客能找到什麼。", action: "開始掃描" },
    noActions: { title: "目前沒有行動", body: "完成第一次掃描後會出現行動。", action: "查看報告" },
    allDone: { title: "全部處理完畢", body: "目前沒有需要你確認的內容。", action: "查看洞察" },
  },
  feedback: {
    approved: "已確認",
    copy: "複製文字",
    copied: "已複製",
    export: "匯出",
    exported: "已匯出",
    working: "處理中…",
    failed: "無法完成，請再試一次。",
    copiedToast: "已複製，可貼到你發布的地方。",
    exportedToast: "已匯出，系統不會自動發布。",
    usage: "本月已用 {used} / {allowance} 次",
    usageUnlimited: "本月已用 {used} 次",
    counted: "已計入一次交付",
    firstApproval: "你第一個確認的行動",
  },
  evidence: { limitation: "限制", viewSource: "查看來源" },
}
