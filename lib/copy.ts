export const supportedLocales = ["en", "zh-HK", "zh-TW"] as const
export type PrototypeLocale = (typeof supportedLocales)[number]

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
type FunnelCopy = {
  demoBar: { title: string; body: string; note: string }
  footer: { tagline: string; body: string; privacy: string; terms: string }
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
    errors: { business: string; place: string; industry: string; district: string; consent: string; submit: string; network: string }
    back: string
    continue: string
    start: string
    submitting: string
  }
  scanning: {
    reference: string
    title: string
    body: string
    progress: string
    subjectLabel: string
    collectors: { google_business: string; instagram: string; search_ai: string }
    phase: { pending: string; running: string; done: string; collected: string; failed: string }
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
    evidenceFailed: string
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
    recoveryLabel: string
    recoveryHint: string
    deliveryTitle: string
    discussionTitle: string
    discussionBody: string
    marketingTitle: string
    marketingBody: string
    submit: string
    submitting: string
    errors: { contact: string; invalidContact: string; delivery: string; failed: string; network: string }
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
    policyLink: string
  }
  legal: { backToScanner: string; version: string }
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
  funnel: FunnelCopy
}

const funnelEn: FunnelCopy = {
  demoBar: { title: "Demo data", body: "Fixed, sanitised Kam Man House sample", note: "No live scans, payments or external publishing on this page" },
  footer: { tagline: "Evidence first, action next.", body: "SME Scanner by Fimmick · Evidence first, action next.", privacy: "Privacy", terms: "Terms" },
  landing: {
    timing: "A free scan takes a few minutes. Completion time varies by source availability.",
    planNote: "Prices shown for the selected market · Interface language never changes market or currency",
    perMonth: "month",
    contactPricing: "Contact Fimmick",
  },
  scan: {
    eyebrow: "Free evidence scan",
    stepTitles: ["Confirm business", "Market & goal", "Optional channels", "Consent & start"],
    stepHints: ["Identity and listing", "Locale stays separate", "Improve coverage", "Purpose-limited"],
    stepOf: "Step {step} of 4",
    progressLabel: "Scan setup {percent}% complete",
    securityTitle: "Public evidence only",
    securityBody: "No owner-only data is requested in the free scan.",
    backHome: "Back to SME Scanner",
    businessLabel: "Business name or Google Maps link",
    businessHint: "Add an area or address if several businesses share the same name.",
    searchButton: "Find business",
    searching: "Searching…",
    matchBadge: "Google Business match",
    verifyNote: "We verify the listing against name, area and public sources.",
    chooseHeading: "Choose the correct business",
    select: "Continue with this business",
    selected: "Confirmed",
    change: "Change business",
    ratingLine: "{rating} ★ · {reviews} reviews",
    reviewsOnly: "{reviews} reviews",
    confidence: "Match confidence: {confidence}",
    confidenceHigh: "High",
    confidenceMedium: "Medium",
    confidenceLow: "Low",
    manualEntry: "This is not my business — continue with manual details",
    manualTitle: "Google Business coverage may be unavailable",
    manualBody: "You can continue, but without a confirmed listing we will not infer a poor Google score.",
    marketLabel: "Search market",
    marketHelp: "Controls geographic query context and regional rules.",
    hk: "Hong Kong",
    hkMeta: "HK market · HKD",
    tw: "Taiwan",
    twMeta: "TW market · TWD",
    languageLabel: "Interface language",
    languageSeparate: "Separate setting",
    languageHelp: "Changing language never changes the search market.",
    marketChanged: "Search market changed: confirm the business match and district again.",
    websiteLabel: "Website",
    websiteHelp: "Adds public content and technical evidence.",
    instagramLabel: "Instagram handle",
    instagramHelp: "Public profile only; provider availability can vary.",
    optional: "Optional",
    igFind: "Find my public Instagram account",
    igSearching: "Searching Instagram…",
    igChooseHeading: "Public accounts that may be yours",
    igNoResults: "No matching public Instagram account was found. You can type the handle instead.",
    igSelect: "This is my account",
    igSelected: "Selected",
    igSourceWebsite: "Found via your Google Business Profile link",
    igSourceSearch: "Found in public search results",
    coverageHeading: "Expected evidence coverage",
    coverageRequested: "{count} of 4 primary sources requested",
    coverageNonBinding: "Non-binding",
    sourceGoogle: "Google Business & Maps",
    sourceWebsite: "Public website",
    sourceSearchAi: "Search & AI surfaces",
    sourceInstagram: "Instagram public evidence",
    sourceNotProvided: "not provided",
    sourceManual: "manual entry · may be unavailable",
    reviewHeading: "Review this scan",
    reviewBusiness: "Business",
    reviewIdentity: "Listing",
    identityConfirmed: "Google Business match confirmed",
    identityManual: "Manual details",
    reviewMarket: "Search market",
    reviewLanguage: "Interface language",
    reviewIndustry: "Industry",
    reviewDistrict: "District",
    reviewObjective: "Goal",
    reviewSources: "Sources requested",
    consentTitle: "Collect supported public evidence for this scan",
    consentBody: "I understand the scan reads public sources only and that evidence availability may vary. This does not opt me into marketing.",
    privacyNote: "Purpose-limited public evidence. A separate, explicit consent is required to unlock or claim the report.",
    errors: {
      business: "Enter a business name before continuing.",
      place: "Confirm a match or choose to continue without one.",
      industry: "Select an industry.",
      district: "Select a district.",
      consent: "Confirm that we may collect public evidence for this scan.",
      submit: "The scan could not be started. Please try again.",
      network: "Network error. Please try again.",
    },
    back: "Back",
    continue: "Continue",
    start: "Start free scan",
    submitting: "Starting scan…",
  },
  scanning: {
    reference: "Scan reference",
    title: "Your evidence scan is running",
    body: "Public evidence is collected stage by stage and each source reports its own state—without fabricating a percentage or finish time. Remaining checks continue in the background.",
    progress: "{done} of 6 stages complete",
    subjectLabel: "Scan subject",
    collectors: { google_business: "Google Business evidence", instagram: "Instagram public evidence", search_ai: "Search and AI-surface evidence" },
    phase: {
      pending: "Waiting for this stage",
      running: "Reading public sources now",
      done: "Collection finished",
      collected: "Collection finished · coverage is confirmed in the report",
      failed: "The scan did not complete",
    },
    seeReport: "See report",
    readyTitle: "Your report is ready",
    readyBody: "Opening the report in a moment. Every source shows its own coverage state there.",
    readyButton: "View report",
    coverageLine: "Coverage {coverage}%",
    failedTitle: "The scan did not complete",
    failedBody: "Something went wrong while collecting evidence. Nothing was scored, so nothing is shown as poor performance. Please start the scan again.",
    failedReference: "Reference {reference}",
    retry: "Start again",
    recoveryTitle: "Save this recovery link",
    recoveryBody: "Return to this exact scan without starting again. The report link appears here as soon as the scan finishes.",
    copyLink: "Copy recovery link",
    copied: "Link copied",
    backgroundTitle: "The scan continues in the background",
    backgroundBody: "Useful evidence becomes available as each source returns; remaining checks continue even if you leave this page.",
    elapsed: "Elapsed {seconds}s",
  },
  report: {
    previewBadge: "Evidence-safe public preview",
    fullBadge: "Full report",
    sampleBadge: "Sanitised sample report",
    partialBadge: "Partial evidence",
    failedBadge: "Scan failed",
    title: "{business} visibility report",
    firstScan: "first scan",
    marketHK: "Hong Kong market",
    marketTW: "Taiwan market",
    withheldTitle: "Score withheld: not enough independent evidence",
    withheldBody: "Fewer than two of the Instagram, Google Business and search/AI channels could be measured, so no overall score is calculated. Coverage shows what is missing; nothing is scored as poor performance.",
    firstScanTitle: "First scan · no comparison yet",
    firstScanBody: "The score is weighted from measured sources only. Unavailable or unsupported sources lower coverage, never the score. A later comparable scan will show what changed.",
    failedTitle: "The scan did not complete",
    failedBody: "No score is available because the scan failed. Please start the scan again.",
    measuredLabel: "Measured",
    unavailableLabel: "Not measured",
    comparisonLabel: "Comparison",
    comparisonNotYet: "Not yet",
    comparisonEligible: "Eligible",
    sourceCount: "{count} sources",
    howMeasured: "How this was measured",
    prioritiesEyebrow: "Priority, not noise",
    prioritiesTitle: "Top three evidence-backed actions",
    prioritiesRanked: "Ranked by weighted impact on the score",
    prioritiesEmpty: "No measured deficit priorities are available.",
    findingsEyebrow: "Full findings",
    findingsTitle: "Every finding by source",
    findingsEmpty: "No detailed findings are available for this report.",
    actionLabel: "Recommended action",
    evidenceLabel: "Evidence",
    draftLabel: "Fix Pack draft",
    summaryEyebrow: "Executive summary",
    summaryTitle: "What the evidence says",
    proofEyebrow: "Verified report proof",
    proofTitle: "Sanitised public evidence behind the score",
    proofBody: "Bounded excerpts from public sources captured at scan time. Provider identifiers, raw payloads and private data are never shown.",
    proof: {
      ig: "Instagram proof",
      gbp: "Google Business proof",
      aeo: "AI visibility proof",
      merchant: "Merchant performance proof",
      trust: "Trust proof",
      followers: "followers",
      following: "following",
      posts: "posts",
      reviews: "reviews",
      rating: "rating",
      overview: "AI Overview mentioned",
      mode: "AI Mode mentioned",
      organic: "organic rank",
      found: "found",
      cited: "cited",
      response: "response rate",
      days: "days since last review",
      competitors: "competitors above you",
      website: "Website",
      faqSchema: "FAQ schema",
      metaLength: "meta description length",
      h1Count: "H1 count",
      yes: "yes",
      no: "no",
      unknown: "unknown",
      ownerReply: "Owner reply",
      noReply: "No owner reply",
    },
    evidenceEyebrow: "Original evidence",
    evidenceTitle: "Public-source content captured at scan time",
    evidenceBody: "Provider facts are shown separately from SME Scanner analysis. Media is stored only where the retention setting allows it.",
    evidenceCaptured: "Captured {date}",
    evidenceMetadataOnly: "Metadata only · snapshot not stored",
    evidenceFailed: "Snapshot unavailable",
    evidenceSource: "View source",
    passportEyebrow: "Evidence passport",
    passportTitle: "Source coverage and limitations",
    fullMethodology: "Full methodology",
    notScored: "Not scored",
    scoreOutOf: "{score} / 100",
    unlockEyebrow: "Secure owner continuation",
    unlockTitle: "Unlock the full report",
    unlockBody: "See every finding with its evidence and recommended action, the executive summary and the original public evidence. Report delivery needs one explicit consent; marketing is never bundled.",
    unlockHidden: "{count} more findings in the full report",
    unlockButton: "Unlock the full report",
    ctaEyebrow: "Talk to Fimmick",
    ctaTitle: "Want help working through these findings?",
    ctaBody: "The Fimmick team can walk through the evidence with you and prepare owner-approved actions.",
    signOut: "Sign out of this report",
    signOutWorking: "Signing out…",
    signOutDone: "Signed out",
    signOutError: "Could not sign out. Please try again.",
    viewerNote: "Full report unlocked on this device for 30 days.",
    memberNote: "Full report · workspace member",
    sampleNote: "Demo data: fixed, sanitised Kam Man House evidence.",
  },
  unlock: {
    reportLabel: "Report",
    title: "Unlock the full report",
    body: "Report access and business ownership are separate security steps. A public share link never grants owner-only evidence or workspace authority.",
    benefits: [
      { title: "Full evidence", body: "Safe excerpts, timestamps and limitations" },
      { title: "Every finding explained", body: "Evidence and a recommended action for each gap" },
      { title: "Ownership comes later", body: "Verified with Google before workspace access" },
    ],
    formTitle: "Secure report delivery",
    formBody: "We send a secure report link to the contact you choose; ownership is verified with Google before workspace access.",
    objectiveHeading: "Your selected goal",
    channelHeading: "How should we deliver the report?",
    channels: { whatsapp: "WhatsApp", line: "LINE", phone: "Phone", email: "Email" },
    contactLabels: { whatsapp: "WhatsApp number", line: "LINE ID", phone: "Phone number", email: "Email" },
    placeholders: { whatsapp: "e.g. +852 9123 4567", line: "e.g. @yourshop", phone: "e.g. +852 9123 4567", email: "owner@business.com" },
    recoveryLabel: "Recovery email",
    recoveryHint: "Use this email to reopen your report securely on another device.",
    deliveryTitle: "Deliver this report securely",
    discussionTitle: "Discuss the findings with Fimmick",
    discussionBody: "Optional and separate from report delivery.",
    marketingTitle: "Occasional Fimmick updates",
    marketingBody: "Optional. Never bundled with report delivery.",
    submit: "Unlock the full report",
    submitting: "Unlocking…",
    errors: {
      contact: "Enter your contact details.",
      invalidContact: "Enter a valid contact for the chosen channel.",
      delivery: "Agree to receive the report before continuing.",
      failed: "The report could not be unlocked. Please try again.",
      network: "Network error. Please try again.",
    },
    success: "Full report unlocked",
    privacyNote: "Marketing consent is never bundled. Retention and deletion rules are explained in the privacy policy.",
    policyLink: "Read the privacy policy",
  },
  pricing: {
    badge: "Plans for the selected market",
    marketNote: "Prices shown in {currency} for the {market} market",
    planNote: "Growth Workspace is billed via Stripe · Multi-location and managed plans are activated by the Fimmick team · Interface language never changes market or currency",
    faqFinalTitle: "How do I subscribe?",
    faqFinalBody: "Growth Workspace is a monthly Stripe subscription per location. Multi-location and Managed Visibility are activated by the Fimmick team after a short conversation. Interface language is separate from market and currency.",
    contactFimmick: "Contact Fimmick",
  },
  methodology: { versionBadge: "Version 2.0 · scoring {version}" },
  trust: {
    intro: "Production controls are enforced by server routes, application-layer authorisation and an append-only audit trail—never by a role label in the interface.",
    boundaryEyebrow: "Data boundary",
    boundaryTitle: "What is kept, for how long, and how it is protected",
    rows: [
      { label: "Scan evidence", value: "Public-source evidence and report data are retained for 12 months and removed on request." },
      { label: "Agent inputs and outputs", value: "Drafts, approvals and exports are retained for 24 months for accountability." },
      { label: "Audit events", value: "Append-only events are retained for 24 months." },
      { label: "OAuth tokens", value: "Encrypted at rest and revoked when a connection is removed." },
      { label: "Report access links", value: "Expire 30 days after issue; recovery links expire after 15 minutes." },
    ],
    policyLink: "Privacy policy and terms · version 2026-07-28",
  },
  legal: { backToScanner: "Back to the scanner", version: "Version {version}" },
}

const funnelZhHK: FunnelCopy = {
  demoBar: { title: "示範資料", body: "固定並已清理的錦汶館資料", note: "此頁不包含即時掃描、付款或自動對外發佈" },
  footer: { tagline: "證據為先，行動為本。", body: "SME Scanner by Fimmick · 證據為先，行動為本。", privacy: "私隱政策", terms: "使用條款" },
  landing: {
    timing: "免費掃描數分鐘內完成；完成時間視乎各資料來源供應情況。",
    planNote: "價格按所選市場顯示 · 介面語言不會自動改變市場或貨幣",
    perMonth: "月",
    contactPricing: "聯絡 Fimmick",
  },
  scan: {
    eyebrow: "免費證據掃描",
    stepTitles: ["確認商戶", "市場與目標", "選填渠道", "同意並開始"],
    stepHints: ["身份與商戶資料", "語言與市場分開", "增加覆蓋", "限於指定用途"],
    stepOf: "第 {step} 步，共 4 步",
    progressLabel: "掃描設定完成 {percent}%",
    securityTitle: "只收集公開證據",
    securityBody: "免費掃描不會要求店主專屬資料。",
    backHome: "返回 SME Scanner",
    businessLabel: "商戶名稱或 Google Maps 連結",
    businessHint: "如有多間同名商戶，請加入地區或地址。",
    searchButton: "尋找商戶",
    searching: "搜尋中…",
    matchBadge: "Google 商戶配對",
    verifyNote: "我們會按名稱、地區及公開來源核實商戶資料。",
    chooseHeading: "請選擇正確的商戶",
    select: "以此商戶繼續",
    selected: "已確認",
    change: "更改商戶",
    ratingLine: "{rating} ★ · {reviews} 則評論",
    reviewsOnly: "{reviews} 則評論",
    confidence: "配對信心：{confidence}",
    confidenceHigh: "高",
    confidenceMedium: "中",
    confidenceLow: "低",
    manualEntry: "這不是我的商戶——以手動資料繼續",
    manualTitle: "Google 商戶覆蓋可能無法取得",
    manualBody: "你仍可繼續；但未確認商戶資料前，我們不會推斷 Google 表現欠佳。",
    marketLabel: "搜尋市場",
    marketHelp: "控制地理搜尋脈絡及地區規則。",
    hk: "香港",
    hkMeta: "香港市場 · 港元",
    tw: "台灣",
    twMeta: "台灣市場 · 新台幣",
    languageLabel: "介面語言",
    languageSeparate: "獨立設定",
    languageHelp: "改變語言不會改變搜尋市場。",
    marketChanged: "已更改搜尋市場：請重新確認商戶配對及地區。",
    websiteLabel: "網站",
    websiteHelp: "增加公開內容及技術證據。",
    instagramLabel: "Instagram 帳戶",
    instagramHelp: "只讀取公開檔案；來源可用性可能不同。",
    optional: "選填",
    igFind: "尋找我的公開 Instagram 帳戶",
    igSearching: "正在搜尋 Instagram…",
    igChooseHeading: "可能屬於你的公開帳戶",
    igNoResults: "找不到相符的公開 Instagram 帳戶，你可以直接輸入帳戶名稱。",
    igSelect: "這是我的帳戶",
    igSelected: "已選擇",
    igSourceWebsite: "由你的 Google 商戶檔案連結找到",
    igSourceSearch: "在公開搜尋結果找到",
    coverageHeading: "預計證據覆蓋",
    coverageRequested: "已要求 4 個主要來源中的 {count} 個",
    coverageNonBinding: "非保證",
    sourceGoogle: "Google 商戶與地圖",
    sourceWebsite: "公開網站",
    sourceSearchAi: "搜尋與 AI 版面",
    sourceInstagram: "Instagram 公開證據",
    sourceNotProvided: "未提供",
    sourceManual: "手動資料 · 可能未能取得",
    reviewHeading: "檢查這次掃描",
    reviewBusiness: "商戶",
    reviewIdentity: "商戶資料",
    identityConfirmed: "已確認 Google 商戶配對",
    identityManual: "手動資料",
    reviewMarket: "搜尋市場",
    reviewLanguage: "介面語言",
    reviewIndustry: "行業",
    reviewDistrict: "地區",
    reviewObjective: "目標",
    reviewSources: "要求的來源",
    consentTitle: "為這次掃描收集可支援的公開證據",
    consentBody: "我明白掃描只會讀取公開來源，而證據可用性可能不同。這不代表我同意接收推廣。",
    privacyNote: "只限指定用途的公開證據。解鎖或認領報告需要另外明確同意。",
    errors: {
      business: "請先輸入商戶名稱。",
      place: "請確認配對結果，或選擇以手動資料繼續。",
      industry: "請選擇行業。",
      district: "請選擇地區。",
      consent: "請確認我們可以為這次掃描收集公開證據。",
      submit: "未能開始掃描，請再試一次。",
      network: "網絡錯誤，請再試一次。",
    },
    back: "返回",
    continue: "繼續",
    start: "開始免費掃描",
    submitting: "正在開始掃描…",
  },
  scanning: {
    reference: "掃描編號",
    title: "證據掃描進行中",
    body: "公開證據會逐階段收集，每個來源如實回報自己的狀態，不會虛構完成百分比或時間。餘下檢查會在背景繼續進行。",
    progress: "6 個階段中已完成 {done} 個",
    subjectLabel: "掃描對象",
    collectors: { google_business: "Google 商戶證據", instagram: "Instagram 公開證據", search_ai: "搜尋與 AI 版面證據" },
    phase: {
      pending: "等待此階段開始",
      running: "正在讀取公開來源",
      done: "收集完成",
      collected: "收集完成 · 覆蓋率以報告為準",
      failed: "掃描未能完成",
    },
    seeReport: "詳見報告",
    readyTitle: "報告已準備好",
    readyBody: "即將開啟報告；每個來源都會在報告內顯示自己的覆蓋狀態。",
    readyButton: "查看報告",
    coverageLine: "覆蓋率 {coverage}%",
    failedTitle: "掃描未能完成",
    failedBody: "收集證據時出現問題。系統沒有計算任何評分，亦不會將任何來源當成表現欠佳。請重新開始掃描。",
    failedReference: "參考編號 {reference}",
    retry: "重新開始",
    recoveryTitle: "儲存返回連結",
    recoveryBody: "不用重新開始，便可返回這次掃描；掃描完成後，報告連結會顯示在此頁。",
    copyLink: "複製返回連結",
    copied: "已複製連結",
    backgroundTitle: "掃描會在背景繼續",
    backgroundBody: "每個來源回傳後便會有可用證據；即使離開此頁，餘下檢查仍會繼續。",
    elapsed: "已用時間 {seconds} 秒",
  },
  report: {
    previewBadge: "安全證據公開預覽",
    fullBadge: "完整報告",
    sampleBadge: "已去除敏感資料的示範報告",
    partialBadge: "部分證據",
    failedBadge: "掃描失敗",
    title: "{business} 能見度報告",
    firstScan: "首次掃描",
    marketHK: "香港市場",
    marketTW: "台灣市場",
    withheldTitle: "評分暫不顯示：獨立證據不足",
    withheldBody: "Instagram、Google 商戶及搜尋／AI 三個渠道中，可量度的少於兩個，因此不會計算總分。覆蓋率如實反映缺少的證據，不會將任何來源當成表現欠佳。",
    firstScanTitle: "首次掃描 · 尚無可比較結果",
    firstScanBody: "評分只按已量度來源加權計算；未能取得或未支援的來源會降低覆蓋率，不會降低評分。下次合資格掃描會顯示有甚麼改變。",
    failedTitle: "掃描未能完成",
    failedBody: "掃描失敗，因此沒有可用評分。請重新開始掃描。",
    measuredLabel: "已量度",
    unavailableLabel: "未量度",
    comparisonLabel: "比較資格",
    comparisonNotYet: "尚未",
    comparisonEligible: "合資格",
    sourceCount: "{count} 個來源",
    howMeasured: "了解評分方法",
    prioritiesEyebrow: "清楚排序，不製造雜訊",
    prioritiesTitle: "3 項有證據支持的優先行動",
    prioritiesRanked: "按對評分的加權影響排序",
    prioritiesEmpty: "暫時沒有可量度的優先改善項目。",
    findingsEyebrow: "完整分析結果",
    findingsTitle: "按來源列出每項發現",
    findingsEmpty: "此報告暫時沒有詳細結果。",
    actionLabel: "建議行動",
    evidenceLabel: "證據",
    draftLabel: "Fix Pack 草稿",
    summaryEyebrow: "報告摘要",
    summaryTitle: "證據顯示的重點",
    proofEyebrow: "已驗證報告證據",
    proofTitle: "評分背後已清理的公開證據",
    proofBody: "掃描時擷取的公開來源節錄，範圍受限。來源識別碼、原始載荷及私人資料一律不會顯示。",
    proof: {
      ig: "Instagram 證據",
      gbp: "Google 商戶證據",
      aeo: "AI 能見度證據",
      merchant: "商戶表現證據",
      trust: "信任證據",
      followers: "追蹤者",
      following: "追蹤中",
      posts: "帖文",
      reviews: "則評論",
      rating: "評分",
      overview: "AI Overview 提及",
      mode: "AI Mode 提及",
      organic: "自然搜尋排名",
      found: "找到商戶",
      cited: "引用",
      response: "回覆率",
      days: "距離最近評論日數",
      competitors: "排在你前面的同業",
      website: "網站",
      faqSchema: "FAQ 結構化資料",
      metaLength: "meta description 長度",
      h1Count: "H1 數量",
      yes: "有",
      no: "沒有",
      unknown: "未知",
      ownerReply: "店主回覆",
      noReply: "未有店主回覆",
    },
    evidenceEyebrow: "原始證據",
    evidenceTitle: "掃描時擷取的公開來源內容",
    evidenceBody: "來源事實與 SME Scanner 的分析分開顯示。只有在保留設定容許時才會儲存媒體。",
    evidenceCaptured: "擷取於 {date}",
    evidenceMetadataOnly: "只有中繼資料 · 未儲存快照",
    evidenceFailed: "快照未能取得",
    evidenceSource: "查看來源",
    passportEyebrow: "證據護照",
    passportTitle: "來源覆蓋範圍與限制",
    fullMethodology: "完整評分方法",
    notScored: "不計分",
    scoreOutOf: "{score} / 100",
    unlockEyebrow: "安全延續店主工作",
    unlockTitle: "解鎖完整報告",
    unlockBody: "查看每項發現的證據及建議行動、報告摘要及原始公開證據。送達報告只需一項明確同意；不會綑綁推廣同意。",
    unlockHidden: "完整報告另有 {count} 項發現",
    unlockButton: "解鎖完整報告",
    ctaEyebrow: "與 Fimmick 聯絡",
    ctaTitle: "想有人陪你逐項處理這些發現？",
    ctaBody: "Fimmick 團隊可與你一起檢視證據，並準備由店主批准的行動。",
    signOut: "登出此報告",
    signOutWorking: "登出中…",
    signOutDone: "已登出",
    signOutError: "未能登出，請再試一次。",
    viewerNote: "完整報告已在此裝置解鎖 30 天。",
    memberNote: "完整報告 · 工作台成員",
    sampleNote: "示範資料：固定並已清理的錦汶館證據。",
  },
  unlock: {
    reportLabel: "報告",
    title: "解鎖完整報告",
    body: "報告存取與商戶擁有權是兩個獨立安全步驟。公開分享連結永遠不會授予店主專屬證據或工作台權限。",
    benefits: [
      { title: "完整證據", body: "安全摘要、時間及限制" },
      { title: "每項發現有解釋", body: "每個缺口都附證據及建議行動" },
      { title: "擁有權稍後驗證", body: "進入工作台前以 Google 驗證" },
    ],
    formTitle: "安全送達報告",
    formBody: "我們會以安全連結送出報告至你選擇的聯絡方式；進入工作台前會以 Google 驗證擁有權。",
    objectiveHeading: "你選擇的目標",
    channelHeading: "以甚麼方式送達報告？",
    channels: { whatsapp: "WhatsApp", line: "LINE", phone: "電話", email: "電郵" },
    contactLabels: { whatsapp: "WhatsApp 號碼", line: "LINE ID", phone: "電話號碼", email: "電郵" },
    placeholders: { whatsapp: "例：+852 9123 4567", line: "例：@yourshop", phone: "例：+852 9123 4567", email: "owner@business.com" },
    recoveryLabel: "復原電郵",
    recoveryHint: "提供電郵後，你可在其他裝置透過安全連結重新開啟報告。",
    deliveryTitle: "安全送達此報告",
    discussionTitle: "與 Fimmick 討論發現",
    discussionBody: "選填，並與報告送達分開。",
    marketingTitle: "偶爾接收 Fimmick 資訊",
    marketingBody: "選填，永遠不會與報告送達綑綁。",
    submit: "解鎖完整報告",
    submitting: "解鎖中…",
    errors: {
      contact: "請輸入聯絡資料。",
      invalidContact: "請輸入所選渠道的有效聯絡資料。",
      delivery: "請先同意接收此報告。",
      failed: "未能解鎖報告，請再試一次。",
      network: "網絡錯誤，請再試一次。",
    },
    success: "已解鎖完整報告",
    privacyNote: "不會綑綁推廣同意。資料保留與刪除規則見私隱政策。",
    policyLink: "閱讀私隱政策",
  },
  pricing: {
    badge: "按所選市場顯示的方案",
    marketNote: "價格以{currency}顯示 · {market}",
    planNote: "增長工作台透過 Stripe 訂閱 · 多地點及專人服務由 Fimmick 團隊人手開通 · 介面語言不會自動改變市場或貨幣",
    faqFinalTitle: "如何訂閱？",
    faqFinalBody: "增長工作台按地點以 Stripe 每月訂閱；多地點及專人能見度服務經簡短溝通後由 Fimmick 團隊人手開通。介面語言與市場、貨幣分開設定。",
    contactFimmick: "聯絡 Fimmick",
  },
  methodology: { versionBadge: "2.0 版本 · 評分 {version}" },
  trust: {
    intro: "正式控制由伺服器路由、應用層授權及只可追加的審計紀錄強制執行，而不是介面上的角色標籤。",
    boundaryEyebrow: "資料界線",
    boundaryTitle: "保留甚麼、保留多久、如何保護",
    rows: [
      { label: "掃描證據", value: "公開來源證據及報告資料保留 12 個月，可按要求刪除。" },
      { label: "Agent 輸入與輸出", value: "草稿、審批及匯出紀錄保留 24 個月，以便追溯責任。" },
      { label: "審計事件", value: "只可追加的事件紀錄保留 24 個月。" },
      { label: "OAuth 代幣", value: "靜態加密儲存；解除連接時即時撤銷。" },
      { label: "報告存取連結", value: "發出後 30 日失效；復原連結 15 分鐘後失效。" },
    ],
    policyLink: "私隱政策及使用條款 · 版本 2026-07-28",
  },
  legal: { backToScanner: "返回掃描", version: "版本 {version}" },
}

const funnelZhTW: FunnelCopy = {
  demoBar: { title: "範例資料", body: "固定且已清理的錦汶館資料", note: "此頁不包含即時掃描、付款或自動對外發布" },
  footer: { tagline: "證據為先，行動為本。", body: "SME Scanner by Fimmick · 證據為先，行動為本。", privacy: "隱私政策", terms: "使用條款" },
  landing: {
    timing: "免費掃描數分鐘內完成；完成時間依各資料來源狀況而異。",
    planNote: "價格依所選市場顯示 · 介面語言不會自動改變市場或貨幣",
    perMonth: "月",
    contactPricing: "聯絡 Fimmick",
  },
  scan: {
    eyebrow: "免費證據掃描",
    stepTitles: ["確認店家", "市場與目標", "選填管道", "同意並開始"],
    stepHints: ["身分與店家資料", "語言與市場分開", "提高涵蓋", "限於指定用途"],
    stepOf: "第 {step} 步，共 4 步",
    progressLabel: "掃描設定完成 {percent}%",
    securityTitle: "只收集公開證據",
    securityBody: "免費掃描不會要求店家專屬資料。",
    backHome: "返回 SME Scanner",
    businessLabel: "店家名稱或 Google Maps 連結",
    businessHint: "若有多家同名店家，請加入地區或地址。",
    searchButton: "尋找店家",
    searching: "搜尋中…",
    matchBadge: "Google 商家配對",
    verifyNote: "我們會依名稱、地區與公開來源核實店家資料。",
    chooseHeading: "請選擇正確的店家",
    select: "以此店家繼續",
    selected: "已確認",
    change: "更改店家",
    ratingLine: "{rating} ★ · {reviews} 則評論",
    reviewsOnly: "{reviews} 則評論",
    confidence: "配對信心：{confidence}",
    confidenceHigh: "高",
    confidenceMedium: "中",
    confidenceLow: "低",
    manualEntry: "這不是我的店家——以手動資料繼續",
    manualTitle: "Google 商家涵蓋可能無法取得",
    manualBody: "你仍可繼續；但在確認店家資料前，我們不會推斷 Google 表現不佳。",
    marketLabel: "搜尋市場",
    marketHelp: "決定地理搜尋脈絡與地區規則。",
    hk: "香港",
    hkMeta: "香港市場 · 港幣",
    tw: "台灣",
    twMeta: "台灣市場 · 新台幣",
    languageLabel: "介面語言",
    languageSeparate: "獨立設定",
    languageHelp: "改變語言不會改變搜尋市場。",
    marketChanged: "已更改搜尋市場：請重新確認店家配對與地區。",
    websiteLabel: "網站",
    websiteHelp: "增加公開內容與技術證據。",
    instagramLabel: "Instagram 帳號",
    instagramHelp: "只讀取公開檔案；來源可用性可能不同。",
    optional: "選填",
    igFind: "尋找我的公開 Instagram 帳號",
    igSearching: "正在搜尋 Instagram…",
    igChooseHeading: "可能屬於你的公開帳號",
    igNoResults: "找不到相符的公開 Instagram 帳號，你可以直接輸入帳號。",
    igSelect: "這是我的帳號",
    igSelected: "已選擇",
    igSourceWebsite: "透過你的 Google 商家檔案連結找到",
    igSourceSearch: "在公開搜尋結果中找到",
    coverageHeading: "預計證據涵蓋",
    coverageRequested: "已要求 4 個主要來源中的 {count} 個",
    coverageNonBinding: "非保證",
    sourceGoogle: "Google 商家與地圖",
    sourceWebsite: "公開網站",
    sourceSearchAi: "搜尋與 AI 版面",
    sourceInstagram: "Instagram 公開證據",
    sourceNotProvided: "未提供",
    sourceManual: "手動資料 · 可能無法取得",
    reviewHeading: "檢查這次掃描",
    reviewBusiness: "店家",
    reviewIdentity: "店家資料",
    identityConfirmed: "已確認 Google 商家配對",
    identityManual: "手動資料",
    reviewMarket: "搜尋市場",
    reviewLanguage: "介面語言",
    reviewIndustry: "產業",
    reviewDistrict: "地區",
    reviewObjective: "目標",
    reviewSources: "要求的來源",
    consentTitle: "為這次掃描收集可支援的公開證據",
    consentBody: "我了解掃描只會讀取公開來源，證據可用性可能不同。這不代表我同意接收行銷訊息。",
    privacyNote: "僅限指定用途的公開證據。解鎖或認領報告需要另外明確同意。",
    errors: {
      business: "請先輸入店家名稱。",
      place: "請確認配對結果，或選擇以手動資料繼續。",
      industry: "請選擇產業。",
      district: "請選擇地區。",
      consent: "請確認我們可以為這次掃描收集公開證據。",
      submit: "無法開始掃描，請再試一次。",
      network: "網路錯誤，請再試一次。",
    },
    back: "返回",
    continue: "繼續",
    start: "開始免費掃描",
    submitting: "正在開始掃描…",
  },
  scanning: {
    reference: "掃描編號",
    title: "證據掃描進行中",
    body: "公開證據會逐階段收集，每個來源如實回報自己的狀態，不會虛構完成百分比或時間。其餘檢查會在背景繼續進行。",
    progress: "6 個階段中已完成 {done} 個",
    subjectLabel: "掃描對象",
    collectors: { google_business: "Google 商家證據", instagram: "Instagram 公開證據", search_ai: "搜尋與 AI 版面證據" },
    phase: {
      pending: "等待此階段開始",
      running: "正在讀取公開來源",
      done: "收集完成",
      collected: "收集完成 · 涵蓋率以報告為準",
      failed: "掃描未能完成",
    },
    seeReport: "詳見報告",
    readyTitle: "報告已準備好",
    readyBody: "即將開啟報告；每個來源都會在報告中顯示自己的涵蓋狀態。",
    readyButton: "查看報告",
    coverageLine: "涵蓋率 {coverage}%",
    failedTitle: "掃描未能完成",
    failedBody: "收集證據時發生問題。系統沒有計算任何分數，也不會把任何來源當成表現不佳。請重新開始掃描。",
    failedReference: "參考編號 {reference}",
    retry: "重新開始",
    recoveryTitle: "儲存返回連結",
    recoveryBody: "不必重新開始，即可回到這次掃描；掃描完成後，報告連結會顯示在此頁。",
    copyLink: "複製返回連結",
    copied: "已複製連結",
    backgroundTitle: "掃描會在背景繼續",
    backgroundBody: "每個來源回傳後就會有可用證據；即使離開此頁，其餘檢查仍會繼續。",
    elapsed: "已用時間 {seconds} 秒",
  },
  report: {
    previewBadge: "安全證據公開預覽",
    fullBadge: "完整報告",
    sampleBadge: "已去除敏感資料的範例報告",
    partialBadge: "部分證據",
    failedBadge: "掃描失敗",
    title: "{business} 能見度報告",
    firstScan: "首次掃描",
    marketHK: "香港市場",
    marketTW: "台灣市場",
    withheldTitle: "分數暫不顯示：獨立證據不足",
    withheldBody: "Instagram、Google 商家與搜尋／AI 三個管道中，可衡量的少於兩個，因此不計算總分。涵蓋率如實反映缺少的證據，不會把任何來源當成表現不佳。",
    firstScanTitle: "首次掃描 · 尚無可比較結果",
    firstScanBody: "分數只依已衡量來源加權計算；無法取得或不支援的來源會降低涵蓋率，不會降低分數。下次合格掃描會顯示有什麼改變。",
    failedTitle: "掃描未能完成",
    failedBody: "掃描失敗，因此沒有可用分數。請重新開始掃描。",
    measuredLabel: "已衡量",
    unavailableLabel: "未衡量",
    comparisonLabel: "比較資格",
    comparisonNotYet: "尚未",
    comparisonEligible: "合格",
    sourceCount: "{count} 個來源",
    howMeasured: "了解評分方法",
    prioritiesEyebrow: "清楚排序，不製造雜訊",
    prioritiesTitle: "3 項有證據支持的優先行動",
    prioritiesRanked: "依對分數的加權影響排序",
    prioritiesEmpty: "目前沒有可衡量的優先改善項目。",
    findingsEyebrow: "完整分析結果",
    findingsTitle: "依來源列出每項發現",
    findingsEmpty: "此報告目前沒有詳細結果。",
    actionLabel: "建議行動",
    evidenceLabel: "證據",
    draftLabel: "Fix Pack 草稿",
    summaryEyebrow: "報告摘要",
    summaryTitle: "證據顯示的重點",
    proofEyebrow: "已驗證報告證據",
    proofTitle: "分數背後已清理的公開證據",
    proofBody: "掃描時擷取的公開來源節錄，範圍受限。來源識別碼、原始資料與私人資料一律不會顯示。",
    proof: {
      ig: "Instagram 證據",
      gbp: "Google 商家證據",
      aeo: "AI 能見度證據",
      merchant: "店家表現證據",
      trust: "信任證據",
      followers: "追蹤者",
      following: "追蹤中",
      posts: "貼文",
      reviews: "則評論",
      rating: "評分",
      overview: "AI Overview 提及",
      mode: "AI Mode 提及",
      organic: "自然搜尋排名",
      found: "找到店家",
      cited: "引用",
      response: "回覆率",
      days: "距離最近評論天數",
      competitors: "排在你前面的同業",
      website: "網站",
      faqSchema: "FAQ 結構化資料",
      metaLength: "meta description 長度",
      h1Count: "H1 數量",
      yes: "有",
      no: "沒有",
      unknown: "未知",
      ownerReply: "店家回覆",
      noReply: "尚無店家回覆",
    },
    evidenceEyebrow: "原始證據",
    evidenceTitle: "掃描時擷取的公開來源內容",
    evidenceBody: "來源事實與 SME Scanner 的分析分開顯示。只有在保留設定允許時才會儲存媒體。",
    evidenceCaptured: "擷取於 {date}",
    evidenceMetadataOnly: "僅有中繼資料 · 未儲存快照",
    evidenceFailed: "快照無法取得",
    evidenceSource: "查看來源",
    passportEyebrow: "證據護照",
    passportTitle: "來源涵蓋範圍與限制",
    fullMethodology: "完整評分方法",
    notScored: "不計分",
    scoreOutOf: "{score} / 100",
    unlockEyebrow: "安全延續店家工作",
    unlockTitle: "解鎖完整報告",
    unlockBody: "查看每項發現的證據與建議行動、報告摘要及原始公開證據。送達報告只需一項明確同意；不會綁定行銷同意。",
    unlockHidden: "完整報告另有 {count} 項發現",
    unlockButton: "解鎖完整報告",
    ctaEyebrow: "與 Fimmick 聯絡",
    ctaTitle: "想有人陪你逐項處理這些發現？",
    ctaBody: "Fimmick 團隊可以和你一起檢視證據，並準備由店家核准的行動。",
    signOut: "登出此報告",
    signOutWorking: "登出中…",
    signOutDone: "已登出",
    signOutError: "無法登出，請再試一次。",
    viewerNote: "完整報告已在此裝置解鎖 30 天。",
    memberNote: "完整報告 · 工作台成員",
    sampleNote: "範例資料：固定且已清理的錦汶館證據。",
  },
  unlock: {
    reportLabel: "報告",
    title: "解鎖完整報告",
    body: "報告存取與店家擁有權是兩個獨立的安全步驟。公開分享連結永遠不會授予店家專屬證據或工作台權限。",
    benefits: [
      { title: "完整證據", body: "安全摘要、時間與限制" },
      { title: "每項發現有說明", body: "每個缺口都附證據與建議行動" },
      { title: "擁有權稍後驗證", body: "進入工作台前以 Google 驗證" },
    ],
    formTitle: "安全送達報告",
    formBody: "我們會以安全連結把報告送到你選擇的聯絡方式；進入工作台前會以 Google 驗證擁有權。",
    objectiveHeading: "你選擇的目標",
    channelHeading: "要用什麼方式送達報告？",
    channels: { whatsapp: "WhatsApp", line: "LINE", phone: "電話", email: "電子郵件" },
    contactLabels: { whatsapp: "WhatsApp 號碼", line: "LINE ID", phone: "電話號碼", email: "電子郵件" },
    placeholders: { whatsapp: "例：+852 9123 4567", line: "例：@yourshop", phone: "例：0912 345 678", email: "owner@business.com" },
    recoveryLabel: "復原電子郵件",
    recoveryHint: "提供電子郵件後，你可以在其他裝置透過安全連結重新開啟報告。",
    deliveryTitle: "安全送達此報告",
    discussionTitle: "與 Fimmick 討論發現",
    discussionBody: "選填，並與報告送達分開。",
    marketingTitle: "偶爾接收 Fimmick 資訊",
    marketingBody: "選填，永遠不會與報告送達綁定。",
    submit: "解鎖完整報告",
    submitting: "解鎖中…",
    errors: {
      contact: "請輸入聯絡資料。",
      invalidContact: "請輸入所選管道的有效聯絡資料。",
      delivery: "請先同意接收此報告。",
      failed: "無法解鎖報告，請再試一次。",
      network: "網路錯誤，請再試一次。",
    },
    success: "已解鎖完整報告",
    privacyNote: "不會綁定行銷同意。資料保留與刪除規則請見隱私政策。",
    policyLink: "閱讀隱私政策",
  },
  pricing: {
    badge: "依所選市場顯示的方案",
    marketNote: "價格以{currency}顯示 · {market}",
    planNote: "成長工作台透過 Stripe 訂閱 · 多據點與專人服務由 Fimmick 團隊人工開通 · 介面語言不會自動改變市場或貨幣",
    faqFinalTitle: "如何訂閱？",
    faqFinalBody: "成長工作台依據點以 Stripe 每月訂閱；多據點與專人能見度服務經簡短溝通後由 Fimmick 團隊人工開通。介面語言與市場、貨幣分開設定。",
    contactFimmick: "聯絡 Fimmick",
  },
  methodology: { versionBadge: "2.0 版本 · 評分 {version}" },
  trust: {
    intro: "正式控制由伺服器路由、應用層授權與只能附加的稽核紀錄強制執行，而不是介面上的角色標籤。",
    boundaryEyebrow: "資料界線",
    boundaryTitle: "保留什麼、保留多久、如何保護",
    rows: [
      { label: "掃描證據", value: "公開來源證據與報告資料保留 12 個月，可依要求刪除。" },
      { label: "Agent 輸入與輸出", value: "草稿、核准與匯出紀錄保留 24 個月，以便追溯責任。" },
      { label: "稽核事件", value: "只能附加的事件紀錄保留 24 個月。" },
      { label: "OAuth 權杖", value: "靜態加密儲存；解除連接時立即撤銷。" },
      { label: "報告存取連結", value: "發出後 30 天失效；復原連結 15 分鐘後失效。" },
    ],
    policyLink: "隱私政策與使用條款 · 版本 2026-07-28",
  },
  legal: { backToScanner: "返回掃描", version: "版本 {version}" },
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
      timing: "A free scan takes a few minutes. Completion time varies by source availability.",
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
    funnel: funnelEn,
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
      timing: "免費掃描數分鐘內完成；完成時間視乎各資料來源供應情況。",
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
    funnel: funnelZhHK,
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
      timing: "免費掃描數分鐘內完成；完成時間依各資料來源狀況而異。",
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
    funnel: funnelZhTW,
  },
}
