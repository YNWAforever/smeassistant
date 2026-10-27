/**
 * The pricing page (/pricing), reached as copy[locale].pricingPage: the four plan
 * cards, the approved-delivery banner and the FAQ. Moved from components/public-pages.tsx
 * (deferred since Phase 2). Prices, the per-month suffix, the free plan's title and
 * the allowance lines come from their own copy and are joined in by the page.
 * Only an approved, exported version counts as a delivery (guardrail 7).
 */

export type PricingPageCopy = {
  title: string
  lead: string
  recommended: string
  plans: {
    free: {
      label: string
      price: string
      description: string
      meta: string
      features: string[]
      cta: string
    }
    growth: {
      label: string
      title: string
      description: string
      meta: string
      features: string[]
      cta: string
      cadence: string
    }
    multi: {
      label: string
      title: string
      description: string
      meta: string
      features: string[]
      cta: string
    }
    managed: {
      label: string
      title: string
      description: string
      meta: string
      features: string[]
      cta: string
    }
  }
  usage: {
    eyebrow: string
    title: string
    body: string
  }
  faq: {
    eyebrow: string
    title: string
    body: string
    autoPublishTitle: string
    autoPublishBody: string
  }
}

export const pricingPageEn: PricingPageCopy = {
  title: "Not a bundle of AI tools. One team that moves improvement forward.",
  lead: "Start with a free evidence scan, add a workspace for recurring monitoring and approvals, then scale by locations or add human-managed support.",
  recommended: "Recommended start",
  plans: {
    free: {
      label: "One free scan",
      price: "Free",
      description: "See current visibility, source evidence and the best issue to tackle first.",
      meta: "No login to start",
      features: ["One public evidence scan", "Score with coverage", "Three safe priorities", "Methodology, sources and limitations"],
      cta: "Start free scan",
    },
    growth: {
      label: "Best for one location",
      title: "Growth plan",
      description: "For a small team that wants recurring improvement without managing a bundle of AI tools.",
      meta: "1 location",
      features: ["Comparable rescans, run whenever you choose", "Complete AI Visibility Team", "Versions, owner approval and proof"],
      cta: "Start Growth",
      cadence: " / {perMonth}",
    },
    multi: {
      label: "Up to 3 locations",
      title: "Multi-location",
      description: "One priority, approval and improvement rhythm across multiple business locations.",
      meta: "Includes 3 locations",
      features: ["Approved deliveries pooled across locations", "Cross-location prioritisation", "Location-scoped evidence and approvals", "Combined and per-location outcomes"],
      cta: "Manage multiple locations",
    },
    managed: {
      label: "Human-managed",
      title: "Managed Visibility",
      description: "Human execution, quality review and outcome support—not unattended auto-publishing.",
      meta: "3-month minimum",
      features: ["Consultant review and execution support", "Channel and location delivery plan", "The same workspace and audit trail", "Owner keeps final approval"],
      cta: "Learn about managed service",
    },
  },
  usage: {
    eyebrow: "Approved deliveries, not tokens",
    title: "One delivery is counted only after an exact version is approved and first exported or published.",
    body: "Evidence, prioritisation, rescans, generation, revisions, returns, rejections and failed runs use no allowance. Safety checks, owner approval, activity history and recovery are included in every Workspace plan.",
  },
  faq: {
    eyebrow: "Simple choices",
    title: "Which plan fits?",
    body: "Start free. Choose Growth for one location, Multi-location when a second or third location appears, and Managed when you need human execution.",
    autoPublishTitle: "Will content auto-publish?",
    autoPublishBody: "No. Every export or publish step requires the right permission and an explicit owner approval, including Managed Visibility.",
  },
}

export const pricingPageZhHK: PricingPageCopy = {
  title: "不是一堆 AI 工具，而是一隊替你推進改善的團隊。",
  lead: "由一次免費證據掃描開始；需要持續監察、草稿與確認時升級工作台，多地點或需要專人支援時再按業務規模擴展。",
  recommended: "推薦起點",
  plans: {
    free: {
      label: "一次免費掃描",
      price: "免費",
      description: "先看清目前的能見度、證據來源及最值得處理的問題。",
      meta: "無需登入開始",
      features: ["1 次公開證據掃描", "評分連同覆蓋率", "3 項安全優先建議", "方法、來源及限制"],
      cta: "免費掃描",
    },
    growth: {
      label: "最適合單一地點",
      title: "增長方案",
      description: "適合希望持續改善能見度、但不想管理多個 AI 工具的小型團隊。",
      meta: "1 個地點",
      features: ["可隨時自行執行的可比較重新掃描", "完整 AI 能見度團隊", "草稿版本、店主確認及成效證明"],
      cta: "開始增長方案",
      cadence: "／{perMonth}",
    },
    multi: {
      label: "最多 3 個地點",
      title: "多地點方案",
      description: "讓多個分店共用一個優先次序、確認流程及能見度改善節奏。",
      meta: "包括 3 個地點",
      features: ["跨地點共用確認後交付", "跨地點優先排序", "分店範圍證據及確認", "合併進度及各地點成效"],
      cta: "管理多個地點",
    },
    managed: {
      label: "專人協作",
      title: "專人能見度服務",
      description: "由專人協助推進行動、品質把關及成效檢視；不是無人監管的自動發佈。",
      meta: "最短服務期 3 個月",
      features: ["顧問定期檢視及執行支援", "渠道與地點交付計劃", "同一工作台、證據及確認紀錄", "店主仍保留最終確認權"],
      cta: "了解專人服務",
    },
  },
  usage: {
    eyebrow: "確認後交付，不是代幣",
    title: "只有指定版本獲確認並首次成功匯出或發佈，才計 1 次交付。",
    body: "查看證據、優先排序、重新掃描、生成、修改、退回、拒絕或執行失敗都不扣除用量。所有 Workspace 方案都包括安全檢查、店主確認、活動紀錄及可還原路徑。",
  },
  faq: {
    eyebrow: "簡單選擇",
    title: "我應選哪個方案？",
    body: "先免費掃描。單一地點可由增長方案開始；第 2 或第 3 個地點出現時才考慮多地點。需要專人推進時，再選專人服務。",
    autoPublishTitle: "內容會自動發佈嗎？",
    autoPublishBody: "不會。每次匯出或發佈前都需要正確權限及明確店主確認；專人服務亦不例外。",
  },
}

export const pricingPageZhTW: PricingPageCopy = {
  title: "不是一堆 AI 工具，而是一隊替你推進改善的團隊。",
  lead: "由一次免費證據掃描開始；需要持續監控、草稿與確認時升級工作台，多據點或需要專人支援時再按業務規模擴展。",
  recommended: "推薦起點",
  plans: {
    free: {
      label: "一次免費掃描",
      price: "免費",
      description: "先看清目前的能見度、證據來源及最值得處理的問題。",
      meta: "無需登入開始",
      features: ["1 次公開證據掃描", "評分連同涵蓋率", "3 項安全優先建議", "方法、來源及限制"],
      cta: "免費掃描",
    },
    growth: {
      label: "最適合單一據點",
      title: "成長方案",
      description: "適合希望持續改善能見度、但不想管理多個 AI 工具的小型團隊。",
      meta: "1 個據點",
      features: ["可隨時自行執行的可比較重新掃描", "完整 AI 能見度團隊", "草稿版本、店家確認及成效證明"],
      cta: "開始成長方案",
      cadence: "／{perMonth}",
    },
    multi: {
      label: "最多 3 個據點",
      title: "多據點方案",
      description: "讓多個分店共用一個優先次序、確認流程及能見度改善節奏。",
      meta: "包括 3 個據點",
      features: ["跨據點共用確認後交付", "跨據點優先排序", "分店範圍證據及確認", "合併進度及各據點成效"],
      cta: "管理多個據點",
    },
    managed: {
      label: "專人協作",
      title: "專人能見度服務",
      description: "由專人協助推進行動、品質把關及成效檢視；不是無人監管的自動發佈。",
      meta: "最短服務期 3 個月",
      features: ["顧問定期檢視及執行支援", "渠道與據點交付計劃", "同一工作台、證據及確認紀錄", "店家仍保留最終確認權"],
      cta: "了解專人服務",
    },
  },
  usage: {
    eyebrow: "確認後交付，不是代幣",
    title: "只有指定版本獲確認並首次成功匯出或發佈，才計 1 次交付。",
    body: "查看證據、優先排序、重新掃描、生成、修改、退回、拒絕或執行失敗都不扣除用量。所有 Workspace 方案都包括安全檢查、店家確認、活動紀錄及可還原路徑。",
  },
  faq: {
    eyebrow: "簡單選擇",
    title: "我應選哪個方案？",
    body: "先免費掃描。單一據點可由成長方案開始；第 2 或第 3 個據點出現時才考慮多據點。需要專人推進時，再選專人服務。",
    autoPublishTitle: "內容會自動發佈嗎？",
    autoPublishBody: "不會。每次匯出或發佈前都需要正確權限及明確店家確認；專人服務亦不例外。",
  },
}
