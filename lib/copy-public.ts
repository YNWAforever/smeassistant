/**
 * Public site strings (header, footer and landing), reached as
 * copy[locale].site. zh-HK is Hong Kong written Chinese and zh-TW uses Taiwan
 * terms (CLAUDE.md §5 copy hygiene). Text budgets from the UX brief:
 * headings ≤ 8 words, supporting lines ≤ 20 words. Claims stay honest: no
 * promised outcome, revenue or causation (CLAUDE.md §0).
 */

export const sourceKeys = ["search", "maps", "ai", "instagram", "website"] as const
export type SourceKey = (typeof sourceKeys)[number]

type Faq = { q: string; a: string }

export type PublicCopy = {
  brand: { name: string; byline: string; homeLabel: string; skip: string }
  nav: { label: string; mobileLabel: string; howItWorks: string; pricing: string; methodology: string; trust: string; sample: string; freeScan: string; openMenu: string; closeMenu: string; menuTitle: string }
  footer: { label: string; body: string; methodology: string; trust: string; pricing: string }
  hero: {
    title: string
    lead: string
    fieldLabel: string
    placeholder: string
    marketLabel: string
    hk: string
    hkMeta: string
    tw: string
    twMeta: string
    localeNote: string
    start: string
    note: string
    error: string
    loopLabel: string
  }
  how: { title: string; steps: Array<{ title: string; body: string }> }
  sources: { title: string; lead: string; items: Record<SourceKey, { name: string; body: string }>; rules: string }
  sample: {
    eyebrow: string
    title: string
    body: string
    actionTitle: string
    actionSummary: string
    status: string
    cta: string
    workspace: string
  }
  pricing: { title: string; freeChip: string; freeTitle: string; freeBody: string; freeCta: string; growthChip: string; growthTitle: string; perMonth: string; all: string }
  faq: { title: string; items: Faq[] }
  trust: { noAutoPost: string; youApprove: string; publicOnly: string; link: string }
}

export const publicEn: PublicCopy = {
  brand: { name: "Kinnso OS", byline: "by Fimmick", homeLabel: "Kinnso OS by Fimmick · home", skip: "Skip to content" },
  nav: {
    label: "Public navigation",
    mobileLabel: "Mobile navigation",
    howItWorks: "How it works",
    pricing: "Pricing",
    methodology: "Methodology",
    trust: "Trust",
    sample: "Sample report",
    freeScan: "Free scan",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menuTitle: "Evidence-first visibility for small businesses",
  },
  footer: {
    label: "Footer navigation",
    body: "Kinnso OS by Fimmick · Evidence first, action next.",
    methodology: "Methodology & limitations",
    trust: "Security & privacy",
    pricing: "Pricing",
  },
  hero: {
    title: "See how customers find you.",
    lead: "Free scan of Google, Maps, AI search, Instagram and your website.",
    fieldLabel: "Business name or Google Maps link",
    placeholder: "e.g. Kam Man House, Happy Valley",
    marketLabel: "Market",
    hk: "Hong Kong",
    hkMeta: "HKD",
    tw: "Taiwan",
    twMeta: "TWD",
    localeNote: "Language never changes the market or currency.",
    start: "Start free scan",
    note: "No sign-up · Results in minutes",
    error: "Enter a business name or Google Maps link.",
    loopLabel: "Illustration: a search checks five sources, fills a score dial and shows one priority. No real data.",
  },
  how: {
    title: "How it works",
    steps: [
      { title: "Scan", body: "We check public evidence across five sources, with the date and source for each." },
      { title: "Decide", body: "You get one priority first, ranked by impact and effort, with drafts ready." },
      { title: "Prove", body: "A later comparable scan shows what changed. Nothing is published until you approve it." },
    ],
  },
  sources: {
    title: "What we check",
    lead: "Missing sources lower coverage, never the score.",
    items: {
      search: { name: "Google Search", body: "Whether you appear for local searches." },
      maps: { name: "Google Maps", body: "Your Business Profile, reviews and hours." },
      ai: { name: "AI search", body: "Google AI Overview and AI Mode, when they appear." },
      instagram: { name: "Instagram", body: "Recent public posts and profile basics." },
      website: { name: "Website", body: "Fifteen checks, from page title to opening hours." },
    },
    rules: "How coverage works",
  },
  sample: {
    eyebrow: "Sample report",
    title: "What your report looks like",
    body: "Fixed demo data for Kam Man House, a sample café. Not a real customer.",
    actionTitle: "Reply to 7 unanswered Google reviews",
    actionSummary: "Seven recent reviews still need an owner reply.",
    status: "Drafts ready",
    cta: "Open the full sample report",
    workspace: "See the demo workspace",
  },
  pricing: {
    title: "Simple pricing",
    freeChip: "Free",
    freeTitle: "Free scan",
    freeBody: "One scan and a report preview. No sign-up.",
    freeCta: "Start free scan",
    growthChip: "One location",
    growthTitle: "Growth",
    perMonth: "month",
    all: "See all plans",
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Is the scan free?", a: "Yes. One scan is free and starts without sign-up. To unlock the full report, you leave a contact so we can send it." },
      { q: "What do you check?", a: "Public evidence from Google Search, Google Maps, Google AI Overview and AI Mode when they appear, Instagram and your website." },
      { q: "How long does it take?", a: "A few minutes. Some checks can finish a little later; the report shows which ones." },
      { q: "Will anything be posted for me?", a: "No. Drafts stay drafts until you approve one exact version, and nothing is published automatically." },
      { q: "What happens to my details?", a: "We use your contact only to deliver your report. Marketing messages need a separate opt-in." },
    ],
  },
  trust: { noAutoPost: "Nothing posts automatically", youApprove: "You approve every version", publicOnly: "Public evidence only", link: "Security & privacy" },
}

export const publicZhHK: PublicCopy = {
  brand: { name: "Kinnso OS", byline: "by Fimmick", homeLabel: "Kinnso OS by Fimmick · 主頁", skip: "跳到主要內容" },
  nav: {
    label: "網站導覽",
    mobileLabel: "流動版導覽",
    howItWorks: "運作方式",
    pricing: "收費",
    methodology: "評分方法",
    trust: "信任與私隱",
    sample: "示範報告",
    freeScan: "免費掃描",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    menuTitle: "為中小企而設、以證據為先的能見度管理",
  },
  footer: {
    label: "頁尾導覽",
    body: "Kinnso OS by Fimmick · 證據為先，行動為本。",
    methodology: "評分方法與限制",
    trust: "安全與私隱",
    pricing: "收費方案",
  },
  hero: {
    title: "看清顧客如何找到你",
    lead: "免費掃描 Google 搜尋、地圖、AI 搜尋、Instagram 及你的網站。",
    fieldLabel: "商戶名稱或 Google Maps 連結",
    placeholder: "例如：錦汶館 跑馬地",
    marketLabel: "市場",
    hk: "香港",
    hkMeta: "港元",
    tw: "台灣",
    twMeta: "新台幣",
    localeNote: "介面語言不會改變市場或貨幣。",
    start: "開始免費掃描",
    note: "毋須登記 · 數分鐘內有結果",
    error: "請輸入商戶名稱或 Google Maps 連結。",
    loopLabel: "示意圖：搜尋後檢查五個來源、填滿評分圈並顯示一項優先行動。並非真實資料。",
  },
  how: {
    title: "運作方式",
    steps: [
      { title: "掃描", body: "檢查五個來源的公開證據，每項都附來源及日期。" },
      { title: "決定", body: "先給你一項優先行動，按影響及工夫排序，草稿已準備好。" },
      { title: "驗證", body: "之後的可比較掃描會顯示有甚麼改變。未經你核准，不會發佈任何內容。" },
    ],
  },
  sources: {
    title: "我們檢查甚麼",
    lead: "缺少的來源只會降低覆蓋率，不會拉低評分。",
    items: {
      search: { name: "Google 搜尋", body: "本地搜尋時會否找到你。" },
      maps: { name: "Google 地圖", body: "商家檔案、評論及營業時間。" },
      ai: { name: "AI 搜尋", body: "Google AI 摘要及 AI 模式（如有出現）。" },
      instagram: { name: "Instagram", body: "近期公開帖文及基本資料。" },
      website: { name: "網站", body: "十五項檢查，由頁面標題到營業時間。" },
    },
    rules: "覆蓋率如何計算",
  },
  sample: {
    eyebrow: "示範報告",
    title: "你的報告會是這樣",
    body: "以示範咖啡店「錦汶館」的固定示範資料製作，並非真實客戶。",
    actionTitle: "回覆 7 則未回覆的 Google 評論",
    actionSummary: "七則近期評論仍待店主回覆。",
    status: "草稿已備妥",
    cta: "開啟完整示範報告",
    workspace: "查看示範工作台",
  },
  pricing: {
    title: "簡單收費",
    freeChip: "免費",
    freeTitle: "免費掃描",
    freeBody: "一次掃描及報告預覽，毋須登記。",
    freeCta: "開始免費掃描",
    growthChip: "一個地點",
    growthTitle: "增長工作台",
    perMonth: "月",
    all: "查看所有方案",
  },
  faq: {
    title: "常見問題",
    items: [
      { q: "掃描是否免費？", a: "是。一次掃描免費，開始時毋須登記。如要解鎖完整報告，需留下聯絡方式以便我們傳送。" },
      { q: "你們會檢查甚麼？", a: "Google 搜尋、Google 地圖、Google AI 摘要及 AI 模式（如有出現）、Instagram 及你網站上的公開證據。" },
      { q: "需要多久？", a: "數分鐘。部分檢查可能稍後才完成，報告會列明是哪幾項。" },
      { q: "會否代我發佈內容？", a: "不會。草稿在你核准某一個版本前都只是草稿，系統不會自動發佈。" },
      { q: "我的資料會如何使用？", a: "聯絡資料只用於傳送你的報告。推廣訊息需要另外同意。" },
    ],
  },
  trust: { noAutoPost: "不會自動發佈", youApprove: "每個版本由你核准", publicOnly: "只用公開證據", link: "安全與私隱" },
}

export const publicZhTW: PublicCopy = {
  brand: { name: "Kinnso OS", byline: "by Fimmick", homeLabel: "Kinnso OS by Fimmick · 首頁", skip: "跳到主要內容" },
  nav: {
    label: "網站導覽",
    mobileLabel: "行動版導覽",
    howItWorks: "運作方式",
    pricing: "方案價格",
    methodology: "評分方法",
    trust: "信任與隱私",
    sample: "示範報告",
    freeScan: "免費掃描",
    openMenu: "開啟選單",
    closeMenu: "關閉選單",
    menuTitle: "為中小企業打造、以證據為先的能見度管理",
  },
  footer: {
    label: "頁尾導覽",
    body: "Kinnso OS by Fimmick · 證據為先，行動為本。",
    methodology: "評分方法與限制",
    trust: "安全與隱私",
    pricing: "方案價格",
  },
  hero: {
    title: "看清顧客如何找到你",
    lead: "免費掃描 Google 搜尋、地圖、AI 搜尋、Instagram 與你的網站。",
    fieldLabel: "商家名稱或 Google Maps 連結",
    placeholder: "例如：錦汶館 跑馬地",
    marketLabel: "市場",
    hk: "香港",
    hkMeta: "港幣",
    tw: "台灣",
    twMeta: "新台幣",
    localeNote: "介面語言不會改變市場或幣別。",
    start: "開始免費掃描",
    note: "無需註冊 · 幾分鐘內有結果",
    error: "請輸入商家名稱或 Google Maps 連結。",
    loopLabel: "示意圖：搜尋後檢查五個來源、填滿評分圈並顯示一項優先行動。並非真實資料。",
  },
  how: {
    title: "運作方式",
    steps: [
      { title: "掃描", body: "檢查五個來源的公開證據，每項都附來源與日期。" },
      { title: "決定", body: "先給你一項優先行動，依影響與工作量排序，草稿已準備好。" },
      { title: "驗證", body: "之後的可比較掃描會顯示有什麼改變。未經你核准，不會發布任何內容。" },
    ],
  },
  sources: {
    title: "我們檢查什麼",
    lead: "缺少的來源只會降低涵蓋率，不會拉低評分。",
    items: {
      search: { name: "Google 搜尋", body: "在地搜尋時是否找得到你。" },
      maps: { name: "Google 地圖", body: "商家檔案、評論與營業時間。" },
      ai: { name: "AI 搜尋", body: "Google AI 摘要與 AI 模式（若有出現）。" },
      instagram: { name: "Instagram", body: "近期公開貼文與基本資料。" },
      website: { name: "網站", body: "十五項檢查，從頁面標題到營業時間。" },
    },
    rules: "涵蓋率如何計算",
  },
  sample: {
    eyebrow: "示範報告",
    title: "你的報告會是這樣",
    body: "以示範咖啡店「錦汶館」的固定示範資料製作，並非真實客戶。",
    actionTitle: "回覆 7 則未回覆的 Google 評論",
    actionSummary: "七則近期評論仍待店家回覆。",
    status: "草稿已備妥",
    cta: "開啟完整示範報告",
    workspace: "查看示範工作台",
  },
  pricing: {
    title: "簡單的方案",
    freeChip: "免費",
    freeTitle: "免費掃描",
    freeBody: "一次掃描與報告預覽，無需註冊。",
    freeCta: "開始免費掃描",
    growthChip: "一個據點",
    growthTitle: "成長工作台",
    perMonth: "月",
    all: "查看所有方案",
  },
  faq: {
    title: "常見問題",
    items: [
      { q: "掃描是免費的嗎？", a: "是。一次掃描免費，開始時無需註冊。若要解鎖完整報告，需留下聯絡方式以便我們寄送。" },
      { q: "你們會檢查什麼？", a: "Google 搜尋、Google 地圖、Google AI 摘要與 AI 模式（若有出現）、Instagram 與你網站上的公開證據。" },
      { q: "需要多久？", a: "幾分鐘。部分檢查可能稍後才完成，報告會列出是哪幾項。" },
      { q: "會不會替我發布內容？", a: "不會。草稿在你核准某一個版本前都只是草稿，系統不會自動發布。" },
      { q: "我的資料會如何使用？", a: "聯絡資料只用於寄送你的報告。行銷訊息需要另外同意。" },
    ],
  },
  trust: { noAutoPost: "不會自動發布", youApprove: "每個版本由你核准", publicOnly: "只使用公開證據", link: "安全與隱私" },
}
