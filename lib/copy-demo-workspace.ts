/**
 * The public demo workspace (/demo-workspace), reached as copy[locale].demoWorkspace.
 * Fixed, sanitised Kam Man House sample (guardrail 12): every number here is the
 * demo snapshot, labelled as such on the page, never a real workspace's data.
 * zh-TW keeps the zh-HK wording except where Taiwan terms differ.
 */

export type DemoWorkspaceCopy = {
  readOnly: string
  title: string
  lead: string
  signIn: string
  snapshot: {
    title: string
    body: string
  }
  gridLabel: string
  priority: {
    label: string
    urgent: string
    title: string
    body: string
    evidence: string
    ask: string
  }
  score: {
    label: string
    coverage: string
    body: string
    report: string
  }
  proof: {
    label: string
    association: string
    points: string
    title: string
    body: string
  }
  flow: {
    title: string
    body: string
    steps: string[]
    scan: string
  }
  footer: string
}

export const demoWorkspaceEn: DemoWorkspaceCopy = {
  readOnly: "Public read-only",
  title: "Kam Man House · Today’s visibility focus",
  lead: "Fixed, sanitised demo data. Understand the evidence, inspect the next step and preview a draft—without approval, export or publishing controls.",
  signIn: "Sign in to use the workspace",
  snapshot: {
    title: "Snapshots stay separate",
    body: "Showing scan_kmh_20260825 · observed 25 Aug 2026, 09:42 HKT. Historical 5 and 20 August data appears only in the comparison card.",
  },
  gridLabel: "Public demo operating brief",
  priority: {
    label: "Today’s priority",
    urgent: "Urgent",
    title: "Reply to seven unanswered Google reviews",
    body: "Drafts are prepared from the brand voice and review context, ready for exact-version owner review after sign-in.",
    evidence: "Same Google Business profile and Yik Yam Street · seven unanswered",
    ask: "Ask why this comes first",
  },
  score: {
    label: "Latest comparable change",
    coverage: "78% coverage",
    body: "The score moved from 66 to 62. Incomplete Instagram evidence is excluded rather than scored as zero.",
    report: "View the full sample report",
  },
  proof: {
    label: "Historical post-action observation",
    association: "Temporal association",
    points: "points",
    title: "Review response rate moved from 22% to 31%",
    body: "From comparable 5 and 20 August snapshots. It does not prove revenue, ranking or booking causation.",
  },
  flow: {
    title: "Start from the problem, not a grid of ten AI tools.",
    body: "The operator selects the review-response capability from the evidence, explains the priority, previews a draft and stops at the approval boundary.",
    steps: ["Explain the regression", "Cite scan-ID evidence", "Recommend one action", "Preview a new draft", "Sign in to approve and re-scan"],
    scan: "Scan my business",
  },
  footer: "This public page exposes no approval or publishing controls. After sign-in, production must still re-authorise membership, role and location scope; a demo role in the UI is not authority.",
}

export const demoWorkspaceZhHK: DemoWorkspaceCopy = {
  readOnly: "公開唯讀",
  title: "錦汶館 · 今日能見度焦點",
  lead: "固定、已清理的示範資料。你可以理解證據、查看下一步及預覽草稿，但不能在公開頁確認、匯出或發佈。",
  signIn: "登入後使用工作台",
  snapshot: {
    title: "Snapshot 不會混合",
    body: "目前顯示 scan_kmh_20260825 · 觀察於 2026-08-25 09:42 HKT。8 月 5 日及 20 日的歷史數據只在比較卡中引用。",
  },
  gridLabel: "公開示範營運摘要",
  priority: {
    label: "今日首要行動",
    urgent: "緊急",
    title: "回覆 7 則未回覆的 Google 評論",
    body: "草稿已按品牌語氣及評論內容準備，等待店主在登入後審閱指定版本。",
    evidence: "同一 Google 商戶及奕蔭街 · 7 則待回覆",
    ask: "問助理：為何先做這項？",
  },
  score: {
    label: "最新可比較變化",
    coverage: "覆蓋率 78%",
    body: "評分由 66 降至 62。Instagram 來源未能取得完整快照，因此被排除，不會當成零分。",
    report: "查看完整示範報告",
  },
  proof: {
    label: "歷史行動後觀察",
    association: "時間關聯",
    points: "個百分點",
    title: "評論回覆率曾由 22% 升至 31%",
    body: "來自 8 月 5 日及 20 日兩個可比較 snapshot。不能證明帶來收入、排名或訂座因果。",
  },
  flow: {
    title: "由問題開始，不用選擇十個 AI 工具。",
    body: "助理按目前證據選擇評論回覆能力，解釋優先原因，預覽一則草稿，再清楚停在確認界線。",
    steps: ["解釋最新退步", "引用 scan_id 證據", "建議一項行動", "預覽新草稿", "登入後確認及重掃"],
    scan: "掃描我的公司",
  },
  footer: "公開頁不提供確認或發佈功能。登入後仍需重新驗證真正的成員資格、角色及分店範圍；介面上的示範角色不構成權限。",
}

export const demoWorkspaceZhTW: DemoWorkspaceCopy = {
  readOnly: "公開唯讀",
  title: "錦汶館 · 今日能見度焦點",
  lead: "固定、已清理的示範資料。你可以理解證據、查看下一步及預覽草稿，但不能在公開頁確認、匯出或發佈。",
  signIn: "登入後使用工作台",
  snapshot: {
    title: "Snapshot 不會混合",
    body: "目前顯示 scan_kmh_20260825 · 觀察於 2026-08-25 09:42 HKT。8 月 5 日及 20 日的歷史數據只在比較卡中引用。",
  },
  gridLabel: "公開示範營運摘要",
  priority: {
    label: "今日首要行動",
    urgent: "緊急",
    title: "回覆 7 則未回覆的 Google 評論",
    body: "草稿已按品牌語氣及評論內容準備，等待店家在登入後審閱指定版本。",
    evidence: "同一 Google 店家及奕蔭街 · 7 則待回覆",
    ask: "問助理：為何先做這項？",
  },
  score: {
    label: "最新可比較變化",
    coverage: "涵蓋率 78%",
    body: "評分由 66 降至 62。Instagram 來源未能取得完整快照，因此被排除，不會當成零分。",
    report: "查看完整示範報告",
  },
  proof: {
    label: "歷史行動後觀察",
    association: "時間關聯",
    points: "個百分點",
    title: "評論回覆率曾由 22% 升至 31%",
    body: "來自 8 月 5 日及 20 日兩個可比較 snapshot。不能證明帶來收入、排名或訂座因果。",
  },
  flow: {
    title: "由問題開始，不用選擇十個 AI 工具。",
    body: "助理按目前證據選擇評論回覆能力，解釋優先原因，預覽一則草稿，再清楚停在確認界線。",
    steps: ["解釋最新退步", "引用 scan_id 證據", "建議一項行動", "預覽新草稿", "登入後確認及重掃"],
    scan: "掃描我的公司",
  },
  footer: "公開頁不提供確認或發佈功能。登入後仍需重新驗證真正的成員資格、角色及分店範圍；介面上的示範角色不構成權限。",
}
