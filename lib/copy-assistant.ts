/**
 * Ask Kinnso (the contextual assistant sheet), reached as copy[locale].assistantSheet:
 * question labels, surface names, run status, the evidence card and the draft preview.
 * The assistant never approves or publishes (guardrails 5, 6); these strings say so.
 * Demo labels quote the fixed Kam Man House sample; live labels are number-free (§3.8).
 * zh-TW keeps the zh-HK wording except where it already differed (什麼, 從, 連線).
 * {title}, {surface} and {n} are filled with lib/copy-ui.ts `fill`.
 */

export type AssistantSheetCopy = {
  questions: {
    explain_priority: string
    explain_change: string
    explain_limits: string
    fallback_plan: string
    draft_review_reply: string
    friendlier_review_reply: string
    compare_priorities: string
    explain_insights: string
    asset_next_step: string
    rescan_validation: string
    generate_social: string
    generate_faq: string
    generate_menu: string
  }
  liveQuestions: {
    explain_priority: string
    draft_review_reply: string
    explain_change: string
    fallback_plan: string
  }
  contextual: {
    explain_missing_inputs: string
    where_to_continue: string
  }
  missingInputsFor: string
  whyReconnectGoogle: string
  needsYouNow: string
  revisions: {
    shorten: string
    contactOnly: string
  }
  surfaces: {
    sample: string
    report: string
    home: string
    actions: string
    action: string
    create: string
    insights: string
    assets: string
    rescan: string
    workspace: string
  }
  sourceBadge: {
    live: string
    demo: string
  }
  description: string
  flowLabel: string
  flow: string[]
  boundary: {
    live: string
    demo: string
  }
  startFrom: string
  refusals: {
    runInProgress: string
    unconfirmed: string
  }
  viewRunHistory: string
  explanation: string
  referencedEvidence: string
  nextStep: string
  continueHere: string
  limit: string
  saveFailed: string
  saving: string
  saved: string
  createVersion: string
  approvalBoundary: {
    requiresApproval: string
    explanationOnly: string
  }
  runStatus: {
    readingLive: string
    readingDemo: string
    failed: string
    runningNote: string
    failedNote: string
  }
  evidenceCard: {
    factBadge: string
    source: string
    observedAt: string
    evidence: string
  }
  artifact: {
    eyebrow: string
    badge: string
    criteria: string
  }
}

export const assistantSheetEn: AssistantSheetCopy = {
  questions: {
    explain_priority: "Why are review replies the priority?",
    explain_change: "What does 22% to 31% mean?",
    explain_limits: "What is still unproven?",
    fallback_plan: "What if it falls to 18% again?",
    draft_review_reply: "Draft one suitable review reply",
    friendlier_review_reply: "Make it warmer without overpromising",
    compare_priorities: "Compare these action priorities",
    explain_insights: "Explain the change and causal limits",
    asset_next_step: "Which assets are safe to use now?",
    rescan_validation: "What must be validated before re-scan?",
    generate_social: "Prepare a post from approved assets",
    generate_faq: "Prepare an FAQ without inventing facts",
    generate_menu: "Create a menu translation batch",
  },
  liveQuestions: {
    explain_priority: "Why is this the priority?",
    draft_review_reply: "Draft one suitable review reply",
    explain_change: "What does the latest score change mean?",
    fallback_plan: "What if the score falls again this week?",
  },
  contextual: {
    explain_missing_inputs: "What detail do you need?",
    where_to_continue: "Where do I continue?",
  },
  missingInputsFor: "What detail do you need for {title}?",
  whyReconnectGoogle: "Why reconnect Google?",
  needsYouNow: "Needs you now",
  revisions: {
    shorten: "Shorten this reply",
    contactOnly: "Use a contact-only next step",
  },
  surfaces: {
    sample: "Kam Man House public demo",
    report: "Visibility report",
    home: "Today’s focus",
    actions: "Action priorities",
    action: "Action draft and versions",
    create: "Create an outcome",
    insights: "Insights and limits",
    assets: "Approved assets",
    rescan: "Re-scan validation",
    workspace: "Current workspace",
  },
  sourceBadge: {
    live: "This workspace's evidence",
    demo: "Demo data",
  },
  description: "Current context: {surface}. It explains evidence, recommends a next step and prepares new drafts—never approval or publishing.",
  flowLabel: "Assistant flow",
  flow: ["Explain", "Evidence", "Act", "Draft", "Approve / re-scan"],
  boundary: {
    live: "Answers use only this workspace's evidence snapshots; nothing is published or approved here.",
    demo: "Public and demo mode uses fixed, sanitised Kam Man House data only; no other business or customer data is accepted.",
  },
  startFrom: "Start from the current problem",
  refusals: {
    runInProgress: "This action already has a draft running. Refresh the action to check its current result first.",
    unconfirmed: "The run outcome could not be confirmed. Refresh the action and check its run history before generating again.",
  },
  viewRunHistory: "View action and run history",
  explanation: "Explanation",
  referencedEvidence: "Referenced evidence snapshots",
  nextStep: "Recommended next step",
  continueHere: "Continue here",
  limit: "Limit",
  saveFailed: "The new version could not be confirmed as saved. Your preview is retained; retry, or close the assistant and compare the latest draft if there is a conflict.",
  saving: "Saving new version…",
  saved: "Version {n} saved",
  createVersion: "Create a new version without overwriting",
  approvalBoundary: {
    requiresApproval: "An authorised person must approve the exact version. It is not published and no delivery is consumed.",
    explanationOnly: "This explanation changes no score, approval state or usage.",
  },
  runStatus: {
    readingLive: "Reading the workspace evidence snapshot",
    readingDemo: "Reading the fixed demo evidence",
    failed: "The run could not complete",
    runningNote: "Answers use each scan's own evidence; no other business's data is accepted.",
    failedNote: "Existing work is preserved and no delivery is consumed.",
  },
  evidenceCard: {
    factBadge: "{type}",
    source: "Source",
    observedAt: "Observed",
    evidence: "Evidence",
  },
  artifact: {
    eyebrow: "Approval-ready output preview",
    badge: "Draft preview",
    criteria: "Acceptance criteria",
  },
}

export const assistantSheetZhHK: AssistantSheetCopy = {
  questions: {
    explain_priority: "為何評論回覆是首要待辦？",
    explain_change: "22% 升至 31% 代表甚麼？",
    explain_limits: "哪些結果仍未能證明？",
    fallback_plan: "如果再次跌至 18%，今星期應做甚麼？",
    draft_review_reply: "示範 1 則合適的評論回覆",
    friendlier_review_reply: "改得更親切，但不要過度承諾",
    compare_priorities: "比較這些待辦的優先次序",
    explain_insights: "解釋最新變化與因果限制",
    asset_next_step: "哪些相片現在可以安全使用？",
    rescan_validation: "重掃前要驗證哪些條件？",
    generate_social: "根據已確認相片準備社交帖文",
    generate_faq: "準備 FAQ，但不要作出事實",
    generate_menu: "建立餐牌翻譯工作批次",
  },
  liveQuestions: {
    explain_priority: "為何這是首要待辦？",
    draft_review_reply: "草擬 1 則合適的評論回覆",
    explain_change: "最新的分數變化代表甚麼？",
    fallback_plan: "如果分數再次下跌，今星期應做甚麼？",
  },
  contextual: {
    explain_missing_inputs: "還需要甚麼資料？",
    where_to_continue: "我應該由哪裡繼續？",
  },
  missingInputsFor: "「{title}」還需要甚麼資料？",
  whyReconnectGoogle: "為何要重新連接 Google？",
  needsYouNow: "現在需要你處理",
  revisions: {
    shorten: "縮短呢則回覆",
    contactOnly: "改用聯絡方式作下一步",
  },
  surfaces: {
    sample: "錦汶館公開示範",
    report: "能見度報告",
    home: "今日焦點",
    actions: "待辦優先次序",
    action: "待辦草稿與版本",
    create: "建立成果",
    insights: "成效與限制",
    assets: "已確認相片",
    rescan: "重新掃描驗證",
    workspace: "目前工作台",
  },
  sourceBadge: {
    live: "只用本工作台證據",
    demo: "示範資料",
  },
  description: "目前情境：{surface}。解釋證據、建議下一步及準備新草稿，但不會自行確認或發佈。",
  flowLabel: "助理處理流程",
  flow: ["解釋", "證據", "待辦", "草稿", "確認／重掃"],
  boundary: {
    live: "答案只使用此工作台的證據快照；這裡不會發佈或確認任何內容。",
    demo: "公開及示範模式只使用固定、已清理的錦汶館資料；不接受其他商戶或客戶資料。",
  },
  startFrom: "由目前問題開始",
  refusals: {
    runInProgress: "此待辦已有草稿正在生成。請先重新整理待辦，查看目前執行結果。",
    unconfirmed: "未能確認執行結果。請先重新整理待辦，查看目前執行紀錄，再決定是否重新生成。",
  },
  viewRunHistory: "查看目前待辦及執行紀錄",
  explanation: "解釋",
  referencedEvidence: "引用的證據 snapshot",
  nextStep: "建議下一步",
  continueHere: "由這裡繼續",
  limit: "限制",
  saveFailed: "未能確認新版本已儲存。預覽仍然保留，請重試；如有版本衝突，先關閉助理並比較最新草稿。",
  saving: "正在儲存新版本…",
  saved: "第 {n} 版已儲存",
  createVersion: "建立新版本（不覆蓋現有內容）",
  approvalBoundary: {
    requiresApproval: "此輸出需要獲授權人士確認指定版本；目前未發佈，也未扣除交付額。",
    explanationOnly: "這是解釋與建議，不會改變掃描分數、確認狀態或用量。",
  },
  runStatus: {
    readingLive: "正在讀取工作台證據快照",
    readingDemo: "正在讀取固定示範證據",
    failed: "暫時未能完成",
    runningNote: "答案只用每次掃描各自的證據，不接受其他商戶資料。",
    failedNote: "現有內容仍保留，失敗不會扣除交付額。",
  },
  evidenceCard: {
    factBadge: "已觀察",
    source: "來源",
    observedAt: "觀察時間",
    evidence: "證據",
  },
  artifact: {
    eyebrow: "可確認輸出預覽",
    badge: "草稿預覽",
    criteria: "確認條件",
  },
}

export const assistantSheetZhTW: AssistantSheetCopy = {
  questions: {
    explain_priority: "為何評論回覆是首要待辦？",
    explain_change: "22% 升至 31% 代表甚麼？",
    explain_limits: "哪些結果仍未能證明？",
    fallback_plan: "如果再次跌至 18%，今星期應做甚麼？",
    draft_review_reply: "示範 1 則合適的評論回覆",
    friendlier_review_reply: "改得更親切，但不要過度承諾",
    compare_priorities: "比較這些待辦的優先次序",
    explain_insights: "解釋最新變化與因果限制",
    asset_next_step: "哪些照片現在可以安全使用？",
    rescan_validation: "重掃前要驗證哪些條件？",
    generate_social: "根據已確認照片準備社交帖文",
    generate_faq: "準備 FAQ，但不要作出事實",
    generate_menu: "建立餐牌翻譯工作批次",
  },
  liveQuestions: {
    explain_priority: "為何這是首要待辦？",
    draft_review_reply: "草擬 1 則合適的評論回覆",
    explain_change: "最新的分數變化代表甚麼？",
    fallback_plan: "如果分數再次下跌，今星期應做甚麼？",
  },
  contextual: {
    explain_missing_inputs: "還需要什麼資料？",
    where_to_continue: "我應該從哪裡繼續？",
  },
  missingInputsFor: "「{title}」還需要什麼資料？",
  whyReconnectGoogle: "為何要重新連線 Google？",
  needsYouNow: "現在需要你處理",
  revisions: {
    shorten: "縮短這則回覆",
    contactOnly: "改用聯絡方式作下一步",
  },
  surfaces: {
    sample: "錦汶館公開示範",
    report: "能見度報告",
    home: "今日焦點",
    actions: "待辦優先次序",
    action: "待辦草稿與版本",
    create: "建立成果",
    insights: "成效與限制",
    assets: "已確認照片",
    rescan: "重新掃描驗證",
    workspace: "目前工作台",
  },
  sourceBadge: {
    live: "只用本工作台證據",
    demo: "示範資料",
  },
  description: "目前情境：{surface}。解釋證據、建議下一步及準備新草稿，但不會自行確認或發佈。",
  flowLabel: "助理處理流程",
  flow: ["解釋", "證據", "待辦", "草稿", "確認／重掃"],
  boundary: {
    live: "答案只使用此工作台的證據快照；這裡不會發佈或確認任何內容。",
    demo: "公開及示範模式只使用固定、已清理的錦汶館資料；不接受其他店家或客戶資料。",
  },
  startFrom: "由目前問題開始",
  refusals: {
    runInProgress: "此待辦已有草稿正在生成。請先重新整理待辦，查看目前執行結果。",
    unconfirmed: "未能確認執行結果。請先重新整理待辦，查看目前執行紀錄，再決定是否重新生成。",
  },
  viewRunHistory: "查看目前待辦及執行紀錄",
  explanation: "解釋",
  referencedEvidence: "引用的證據 snapshot",
  nextStep: "建議下一步",
  continueHere: "從這裡繼續",
  limit: "限制",
  saveFailed: "未能確認新版本已儲存。預覽仍然保留，請重試；如有版本衝突，先關閉助理並比較最新草稿。",
  saving: "正在儲存新版本…",
  saved: "第 {n} 版已儲存",
  createVersion: "建立新版本（不覆蓋現有內容）",
  approvalBoundary: {
    requiresApproval: "此輸出需要獲授權人士確認指定版本；目前未發佈，也未扣除交付額。",
    explanationOnly: "這是解釋與建議，不會改變掃描分數、確認狀態或用量。",
  },
  runStatus: {
    readingLive: "正在讀取工作台證據快照",
    readingDemo: "正在讀取固定示範證據",
    failed: "暫時未能完成",
    runningNote: "答案只用每次掃描各自的證據，不接受其他商戶資料。",
    failedNote: "現有內容仍保留，失敗不會扣除交付額。",
  },
  evidenceCard: {
    factBadge: "已觀察",
    source: "來源",
    observedAt: "觀察時間",
    evidence: "證據",
  },
  artifact: {
    eyebrow: "可確認輸出預覽",
    badge: "草稿預覽",
    criteria: "確認條件",
  },
}
