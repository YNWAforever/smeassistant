export const supportedLocales = ["en", "zh-HK", "zh-TW"] as const
import type { PublicCopy } from "@/lib/copy-public"
import type { PublicInfoCopy } from "@/lib/copy-public-info"
import type { ReportUiCopy } from "@/lib/copy-report"
import type { UiCopy } from "@/lib/copy-ui"
import type { WorkspaceCopy } from "@/lib/copy-workspace"
import { localeDataFor } from "@/lib/locale-data/registry"

export type PrototypeLocale = (typeof supportedLocales)[number]

const homeReviewZh = {
  title: "已套用回覆的下一步", applied: "已套用（店主回報）", completed: "已完成",
  version: "第 {n} 版", pending: "待店主人工核對", checked: "店主已核對 · 店主聲明",
  notFound: "未找到／內容不符", later: "稍後再核對", retracted: "店主核對已撤回",
  check: "核對已儲存回覆", view: "查看已儲存核對", next: "下一步：",
  compare: "比對商戶、指定評論及此已儲存回覆。",
  independent: "獨立驗證仍待核實；店主聲明不代表已發佈或成效改善。",
  newerDraft: "第 {n} 版是另一份待審草稿；此核對及已套用聲明只屬第 {applied} 版。",
  reviewDraft: "審閱第 {n} 版草稿", returnHome: "返回今日首頁",
  returnBlocked: "請先儲存這份核對再返回。若結果未確認，請重試儲存；輸入會保留。",
  missingVersion: "無法讀取指定的已儲存版本",
  missingVersionHelp: "請重新開啟指定的已儲存版本；這裡不會自動選取另一版本。",
  restoreVersion: "返回上一個畫面",
}
/** Shared vocabulary for the version-bound home/check handoff. */
export const homeReviewCopy = {
  en: {
    title: "Follow up an applied reply", applied: "Applied (reported)", completed: "Completed",
    version: "Version {n}", pending: "Owner check pending", checked: "Owner checked · statement only",
    notFound: "Not found / content differs", later: "Check deferred", retracted: "Owner check withdrawn",
    check: "Check saved reply", view: "View saved check", next: "Next:",
    compare: "Match the business, specified review and this saved reply.",
    independent: "Independent verification is pending; an owner statement does not confirm publication or improved results.",
    newerDraft: "Version {n} is a separate draft and needs its own review. This check and applied statement stay with version {applied}.",
    reviewDraft: "Review draft version {n}", returnHome: "Return to today",
    returnBlocked: "Save this check before going back. If the result is unclear, retry the save; your input stays here.",
    missingVersion: "This saved version is unavailable",
    missingVersionHelp: "Open the intended saved version again. Another version will not be selected automatically.",
    restoreVersion: "Return to the previous view",
  },
  "zh-HK": homeReviewZh,
  "zh-TW": { ...homeReviewZh, independent: "獨立驗證仍待核實；店主聲明不代表已發佈或成效改善。" },
}

/**
 * Each locale's name in its own language, for the language picker. It lists
 * every locale, so it cannot come from the per-page dictionary registry;
 * tests/locale-data.test.ts keeps it equal to each dictionary's `language`.
 */
export const LOCALE_NAMES: Readonly<Record<PrototypeLocale, string>> = {
  en: "English",
  "zh-HK": "繁體中文（香港）",
  "zh-TW": "繁體中文（台灣）",
}

/** Compact picker labels for tight bars (the trigger keeps its full accessible name). */
export const LOCALE_SHORT_NAMES: Readonly<Record<PrototypeLocale, string>> = {
  en: "EN",
  "zh-HK": "繁·港",
  "zh-TW": "繁·台",
}

export function normaliseLocale(value: string | undefined): PrototypeLocale {
  return supportedLocales.includes(value as PrototypeLocale) ? (value as PrototypeLocale) : "zh-HK"
}

/**
 * Production copy for the public funnel (Phase 1). Every string exists in all
 * three locales; zh-HK is written Chinese in the prototype's register, zh-TW
 * uses Taiwan wording (店家／核准／據點), en is concise British-neutral.
 * Data-derived labels (finding keys, module names, severities, candidate-search
 * errors, consent sentences) come from the upstream message bundle instead
 * (lib/i18n.ts + lib/messages/*.json).
 */
export type FunnelCopy = {
  demoBar: { title: string; body: string; note: string }
  footer: { tagline: string; body: string; privacy: string; terms: string }
  notFound: { eyebrow: string; title: string; body: string; home: string; scan: string; sample: string }
  landing: { timing: string; planNote: string; perMonth: string; contactPricing: string }
  scan: {
    eyebrow: string
    stepTitles: [string, string, string, string]
    stepHints: [string, string, string, string]
    stepOf: string
    progressLabel: string
    securityTitle: string
    securityBody: string
    backHome: string
    businessLabel: string
    businessHint: string
    searchButton: string
    searching: string
    matchBadge: string
    verifyNote: string
    chooseHeading: string
    select: string
    selected: string
    change: string
    ratingLine: string
    reviewsOnly: string
    confidence: string
    confidenceHigh: string
    confidenceMedium: string
    confidenceLow: string
    manualEntry: string
    manualTitle: string
    manualBody: string
    marketLabel: string
    marketHelp: string
    hk: string
    hkMeta: string
    tw: string
    twMeta: string
    languageLabel: string
    languageSeparate: string
    languageHelp: string
    marketChanged: string
    websiteLabel: string
    websiteHelp: string
    instagramLabel: string
    instagramHelp: string
    optional: string
    igFind: string
    igSearching: string
    igChooseHeading: string
    igNoResults: string
    igSelect: string
    igSelected: string
    igSourceWebsite: string
    igSourceSearch: string
    coverageHeading: string
    coverageRequested: string
    coverageNonBinding: string
    sourceGoogle: string
    sourceWebsite: string
    sourceSearchAi: string
    sourceInstagram: string
    sourceNotProvided: string
    sourceManual: string
    reviewHeading: string
    reviewBusiness: string
    reviewIdentity: string
    identityConfirmed: string
    identityManual: string
    reviewMarket: string
    reviewLanguage: string
    reviewIndustry: string
    reviewDistrict: string
    reviewObjective: string
    reviewSources: string
    consentTitle: string
    consentBody: string
    privacyNote: string
    errors: { business: string; place: string; industry: string; district: string; website: string; consent: string; consentStale: string; submit: string; network: string }
    back: string
    continue: string
    start: string
    submitting: string
  }
  scanning: {
    reference: string
    title: string
    /** Hero title once the scan has finished (the card below says what to do next). */
    titleReady: string
    /** Hero title once the scan has stopped without a result. */
    titleFailed: string
    body: string
    progress: string
    subjectLabel: string
    collectors: { google_business: string; instagram: string; search_ai: string }
    phase: { pending: string; running: string; awaiting_result: string; not_provided: string; done: string; unavailable: string; failed: string; stalled: string }
    stalledTitle: string
    stalledBody: string
    stalledReason: { timeout: string; rateLimited: string; unreachable: string; missing: string }
    stalledCheck: string
    stalledChecking: string
    stalledResume: string
    stalledResuming: string
    stalledResumeNote: string
    atCapacity: string
    elapsedMinutes: string
    seeReport: string
    readyTitle: string
    readyBody: string
    readyButton: string
    coverageLine: string
    failedTitle: string
    failedBody: string
    failedReference: string
    retry: string
    recoveryTitle: string
    recoveryBody: string
    copyLink: string
    copied: string
    backgroundTitle: string
    backgroundBody: string
    elapsed: string
  }
  report: {
    previewBadge: string
    fullBadge: string
    sampleBadge: string
    partialBadge: string
    failedBadge: string
    title: string
    firstScan: string
    marketHK: string
    marketTW: string
    withheldTitle: string
    withheldBody: string
    firstScanTitle: string
    firstScanBody: string
    failedTitle: string
    failedBody: string
    measuredLabel: string
    unavailableLabel: string
    comparisonLabel: string
    comparisonNotYet: string
    comparisonEligible: string
    sourceCount: string
    /** Singular form where the language has one (en "1 source"); zh repeats sourceCount. */
    sourceCountOne: string
    howMeasured: string
    prioritiesEyebrow: string
    prioritiesTitle: string
    prioritiesRanked: string
    prioritiesEmpty: string
    findingsEyebrow: string
    findingsTitle: string
    findingsEmpty: string
    actionLabel: string
    evidenceLabel: string
    draftLabel: string
    summaryEyebrow: string
    summaryTitle: string
    proofEyebrow: string
    proofTitle: string
    proofBody: string
    dashboard: { engagement: string; searchVisibility: string; unavailable: string; statistics: string; rubric: string; rubricNote: string; comparisons: string; comparisonsNote: string; noComparisons: string; sampleSize: string; dateUnavailable: string; observed: string; scanned: string; details: string; summary: string; unavailableReason: string; followersUnit: string; reviewsUnit: string; countUnit: string; currentBusiness: string; coverageUnavailable: string; responseRate: string; unansweredReviews: string; websiteChecks: string; websiteSource: string; outOf: string; queriesOutOf: string; rubricSample: string; rubricSampleNote: string }
    proof: {
      ig: string
      gbp: string
      aeo: string
      merchant: string
      trust: string
      followers: string
      following: string
      posts: string
      reviews: string
      rating: string
      overview: string
      mode: string
      organic: string
      found: string
      cited: string
      response: string
      days: string
      competitors: string
      website: string
      faqSchema: string
      metaLength: string
      h1Count: string
      yes: string
      no: string
      unknown: string
      ownerReply: string
      noReply: string
    }
    evidenceEyebrow: string
    evidenceTitle: string
    evidenceBody: string
    evidenceCaptured: string
    evidenceMetadataOnly: string
    evidenceStoredUnavailable: string
    evidenceFailed: string
    evidencePublished: string
    evidenceCaption: string
    evidenceOpen: string
    evidenceClose: string
    evidenceShowMore: string
    evidenceShowLess: string
    evidenceSource: string
    passportEyebrow: string
    passportTitle: string
    fullMethodology: string
    notScored: string
    scoreOutOf: string
    unlockEyebrow: string
    unlockTitle: string
    unlockBody: string
    unlockHidden: string
    unlockButton: string
    ctaEyebrow: string
    ctaTitle: string
    ctaBody: string
    signOut: string
    signOutWorking: string
    signOutDone: string
    signOutError: string
    viewerNote: string
    memberNote: string
    sampleNote: string
    claimTitle: string
    claimBody: string
    claimCta: string
  }
  unlock: {
    reportLabel: string
    title: string
    body: string
    benefits: [{ title: string; body: string }, { title: string; body: string }, { title: string; body: string }]
    formTitle: string
    formBody: string
    objectiveHeading: string
    channelHeading: string
    channels: { whatsapp: string; line: string; phone: string; email: string }
    contactLabels: { whatsapp: string; line: string; phone: string; email: string }
    placeholders: { whatsapp: string; line: string; phone: string; email: string }
    signInEmailLabel: string
    signInEmailHint: string
    deliveryTitle: string
    /** The delivery consent's own description; must not reuse formBody. */
    deliveryBody: string
    discussionTitle: string
    discussionBody: string
    marketingTitle: string
    marketingBody: string
    submit: string
    submitting: string
    errors: { contact: string; invalidContact: string; invalidSignInEmail: string; delivery: string; failed: string; network: string }
    success: string
    privacyNote: string
    policyLink: string
  }
  pricing: {
    badge: string
    marketNote: string
    planNote: string
    faqFinalTitle: string
    faqFinalBody: string
    contactFimmick: string
  }
  methodology: { versionBadge: string }
  trust: {
    intro: string
    boundaryEyebrow: string
    boundaryTitle: string
    rows: Array<{ label: string; value: string }>
    /**
     * The retention schedule's actual status. The rows say what is kept and how
     * it is protected; this says for how long, and the honest answer today is
     * "nothing deletes any of it by age". One line rather than a repeat on each
     * row, and outside `rows` so it cannot be read as another kept thing.
     */
    retentionNote: string
    policyLink: string
  }
  /**
   * The unsaved preview draft (P4.5, spec §3): the report card, the /start
   * page and its form. `badge`, `boundary`, `notKept`, `cta`, `submit` and
   * `cardTitle` are spec §3 verbatim. Refusals are fixed per reason and never
   * echo what the visitor typed.
   */
  preview: {
    cardTitle: string
    badge: string
    boundary: string
    reviewLabel: string
    /** "{count}" is the trimmed review length in Unicode code points. */
    count: string
    ratingLabel: string
    noRating: string
    /** "{rating}" is 1–5. */
    ratingOption: string
    submit: string
    submitting: string
    warningsLabel: string
    copy: string
    copied: string
    copyFailed: string
    notKept: string
    cta: string
    refusals: {
      already_used: string
      job_limit: string
      ip_limit: string
      daily_limit: string
      budget: string
      paused: string
      unavailable: string
      invalid_input: string
    }
  }
  legal: { backToScanner: string; version: string; contents: string }
}

export type Copy = {
  language: string
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
    /** FA-04: the 今日要做 card's one verb, and the variant when facts are missing. */
    start: string
    addFacts: string
    whyNow: string
    /** FA-04: the closed disclosure that holds the methodology. */
    trust: string
    emptyWeek: string
    rescanNow: string
    /** F-19: no scan (or no linked business) yet, and a scanned location with nothing open. */
    noScanTitle: string
    noScanSubtitle: string
    quietTitle: string
    quietSubtitle: string
    noLocationTitle: string
    noLocationBody: string
    noLocationCta: string
    month: string
    /** Shown in place of a count when no comparable scan exists: unknown, never 0. */
    noComparable: string
  }
  ownerFocus: {
    why: string
    results: string
    otherTasks: string
    allTasks: string
    create: string
    review: string
    view: string
    export: string
    connect: string
    workflow: string
    contentGroup: string
    historyGroup: string
    settingsGroup: string
    moreIntro: string
    approvalNote: string
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
    /** Workspace colour theme switch (dark mode is workspace-only). */
    theme: { label: string; light: string; dark: string; system: string }
  }
  funnel: FunnelCopy
  workspace: WorkspaceCopy
  /** Component kit strings (lib/copy-ui.ts). */
  ui: UiCopy
  /** Public site: header, footer and landing (lib/copy-public.ts). */
  site: PublicCopy
  /** Methodology and Trust pages (lib/copy-public-info.ts). */
  siteInfo: PublicInfoCopy
  /** Report page additions (lib/copy-report.ts). */
  report: ReportUiCopy
}

/**
 * `copy[locale]` reads the dictionary registry (lib/locale-data/registry.ts).
 * On the server and in tests every locale is bundled; in the browser only the
 * dictionaries the page's layout provided exist, so a visitor downloads one
 * locale instead of all three. The strings live in lib/copy-dictionaries.ts.
 */
export const copy: Readonly<Record<PrototypeLocale, Copy>> = Object.freeze(
  Object.defineProperties(
    {} as Record<PrototypeLocale, Copy>,
    Object.fromEntries(supportedLocales.map((locale) => [locale, { enumerable: true, get: () => localeDataFor(locale).copy }])),
  ),
)

/** Localised presentation of stored scan evidence; never a combined visibility score. */
export const scanMetricsCopy = {
 en: {
  title: "Captured scan samples", instagram: "Instagram post sample", organic: "Google Search", maps: "Google Maps", ai: "AI mentions",
  appearances: "{x} of {n} eligible observations confirmed an appearance in the captured surface",
  scope: "This measures confirmed appearances in the captured results only, not overall search visibility.",
  posts: "{n} distinct posts", dated: "{n} posts with a recorded publication date", span: "Captured publication date span", published: "Publication date", scanned: "Scan date", observed: "Observation date", dateUnavailable: "Date not recorded", publicationUnavailable: "Publication date unavailable", scanUnavailable: "Scan date unavailable",
  historical: "Engagement averages and follower-based rates are unavailable: historical counts cannot reliably distinguish missing values from zero.", zero: "Historical zeros may mean missing counts", likes: "Recorded likes", comments: "Recorded comments", missing: "Not recorded", recorded: "Counts as recorded in stored evidence; not current totals.",
  unavailable: "Measurement unavailable", inspected: "Inspected records: {n}", duplicates: "Duplicate records: {n}", eligible: "Eligible observations: {n}", excluded: "Excluded observations: {n}", incomplete: "Incomplete sample: input records were limited.", evidenceLimited: "Evidence rows limited; totals use the inspected sample.", omitted: "{n} search groups omitted", evidence: "Stored evidence ({n} rows)",
  engine: "Engine", queryType: "Query type", contextUnavailable: "Source context not recorded", queryTypeUnavailable: "Not recorded", gl: "Country", hl: "Language", location: "Location", device: "Device", ll: "Map coordinates", mobile: "Mobile", desktop: "Desktop", discovery: "Discovery", branded: "Branded",
  present: "Confirmed appearance in captured surface", absent: "No confirmed appearance in captured surface", unknown: "Unknown outcome", failed: "Failed observation", unsupported: "Unsupported surface", no_answer: "No usable answer", conflict: "Conflicting evidence", unidentified: "Unidentified record",
 },
 "zh-HK": {
  title: "已擷取的掃描樣本", instagram: "Instagram 帖文樣本", organic: "Google 搜尋", maps: "Google 地圖", ai: "AI 提及",
  appearances: "{n} 次合資格觀察中，{x} 次確認在已擷取結果中出現", scope: "只量度已擷取結果中確認出現的次數，並非整體搜尋能見度。",
  posts: "{n} 則不重複帖文", dated: "{n} 則帖文有發佈日期記錄", span: "已擷取帖文的發佈日期範圍", published: "發佈日期", scanned: "掃描日期", observed: "觀察日期", dateUnavailable: "未有記錄日期", publicationUnavailable: "發佈日期未有提供", scanUnavailable: "掃描日期未有提供",
  historical: "未能量度平均互動及按追蹤者計算的互動率：歷史數據無法可靠地區分缺失數值與零。", zero: "歷史零值可能代表未有記錄", likes: "已記錄讚好數", comments: "已記錄留言數", missing: "未有記錄", recorded: "數值來自已儲存證據，並非目前總數。",
  unavailable: "未能量度", inspected: "已檢視記錄：{n}", duplicates: "重複記錄：{n}", eligible: "合資格觀察：{n}", excluded: "已排除觀察：{n}", incomplete: "樣本不完整：輸入記錄已截短。", evidenceLimited: "證據列已截短；總數按已檢視樣本計算。", omitted: "已省略 {n} 組搜尋", evidence: "已儲存證據（{n} 列）",
  engine: "引擎", queryType: "查詢類型", contextUnavailable: "未有來源設定記錄", queryTypeUnavailable: "未有記錄", gl: "國家", hl: "語言", location: "地點", device: "裝置", ll: "地圖座標", mobile: "流動裝置", desktop: "桌面裝置", discovery: "探索", branded: "品牌",
  present: "確認在已擷取結果中出現", absent: "未確認在已擷取結果中出現", unknown: "結果不明", failed: "觀察失敗", unsupported: "不支援此結果類型", no_answer: "沒有可用回答", conflict: "證據互相矛盾", unidentified: "無法識別的記錄",
 },
 "zh-TW": {
  title: "已擷取的掃描樣本", instagram: "Instagram 貼文樣本", organic: "Google 搜尋", maps: "Google 地圖", ai: "AI 提及",
  appearances: "{n} 次合資格觀察中，{x} 次確認在已擷取結果中出現", scope: "僅衡量已擷取結果中確認出現的次數，並非整體搜尋能見度。",
  posts: "{n} 則不重複貼文", dated: "{n} 則貼文有發布日期記錄", span: "已擷取貼文的發布日期範圍", published: "發布日期", scanned: "掃描日期", observed: "觀察日期", dateUnavailable: "未記錄日期", publicationUnavailable: "未提供發布日期", scanUnavailable: "未提供掃描日期",
  historical: "未能量度平均互動及依追蹤者計算的互動率：歷史資料無法可靠地區分缺漏數值與零。", zero: "歷史零值可能代表未有記錄", likes: "已記錄按讚數", comments: "已記錄留言數", missing: "未有記錄", recorded: "數值來自已儲存證據，並非目前總數。",
  unavailable: "未能量度", inspected: "已檢視記錄：{n}", duplicates: "重複記錄：{n}", eligible: "合資格觀察：{n}", excluded: "已排除觀察：{n}", incomplete: "樣本不完整：輸入記錄已截短。", evidenceLimited: "證據列已截短；總數依已檢視樣本計算。", omitted: "已省略 {n} 組搜尋", evidence: "已儲存證據（{n} 列）",
  engine: "引擎", queryType: "查詢類型", contextUnavailable: "未記錄來源設定", queryTypeUnavailable: "未有記錄", gl: "國家", hl: "語言", location: "地點", device: "裝置", ll: "地圖座標", mobile: "行動裝置", desktop: "桌面裝置", discovery: "探索", branded: "品牌",
  present: "確認在已擷取結果中出現", absent: "未確認在已擷取結果中出現", unknown: "結果不明", failed: "觀察失敗", unsupported: "不支援此結果類型", no_answer: "沒有可用回答", conflict: "證據互相矛盾", unidentified: "無法識別的記錄",
 },
} satisfies Record<PrototypeLocale, Record<string, string>>;
