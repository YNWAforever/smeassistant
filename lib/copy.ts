export const supportedLocales = ["en", "zh-HK", "zh-TW"] as const
export type PrototypeLocale = (typeof supportedLocales)[number]

export function normaliseLocale(value: string | undefined): PrototypeLocale {
  return supportedLocales.includes(value as PrototypeLocale) ? (value as PrototypeLocale) : "zh-HK"
}

type Copy = {
  language: string
  prototype: string
  sampleData: string
  nav: {
    scanner: string
    sample: string
    methodology: string
    pricing: string
    trust: string
    signIn: string
    home: string
    actions: string
    create: string
    insights: string
    more: string
  }
  landing: {
    eyebrow: string
    title: string
    body: string
    searchLabel: string
    searchPlaceholder: string
    marketLabel: string
    start: string
    timing: string
    trust: string
    checked: string
  }
  home: {
    title: string
    subtitle: string
    changed: string
    priority: string
    proof: string
    reviewDrafts: string
    month: string
  }
  common: {
    coverage: string
    measured: string
    unavailable: string
    unsupported: string
    failed: string
    pending: string
    demo: string
    viewEvidence: string
    howMeasured: string
    back: string
    continue: string
  }
}

export const copy: Record<PrototypeLocale, Copy> = {
  en: {
    language: "English",
    prototype: "Interactive prototype",
    sampleData: "Sample data",
    nav: {
      scanner: "Free scanner",
      sample: "Sample report",
      methodology: "Methodology",
      pricing: "Pricing",
      trust: "Trust",
      signIn: "Owner sign in",
      home: "Home",
      actions: "Actions",
      create: "Create",
      insights: "Insights",
      more: "More",
    },
    landing: {
      eyebrow: "A clearer growth day starts here",
      title: "Be easier to find. Know exactly what to improve next.",
      body: "See how customers discover your business across Google, AI search and social channels—then turn verified gaps into simple, owner-approved actions.",
      searchLabel: "Find your business",
      searchPlaceholder: "Business name, area, or Google Maps link",
      marketLabel: "Search market",
      start: "Find my business",
      timing: "Start your free scan in about 30 seconds. Completion time varies by source availability.",
      trust: "No login to start · Evidence-safe preview · Owner approval before delivery",
      checked: "What we can check",
    },
    home: {
      title: "Your next visibility win is ready.",
      subtitle: "One clear action for today, backed by evidence and ready for your approval.",
      changed: "What changed",
      priority: "Today’s priority",
      proof: "Previous action outcome",
      reviewDrafts: "Review drafts",
      month: "This month",
    },
    common: {
      coverage: "Coverage",
      measured: "Measured",
      unavailable: "Unavailable",
      unsupported: "Unsupported",
      failed: "Failed",
      pending: "Pending",
      demo: "Demo data",
      viewEvidence: "View evidence",
      howMeasured: "How this was measured",
      back: "Back",
      continue: "Continue",
    },
  },
  "zh-HK": {
    language: "繁體中文（香港）",
    prototype: "互動原型",
    sampleData: "示範資料",
    nav: {
      scanner: "免費掃描",
      sample: "示範報告",
      methodology: "評分方法",
      pricing: "收費",
      trust: "信任與私隱",
      signIn: "店主登入",
      home: "主頁",
      actions: "行動",
      create: "建立內容",
      insights: "成效",
      more: "更多",
    },
    landing: {
      eyebrow: "更清晰的增長一天，由這裡開始",
      title: "讓更多顧客找到你，清楚知道下一步要改善甚麼。",
      body: "了解顧客如何透過 Google、AI 搜尋及社交平台發現你的業務，再將已核實的問題變成簡單、由你批准的行動。",
      searchLabel: "搜尋你的業務",
      searchPlaceholder: "輸入商戶名稱、地區或 Google Maps 連結",
      marketLabel: "搜尋市場",
      start: "尋找我的業務",
      timing: "約 30 秒便可開始免費掃描；完成時間視乎各資料來源供應情況。",
      trust: "開始毋須登入 · 安全證據預覽 · 對外送出前由店主批准",
      checked: "可檢查的範圍",
    },
    home: {
      title: "下一個曝光提升機會已準備好。",
      subtitle: "今天只需處理一項清晰行動；證據和草稿已備妥，等你批准。",
      changed: "最新變化",
      priority: "今日首要行動",
      proof: "上一項行動結果",
      reviewDrafts: "審閱草稿",
      month: "本月進度",
    },
    common: {
      coverage: "覆蓋率",
      measured: "已量度",
      unavailable: "暫時未能取得",
      unsupported: "未支援",
      failed: "失敗",
      pending: "等候中",
      demo: "示範資料",
      viewEvidence: "查看證據",
      howMeasured: "了解評分方法",
      back: "返回",
      continue: "繼續",
    },
  },
  "zh-TW": {
    language: "繁體中文（台灣）",
    prototype: "互動原型",
    sampleData: "範例資料",
    nav: {
      scanner: "免費掃描",
      sample: "範例報告",
      methodology: "評分方法",
      pricing: "方案價格",
      trust: "信任與隱私",
      signIn: "店家登入",
      home: "首頁",
      actions: "行動",
      create: "建立內容",
      insights: "成效洞察",
      more: "更多",
    },
    landing: {
      eyebrow: "更清楚的成長一天，從這裡開始",
      title: "讓更多顧客找到你，清楚知道下一步要改善什麼。",
      body: "了解顧客如何透過 Google、AI 搜尋與社群平台發現你的商家，再把已驗證的缺口變成簡單、由你核准的行動。",
      searchLabel: "搜尋你的商家",
      searchPlaceholder: "輸入商家名稱、地區或 Google Maps 連結",
      marketLabel: "搜尋市場",
      start: "尋找我的商家",
      timing: "約 30 秒即可開始免費掃描；完成時間依各資料來源狀況而異。",
      trust: "開始無需登入 · 安全證據預覽 · 對外送出前由店家核准",
      checked: "可檢查的範圍",
    },
    home: {
      title: "下一個能見度提升機會已準備好。",
      subtitle: "今天只要處理一個清楚行動；證據和草稿都已備妥，等你核准。",
      changed: "最新變化",
      priority: "今日優先行動",
      proof: "上一項行動結果",
      reviewDrafts: "審閱草稿",
      month: "本月進度",
    },
    common: {
      coverage: "覆蓋率",
      measured: "已量測",
      unavailable: "暫時無法取得",
      unsupported: "未支援",
      failed: "失敗",
      pending: "等候中",
      demo: "範例資料",
      viewEvidence: "查看證據",
      howMeasured: "了解評分方法",
      back: "返回",
      continue: "繼續",
    },
  },
}
