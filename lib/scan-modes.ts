import type { Locale } from "@/lib/locale";

export type ScanModeKey = "generic" | "fnb" | "retail" | "local-service";

export type LocalizedText = Record<Locale, string>;
export type LocalizedList = Record<Locale, string[]>;

export type ScanModeFaqItem = {
  question: string;
  answer: string;
};

export type ScanModeConfig = {
  key: ScanModeKey;
  route: string;
  navLabel: LocalizedText;
  defaultIndustry?: string;
  landing: {
    badge: LocalizedText;
    headline: LocalizedText;
    subheading: LocalizedText;
    checklist: LocalizedList;
    cta: LocalizedText;
  };
  faq: Record<Locale, ScanModeFaqItem[]>;
  scanningMessages: LocalizedList;
  reportPreviewModulePriority: string[];
};

export type PreviewFindingLike = {
  module: string;
  severity: string;
  score_impact: number | null;
};

export const SCAN_MODE_KEYS = ["generic", "fnb", "retail", "local-service"] as const;
export const NAV_MODE_KEYS = ["fnb", "retail", "local-service", "generic"] as const;

const sharedChecklistZh = [
  "綜合能見度評分",
  "Google 商家評分、review、相片、營業時間",
  "Google AI Overview / AI Mode 有冇提及你",
  "IG bio、link、Reels、Highlights、發文頻率",
  "Top 3 真實問題",
  "WhatsApp 解鎖完整報告",
];

const sharedChecklistEn = [
  "Overall Visibility Score",
  "Google Business rating, reviews, photos, and hours",
  "Whether Google AI Overview / AI Mode mentions you",
  "IG bio, link, Reels, Highlights, and posting frequency",
  "Top 3 real issues",
  "WhatsApp unlock for the full report",
];

const sharedFaqZh: ScanModeFaqItem[] = [
  { question: "係咪免費？", answer: "係。你可以免費睇 scan preview，留低 WhatsApp 先解鎖完整報告。" },
  { question: "需唔需要登入？", answer: "唔需要登入。v0.1 只需要填基本商戶資料就可以開始。" },
  { question: "會 scan 啲咩資料？", answer: "主要睇公開 IG、Google 商家 / Maps 訊號、AI 搜尋能見度，以及可選網站基本資料。" },
  { question: "如果我冇網站得唔得？", answer: "得。網站係可選；如果冇網站，系統會略過網站相關嘅 AI / SEO 檢查。" },
  { question: "點解要 IG handle？", answer: "系統會睇公開 IG profile 清唔清楚、內容新唔新、Reels / Highlights 有冇做、客人搵唔搵到查詢入口。" },
  { question: "點解要 WhatsApp 解鎖？", answer: "WhatsApp 用嚟解鎖完整 audit，同埋喺你同意後方便 Fimmick 跟進改善建議。" },
  { question: "掃描結果係咪真實數據？", answer: "報告會用可取得嘅公開訊號，並喺有數據時展示證據。拎唔到嘅資料唔會扮成事實。" },
];

const sharedFaqEn: ScanModeFaqItem[] = [
  { question: "Is it free?", answer: "Yes. You can view the scan preview for free and leave WhatsApp to unlock the full report." },
  { question: "Do I need to log in?", answer: "No login is required. v0.1 only needs basic business details to start." },
  { question: "What data does it scan?", answer: "It checks public IG, Google Business / Maps signals, AI search visibility, and optional website basics." },
  { question: "Can I scan without a website?", answer: "Yes. Website is optional; website-related AI / SEO checks are skipped when absent." },
  { question: "Why do you need my IG handle?", answer: "The scan checks public profile clarity, content freshness, Reels, Highlights, and whether customers can find a contact path." },
  { question: "Why is WhatsApp needed to unlock?", answer: "WhatsApp unlocks the full audit and lets Fimmick follow up on improvement options after consent." },
  { question: "Is the result based on real data?", answer: "The report uses available public signals and shows evidence where data is available. Unavailable data is not treated as fact." },
];

const sharedChecklistTw = [
  "綜合能見度評分",
  "Google 商家評分、評論、相片、營業時間",
  "Google AI Overview / AI Mode 有沒有提到你",
  "IG bio、連結、Reels、Highlights、發文頻率",
  "Top 3 真實問題",
  "LINE 解鎖完整報告",
];

const sharedFaqTw: ScanModeFaqItem[] = [
  { question: "是免費的嗎？", answer: "是。你可以免費看掃描預覽，留下 LINE 再解鎖完整報告。" },
  { question: "需要登入嗎？", answer: "不需要登入。v0.1 只需要填基本商家資料就能開始。" },
  { question: "會掃描哪些資料？", answer: "主要看公開 IG、Google 商家 / Maps 訊號、AI 搜尋能見度，以及選填的網站基本資料。" },
  { question: "如果我沒有網站可以嗎？", answer: "可以。網站是選填；沒有網站時，系統會略過網站相關的 AI / SEO 檢查。" },
  { question: "為什麼需要 IG 帳號？", answer: "系統會看公開 IG profile 清不清楚、內容新不新、有沒有經營 Reels / Highlights、客人找不找得到聯絡入口。" },
  { question: "為什麼要用 LINE 解鎖？", answer: "LINE 用來解鎖完整 audit，並在你同意後方便 Fimmick 跟進改善建議。" },
  { question: "掃描結果是真實數據嗎？", answer: "報告會用可取得的公開訊號，並在有數據時呈現證據。拿不到的資料不會當成事實。" },
];

export const SCAN_MODES: Record<ScanModeKey, ScanModeConfig> = {
  generic: {
    key: "generic",
    route: "/scanner",
    navLabel: { "zh-HK": "通用 Scan", en: "General Scan", "zh-TW": "通用掃描" },
    landing: {
      badge: { "zh-HK": "免費 AI 能見度診斷", en: "Free AI Visibility Audit", "zh-TW": "免費 AI 能見度診斷" },
      headline: { "zh-HK": "AI、Google、IG 都搵唔到你？", en: "Can AI, Google, and IG find your business?", "zh-TW": "AI、Google、IG 都找不到你？" },
      subheading: {
        "zh-HK": "免費 scan，幾分鐘內即睇三大流量缺口。",
        en: "Free scan. In a few minutes, see your three biggest traffic gaps.",
        "zh-TW": "免費掃描，幾分鐘內看見三大流量缺口。",
      },
      checklist: { "zh-HK": sharedChecklistZh, en: sharedChecklistEn, "zh-TW": sharedChecklistTw },
      cta: { "zh-HK": "開始免費 Scan", en: "Start Free Scan", "zh-TW": "開始免費掃描" },
    },
    faq: { "zh-HK": sharedFaqZh, en: sharedFaqEn, "zh-TW": sharedFaqTw },
    scanningMessages: {
      "zh-HK": ["緊急 scan 緊你嘅 IG...", "正在分析 Google 商家評分...", "問緊 Google AI 能見度...", "計算緊你嘅 Visibility Score..."],
      en: ["Scanning your IG...", "Analysing your Google Business score...", "Checking AI visibility...", "Calculating your Visibility Score..."],
      "zh-TW": ["正在掃描你的 IG...", "正在分析 Google 商家評分...", "正在詢問 Google AI 能見度...", "正在計算你的 Visibility Score..."],
    },
    reportPreviewModulePriority: [],
  },
  fnb: {
    key: "fnb",
    route: "/fnb",
    navLabel: { "zh-HK": "F&B", en: "F&B", "zh-TW": "餐飲" },
    defaultIndustry: "餐飲",
    landing: {
      badge: { "zh-HK": "餐飲能見度診斷", en: "F&B Visibility Audit", "zh-TW": "餐飲能見度診斷" },
      headline: { "zh-HK": "附近客人搵餐廳，Google Maps / AI 見唔見到你？", en: "When nearby diners search, can Google Maps and AI find you?", "zh-TW": "附近客人找餐廳，Google Maps / AI 看不看得到你？" },
      subheading: {
        "zh-HK": "檢查 review、相片、營業時間、AI 推薦同 IG 查詢路徑。",
        en: "Check reviews, photos, opening hours, AI recommendations, and IG enquiry paths.",
        "zh-TW": "檢查評論、相片、營業時間、AI 推薦與 IG 詢問路徑。",
      },
      checklist: { "zh-HK": sharedChecklistZh, en: sharedChecklistEn, "zh-TW": sharedChecklistTw },
      cta: { "zh-HK": "免費 Scan 我間餐廳", en: "Scan My Restaurant for Free", "zh-TW": "免費掃描我的餐廳" },
    },
    faq: {
      "zh-HK": [
        { question: "餐廳最主要睇咩？", answer: "會重點睇 Google Maps、review、相片、營業時間、AI 推薦同 IG 查詢入口。" },
        ...sharedFaqZh,
      ],
      en: [
        { question: "What matters most for F&B?", answer: "The scan prioritizes Google Maps, reviews, photos, opening hours, AI recommendations, and IG enquiry paths." },
        ...sharedFaqEn,
      ],
      "zh-TW": [
        { question: "餐廳最主要看什麼？", answer: "會重點看 Google Maps、評論、相片、營業時間、AI 推薦與 IG 詢問入口。" },
        ...sharedFaqTw,
      ],
    },
    scanningMessages: {
      "zh-HK": ["睇緊你喺 Google Maps 嘅餐廳資料...", "分析緊 review、相片同營業時間...", "問緊 AI：附近有咩餐廳推薦...", "計算緊你嘅餐廳能見度分數..."],
      en: ["Checking your restaurant on Google Maps...", "Analysing reviews, photos, and opening hours...", "Asking AI about nearby restaurant recommendations...", "Calculating your restaurant visibility score..."],
      "zh-TW": ["正在查看你在 Google Maps 的餐廳資料...", "正在分析評論、相片與營業時間...", "正在詢問 AI：附近有哪些餐廳推薦...", "正在計算你的餐廳能見度分數..."],
    },
    reportPreviewModulePriority: ["gbp", "aeo", "ig", "trust"],
  },
  retail: {
    key: "retail",
    route: "/retail",
    navLabel: { "zh-HK": "本地零售", en: "Local Retail", "zh-TW": "本地零售" },
    defaultIndustry: "零售",
    landing: {
      badge: { "zh-HK": "零售能見度診斷", en: "Retail Visibility Audit", "zh-TW": "零售能見度診斷" },
      headline: { "zh-HK": "客人未入舖之前，Google / IG 已經決定佢信唔信你。", en: "Before customers visit, Google and IG shape whether they trust you.", "zh-TW": "客人還沒進店之前，Google / IG 已經決定他信不信你。" },
      subheading: {
        "zh-HK": "檢查店舖搜尋、review、新相、IG 內容同 AI 推薦能見度。",
        en: "Check store discovery, reviews, fresh photos, IG content, and AI recommendation visibility.",
        "zh-TW": "檢查店家搜尋、評論、新相片、IG 內容與 AI 推薦能見度。",
      },
      checklist: { "zh-HK": sharedChecklistZh, en: sharedChecklistEn, "zh-TW": sharedChecklistTw },
      cta: { "zh-HK": "免費 Scan 我間店", en: "Scan My Store for Free", "zh-TW": "免費掃描我的店" },
    },
    faq: {
      "zh-HK": [
        { question: "零售店最主要睇咩？", answer: "會重點睇 Google 店舖資料、相片、review、IG 社交證明，同 AI 會唔會推薦你。" },
        ...sharedFaqZh,
      ],
      en: [
        { question: "What matters most for retail?", answer: "The scan prioritizes Google store details, photos, reviews, IG social proof, and whether AI recommends you." },
        ...sharedFaqEn,
      ],
      "zh-TW": [
        { question: "零售店最主要看什麼？", answer: "會重點看 Google 店家資料、相片、評論、IG 社交證明，以及 AI 會不會推薦你。" },
        ...sharedFaqTw,
      ],
    },
    scanningMessages: {
      "zh-HK": ["睇緊你喺 Google Maps 嘅店舖資料...", "分析緊 review、相片同 IG 訊號...", "問緊 AI：附近有咩零售店推薦...", "計算緊你嘅店舖能見度分數..."],
      en: ["Checking your store on Google Maps...", "Analysing reviews, photos, and IG signals...", "Asking AI about nearby retail recommendations...", "Calculating your store visibility score..."],
      "zh-TW": ["正在查看你在 Google Maps 的店家資料...", "正在分析評論、相片與 IG 訊號...", "正在詢問 AI：附近有哪些零售店推薦...", "正在計算你的店家能見度分數..."],
    },
    reportPreviewModulePriority: ["gbp", "ig", "trust", "aeo"],
  },
  "local-service": {
    key: "local-service",
    route: "/local-service",
    navLabel: { "zh-HK": "本地服務", en: "Local Service", "zh-TW": "本地服務" },
    defaultIndustry: "本地服務",
    landing: {
      badge: { "zh-HK": "本地服務能見度診斷", en: "Local Service Visibility Audit", "zh-TW": "本地服務能見度診斷" },
      headline: { "zh-HK": "客人搵服務時，review、地區、AI 推薦決定佢會唔會問你。", en: "For local services, reviews, location, and AI recommendations decide enquiries.", "zh-TW": "客人找服務時，評論、地區、AI 推薦決定他會不會詢問你。" },
      subheading: {
        "zh-HK": "檢查 Google 信任訊號、地區能見度、AI 推薦同查詢路徑。",
        en: "Check Google trust signals, local visibility, AI recommendations, and enquiry paths.",
        "zh-TW": "檢查 Google 信任訊號、地區能見度、AI 推薦與詢問路徑。",
      },
      checklist: { "zh-HK": sharedChecklistZh, en: sharedChecklistEn, "zh-TW": sharedChecklistTw },
      cta: { "zh-HK": "免費 Scan 我嘅服務", en: "Scan My Service for Free", "zh-TW": "免費掃描我的服務" },
    },
    faq: {
      "zh-HK": [
        { question: "本地服務最主要睇咩？", answer: "會重點睇 Google review、評分、地區相關性、AI 推薦，同客人搵唔搵到查詢入口。" },
        ...sharedFaqZh,
      ],
      en: [
        { question: "What matters most for local services?", answer: "The scan prioritizes Google reviews, ratings, local relevance, AI recommendations, and whether customers can find an enquiry path." },
        ...sharedFaqEn,
      ],
      "zh-TW": [
        { question: "本地服務最主要看什麼？", answer: "會重點看 Google 評論、評分、地區相關性、AI 推薦，以及客人找不找得到詢問入口。" },
        ...sharedFaqTw,
      ],
    },
    scanningMessages: {
      "zh-HK": ["睇緊你嘅 Google 商家同地區訊號...", "分析緊 review、信任度同查詢路徑...", "問緊 AI：附近有咩服務推薦...", "計算緊你嘅本地服務能見度分數..."],
      en: ["Checking your Google Business and local signals...", "Analysing reviews, trust, and enquiry paths...", "Asking AI about nearby service recommendations...", "Calculating your local service visibility score..."],
      "zh-TW": ["正在查看你的 Google 商家與地區訊號...", "正在分析評論、信任度與詢問路徑...", "正在詢問 AI：附近有哪些服務推薦...", "正在計算你的本地服務能見度分數..."],
    },
    reportPreviewModulePriority: ["gbp", "trust", "aeo", "ig"],
  },
};

const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export function isScanModeKey(value: unknown): value is ScanModeKey {
  return typeof value === "string" && SCAN_MODE_KEYS.includes(value as ScanModeKey);
}

export function getScanMode(key: unknown): ScanModeConfig {
  return isScanModeKey(key) ? SCAN_MODES[key] : SCAN_MODES.generic;
}

export function getModeKeyForIndustry(industry: string | null | undefined): ScanModeKey {
  if (industry === "餐飲") return "fnb";
  if (industry === "零售") return "retail";
  if (industry === "本地服務") return "local-service";
  return "generic";
}

export function getScanningMessages(modeKey: unknown, locale: Locale): string[] {
  const mode = getScanMode(modeKey);
  return mode.scanningMessages[locale] ?? SCAN_MODES.generic.scanningMessages[locale];
}

export function selectPreviewFindings<T extends PreviewFindingLike>(
  findings: T[],
  industry: string | null | undefined,
  limit = 3
): T[] {
  const mode = SCAN_MODES[getModeKeyForIndustry(industry)];
  const priority = mode.reportPreviewModulePriority;
  const hasPriorityFinding = findings.some((f) => priority.includes(f.module));

  return [...findings]
    .sort((a, b) => {
      if (hasPriorityFinding) {
        const moduleDiff = priority.indexOf(a.module) - priority.indexOf(b.module);
        const aKnown = priority.includes(a.module);
        const bKnown = priority.includes(b.module);
        if (aKnown && bKnown && moduleDiff !== 0) return moduleDiff;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
      }

      const severityDiff = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      return (a.score_impact ?? 0) - (b.score_impact ?? 0);
    })
    .slice(0, limit);
}
