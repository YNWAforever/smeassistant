import type { PrototypeLocale } from "@/lib/copy";
import type { TemplateKey } from "@/lib/workspace/templates";

export type ConversationCategory = "all" | "start" | "content" | "search";
type EntryKey = Extract<TemplateKey, "review-response" | "review-request" | "social-post" | "gbp-post" | "visibility-content" | "website-basics">;
type DesignCopy = {
  eyebrow: string; discussion: string; newDiscussion: string; together: string;
  start: string; attach: string; documents: string; sources: string; templates: string; templateNav: string; filters: string;
  categories: Record<ConversationCategory, string>;
  cards: Record<EntryKey, { title: string; description: string; tag: string }>;
  today: string; fullToday: string; open: string; awaiting: string; completed: string; todayUnavailable: string;
  effort: string; continue: string; recent: string; local: string; savedVersion: string; tools: string; toolHint: string;
  language: string; localNote: string; contextHint: string;
};

export const conversationDesignCopy: Record<PrototypeLocale, DesignCopy> = {
  en: {
    eyebrow: "Your work, one conversation away", discussion: "Conversation", newDiscussion: "New discussion", together: "Work together",
    start: "Start discussion", attach: "Add document", documents: "Documents & outputs", sources: "Sources", templates: "Choose a template, start something", templateNav: "Templates", filters: "Filter templates",
    categories: { all: "All", start: "Get started", content: "Content & reviews", search: "Search & results" },
    cards: {
      "review-response": { title: "Reply to a Google review", description: "Start with the review and your shop’s tone of voice.", tag: "Review + brand voice" },
      "review-request": { title: "Invite a customer to leave a review", description: "Prepare a friendly request using confirmed details.", tag: "Customer follow-up" },
      "social-post": { title: "Write a social post", description: "Start with a topic, confirmed facts and your photos.", tag: "Documents + photos" },
      "gbp-post": { title: "Prepare a Google business post", description: "Turn a confirmed shop update into a post to review.", tag: "Shop update" },
      "visibility-content": { title: "Find a search content gap", description: "Collect a question to check against your search sources.", tag: "Search + public pages" },
      "website-basics": { title: "Prepare your website basics", description: "Make your shop details and common questions clearer.", tag: "Shop information" },
    },
    today: "Today", fullToday: "Full Today view", open: "Open tasks", awaiting: "Draft versions", completed: "Done this month", todayUnavailable: "Today’s summary is unavailable. Open Today for the full view.",
    effort: "Work in this scope · task activity, not a claim of business results.", continue: "Continue", recent: "Recent discussions", local: "Only in this browser", savedVersion: "A saved version is available", tools: "Documents, search & sources", toolHint: "Open a tool when you need it. Reads and confirmations stay under your control.",
    language: "English", localNote: "Discussions save as browser-local notes. No AI reply is generated here.", contextHint: "Use confirmed shop details and check your sources before approving work.",
  },
  "zh-HK": {
    eyebrow: "Your work, one conversation away", discussion: "對話", newDiscussion: "新討論", together: "一齊工作",
    start: "開始討論", attach: "加入文件", documents: "文件與產出", sources: "資料來源", templates: "揀個模板，開始做", templateNav: "模板", filters: "篩選模板",
    categories: { all: "全部", start: "開始工作", content: "內容與評論", search: "搜尋與成效" },
    cards: {
      "review-response": { title: "回覆 Google 評論", description: "沿用舖頭語氣，準備一份可以審閱嘅稿。", tag: "評論＋品牌語氣" },
      "review-request": { title: "邀請客人留評論", description: "由已確認資料開始，寫句自然嘅邀請。", tag: "客人跟進" },
      "social-post": { title: "寫一篇社交帖文", description: "由主題、已確認資料同相片開始。", tag: "文件＋相片" },
      "gbp-post": { title: "準備 Google 商家帖文", description: "將已確認嘅舖頭近況，整理成待審閱帖文。", tag: "舖頭近況" },
      "visibility-content": { title: "搵搜尋內容缺口", description: "記低客人想搵嘅問題，再對照搜尋來源。", tag: "搜尋＋公開網頁" },
      "website-basics": { title: "整理網站基本資料", description: "將舖頭資料同常見問題講清楚。", tag: "舖頭資料" },
    },
    today: "今日", fullToday: "睇完整今日", open: "未完成待辦", awaiting: "草稿版本", completed: "今個月已完成", todayUnavailable: "暫時讀唔到今日摘要，可以打開今日睇完整資料。",
    effort: "目前範圍嘅工作紀錄，唔代表生意成效。", continue: "繼續", recent: "最近討論", local: "只喺呢個瀏覽器", savedVersion: "有已存版本可以繼續", tools: "文件、搜尋同資料來源", toolHint: "有需要先打開工具。讀取資料同確認工作，都由你決定。",
    language: "繁體中文・香港", localNote: "討論會存成本機筆記，呢度唔會產生 AI 回覆。", contextHint: "用已確認嘅舖頭資料，確認工作前先核對來源。",
  },
  "zh-TW": {
    eyebrow: "Your work, one conversation away", discussion: "對話", newDiscussion: "新討論", together: "一起工作",
    start: "開始討論", attach: "加入文件", documents: "文件與產出", sources: "資料來源", templates: "選個範本，開始做", templateNav: "範本", filters: "篩選範本",
    categories: { all: "全部", start: "開始工作", content: "內容與評論", search: "搜尋與成效" },
    cards: {
      "review-response": { title: "回覆 Google 評論", description: "沿用店裡語氣，準備一份可以審閱的稿。", tag: "評論＋品牌語氣" },
      "review-request": { title: "邀請客人留評論", description: "從已確認資料開始，寫句自然的邀請。", tag: "客人跟進" },
      "social-post": { title: "寫一篇社群貼文", description: "從主題、已確認資料和照片開始。", tag: "文件＋照片" },
      "gbp-post": { title: "準備 Google 商家貼文", description: "將已確認的店裡近況，整理成待審閱貼文。", tag: "店裡近況" },
      "visibility-content": { title: "找搜尋內容缺口", description: "記下客人想找的問題，再對照搜尋來源。", tag: "搜尋＋公開網頁" },
      "website-basics": { title: "整理網站基本資料", description: "將店裡資料和常見問題說清楚。", tag: "店裡資料" },
    },
    today: "今天", fullToday: "查看完整今天", open: "未完成待辦", awaiting: "草稿版本", completed: "本月已完成", todayUnavailable: "暫時無法讀取今天摘要，可以開啟今天查看完整資料。",
    effort: "目前範圍的工作紀錄，不代表生意成效。", continue: "繼續", recent: "最近討論", local: "只在這個瀏覽器", savedVersion: "有已存版本可以繼續", tools: "文件、搜尋與資料來源", toolHint: "有需要再開啟工具。讀取資料和確認工作，都由你決定。",
    language: "繁體中文・台灣", localNote: "討論會存成本機筆記，這裡不會產生 AI 回覆。", contextHint: "使用已確認的店裡資料，確認工作前先核對來源。",
  },
};
