// Deep import on purpose (P4.4): under tsx (scripts/eval-workflows.ts) a static
// named import from the vendored package's CJS barrel does not resolve; the
// defining source file does. Do not move it back to the barrel on a re-pin
// unless `eval:workflows --check-load` still loads afterwards.
import { FINDING_KEYS } from "@sme-scanner/scoring/src/types";
import { localized, type Capability, type LocalizedText } from "@/lib/domain";
import type { MetricKey } from "@/lib/workspace/metrics";
import type { WebsiteCheckKey } from "@/lib/website/checks";

/**
 * Action template table (CLAUDE.md §3.6.1). One open action per
 * (workspace, location, template); every upstream finding key resolves to a
 * template or to the ledger-only list. `agentKey` names this app's Phase 4
 * agents (lib/agents), not upstream's Fix Pack agents.
 */
export type TemplateKey =
  | "review-response"
  | "review-request"
  | "gbp-profile-fix"
  | "gbp-photo-pack"
  | "gbp-post"
  | "social-post"
  | "ig-bio"
  | "ig-highlights"
  | "visibility-content"
  | "website-basics"
  | "local-seo-brief"
  | "menu-translation"
  | "offer-instagram-post"
  | "offer-google-post"
  | "google-reconnect";

/** The templates written from a confirmed offer; `isOfferTemplate` is the runtime test for the same set. */
export type OfferTemplateKey = "offer-instagram-post" | "offer-google-post";

export type WorkspaceAgentKey =
  | "review_reply"
  | "review_request"
  | "photo_brief"
  | "gbp_post"
  | "social_post"
  | "ig_bio"
  | "faq_jsonld"
  | "website_basics"
  | "local_seo_brief"
  | "menu_translation"
  | "promotion_copy";

export type TemplateDelivery = "export_copy" | "export" | "checklist" | "system";

/**
 * What kind of input a workflow needs, which decides whether a missing one may
 * block a model call.
 * - `confirmed_fact`: something only the owner knows (a claim, a link, a menu).
 *   Missing means the draft would have to invent it, so the run stops at needs_input.
 * - `evidence`: something the server reads from stored scan data.
 * - `preference`: a style choice with a safe default (voice, language, channel).
 */
export type WorkflowInputKind = "confirmed_fact" | "evidence" | "preference";

export interface WorkflowInput {
  key: string;
  kind: WorkflowInputKind;
}

/** Every workflow retries a failed model call once and stops at needs_input on missing facts. */
const DEFAULT_FAILURE = { retries: 1, onMissingFacts: "needs_input" } as const;

/**
 * The typed workflow contract: one row of the template table. It carries what a
 * workflow needs, produces, delivers and measures -- and nothing about who may
 * run it. Authorization stays in requireMembership, the route handlers, the SQL
 * functions and checkAiBudget.
 */
export interface WorkflowDefinition {
  key: TemplateKey;
  triggerFindingKeys: string[];
  capability: Capability;
  agentKey: WorkspaceAgentKey | null;
  /** Kept as a stored literal; must equal `inputs.map((i) => i.key)` (contract test). */
  requiredInputs: string[];
  /** The same inputs with their kind. */
  inputs: readonly WorkflowInput[];
  effortMinutes: number;
  delivery: TemplateDelivery;
  /** Only an approved version is ever counted as a delivery (guardrail 7). */
  deliveryUnit: "approved_version";
  /** The metric that proves the change; null when no snapshot metric can. */
  measurement: MetricKey | null;
  failure: { retries: 1; onMissingFacts: "needs_input" };
  externalFacing: boolean;
  /** Which channel the actions page filters this template under. */
  channel: "google" | "instagram" | "website" | "search_ai";
  /**
   * Website checks whose passing would evidence this template's work, for the
   * verifier sweep (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
   *
   * Optional because most templates are not website-backed and never will be --
   * a GBP photo pack has nothing an HTTP fetch could confirm. Absent means "not
   * verifiable", which is a permanent and correct answer, not a gap.
   *
   * Declared here rather than in the verifier so the same row says what creates
   * an action and what would prove it is done.
   */
  verifyChecks?: readonly WebsiteCheckKey[];
  /** What the owner receives, in one plain line. */
  outcome: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  workflow: LocalizedText;
}

/** Kept so existing imports keep working; the table is a list of workflow definitions. */
export type ActionTemplate = WorkflowDefinition;

/** Website-check trigger that is not an upstream finding (§3.6.1 visibility-content). */
export const WEBSITE_FAQ_TRIGGER = "website.checks.faq_schema";

/** Findings shown in the change ledger only; they never create actions. */
export const LEDGER_ONLY_KEYS: string[] = [
  "trust.cross_signal",
  "aeo.website_no_faq_schema",
  "ig.data_unavailable",
  "gbp.data_unavailable",
  "aeo.data_unavailable",
  "trust.data_unavailable",
];

export const TEMPLATES: ActionTemplate[] = [
  {
    key: "review-response",
    triggerFindingKeys: ["gbp.owner_response_low", "gbp.rating_low", "trust.owner_engagement", "trust.review_rating"],
    capability: "Live",
    agentKey: "review_reply",
    requiredInputs: ["brand_voice", "reviews_without_response", "language"],
    inputs: [
      { key: "brand_voice", kind: "preference" },
      { key: "reviews_without_response", kind: "evidence" },
      { key: "language", kind: "preference" },
    ],
    effortMinutes: 10,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "gbp.response_rate_pct",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "google",
    outcome: localized("Replies you can paste into Google, one per selected review", "可直接貼到 Google 的回覆，每則選定評論一段"),
    title: localized("Reply to unanswered Google reviews", "回覆未回覆的 Google 評論"),
    summary: localized("Drafts follow your brand voice and each review's content, ready for one review pass.", "草稿已按品牌語氣及評論內容準備好，等你一次過審閱。"),
    workflow: localized("Review reply workflow", "評論回覆流程"),
  },
  {
    key: "review-request",
    triggerFindingKeys: ["gbp.reviews_volume_low", "gbp.review_freshness", "trust.review_volume", "trust.review_recency"],
    capability: "Live",
    agentKey: "review_request",
    requiredInputs: ["brand_voice", "channel"],
    inputs: [
      { key: "brand_voice", kind: "preference" },
      { key: "channel", kind: "preference" },
    ],
    effortMinutes: 8,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "gbp.reviews_count",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "google",
    outcome: localized("A short review request you can send by WhatsApp, LINE or QR card", "一段可經 WhatsApp、LINE 或 QR 卡發送的評論邀請"),
    title: localized("Ask recent customers for a Google review", "邀請近期顧客留下 Google 評論"),
    summary: localized("A short, polite request for WhatsApp, LINE or a QR card, matched to your brand voice.", "一段簡短有禮的邀請，適用於 WhatsApp、LINE 或 QR 卡，並配合品牌語氣。"),
    workflow: localized("Review request workflow", "評論邀請流程"),
  },
  {
    key: "gbp-profile-fix",
    triggerFindingKeys: ["gbp.hours_incomplete", "gbp.categories_missing"],
    capability: "Live",
    agentKey: null,
    requiredInputs: ["opening_hours", "categories"],
    inputs: [
      { key: "opening_hours", kind: "confirmed_fact" },
      { key: "categories", kind: "confirmed_fact" },
    ],
    effortMinutes: 10,
    delivery: "checklist",
    deliveryUnit: "approved_version",
    measurement: "gbp.hours_complete",
    failure: DEFAULT_FAILURE,
    externalFacing: false,
    channel: "google",
    outcome: localized("A checklist of the exact fields to fix on the profile", "一份列明檔案上需修正欄位的檢查清單"),
    title: localized("Complete the Google Business Profile basics", "補齊 Google 商戶檔案基本資料"),
    summary: localized("Opening hours and categories are missing or incomplete on the public profile.", "公開檔案的營業時間或類別缺失或不完整。"),
    workflow: localized("Profile checklist", "檔案檢查清單"),
  },
  {
    key: "gbp-photo-pack",
    triggerFindingKeys: ["gbp.photos_volume", "gbp.photos_freshness"],
    capability: "Beta",
    agentKey: "photo_brief",
    requiredInputs: [],
    inputs: [],
    effortMinutes: 15,
    delivery: "export",
    deliveryUnit: "approved_version",
    measurement: "gbp.photos_count",
    failure: DEFAULT_FAILURE,
    externalFacing: false,
    channel: "google",
    outcome: localized("A photo brief listing the shots to take", "一份列明應拍攝相片的簡報"),
    title: localized("Refresh your Google photos", "更新 Google 商戶相片"),
    summary: localized("A photo brief listing the shots that would bring the profile up to date.", "一份相片拍攝簡報，列出可令檔案更貼近現況的相片。"),
    workflow: localized("Photo brief", "相片簡報"),
  },
  {
    key: "gbp-post",
    triggerFindingKeys: ["gbp.posts_inactive"],
    capability: "Beta",
    agentKey: "gbp_post",
    requiredInputs: ["brand_voice"],
    inputs: [
      { key: "brand_voice", kind: "preference" },
    ],
    effortMinutes: 8,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "gbp.days_since_last_review",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "google",
    outcome: localized("A Google Business post you can copy and publish yourself", "一則可自行複製並發佈的 Google 商戶帖文"),
    title: localized("Publish a Google Business post", "發佈一則 Google 商戶帖文"),
    summary: localized("The profile has no recent posts; a short update keeps it active in local results.", "檔案近期沒有帖文；一則簡短更新可維持本地搜尋的活躍度。"),
    workflow: localized("Google post workflow", "Google 帖文流程"),
  },
  {
    key: "social-post",
    triggerFindingKeys: ["ig.content_consistency", "ig.content_mix", "ig.reels_missing", "ig.engagement_low", "ig.follower_count_low", "trust.social_proof"],
    capability: "Live",
    agentKey: "social_post",
    requiredInputs: ["asset_or_text_only", "alt_text"],
    inputs: [
      { key: "asset_or_text_only", kind: "confirmed_fact" },
      { key: "alt_text", kind: "preference" },
    ],
    effortMinutes: 8,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "ig.days_since_last_post",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "instagram",
    outcome: localized("A social post draft with alt text, ready to copy", "一則附替代文字、可直接複製的社交帖文草稿"),
    title: localized("Fill the Instagram content gap", "處理 Instagram 內容空檔"),
    summary: localized("A social post draft about what is happening in the shop right now.", "一則以店舖近況為主的社交帖文草稿。"),
    workflow: localized("Social post workflow", "社交帖文流程"),
  },
  {
    key: "ig-bio",
    triggerFindingKeys: ["ig.profile_clarity", "ig.bio_cta"],
    capability: "Live",
    agentKey: "ig_bio",
    requiredInputs: ["brand_voice", "approved_claim", "cta_link"],
    inputs: [
      { key: "brand_voice", kind: "preference" },
      { key: "approved_claim", kind: "confirmed_fact" },
      { key: "cta_link", kind: "confirmed_fact" },
    ],
    effortMinutes: 5,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "ig.followers",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "instagram",
    outcome: localized("A rewritten Instagram bio within the 150-character limit", "一個不超過 150 字元的 Instagram 簡介改寫"),
    title: localized("Sharpen the Instagram bio", "優化 Instagram 簡介"),
    summary: localized("Say what you do, where you are, and how to book, in the first two lines.", "頭兩行講清楚你做甚麼、在哪裡、如何預訂。"),
    workflow: localized("Bio rewrite", "簡介改寫"),
  },
  {
    key: "ig-highlights",
    triggerFindingKeys: ["ig.story_highlights_missing"],
    capability: "Live",
    agentKey: null,
    requiredInputs: [],
    inputs: [],
    effortMinutes: 10,
    delivery: "checklist",
    deliveryUnit: "approved_version",
    measurement: "ig.highlights_count",
    failure: DEFAULT_FAILURE,
    externalFacing: false,
    channel: "instagram",
    outcome: localized("A checklist of the story highlights to add", "一份列明應新增精選故事的檢查清單"),
    title: localized("Add Instagram story highlights", "新增 Instagram 精選故事"),
    summary: localized("Menu, location and booking highlights answer the questions visitors ask first.", "餐牌、位置及預訂精選，先回答訪客最常問的問題。"),
    workflow: localized("Highlights checklist", "精選檢查清單"),
  },
  {
    key: "visibility-content",
    triggerFindingKeys: ["aeo.ai_overview_missing", "aeo.ai_mode_missing", "aeo.ai_citation_missing", WEBSITE_FAQ_TRIGGER],
    capability: "Live",
    agentKey: "faq_jsonld",
    requiredInputs: ["owner_fact_1", "owner_fact_2", "owner_fact_3"],
    inputs: [
      { key: "owner_fact_1", kind: "confirmed_fact" },
      { key: "owner_fact_2", kind: "confirmed_fact" },
      { key: "owner_fact_3", kind: "confirmed_fact" },
    ],
    effortMinutes: 15,
    delivery: "export",
    deliveryUnit: "approved_version",
    measurement: "aeo.ai_citation_count",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "website",
    verifyChecks: ["faq_schema"],
    outcome: localized("Three FAQ answers and matching JSON-LD for your website", "三則常見問題答案及對應的網站 JSON-LD"),
    title: localized("Add clear FAQ answers for search and AI", "新增清晰的常見問題，供搜尋及 AI 引用"),
    summary: localized("Answer the three questions search and AI surfaces could not find on your site.", "解答搜尋及 AI 介面在你網站找不到的三項問題。"),
    workflow: localized("FAQ and JSON-LD workflow", "常見問題及 JSON-LD 流程"),
  },
  {
    key: "website-basics",
    triggerFindingKeys: ["aeo.website_content_weak", "aeo.website_meta_weak", "aeo.website_h1_weak"],
    capability: "Live",
    agentKey: "website_basics",
    requiredInputs: ["approved_claim"],
    inputs: [
      { key: "approved_claim", kind: "preference" },
    ],
    effortMinutes: 10,
    delivery: "export",
    deliveryUnit: "approved_version",
    measurement: "website.checks_passed",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "website",
    // "title" has no scanner-side trigger here -- aeo.website_content_weak and
    // aeo.website_meta_weak both fire on meta_description_len, and
    // aeo.website_h1_weak on h1_count; none inspects <title>. It is included
    // because the decision rule verifies against the recorded website_checks
    // state, not against which finding fired, and a failing title is squarely
    // within this template's own remit ("title, description and heading
    // copy"). Deliberate, not an assumed mirror of triggerFindingKeys.
    verifyChecks: ["title", "meta_description_50_160", "single_h1"],
    outcome: localized("Title, description and heading copy for your website", "網站的標題、簡介及標題文字"),
    title: localized("Fix the website basics", "修正網站基本資料"),
    summary: localized("Title, description and heading copy that describes the business plainly.", "以清楚描述業務的標題、簡介及標題文字。"),
    workflow: localized("Website basics workflow", "網站基本資料流程"),
  },
  {
    key: "local-seo-brief",
    triggerFindingKeys: ["aeo.search_visibility_poor", "aeo.maps_visibility_poor", "aeo.organic_rank_poor", "aeo.competitor_gap"],
    capability: "Beta",
    agentKey: "local_seo_brief",
    requiredInputs: [],
    inputs: [],
    effortMinutes: 20,
    delivery: "export",
    deliveryUnit: "approved_version",
    measurement: "aeo.best_organic_rank",
    failure: DEFAULT_FAILURE,
    externalFacing: false,
    channel: "search_ai",
    outcome: localized("A brief on where competitors outrank you and why", "一份說明競爭對手在哪些搜尋勝出及原因的簡報"),
    title: localized("Local search brief", "本地搜尋簡報"),
    summary: localized("Where competitors appear above you and what evidence explains the gap.", "競爭對手在哪些搜尋中排在你之上，以及證據如何解釋差距。"),
    workflow: localized("Local SEO brief", "本地 SEO 簡報"),
  },
  {
    key: "menu-translation",
    triggerFindingKeys: [],
    capability: "Beta",
    agentKey: "menu_translation",
    requiredInputs: ["menu_items"],
    inputs: [
      { key: "menu_items", kind: "confirmed_fact" },
    ],
    effortMinutes: 20,
    delivery: "export",
    deliveryUnit: "approved_version",
    measurement: "website.checks_passed",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "website",
    outcome: localized("An English menu translation for you to check dish by dish", "一份供你逐項核對的英文餐牌翻譯"),
    title: localized("Review the English menu translation", "審閱英文餐牌翻譯"),
    summary: localized("Confirm the dish facts first, then finish the remaining English labels.", "先確認菜式資料，再完成餘下英文標籤。"),
    workflow: localized("Menu translation workflow", "餐牌翻譯流程"),
  },
  {
    key: "offer-instagram-post",
    triggerFindingKeys: [],
    capability: "Beta",
    agentKey: "promotion_copy",
    requiredInputs: ["offer_id", "brand_voice"],
    inputs: [
      { key: "offer_id", kind: "confirmed_fact" },
      { key: "brand_voice", kind: "preference" },
    ],
    effortMinutes: 8,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: "ig.days_since_last_post",
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "instagram",
    outcome: localized("An Instagram caption for your confirmed offer, ready to copy", "一則為你已確認優惠而寫、可直接複製的 Instagram 文案"),
    title: localized("Promote your offer on Instagram", "在 Instagram 宣傳你的優惠"),
    summary: localized("A caption that states the offer's price, dates and terms exactly as you confirmed them.", "一則按你已確認的價錢、日期及條款撰寫的文案。"),
    workflow: localized("Offer Instagram post workflow", "優惠 Instagram 帖文流程"),
  },
  {
    key: "offer-google-post",
    triggerFindingKeys: [],
    capability: "Beta",
    agentKey: "promotion_copy",
    requiredInputs: ["offer_id", "brand_voice"],
    inputs: [
      { key: "offer_id", kind: "confirmed_fact" },
      { key: "brand_voice", kind: "preference" },
    ],
    effortMinutes: 8,
    delivery: "export_copy",
    deliveryUnit: "approved_version",
    measurement: null,
    failure: DEFAULT_FAILURE,
    externalFacing: true,
    channel: "google",
    outcome: localized("A Google Business post for your confirmed offer, ready to copy", "一則為你已確認優惠而寫、可直接複製的 Google 商戶帖文"),
    title: localized("Promote your offer on Google", "在 Google 宣傳你的優惠"),
    summary: localized("A short post that states the offer's price, dates and terms exactly as you confirmed them.", "一則按你已確認的價錢、日期及條款撰寫的簡短帖文。"),
    workflow: localized("Offer Google post workflow", "優惠 Google 帖文流程"),
  },
  {
    key: "google-reconnect",
    triggerFindingKeys: [],
    capability: "Requires connection",
    agentKey: null,
    requiredInputs: ["google_account_owner"],
    inputs: [
      { key: "google_account_owner", kind: "confirmed_fact" },
    ],
    effortMinutes: 5,
    delivery: "system",
    deliveryUnit: "approved_version",
    measurement: null,
    failure: DEFAULT_FAILURE,
    externalFacing: false,
    channel: "google",
    outcome: localized("Google Business access restored so profile data can be read", "恢復 Google 商戶權限，以便讀取檔案資料"),
    title: localized("Restore Google Business access", "重新連接 Google 商戶權限"),
    summary: localized("Reconnect the account before non-public profile data can be read safely.", "恢復連接後，才可安全取得非公開營運資料。"),
    workflow: localized("Connection recovery", "連接恢復"),
  },
];

const BY_FINDING = new Map<string, ActionTemplate>();
for (const template of TEMPLATES) {
  for (const key of template.triggerFindingKeys) {
    if (BY_FINDING.has(key)) throw new Error(`finding key mapped twice: ${key}`);
    BY_FINDING.set(key, template);
  }
}

export function templateForFinding(findingKey: string): ActionTemplate | null {
  return BY_FINDING.get(findingKey) ?? null;
}

export function templateByKey(key: TemplateKey): ActionTemplate {
  const template = TEMPLATES.find((t) => t.key === key);
  if (!template) throw new Error(`unknown template ${key}`);
  return template;
}

/**
 * Non-throwing lookup for read paths that map persisted rows. A row written by
 * an older derivation can name a template this build no longer declares, and a
 * list page must still render it rather than throw.
 */
export function findTemplate(key: string): ActionTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * A workflow written from an owner-confirmed offer. These are created only by
 * POST /api/offers/[offerId]/promotions: an objective, the Create page and
 * POST /api/actions have no offer to bind, so they must never offer or accept one.
 */
export function isOfferTemplate(template: Pick<WorkflowDefinition, "inputs">): boolean {
  return template.inputs.some((input) => input.key === "offer_id");
}

export function isLedgerOnly(findingKey: string): boolean {
  return LEDGER_ONLY_KEYS.includes(findingKey);
}

/** Every key the scorer can emit, plus the website trigger — the coverage the test pins. */
export const COVERED_FINDING_KEYS: readonly string[] = [...FINDING_KEYS, WEBSITE_FAQ_TRIGGER];
