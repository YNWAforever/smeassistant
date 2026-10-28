import type { PrototypeLocale } from "@/lib/copy";

type ConversationCopy = {
  switchLabel: string; title: string; preview: string; lead: string; privacy: string; boundary: string;
  templates: string; templateHint: string; useTemplate: string; threads: string; empty: string; newThread: string;
  note: string; placeholder: string; save: string; saved: string; loading: string; unavailable: string; corrupt: string; limit: string; missing: string;
  continueWork: string; noActions: string; allActions: string; openAction: string; openVersion: string; linkAction: string; chooseAction: string; actionUnavailable: string;
  context: string; shop: string; insights: string; integrations: string;
};
export const conversationCopy: Record<PrototypeLocale, ConversationCopy> = {
  en: {
    switchLabel: "Start work", title: "What would you like to work on?", preview: "Preview", lead: "Keep a local thread of notes, choose a task template, or return to existing work.",
    privacy: "Notes stay in this browser, separated by account, workspace and location. No cloud backup or sync. People using this browser profile may read them; clearing site data deletes them.",
    boundary: "Notes are not AI replies or drafts and are not shared through linked tasks. Saving them does not confirm work or count a delivery. Ask Kinnso is available above.",
    templates: "Start with a template", templateHint: "Choose a template to fill your note. Nothing runs until you open an existing task and use its controls.", useTemplate: "Use template:",
    threads: "Recent local threads", empty: "No local threads yet.", newThread: "New thread", note: "Your note", placeholder: "What do you want to work on? Add confirmed facts or a next step.", save: "Save local note", saved: "Saved in this browser", loading: "Loading local notes…",
    unavailable: "Your notes could not be saved or restored in this browser. Current notes remain on this screen only and may be lost when you leave or refresh.",
    corrupt: "Saved local notes could not be read. They have not been replaced. Clear this site's browser data to start again; this also removes its other local settings.",
    limit: "This browser's note limit was reached. The latest change could not be saved. Keep a copy before leaving.", missing: "This local thread is unavailable in this account, workspace and location.",
    continueWork: "Continue existing work", noActions: "No tasks in the current list.", allActions: "View all tasks", openAction: "Open task", openVersion: "Open saved version", linkAction: "Link existing task", chooseAction: "Choose a task", actionUnavailable: "Linked task is not in the current list. Check the task list for access or other work.",
    context: "Shop context", shop: "Shop", insights: "Better?", integrations: "Connections",
  },
  "zh-HK": {
    switchLabel: "開始工作", title: "今日想處理啲咩？", preview: "預覽", lead: "用本機討論串記低想法、揀工作範本，或者繼續現有工作。",
    privacy: "筆記只留喺呢個瀏覽器，按帳戶、工作空間同分店分開，冇雲端備份或同步。用同一瀏覽器設定檔嘅人可能讀到；清除網站資料會刪除筆記。",
    boundary: "筆記唔係 AI 回覆或草稿，亦唔會透過連結嘅待辦分享。儲存唔代表確認工作，唔會計作交付。現有助手「問 Kinnso」喺上面。",
    templates: "由範本開始", templateHint: "揀範本會填入筆記。要執行工作，請打開現有待辦，再用入面嘅操作。", useTemplate: "使用範本：",
    threads: "最近嘅本機討論串", empty: "未有本機討論串。", newThread: "新討論串", note: "你嘅筆記", placeholder: "想處理啲咩？記低已確認資料或者下一步。", save: "儲存本機筆記", saved: "已儲存喺呢個瀏覽器", loading: "讀取本機筆記中…",
    unavailable: "呢個瀏覽器未能儲存或還原筆記。目前筆記只留喺呢個畫面，離開或重新整理後可能遺失。",
    corrupt: "未能讀取已存嘅本機筆記，原有資料未被取代。要重新開始，請清除呢個網站嘅瀏覽器資料；其他本機設定亦會一併移除。",
    limit: "已達到呢個瀏覽器嘅筆記上限，最新更改未能儲存。離開前請另存一份。", missing: "呢個帳戶、工作空間同分店搵唔到呢個本機討論串。",
    continueWork: "繼續現有工作", noActions: "目前清單未有待辦。", allActions: "睇全部待辦", openAction: "打開待辦", openVersion: "打開已存版本", linkAction: "連結現有待辦", chooseAction: "揀一項待辦", actionUnavailable: "連結嘅待辦唔喺目前清單。請到待辦清單確認存取權或其他工作。",
    context: "舖頭資料", shop: "舖", insights: "好啲？", integrations: "連接設定",
  },
  "zh-TW": {
    switchLabel: "開始工作", title: "今天想處理什麼？", preview: "預覽", lead: "用本機討論串記下想法、選工作範本，或繼續現有工作。",
    privacy: "筆記只留在這個瀏覽器，依帳戶、工作空間和分店分開，沒有雲端備份或同步。使用同一瀏覽器設定檔的人可能讀到；清除網站資料會刪除筆記。",
    boundary: "筆記不是 AI 回覆或草稿，也不會透過連結的待辦分享。儲存不代表確認工作，不計入交付。現有助手「問 Kinnso」在上方。",
    templates: "從範本開始", templateHint: "選範本會填入筆記。要執行工作，請開啟現有待辦，再使用裡面的操作。", useTemplate: "使用範本：",
    threads: "最近的本機討論串", empty: "還沒有本機討論串。", newThread: "新討論串", note: "你的筆記", placeholder: "想處理什麼？記下已確認資料或下一步。", save: "儲存本機筆記", saved: "已儲存在這個瀏覽器", loading: "正在讀取本機筆記…",
    unavailable: "這個瀏覽器無法儲存或還原筆記。目前筆記只留在這個畫面，離開或重新整理後可能遺失。",
    corrupt: "無法讀取已存的本機筆記，原有資料未被取代。若要重新開始，請清除這個網站的瀏覽器資料；其他本機設定也會一併移除。",
    limit: "已達到這個瀏覽器的筆記上限，最新變更無法儲存。離開前請另存一份。", missing: "這個帳戶、工作空間和分店找不到這個本機討論串。",
    continueWork: "繼續現有工作", noActions: "目前清單沒有待辦。", allActions: "查看全部待辦", openAction: "開啟待辦", openVersion: "開啟已存版本", linkAction: "連結現有待辦", chooseAction: "選一項待辦", actionUnavailable: "連結的待辦不在目前清單。請到待辦清單確認存取權或其他工作。",
    context: "店裡資料", shop: "店裡", insights: "有好一點？", integrations: "連接設定",
  },
};
