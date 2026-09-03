import { FINDING_KEYS } from "@sme-scanner/scoring";
import { localized, type Capability, type LocalizedText } from "@/lib/domain";

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
  | "google-reconnect";

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
  | "menu_translation";

export type TemplateDelivery = "export_copy" | "export" | "checklist" | "system";

export interface ActionTemplate {
  key: TemplateKey;
  triggerFindingKeys: string[];
  capability: Capability;
  agentKey: WorkspaceAgentKey | null;
  requiredInputs: string[];
  effortMinutes: number;
  delivery: TemplateDelivery;
  externalFacing: boolean;
  /** Which channel the actions page filters this template under. */
  channel: "google" | "instagram" | "website" | "search_ai";
  title: LocalizedText;
  summary: LocalizedText;
  workflow: LocalizedText;
}

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
    effortMinutes: 10,
    delivery: "export_copy",
    externalFacing: true,
    channel: "google",
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
    effortMinutes: 8,
    delivery: "export_copy",
    externalFacing: true,
    channel: "google",
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
    effortMinutes: 10,
    delivery: "checklist",
    externalFacing: false,
    channel: "google",
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
    effortMinutes: 15,
    delivery: "export",
    externalFacing: false,
    channel: "google",
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
    effortMinutes: 8,
    delivery: "export_copy",
    externalFacing: true,
    channel: "google",
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
    effortMinutes: 8,
    delivery: "export_copy",
    externalFacing: true,
    channel: "instagram",
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
    effortMinutes: 5,
    delivery: "export_copy",
    externalFacing: true,
    channel: "instagram",
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
    effortMinutes: 10,
    delivery: "checklist",
    externalFacing: false,
    channel: "instagram",
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
    effortMinutes: 15,
    delivery: "export",
    externalFacing: true,
    channel: "website",
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
    effortMinutes: 10,
    delivery: "export",
    externalFacing: true,
    channel: "website",
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
    effortMinutes: 20,
    delivery: "export",
    externalFacing: false,
    channel: "search_ai",
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
    effortMinutes: 20,
    delivery: "export",
    externalFacing: true,
    channel: "website",
    title: localized("Review the English menu translation", "審閱英文餐牌翻譯"),
    summary: localized("Confirm the dish facts first, then finish the remaining English labels.", "先確認菜式資料，再完成餘下英文標籤。"),
    workflow: localized("Menu translation workflow", "餐牌翻譯流程"),
  },
  {
    key: "google-reconnect",
    triggerFindingKeys: [],
    capability: "Requires connection",
    agentKey: null,
    requiredInputs: ["google_account_owner"],
    effortMinutes: 5,
    delivery: "system",
    externalFacing: false,
    channel: "google",
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

export function isLedgerOnly(findingKey: string): boolean {
  return LEDGER_ONLY_KEYS.includes(findingKey);
}

/** Every key the scorer can emit, plus the website trigger — the coverage the test pins. */
export const COVERED_FINDING_KEYS: readonly string[] = [...FINDING_KEYS, WEBSITE_FAQ_TRIGGER];
