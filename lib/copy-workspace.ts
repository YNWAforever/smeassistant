import type { PriorityFactorKey } from "@/lib/workspace/priority";
import type { TemplateKey } from "@/lib/workspace/templates";
import type { MetricKey } from "@/lib/workspace/metrics";
import type { AttributionBasis } from "@/lib/workspace/applications";

/**
 * Workspace copy (`copy[locale].workspace`, CLAUDE.md Phase 3 item 5): labels
 * for templates, priority factors, metrics, display phases and states, in all
 * three locales. Kept in its own module so lib/copy.ts stays navigable; it is
 * still reached only through `copy[locale].workspace`.
 */
export type DisplayPhaseKey =
  | "requires_connection"
  | "needs_input"
  | "generating"
  | "draft_ready"
  | "changes_requested"
  | "approved_export_ready"
  | "verified"
  | "applied"
  | "exported"
  | "awaiting_comparable_scan"
  | "measured"
  | "recommended";

export const DISPLAY_PHASE_KEYS: DisplayPhaseKey[] = [
  "requires_connection",
  "needs_input",
  "generating",
  "draft_ready",
  "changes_requested",
  "approved_export_ready",
  "verified",
  "applied",
  "exported",
  "awaiting_comparable_scan",
  "measured",
  "recommended",
];

export type StateLabelKey =
  | "measured" | "unavailable" | "unsupported" | "failed" | "pending"
  | "recommended" | "needs_input" | "ready" | "in_progress" | "completed" | "dismissed" | "cancelled" | "expired"
  | "queued" | "running" | "succeeded" | "timed_out"
  | "draft" | "changes_requested" | "approved" | "rejected" | "superseded"
  | "not_requested" | "export_ready" | "exported" | "scheduled" | "publishing" | "published"
  | "not_eligible" | "awaiting_comparable_scan" | "insufficient_coverage";

/**
 * P4.1 confirmed offers and promotion drafts (design 3.2). Every string the
 * Offers page, the promotion panel and the action detail's offer card show.
 * Interpolated strings use {name} placeholders. A raw error code never reaches
 * an owner: every code the routes answer is mapped to a sentence here.
 */
export type OffersCopy = {
  nav: string;
  page: { eyebrow: string; title: string; description: string };
  list: { empty: string; emptyBody: string };
  viewer: { title: string; body: string };
  actions: { newOffer: string; edit: string; confirm: string; archive: string; createDrafts: string; cancel: string; save: string; saveChanges: string; reload: string };
  status: { draft: string; confirmed: string; archived: string; expired: string };
  scope: { all: string };
  fields: { location: string; title: string; details: string; terms: string; price: string; currency: string; validFrom: string; validUntil: string; claims: string; prohibitedTerms: string; asset: string };
  hints: { price: string; currency: string; claims: string; prohibitedTerms: string; asset: string };
  noAsset: string;
  meta: { price: string; noPrice: string; valid: string; range: string; location: string; revision: string; terms: string; claims: string };
  confirm: { statement: string; action: string };
  archiveStep: { statement: string; action: string };
  errors: { required: string; dates: string; price: string; invalid: string; forbidden: string; network: string; rate: string; revisionChanged: string; archived: string; incomplete: string; currency: string; generic: string };
  toasts: { created: string; updated: string; confirmed: string; archived: string };
  promotion: {
    title: string;
    disclosure: string;
    usage: string;
    channels: { instagram: string; google: string };
    listSeparator: string;
    create: string;
    creating: string;
    states: { waiting: string; generating: string; ready: string; needs_input: string; failed: string };
    retry: string;
    open: string;
    needsInput: string;
    needsInputGeneric: string;
    failed: string;
    createFailed: string;
    noPermission: string;
    checkingUsage: string;
  };
  stale: { offer_changed: string; offer_expired: string; offer_inactive: string };
  card: { heading: string; viewOffers: string };
};

export type WorkspaceCopy = {
  /** P4.2 work packs. `title` is also stored as the evidence detail of an action a pack creates. */
  packs: { title: string };
  templates: Record<TemplateKey, { title: string; summary: string; workflow: string }>;
  factors: Record<PriorityFactorKey, string>;
  metrics: Record<MetricKey, string>;
  phases: Record<DisplayPhaseKey, string>;
  /**
   * P3.2 task 9: the signal that justified an `Attributed` measurement, shown
   * as a suffix beside the fact type so a self-report is never displayed as
   * though the product confirmed it (design doc §4 "Read surface").
   * `unknown` covers a `null` attribution_basis -- pre-migration-0006 rows --
   * and must render as "not recorded", never as a guessed basis.
   */
  basis: { exported: string; owner_asserted: string; verified: string; unknown: string };
  states: Record<StateLabelKey, string>;
  priority: { urgent: string; high: string; medium: string; low: string };
  freshness: { today: string; days: string };
  scanInputs: {
    heading: string;
    fromScan: string;
    noOwnerReply: string;
    /** P2.2 "selected-review replies": the owner chooses which reviews the draft answers. */
    include: string;
    selectedNote: string;
    keepOne: string;
    limitation: string;
    population: string;
    addOwn: string;
    addOwnNote: string;
    addOwnSubmit: string;
  };
  inputs: Record<string, string>;
  offers: OffersCopy;
  /**
   * P2.1 item 6 / P2.2 item 12. Templates whose `delivery` is "checklist" have
   * no agent: the owner does the work in Google Business Profile or Instagram.
   * Keyed partially on purpose -- a test asserts every checklist template has
   * steps in every locale, so a new one fails the suite instead of rendering an
   * empty card.
   */
  checklist: {
    heading: string;
    note: string;
    saveInputs: string;
  };
  checklistSteps: Partial<Record<TemplateKey, { where: string; steps: string[] }>>;
  /**
   * P2.2/item 13: the FAQ export must carry instructions for the owner's
   * website editor, and the website-basics export must read as an approved
   * checklist for implementation, NOT a claim the website was updated.
   * Keyed by template because the two website templates need different
   * "where does this go" instructions; the disclaimer is shared.
   */
  websiteExport: {
    heading: string;
    criteriaHeading: string;
    disclaimer: string;
    instructions: Partial<Record<TemplateKey, string>>;
  };
};

export const ACTION_INPUT_KEYS = [
  "brand_voice", "reviews_without_response", "language", "channel", "opening_hours", "categories", "asset_or_text_only", "alt_text",
  "approved_claim", "cta_link", "owner_fact_1", "owner_fact_2", "owner_fact_3", "menu_items", "google_account_owner", "offer_id",
] as const;

function inputs(labels: string[]): Record<string, string> {
  return Object.fromEntries(ACTION_INPUT_KEYS.map((key, index) => [key, labels[index]]));
}

export const workspaceEn: WorkspaceCopy = {
  packs: { title: "Visibility starter pack" },
  offers: {
    nav: "Offers",
    page: {
      eyebrow: "Confirmed facts for promotions",
      title: "Offers",
      description: "Record an offer once, confirm it, then create promotion drafts from exactly those details. Nothing is published or sent.",
    },
    list: { empty: "No offers yet", emptyBody: "Add an offer with its price, dates and terms. Drafts only ever use what you confirm here." },
    viewer: { title: "Viewer access", body: "You can read offers here. Creating, confirming and archiving need an owner or a manager." },
    actions: {
      newOffer: "New offer",
      edit: "Edit",
      confirm: "Confirm",
      archive: "Archive",
      createDrafts: "Create promotion drafts",
      cancel: "Cancel",
      save: "Save offer",
      saveChanges: "Save changes",
      reload: "Reload",
    },
    status: { draft: "Draft", confirmed: "Confirmed", archived: "Archived", expired: "Expired" },
    scope: { all: "All locations" },
    fields: {
      location: "Location",
      title: "Offer name",
      details: "What the offer includes",
      terms: "Terms and limits",
      price: "Price",
      currency: "Currency",
      validFrom: "Starts",
      validUntil: "Ends",
      claims: "Statements you confirm are true",
      prohibitedTerms: "Words never to use",
      asset: "Photo",
    },
    hints: {
      price: "Optional. Leave empty when there is no fixed price.",
      currency: "Fixed to your market.",
      claims: "One per line. Drafts may only state these.",
      prohibitedTerms: "One per line. Drafts will avoid these words.",
      asset: "Optional. Only photos with confirmed rights are listed.",
    },
    noAsset: "No photo",
    meta: {
      price: "Price",
      noPrice: "No fixed price",
      valid: "Valid",
      range: "{from} to {until}",
      location: "Location",
      revision: "Revision",
      terms: "Terms",
      claims: "Confirmed statements",
    },
    confirm: { statement: "These details are correct and may be used in drafts.", action: "Confirm these details" },
    archiveStep: { statement: "Archive this offer? Its open promotion drafts are cancelled and it can no longer be used.", action: "Archive offer" },
    errors: {
      required: "A name and the offer details are required.",
      dates: "Enter both dates; the end date cannot be before the start date.",
      price: "Enter a price of 0 or more with at most 2 decimals, or leave it empty.",
      invalid: "Some details are not valid. Check the offer and try again.",
      forbidden: "Your role or location scope does not allow this.",
      network: "The server could not be reached; what you typed is kept.",
      rate: "Too many requests; try again shortly.",
      revisionChanged: "This offer was changed elsewhere. Reload to see the latest version; what you typed is kept below.",
      archived: "This offer is archived and can no longer be changed.",
      incomplete: "This offer is missing details needed to confirm it. Fill them in and save first.",
      currency: "The price currency does not match your market. Save the offer again to fix it.",
      generic: "The request failed. Try again, or contact Fimmick if it keeps happening.",
    },
    toasts: {
      created: "Offer saved as a draft. Confirm it before it can be used.",
      updated: "Offer updated and returned to draft. Confirm it again to use it.",
      confirmed: "Offer confirmed.",
      archived: "Offer archived.",
    },
    promotion: {
      title: "Promotion drafts",
      disclosure: "Creates {n} drafts ({channels}). Nothing is counted until you approve and export a draft; each one you export counts as 1 delivery.",
      usage: " This month: {used} of {allowance} used.",
      channels: { instagram: "Instagram", google: "Google" },
      listSeparator: ", ",
      create: "Create drafts",
      creating: "Creating drafts",
      states: { waiting: "Waiting", generating: "Generating", ready: "Draft ready", needs_input: "Needs details", failed: "Failed" },
      retry: "Retry",
      open: "Open draft",
      needsInput: "More details are needed before this draft can be written: {facts}.",
      needsInputGeneric: "More details are needed before this draft can be written. Open the draft to add them.",
      failed: "This draft could not be written this time and nothing was counted. Try again, or open the draft.",
      createFailed: "The drafts could not be created. Try again shortly.",
      noPermission: "Your role or location scope cannot create drafts for this offer.",
      checkingUsage: "Checking this month's usage",
    },
    stale: {
      offer_changed: "The offer changed after this draft was written. Generate a new draft from the current offer.",
      offer_expired: "This offer has ended. Extend its dates and confirm it again to use it.",
      offer_inactive: "This offer is not confirmed or has been archived.",
    },
    card: { heading: "Offer behind this draft", viewOffers: "Open offers" },
  },
  templates: {
    "review-response": { title: "Reply to unanswered Google reviews", summary: "Drafts follow your brand voice and each review's content, ready for one review pass.", workflow: "Review reply workflow" },
    "review-request": { title: "Ask recent customers for a Google review", summary: "A short, polite request for WhatsApp, LINE or a QR card, matched to your brand voice.", workflow: "Review request workflow" },
    "gbp-profile-fix": { title: "Complete the Google Business Profile basics", summary: "Opening hours and categories are missing or incomplete on the public profile.", workflow: "Profile checklist" },
    "gbp-photo-pack": { title: "Refresh your Google photos", summary: "A photo brief listing the shots that would bring the profile up to date.", workflow: "Photo brief" },
    "gbp-post": { title: "Publish a Google Business post", summary: "The profile has no recent posts; a short update keeps it active in local results.", workflow: "Google post workflow" },
    "social-post": { title: "Fill the Instagram content gap", summary: "A social post draft about what is happening in the shop right now.", workflow: "Social post workflow" },
    "ig-bio": { title: "Sharpen the Instagram bio", summary: "Say what you do, where you are, and how to book, in the first two lines.", workflow: "Bio rewrite" },
    "ig-highlights": { title: "Add Instagram story highlights", summary: "Menu, location and booking highlights answer the questions visitors ask first.", workflow: "Highlights checklist" },
    "visibility-content": { title: "Add clear FAQ answers for search and AI", summary: "Answer the three questions search and AI surfaces could not find on your site.", workflow: "FAQ and JSON-LD workflow" },
    "website-basics": { title: "Fix the website basics", summary: "Title, description and heading copy that describes the business plainly.", workflow: "Website basics workflow" },
    "local-seo-brief": { title: "Local search brief", summary: "Where competitors appear above you and what evidence explains the gap.", workflow: "Local SEO brief" },
    "menu-translation": { title: "Review the English menu translation", summary: "Confirm the dish facts first, then finish the remaining English labels.", workflow: "Menu translation workflow" },
    "offer-instagram-post": { title: "Promote your offer on Instagram", summary: "A caption that states the offer's price, dates and terms exactly as you confirmed them.", workflow: "Offer Instagram post workflow" },
    "offer-google-post": { title: "Promote your offer on Google", summary: "A short post that states the offer's price, dates and terms exactly as you confirmed them.", workflow: "Offer Google post workflow" },
    "google-reconnect": { title: "Restore Google Business access", summary: "Reconnect the account before non-public profile data can be read safely.", workflow: "Connection recovery" },
  },
  factors: { impact: "Score impact", severity: "Severity", urgency: "Urgency", readiness: "Readiness", effort: "Effort", risk: "Brand risk", evidence: "Evidence confidence" },
  metrics: {
    "gbp.rating": "Google rating", "gbp.reviews_count": "Google reviews", "gbp.reviews_sampled": "Reviews sampled", "gbp.unanswered_sampled": "Unanswered in sample",
    "gbp.response_rate_pct": "Owner response rate", "gbp.days_since_last_review": "Days since last review", "gbp.photos_count": "Google photos", "gbp.hours_complete": "Opening hours complete",
    "ig.followers": "Instagram followers", "ig.posts_sampled": "Posts sampled", "ig.days_since_last_post": "Days since last post", "ig.reels_count": "Reels", "ig.highlights_count": "Story highlights", "ig.avg_engagement": "Average engagement",
    "aeo.runs_total": "Search queries run", "aeo.runs_usable": "Usable query runs", "aeo.ai_citation_count": "AI citations", "aeo.best_organic_rank": "Best organic rank", "aeo.best_maps_rank": "Best Maps rank", "aeo.competitors_above": "Competitors above you",
    "aeo.ai_overview_presence_rate": "AI Overview presence", "aeo.ai_mode_presence_rate": "AI Mode presence", "aeo.organic_presence_rate": "Organic presence",
    "website.checks_passed": "Website checks passed", "website.checks_evaluated": "Website checks evaluated", "website.has_faq_schema": "FAQ schema present",
  },
  phases: {
    requires_connection: "Requires connection", needs_input: "Needs input", generating: "Generating", draft_ready: "Draft ready", changes_requested: "Changes requested",
    approved_export_ready: "Approved · export ready", verified: "Verified on site", exported: "Exported", applied: "Applied (reported)", awaiting_comparable_scan: "Awaiting comparable scan", measured: "Measured", recommended: "Recommended",
  },
  basis: {
    exported: "exported",
    owner_asserted: "you reported applying this",
    verified: "verified on site",
    unknown: "basis not recorded",
  } satisfies Record<AttributionBasis | "unknown", string>,
  states: {
    measured: "Measured", unavailable: "Unavailable", unsupported: "Unsupported", failed: "Failed", pending: "Pending",
    recommended: "Recommended", needs_input: "Needs input", ready: "Ready", in_progress: "In progress", completed: "Completed", dismissed: "Dismissed", cancelled: "Cancelled", expired: "Expired",
    queued: "Queued", running: "Running", succeeded: "Succeeded", timed_out: "Timed out",
    draft: "Draft", changes_requested: "Changes requested", approved: "Approved", rejected: "Rejected", superseded: "Superseded",
    not_requested: "Not requested", export_ready: "Export ready", exported: "Exported", scheduled: "Scheduled", publishing: "Publishing", published: "Published",
    not_eligible: "Not eligible", awaiting_comparable_scan: "Awaiting comparable scan", insufficient_coverage: "Insufficient coverage",
  },
  priority: { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" },
  freshness: { today: "Updated today", days: "Updated {n} days ago" },
  scanInputs: {
    heading: "Reviews the draft will use",
    fromScan: "Supplied by the scan",
    noOwnerReply: "No owner reply",
    include: "Reply to this review",
    selectedNote: "{n} of {total} reviews will be used in the next draft.",
    keepOne: "Keep at least one review selected.",
    // Says only what the pipeline guarantees: sanitizeReportProof keeps a
    // bounded sample in provider order, so no recency claim is made here.
    limitation: "The scan kept {inspected} reviews; {unanswered} have no owner reply.",
    population: " Google reported {total} reviews in total.",
    addOwn: "Add a review the scan did not capture (optional)",
    addOwnNote: "Text you type here is recorded as owner-supplied, never as collected evidence.",
    addOwnSubmit: "Save and generate",
  },
  inputs: inputs([
    "Brand voice", "Reviews without response", "Language", "Channel (WhatsApp / LINE / QR)", "Opening hours", "Categories", "Approved asset or text only", "Alt text",
    "Approved claim", "CTA link", "Owner fact 1", "Owner fact 2", "Owner fact 3", "Menu items (name, ingredients, allergens, price)", "Google account owner", "Confirmed offer",
  ]),
  checklist: {
    heading: "Steps to complete",
    note: "These steps happen in the other product, not here. Marking them done records your own confirmation — the next scan is what checks the result.",
    saveInputs: "Save what you set",
  },
  checklistSteps: {
    "gbp-profile-fix": {
      where: "Do this in Google Business Profile",
      steps: [
        "Open your Google Business Profile and choose Edit profile → Hours.",
        "Set hours for every day you trade, and mark the days you are closed.",
        "Under Edit profile → Business category, confirm the primary category and add any secondary ones that apply.",
        "Save in Google, then record the hours and categories below so this action keeps what you set.",
      ],
    },
    "ig-highlights": {
      where: "Do this in the Instagram app",
      steps: [
        "Open your Instagram profile and tap New under the bio to start a highlight.",
        "Make one highlight for each thing customers ask about most.",
        "Give each highlight a cover image and a short name.",
        "Check that the highlights appear under your bio on the public profile.",
      ],
    },
  },
  websiteExport: {
    heading: "How to apply this",
    criteriaHeading: "Checklist",
    disclaimer: "This is a draft for your website editor, not a claim that your website has changed. Approving and exporting it does not publish anything -- nothing on your website is different until you (or whoever manages it) applies it. The next scan will show whether it was applied.",
    instructions: {
      "visibility-content": 'Paste the <script type="application/ld+json"> block into your website\'s <head>, and add the Q&A text to a visible FAQ section on the page it concerns.',
      "website-basics": "Apply the title, meta description and H1 to the relevant page through your website editor or CMS.",
    },
  },
};

export const workspaceZhHK: WorkspaceCopy = {
  packs: { title: "能見度入門套裝" },
  offers: {
    nav: "優惠",
    page: { eyebrow: "已確認的推廣資料", title: "優惠", description: "只需記錄優惠一次並確認，之後便可按這些資料建立推廣草稿。系統不會自動發佈或發送任何內容。" },
    list: { empty: "尚未有優惠", emptyBody: "加入優惠的價錢、日期及條款。草稿只會使用你在這裡確認的資料。" },
    viewer: { title: "檢視者權限", body: "你可以查看優惠；建立、確認及封存需要店主或經理。" },
    actions: {
      newOffer: "新增優惠",
      edit: "編輯",
      confirm: "確認",
      archive: "封存",
      createDrafts: "建立推廣草稿",
      cancel: "取消",
      save: "儲存優惠",
      saveChanges: "儲存修改",
      reload: "重新載入",
    },
    status: { draft: "草稿", confirmed: "已確認", archived: "已封存", expired: "已過期" },
    scope: { all: "所有地點" },
    fields: {
      location: "地點",
      title: "優惠名稱",
      details: "優惠內容",
      terms: "條款及限制",
      price: "價錢",
      currency: "貨幣",
      validFrom: "開始日期",
      validUntil: "結束日期",
      claims: "你確認屬實的說法",
      prohibitedTerms: "不可使用的字詞",
      asset: "相片",
    },
    hints: { price: "可不填。沒有固定價錢時請留空。", currency: "按你的市場固定。", claims: "每行一項。草稿只可使用這些說法。", prohibitedTerms: "每行一項。草稿會避免使用這些字詞。", asset: "可不選。只列出已確認使用權的相片。" },
    noAsset: "不使用相片",
    meta: { price: "價錢", noPrice: "沒有固定價錢", valid: "有效期", range: "{from} 至 {until}", location: "地點", revision: "修訂版本", terms: "條款", claims: "已確認的說法" },
    confirm: { statement: "這些資料正確，並可用於草稿。", action: "確認這些資料" },
    archiveStep: { statement: "要封存此優惠嗎？其進行中的推廣草稿會被取消，優惠亦不能再使用。", action: "封存優惠" },
    errors: {
      required: "必須填寫優惠名稱及內容。",
      dates: "請填寫兩個日期，結束日期不可早於開始日期。",
      price: "價錢須為 0 或以上，最多兩位小數；或留空。",
      invalid: "部分資料無效，請檢查優惠後再試。",
      forbidden: "你的角色或地點範圍不允許此操作。",
      network: "無法連接伺服器；你輸入的內容已保留。",
      rate: "請求過於頻繁，請稍後再試。",
      revisionChanged: "此優惠已在其他地方被修改。請重新載入查看最新版本；你輸入的內容會保留在下方。",
      archived: "此優惠已封存，不能再修改。",
      incomplete: "此優惠欠缺確認所需的資料。請先補上並儲存。",
      currency: "價錢貨幣與你的市場不符。請重新儲存優惠以更正。",
      generic: "操作失敗，請再試一次；如持續出現，請聯絡 Fimmick。",
    },
    toasts: { created: "優惠已儲存為草稿。確認後才可使用。", updated: "優惠已更新並回復為草稿。請重新確認才可使用。", confirmed: "優惠已確認。", archived: "優惠已封存。" },
    promotion: {
      title: "推廣草稿",
      disclosure: "會建立 {n} 份草稿（{channels}）。核准並匯出草稿前不會計算用量；每份匯出的草稿計為 1 次交付。",
      usage: "本月已使用 {used} / {allowance} 次。",
      channels: { instagram: "Instagram", google: "Google" },
      listSeparator: "、",
      create: "建立草稿",
      creating: "正在建立草稿",
      states: { waiting: "等待中", generating: "生成中", ready: "草稿已備妥", needs_input: "需要補充資料", failed: "失敗" },
      retry: "重試",
      open: "開啟草稿",
      needsInput: "撰寫這份草稿前需要補充資料：{facts}。",
      needsInputGeneric: "撰寫這份草稿前需要補充資料。請開啟草稿並提供。",
      failed: "今次未能撰寫這份草稿，亦沒有計算用量。請重試，或開啟草稿。",
      createFailed: "未能建立草稿，請稍後再試。",
      noPermission: "你的角色或地點範圍不可為此優惠建立草稿。",
      checkingUsage: "正在查看本月用量",
    },
    stale: { offer_changed: "優惠在這份草稿撰寫後已更改。請按目前的優惠重新生成草稿。", offer_expired: "此優惠已結束。請延長日期並重新確認後才可使用。", offer_inactive: "此優惠尚未確認或已封存。" },
    card: { heading: "這份草稿所依據的優惠", viewOffers: "前往優惠" },
  },
  templates: {
    "review-response": { title: "回覆未回覆的 Google 評論", summary: "草稿已按品牌語氣及評論內容準備好，等你一次過審閱。", workflow: "評論回覆流程" },
    "review-request": { title: "邀請近期顧客留下 Google 評論", summary: "一段簡短有禮的邀請，適用於 WhatsApp、LINE 或 QR 卡，並配合品牌語氣。", workflow: "評論邀請流程" },
    "gbp-profile-fix": { title: "補齊 Google 商戶檔案基本資料", summary: "公開檔案的營業時間或類別缺失或不完整。", workflow: "檔案檢查清單" },
    "gbp-photo-pack": { title: "更新 Google 商戶相片", summary: "一份相片拍攝簡報，列出可令檔案更貼近現況的相片。", workflow: "相片簡報" },
    "gbp-post": { title: "發佈一則 Google 商戶帖文", summary: "檔案近期沒有帖文；一則簡短更新可維持本地搜尋的活躍度。", workflow: "Google 帖文流程" },
    "social-post": { title: "處理 Instagram 內容空檔", summary: "一則以店舖近況為主的社交帖文草稿。", workflow: "社交帖文流程" },
    "ig-bio": { title: "優化 Instagram 簡介", summary: "頭兩行講清楚你做甚麼、在哪裡、如何預訂。", workflow: "簡介改寫" },
    "ig-highlights": { title: "新增 Instagram 精選故事", summary: "餐牌、位置及預訂精選，先回答訪客最常問的問題。", workflow: "精選檢查清單" },
    "visibility-content": { title: "新增清晰的常見問題，供搜尋及 AI 引用", summary: "解答搜尋及 AI 介面在你網站找不到的三項問題。", workflow: "常見問題及 JSON-LD 流程" },
    "website-basics": { title: "修正網站基本資料", summary: "以清楚描述業務的標題、簡介及標題文字。", workflow: "網站基本資料流程" },
    "local-seo-brief": { title: "本地搜尋簡報", summary: "競爭對手在哪些搜尋中排在你之上，以及證據如何解釋差距。", workflow: "本地 SEO 簡報" },
    "menu-translation": { title: "審閱英文餐牌翻譯", summary: "先確認菜式資料，再完成餘下英文標籤。", workflow: "餐牌翻譯流程" },
    "offer-instagram-post": { title: "在 Instagram 宣傳你的優惠", summary: "一則按你已確認的價錢、日期及條款撰寫的文案。", workflow: "優惠 Instagram 帖文流程" },
    "offer-google-post": { title: "在 Google 宣傳你的優惠", summary: "一則按你已確認的價錢、日期及條款撰寫的簡短帖文。", workflow: "優惠 Google 帖文流程" },
    "google-reconnect": { title: "重新連接 Google 商戶權限", summary: "恢復連接後，才可安全取得非公開營運資料。", workflow: "連接恢復" },
  },
  factors: { impact: "評分影響", severity: "嚴重程度", urgency: "急切程度", readiness: "準備程度", effort: "所需時間", risk: "品牌風險", evidence: "證據可信度" },
  metrics: {
    "gbp.rating": "Google 評分", "gbp.reviews_count": "Google 評論數", "gbp.reviews_sampled": "抽樣評論數", "gbp.unanswered_sampled": "抽樣中未回覆",
    "gbp.response_rate_pct": "店主回覆率", "gbp.days_since_last_review": "距離最近評論日數", "gbp.photos_count": "Google 相片數", "gbp.hours_complete": "營業時間完整",
    "ig.followers": "Instagram 追蹤者", "ig.posts_sampled": "抽樣帖文數", "ig.days_since_last_post": "距離最近帖文日數", "ig.reels_count": "Reels 數", "ig.highlights_count": "精選故事數", "ig.avg_engagement": "平均互動",
    "aeo.runs_total": "搜尋查詢次數", "aeo.runs_usable": "可用查詢次數", "aeo.ai_citation_count": "AI 引用次數", "aeo.best_organic_rank": "最佳自然排名", "aeo.best_maps_rank": "最佳地圖排名", "aeo.competitors_above": "排在你之上的競爭對手",
    "aeo.ai_overview_presence_rate": "AI 概覽出現率", "aeo.ai_mode_presence_rate": "AI 模式出現率", "aeo.organic_presence_rate": "自然搜尋出現率",
    "website.checks_passed": "網站檢查通過", "website.checks_evaluated": "網站檢查項目", "website.has_faq_schema": "已有 FAQ 結構化資料",
  },
  phases: {
    requires_connection: "需要連接", needs_input: "需要輸入", generating: "生成中", draft_ready: "草稿已備妥", changes_requested: "要求修改",
    approved_export_ready: "已核准 · 可匯出", verified: "已在網站核實", exported: "已匯出", applied: "已套用（店主回報）", awaiting_comparable_scan: "等待可比較掃描", measured: "已量度", recommended: "建議",
  },
  basis: {
    exported: "已匯出",
    owner_asserted: "你回報已套用",
    verified: "已在網站核實",
    unknown: "未記錄依據",
  } satisfies Record<AttributionBasis | "unknown", string>,
  states: {
    measured: "已量度", unavailable: "未能取得", unsupported: "未支援", failed: "失敗", pending: "處理中",
    recommended: "建議", needs_input: "需要輸入", ready: "準備就緒", in_progress: "進行中", completed: "已完成", dismissed: "已略過", cancelled: "已取消", expired: "已過期",
    queued: "排隊中", running: "執行中", succeeded: "已成功", timed_out: "逾時",
    draft: "草稿", changes_requested: "要求修改", approved: "已核准", rejected: "已拒絕", superseded: "已被取代",
    not_requested: "未申請", export_ready: "可匯出", exported: "已匯出", scheduled: "已排程", publishing: "發佈中", published: "已發佈",
    not_eligible: "不符合資格", awaiting_comparable_scan: "等待可比較掃描", insufficient_coverage: "覆蓋不足",
  },
  priority: { urgent: "緊急", high: "高", medium: "中", low: "低" },
  freshness: { today: "今日更新", days: "{n} 日前更新" },
  scanInputs: {
    heading: "草稿會用到的評論",
    fromScan: "由掃描提供",
    noOwnerReply: "未有店主回覆",
    include: "回覆這則評論",
    selectedNote: "下次生成將使用 {total} 則評論中的 {n} 則。",
    keepOne: "請至少保留一則評論。",
    limitation: "掃描保留了 {inspected} 則評論，其中 {unanswered} 則未有店主回覆。",
    population: "Google 顯示評論總數為 {total} 則。",
    addOwn: "補充掃描未收錄的評論（選填）",
    addOwnNote: "你在此輸入的內容會標示為店主提供，不會當作已收集的證據。",
    addOwnSubmit: "儲存並生成",
  },
  inputs: inputs([
    "品牌語氣", "未回覆的評論", "語言", "渠道（WhatsApp / LINE / QR）", "營業時間", "類別", "已批准素材或純文字", "替代文字",
    "已批准的主張", "行動連結", "店主事實 1", "店主事實 2", "店主事實 3", "餐牌項目（名稱、材料、致敏原、價錢）", "Google 帳戶擁有人", "已確認優惠",
  ]),
  checklist: {
    heading: "完成步驟",
    note: "這些步驟需在其他平台完成，不在此工作台進行。標示完成只是記錄你的確認；實際結果由下次掃描核實。",
    saveInputs: "記錄你所設定的內容",
  },
  checklistSteps: {
    "gbp-profile-fix": {
      where: "請在 Google 商家檔案完成",
      steps: [
        "開啟 Google 商家檔案，選擇「編輯檔案」→「營業時間」。",
        "為每個營業日填寫時間，並標明休息日。",
        "在「編輯檔案」→「商家類別」確認主要類別，並加入適用的次要類別。",
        "在 Google 儲存後，於下方記錄你設定的營業時間及類別，令此行動保留你的設定。",
      ],
    },
    "ig-highlights": {
      where: "請在 Instagram 應用程式完成",
      steps: [
        "開啟 Instagram 個人檔案，在簡介下方按「新增」建立限時動態精選。",
        "為顧客最常查詢的每個主題各建立一個精選。",
        "為每個精選設定封面圖片及簡短名稱。",
        "確認精選已在公開個人檔案的簡介下方顯示。",
      ],
    },
  },
  websiteExport: {
    heading: "如何套用",
    criteriaHeading: "檢查清單",
    disclaimer: "呢個係比你網站編輯用嘅草稿，唔係話你個網站已經改咗。核准同匯出唔會自動發佈任何嘢——喺你（或負責網站嘅人）套用之前，網站上乜都未變。下次掃描會顯示係咪已經套用。",
    instructions: {
      "visibility-content": "將 <script type=\"application/ld+json\"> 區塊貼入你網站嘅 <head>，並將問答文字加入相關頁面一個公開可見嘅 FAQ 部分。",
      "website-basics": "透過你嘅網站編輯器或 CMS，將標題、描述同 H1 套用到相關頁面。",
    },
  },
};

export const workspaceZhTW: WorkspaceCopy = {
  ...workspaceZhHK,
  packs: { title: "能見度入門套組" },
  offers: {
    nav: "優惠",
    page: { eyebrow: "已確認的推廣資訊", title: "優惠", description: "只要記錄優惠一次並確認，就能依這些資訊建立推廣草稿。系統不會自動發布或傳送任何內容。" },
    list: { empty: "還沒有優惠", emptyBody: "新增優惠的價格、日期與條款。草稿只會使用您在這裡確認的資訊。" },
    viewer: { title: "檢視者權限", body: "您可以查看優惠；建立、確認與封存需要店主或經理。" },
    actions: {
      newOffer: "新增優惠",
      edit: "編輯",
      confirm: "確認",
      archive: "封存",
      createDrafts: "建立推廣草稿",
      cancel: "取消",
      save: "儲存優惠",
      saveChanges: "儲存變更",
      reload: "重新載入",
    },
    status: { draft: "草稿", confirmed: "已確認", archived: "已封存", expired: "已過期" },
    scope: { all: "所有據點" },
    fields: {
      location: "據點",
      title: "優惠名稱",
      details: "優惠內容",
      terms: "條款與限制",
      price: "價格",
      currency: "幣別",
      validFrom: "開始日期",
      validUntil: "結束日期",
      claims: "您確認屬實的說法",
      prohibitedTerms: "不可使用的字詞",
      asset: "照片",
    },
    hints: { price: "可不填。沒有固定價格時請留空。", currency: "依您的市場固定。", claims: "每行一項。草稿只能使用這些說法。", prohibitedTerms: "每行一項。草稿會避免使用這些字詞。", asset: "可不選。只列出已確認使用權的照片。" },
    noAsset: "不使用照片",
    meta: { price: "價格", noPrice: "沒有固定價格", valid: "有效期間", range: "{from} 至 {until}", location: "據點", revision: "修訂版本", terms: "條款", claims: "已確認的說法" },
    confirm: { statement: "這些資訊正確，並可用於草稿。", action: "確認這些資訊" },
    archiveStep: { statement: "要封存此優惠嗎？其進行中的推廣草稿會被取消，優惠也不能再使用。", action: "封存優惠" },
    errors: {
      required: "必須填寫優惠名稱與內容。",
      dates: "請填寫兩個日期，結束日期不能早於開始日期。",
      price: "價格須為 0 以上，最多兩位小數；或留空。",
      invalid: "部分資訊無效，請檢查優惠後再試一次。",
      forbidden: "您的角色或據點範圍不允許此操作。",
      network: "無法連線至伺服器；您輸入的內容已保留。",
      rate: "請求過於頻繁，請稍後再試。",
      revisionChanged: "此優惠已在其他地方被修改。請重新載入以查看最新版本；您輸入的內容會保留在下方。",
      archived: "此優惠已封存，無法再修改。",
      incomplete: "此優惠缺少確認所需的資訊。請先補齊並儲存。",
      currency: "價格幣別與您的市場不符。請重新儲存優惠以修正。",
      generic: "操作失敗，請再試一次；如果持續發生，請聯絡 Fimmick。",
    },
    toasts: { created: "優惠已儲存為草稿。確認後才能使用。", updated: "優惠已更新並回到草稿。請重新確認才能使用。", confirmed: "優惠已確認。", archived: "優惠已封存。" },
    promotion: {
      title: "推廣草稿",
      disclosure: "會建立 {n} 份草稿（{channels}）。在您核准並匯出草稿之前不會計算用量；每份匯出的草稿計為 1 次交付。",
      usage: "本月已使用 {used} / {allowance} 次。",
      channels: { instagram: "Instagram", google: "Google" },
      listSeparator: "、",
      create: "建立草稿",
      creating: "正在建立草稿",
      states: { waiting: "等待中", generating: "產生中", ready: "草稿已備妥", needs_input: "需要補充資訊", failed: "失敗" },
      retry: "重試",
      open: "開啟草稿",
      needsInput: "撰寫這份草稿前需要補充資訊：{facts}。",
      needsInputGeneric: "撰寫這份草稿前需要補充資訊。請開啟草稿並提供。",
      failed: "這次無法撰寫這份草稿，也沒有計算用量。請重試，或開啟草稿。",
      createFailed: "無法建立草稿，請稍後再試。",
      noPermission: "您的角色或據點範圍無法為此優惠建立草稿。",
      checkingUsage: "正在查看本月用量",
    },
    stale: { offer_changed: "優惠在這份草稿撰寫後已變更。請依目前的優惠重新產生草稿。", offer_expired: "此優惠已結束。請延長日期並重新確認後才能使用。", offer_inactive: "此優惠尚未確認或已封存。" },
    card: { heading: "這份草稿所依據的優惠", viewOffers: "前往優惠" },
  },
  templates: {
    ...workspaceZhHK.templates,
    "review-response": { title: "回覆未回覆的 Google 評論", summary: "草稿已依品牌語氣與評論內容準備好，等你一次審閱。", workflow: "評論回覆流程" },
    "social-post": { title: "處理 Instagram 內容空檔", summary: "一則以店內近況為主的社群貼文草稿。", workflow: "社群貼文流程" },
    "gbp-post": { title: "發布一則 Google 商家貼文", summary: "檔案近期沒有貼文；一則簡短更新可維持在地搜尋的活躍度。", workflow: "Google 貼文流程" },
    "menu-translation": { title: "審閱英文菜單翻譯", summary: "先確認菜色資料，再完成其餘英文標籤。", workflow: "菜單翻譯流程" },
    "offer-instagram-post": { title: "在 Instagram 宣傳你的優惠", summary: "一則依你已確認的價格、日期及條款撰寫的文案。", workflow: "優惠 Instagram 貼文流程" },
    "offer-google-post": { title: "在 Google 宣傳你的優惠", summary: "一則依你已確認的價格、日期及條款撰寫的簡短貼文。", workflow: "優惠 Google 貼文流程" },
    "google-reconnect": { title: "重新連接 Google 商家權限", summary: "恢復連接後，才可安全取得非公開營運資料。", workflow: "連線恢復" },
  },
  // Mirrors the 核實/查證 verb and 你/您 pronoun split Task 8 set in the
  // `applied` message namespace (lib/messages/{zh-HK,zh-TW}.json:
  // assertedOn) -- keep the two in sync if either changes. `exported` and
  // `unknown` carry no verb or pronoun, so they stay inherited from zh-HK.
  basis: {
    ...workspaceZhHK.basis,
    owner_asserted: "您回報已套用",
    verified: "已在網站查證",
  } satisfies Record<AttributionBasis | "unknown", string>,
  // Same 核實/查證 split as `basis.verified` above -- inheritance from
  // zh-HK is NOT safe for this verb (that is exactly the inversion the
  // previous slice shipped), so this key needs its own override here.
  phases: { ...workspaceZhHK.phases, verified: "已在網站查證" },
  states: { ...workspaceZhHK.states, unavailable: "無法取得", publishing: "發布中", published: "已發布" },
  freshness: { today: "今天更新", days: "{n} 天前更新" },
  checklistSteps: {
    ...workspaceZhHK.checklistSteps,
    // Instagram ships these as "精選動態" in zh-TW.
    "ig-highlights": {
      where: "請在 Instagram 應用程式完成",
      steps: [
        "開啟 Instagram 個人檔案，在簡介下方點選「新增」建立精選動態。",
        "為顧客最常詢問的每個主題各建立一個精選動態。",
        "為每個精選動態設定封面圖片及簡短名稱。",
        "確認精選動態已在公開個人檔案的簡介下方顯示。",
      ],
    },
  },
  websiteExport: {
    heading: "如何套用",
    criteriaHeading: "檢查清單",
    disclaimer: "這是給您網站編輯者使用的草稿，不代表您的網站已經更新。核准並匯出不會自動發布任何內容——在您（或負責網站的人）套用之前，網站上什麼都沒有改變。下次掃描會顯示是否已經套用。",
    instructions: {
      "visibility-content": "將 <script type=\"application/ld+json\"> 區塊貼到您網站的 <head>，並將問答文字加到相關頁面一個公開可見的 FAQ 區塊。",
      "website-basics": "透過您的網站編輯器或 CMS，將標題、描述和 H1 套用到相關頁面。",
    },
  },
};
