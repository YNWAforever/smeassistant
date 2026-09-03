import type { PriorityFactorKey } from "@/lib/workspace/priority";
import type { TemplateKey } from "@/lib/workspace/templates";
import type { MetricKey } from "@/lib/workspace/metrics";

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

export type WorkspaceCopy = {
  templates: Record<TemplateKey, { title: string; summary: string; workflow: string }>;
  factors: Record<PriorityFactorKey, string>;
  metrics: Record<MetricKey, string>;
  phases: Record<DisplayPhaseKey, string>;
  states: Record<StateLabelKey, string>;
  priority: { urgent: string; high: string; medium: string; low: string };
  freshness: { today: string; days: string };
  inputs: Record<string, string>;
};

const INPUT_KEYS = [
  "brand_voice", "reviews_without_response", "language", "channel", "opening_hours", "categories", "asset_or_text_only", "alt_text",
  "approved_claim", "cta_link", "owner_fact_1", "owner_fact_2", "owner_fact_3", "menu_items", "google_account_owner",
] as const;

function inputs(labels: string[]): Record<string, string> {
  return Object.fromEntries(INPUT_KEYS.map((key, index) => [key, labels[index]]));
}

export const workspaceEn: WorkspaceCopy = {
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
    approved_export_ready: "Approved · export ready", exported: "Exported", awaiting_comparable_scan: "Awaiting comparable scan", measured: "Measured", recommended: "Recommended",
  },
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
  inputs: inputs([
    "Brand voice", "Reviews without response", "Language", "Channel (WhatsApp / LINE / QR)", "Opening hours", "Categories", "Approved asset or text only", "Alt text",
    "Approved claim", "CTA link", "Owner fact 1", "Owner fact 2", "Owner fact 3", "Menu items (name, ingredients, allergens, price)", "Google account owner",
  ]),
};

export const workspaceZhHK: WorkspaceCopy = {
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
    approved_export_ready: "已核准 · 可匯出", exported: "已匯出", awaiting_comparable_scan: "等待可比較掃描", measured: "已量度", recommended: "建議",
  },
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
  inputs: inputs([
    "品牌語氣", "未回覆的評論", "語言", "渠道（WhatsApp / LINE / QR）", "營業時間", "類別", "已批准素材或純文字", "替代文字",
    "已批准的主張", "行動連結", "店主事實 1", "店主事實 2", "店主事實 3", "餐牌項目（名稱、材料、致敏原、價錢）", "Google 帳戶擁有人",
  ]),
};

export const workspaceZhTW: WorkspaceCopy = {
  ...workspaceZhHK,
  templates: {
    ...workspaceZhHK.templates,
    "review-response": { title: "回覆未回覆的 Google 評論", summary: "草稿已依品牌語氣與評論內容準備好，等你一次審閱。", workflow: "評論回覆流程" },
    "social-post": { title: "處理 Instagram 內容空檔", summary: "一則以店內近況為主的社群貼文草稿。", workflow: "社群貼文流程" },
    "gbp-post": { title: "發布一則 Google 商家貼文", summary: "檔案近期沒有貼文；一則簡短更新可維持在地搜尋的活躍度。", workflow: "Google 貼文流程" },
    "menu-translation": { title: "審閱英文菜單翻譯", summary: "先確認菜色資料，再完成其餘英文標籤。", workflow: "菜單翻譯流程" },
    "google-reconnect": { title: "重新連接 Google 商家權限", summary: "恢復連接後，才可安全取得非公開營運資料。", workflow: "連線恢復" },
  },
  states: { ...workspaceZhHK.states, unavailable: "無法取得", publishing: "發布中", published: "已發布" },
  freshness: { today: "今天更新", days: "{n} 天前更新" },
};
