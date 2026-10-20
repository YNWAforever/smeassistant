/**
 * Workspace shell and Phase 4 navigation strings, reached as copy[locale].shell.
 * Five destinations (docs/ux target IA §2): Today, Actions, Insights, Business,
 * Settings. Agent names are never shown; the assistant is "Ask Kinnso".
 * zh-HK is Hong Kong written Chinese, zh-TW uses Taiwan terms (店家, 據點).
 */

type Item = { title: string; body: string }

export type ShellCopy = {
  brand: { name: string; tagline: string }
  skip: string
  nav: { label: string; today: string; actions: string; insights: string; business: string; settings: string }
  context: { owner: string; review: string; newAction: string }
  switcher: string
  allLocations: string
  usage: { label: string; note: string }
  notifications: { label: string; unread: string }
  assistant: { name: string }
  business: { title: string; lead: string; profile: Item; locations: Item; assets: Item; integrations: Item }
  settings: { title: string; lead: string; team: Item; plan: Item; notifications: Item; activity: Item }
  locked: string
  locations: { title: string; lead: string; primary: string; place: string; noPlace: string; switch: string; empty: string }
  newAction: { title: string; lead: string; label: string; goal: Item; offer: Item; pack: Item }
  views: { due: string; fixPack: string; fixPackLead: string }
  queue: {
    eyebrow: string
    title: string
    lead: string
    newAction: string
    navLabel: string
    tabs: { all: string; needs_input: string; drafts: string; awaiting_approval: string; completed: string }
  }
  panel: { label: string; preview: string; close: string; fullPage: string }
  bulk: {
    title: string
    body: string
    open: string
    dialogTitle: string
    dialogBody: string
    read: string
    approve: string
    approving: string
    cancel: string
    approved: string
    failed: string
    done: string
    version: string
  }
  /**
   * Role and scope notices (Phase 5). Each says what this role can do and who
   * can change it; the server checks stay the authority. {role} and {name} are
   * filled by components/states/role-notice.tsx.
   */
  /** Today's getting-started checklist (Phase 5); hides itself once every item is done. */
  gettingStarted: {
    title: string
    lead: string
    progress: string
    done: string
    items: { ownership: string; brand: string; google: string; approve: string; deliver: string }
  }
  /** Choosing a workspace after sign-in (Phase 5). {n} and {email} are filled with `fill`. */
  select: {
    signedInAs: string
    title: string
    lead: string
    open: string
    allLocations: string
    locations: { one: string; other: string }
    markets: { hk: string; tw: string }
    noScan: string
    score: string
    noScore: string
    coverage: string
    noCoverage: string
    urgent: { zero: string; one: string; other: string }
    emptyTitle: string
    alreadyScanned: string
    signOut: string
  }
  /** Signed-in tasks outside a workspace (sign-in, onboarding, choosing a workspace). */
  auth: { help: string; helpLabel: string; home: string }
  access: {
    readOnly: string
    ownerOnly: string
    askOwner: string
    viewer: Item
    viewerAction: Item
    viewerAssets: Item
    outOfScope: Item
    createReadOnly: Item
    brand: Item
    billing: Item
    teamViewer: Item
    teamManager: Item
    forbidden: Item
    notMember: Item & { hint: string }
  }
}

export const shellEn: ShellCopy = {
  brand: { name: "Kinnso OS", tagline: "by Fimmick" },
  skip: "Skip to content",
  nav: { label: "Workspace", today: "Today", actions: "Actions", insights: "Insights", business: "Business", settings: "Settings" },
  context: { owner: "Owner workspace", review: "Review & approve", newAction: "New action" },
  switcher: "Switch workspace or location",
  allLocations: "All locations",
  usage: { label: "Approved deliveries", note: "Drafts, edits and rejections use none" },
  notifications: { label: "Notifications", unread: "Notifications, {count} unread" },
  assistant: { name: "Ask Kinnso" },
  business: {
    title: "Business",
    lead: "What we know about your business, and where it comes from.",
    profile: { title: "Profile and facts", body: "Brand voice and confirmed facts" },
    locations: { title: "Locations", body: "Each location and its Google listing" },
    assets: { title: "Assets", body: "Photos and menus, with usage rights" },
    integrations: { title: "Integrations", body: "Google Business Profile, Instagram, website" },
  },
  settings: {
    title: "Settings",
    lead: "Who has access, your plan, and what we tell you.",
    team: { title: "Team and roles", body: "Invite people and set their access" },
    plan: { title: "Plan and usage", body: "Approved deliveries this month and billing" },
    notifications: { title: "Notifications", body: "Choose which updates you get" },
    activity: { title: "Activity", body: "Every decision, export and scan" },
  },
  locked: "Owner only",
  locations: {
    title: "Locations",
    lead: "Switch location from the menu at the top of the sidebar.",
    primary: "Main location",
    place: "Google listing linked",
    noPlace: "No Google listing linked",
    switch: "Open this location",
    empty: "No locations yet.",
  },
  newAction: {
    title: "New action",
    lead: "Start from a goal, an offer or a starter pack. Nothing is published without your approval.",
    label: "Choose how to start",
    goal: { title: "From a goal", body: "Pick what you want to improve" },
    offer: { title: "Offer", body: "Promote an offer you confirm" },
    pack: { title: "Starter pack", body: "A set of first actions for one location" },
  },
  views: {
    due: "Due",
    fixPack: "Fix Pack",
    fixPackLead: "Drafts prepared by the Fimmick team. Approve or reject each one.",
  },
  queue: {
    eyebrow: "Evidence-backed work queue",
    title: "Actions",
    lead: "Ranked from measured findings or a goal you set. Open one to review, approve and deliver.",
    newAction: "New",
    navLabel: "Action views",
    tabs: { all: "All", needs_input: "Needs input", drafts: "Drafts", awaiting_approval: "Approvals", completed: "Completed" },
  },
  panel: { label: "Action details", preview: "Preview", close: "Close details", fullPage: "Open full page" },
  bulk: {
    title: "{count} drafts ready to approve",
    body: "Review replies and social posts with no missing facts or warnings. Read each one before you approve.",
    open: "Review and approve",
    dialogTitle: "Approve drafts",
    dialogBody: "Tick each draft you have read. Each approval locks that exact version; nothing is published or counted until you export it.",
    read: "I have read this draft",
    approve: "Approve {count} selected",
    approving: "Approving…",
    cancel: "Close",
    approved: "Approved",
    failed: "Not approved: open it to review",
    done: "{approved} of {total} approved",
    version: "Version {n}",
  },
  gettingStarted: {
    title: "Getting started",
    lead: "Five steps to your first delivered piece of work. This list disappears once they are all done.",
    progress: "{done} of {total} done",
    done: "Done",
    items: { ownership: "Ownership confirmed", brand: "Set your brand voice", google: "Connect Google Business", approve: "Approve your first draft", deliver: "Export or copy it" },
  },
  select: {
    signedInAs: "Signed in as {email}",
    title: "Choose a workspace",
    lead: "Your role and locations are checked again when you open one.",
    open: "Open {name}",
    allLocations: "All locations",
    locations: { one: "1 location", other: "{n} locations" },
    markets: { hk: "Hong Kong", tw: "Taiwan" },
    noScan: "No scan yet",
    score: "Score {n}",
    noScore: "No score yet",
    coverage: "{n}% coverage",
    noCoverage: "Coverage unknown",
    urgent: { zero: "Nothing urgent", one: "1 urgent action", other: "{n} urgent actions" },
    emptyTitle: "No workspace linked yet",
    alreadyScanned: "I've already scanned my business",
    signOut: "Sign out and use another email",
  },
  auth: { help: "Help", helpLabel: "Questions about Kinnso OS", home: "Kinnso OS home" },
  access: {
    readOnly: "Read only",
    ownerOnly: "Owner only",
    askOwner: "Only the workspace owner can change roles and locations, in Settings › Team.",
    viewer: { title: "Viewer access", body: "You can see evidence, actions and results. Drafting, approving, delivering and billing need an owner or a manager." },
    viewerAction: { title: "Viewer access", body: "You can see the evidence and history. Editing, drafting, approving and exporting need an owner or a manager." },
    viewerAssets: { title: "Viewer access", body: "You can see assets and their usage rights. Uploading and confirming rights need an owner or a manager." },
    outOfScope: { title: "Outside your locations", body: "You can read this action. Editing, approving and delivering it needs the owner or a manager of its location." },
    createReadOnly: { title: "Read only for your role or locations", body: "Starting new work here needs the owner or a manager of this location." },
    brand: { title: "{role} access", body: "You can read the business profile. Only the owner can save changes." },
    billing: { title: "Owner only", body: "You can see the plan and its limits. Only the owner can change the plan or payment." },
    teamViewer: { title: "{role} access", body: "You can see who is in this workspace. Only the owner can manage people and their access." },
    teamManager: { title: "{role} access", body: "You can prepare and approve work in your locations. Only the owner can manage people and billing." },
    forbidden: { title: "That wasn't open to your role", body: "Your role or locations don't allow that page or action, so we brought you back to Today." },
    notMember: { title: "No access to “{name}”", body: "You are not a member of that workspace, or your access was removed.", hint: "Choose a workspace you can open below, or ask its owner to invite you." },
  },
}

export const shellZhHK: ShellCopy = {
  brand: { name: "Kinnso OS", tagline: "由 Fimmick 提供" },
  skip: "跳到主要內容",
  nav: { label: "工作台", today: "今日", actions: "行動", insights: "成效", business: "商戶", settings: "設定" },
  context: { owner: "店主工作台", review: "審閱與審批", newAction: "新行動" },
  switcher: "切換工作台或地點",
  allLocations: "所有地點",
  usage: { label: "核准後交付", note: "草稿、修改及拒絕不計用量" },
  notifications: { label: "通知", unread: "通知，{count} 則未讀" },
  assistant: { name: "問 Kinnso" },
  business: {
    title: "商戶",
    lead: "我們對你商戶的了解，以及資料來源。",
    profile: { title: "資料及事實", body: "品牌語氣及已確認的事實" },
    locations: { title: "地點", body: "每個地點及其 Google 商戶檔案" },
    assets: { title: "素材", body: "相片及餐牌，附使用權" },
    integrations: { title: "連接", body: "Google 商家檔案、Instagram、網站" },
  },
  settings: {
    title: "設定",
    lead: "誰可存取、你的方案，以及我們通知你甚麼。",
    team: { title: "團隊與權限", body: "邀請同事並設定權限" },
    plan: { title: "方案與用量", body: "本月核准後交付及帳單" },
    notifications: { title: "通知", body: "選擇接收哪些更新" },
    activity: { title: "活動紀錄", body: "每個決定、匯出及掃描" },
  },
  locked: "只限店主",
  locations: {
    title: "地點",
    lead: "可在側欄頂部的選單切換地點。",
    primary: "主要地點",
    place: "已連結 Google 商戶檔案",
    noPlace: "未連結 Google 商戶檔案",
    switch: "開啟此地點",
    empty: "暫時未有地點。",
  },
  newAction: {
    title: "新行動",
    lead: "由目標、優惠或入門套裝開始。未經你批准，不會發佈任何內容。",
    label: "選擇開始方式",
    goal: { title: "由目標開始", body: "選擇想改善的地方" },
    offer: { title: "優惠", body: "推廣你確認的優惠" },
    pack: { title: "入門套裝", body: "為一個地點準備第一批行動" },
  },
  views: {
    due: "到期",
    fixPack: "Fix Pack",
    fixPackLead: "由 Fimmick 團隊準備的草稿，請逐一批准或拒絕。",
  },
  queue: {
    eyebrow: "有實證支持的工作清單",
    title: "行動",
    lead: "按已量度的發現或你設定的目標排序。開啟一項即可審閱、審批及送出。",
    newAction: "新增",
    navLabel: "行動分類",
    tabs: { all: "全部", needs_input: "需要資料", drafts: "草稿", awaiting_approval: "待審批", completed: "已完成" },
  },
  panel: { label: "行動詳情", preview: "預覽", close: "關閉詳情", fullPage: "開啟完整頁面" },
  bulk: {
    title: "{count} 份草稿可審批",
    body: "沒有缺少資料或警告的評論回覆及社交帖文。請逐份閱讀後才審批。",
    open: "審閱並審批",
    dialogTitle: "審批草稿",
    dialogBody: "請勾選每份已閱讀的草稿。每次審批只鎖定該版本；匯出前不會發佈，亦不計用量。",
    read: "我已閱讀這份草稿",
    approve: "審批已選的 {count} 份",
    approving: "審批中…",
    cancel: "關閉",
    approved: "已審批",
    failed: "未能審批：請開啟審閱",
    done: "已審批 {total} 份中的 {approved} 份",
    version: "第 {n} 版",
  },
  gettingStarted: {
    title: "開始使用",
    lead: "五個步驟，完成第一份送出的工作。全部完成後，此清單會自動隱藏。",
    progress: "已完成 {done} / {total}",
    done: "已完成",
    items: { ownership: "擁有權已確認", brand: "設定品牌語氣", google: "連接 Google 商家", approve: "審批第一份草稿", deliver: "匯出或複製" },
  },
  select: {
    signedInAs: "已登入：{email}",
    title: "選擇工作台",
    lead: "開啟時會再次核對你的角色及地點範圍。",
    open: "開啟 {name}",
    allLocations: "所有地點",
    locations: { one: "1 個地點", other: "{n} 個地點" },
    markets: { hk: "香港", tw: "台灣" },
    noScan: "尚未掃描",
    score: "評分 {n}",
    noScore: "暫未有評分",
    coverage: "覆蓋率 {n}%",
    noCoverage: "覆蓋率未知",
    urgent: { zero: "沒有緊急行動", one: "1 項緊急行動", other: "{n} 項緊急行動" },
    emptyTitle: "尚未連結任何工作台",
    alreadyScanned: "我已掃描過我的商戶",
    signOut: "登出並用另一個電郵登入",
  },
  auth: { help: "說明", helpLabel: "關於 Kinnso OS 的常見問題", home: "Kinnso OS 首頁" },
  access: {
    readOnly: "只讀",
    ownerOnly: "只限店主",
    askOwner: "只有工作台店主可在「設定 › 團隊」更改角色及地點。",
    viewer: { title: "檢視者權限", body: "你可查看證據、行動及成效；起草、審批、送出及帳單需要店主或經理。" },
    viewerAction: { title: "檢視者權限", body: "你可查看證據及紀錄；編輯、起草、審批及匯出需要店主或經理。" },
    viewerAssets: { title: "檢視者權限", body: "你可查看素材及其使用權；上載及確認使用權需要店主或經理。" },
    outOfScope: { title: "超出你負責的地點", body: "你可查看此行動；編輯、審批及送出需要店主或負責該地點的經理。" },
    createReadOnly: { title: "你的角色或地點只可查看", body: "在此開始新工作需要店主或負責此地點的經理。" },
    brand: { title: "{role}權限", body: "你可查看商戶資料；只有店主可以儲存更改。" },
    billing: { title: "只限店主", body: "你可查看方案及其限制；只有店主可以更改方案或付款。" },
    teamViewer: { title: "{role}權限", body: "你可查看工作台成員；只有店主可以管理成員及其權限。" },
    teamManager: { title: "{role}權限", body: "你可在負責的地點準備及審批工作；只有店主可以管理成員及帳單。" },
    forbidden: { title: "你的角色不可使用該頁面", body: "你的角色或地點不允許該頁面或操作，所以已帶你返回今日。" },
    notMember: { title: "無法開啟「{name}」", body: "你不是該工作台的成員，或你的權限已被移除。", hint: "請從下方選擇你可開啟的工作台，或請其店主邀請你。" },
  },
}

export const shellZhTW: ShellCopy = {
  brand: { name: "Kinnso OS", tagline: "由 Fimmick 提供" },
  skip: "跳到主要內容",
  nav: { label: "工作台", today: "今日", actions: "行動", insights: "成效", business: "店家", settings: "設定" },
  context: { owner: "店家工作台", review: "審閱與核准", newAction: "新行動" },
  switcher: "切換工作台或據點",
  allLocations: "所有據點",
  usage: { label: "核准後交付", note: "草稿、修改及拒絕不計用量" },
  notifications: { label: "通知", unread: "通知，{count} 則未讀" },
  assistant: { name: "問 Kinnso" },
  business: {
    title: "店家",
    lead: "我們對你店家的了解，以及資料來源。",
    profile: { title: "資料與事實", body: "品牌語氣與已確認的事實" },
    locations: { title: "據點", body: "每個據點及其 Google 商家檔案" },
    assets: { title: "素材", body: "照片與菜單，附使用權" },
    integrations: { title: "連接", body: "Google 商家檔案、Instagram、網站" },
  },
  settings: {
    title: "設定",
    lead: "誰可存取、你的方案，以及我們通知你什麼。",
    team: { title: "團隊與權限", body: "邀請同事並設定權限" },
    plan: { title: "方案與用量", body: "本月核准後交付與帳單" },
    notifications: { title: "通知", body: "選擇接收哪些更新" },
    activity: { title: "活動紀錄", body: "每個決定、匯出與掃描" },
  },
  locked: "僅限店家負責人",
  locations: {
    title: "據點",
    lead: "可在側欄頂部的選單切換據點。",
    primary: "主要據點",
    place: "已連結 Google 商家檔案",
    noPlace: "未連結 Google 商家檔案",
    switch: "開啟此據點",
    empty: "目前沒有據點。",
  },
  newAction: {
    title: "新行動",
    lead: "從目標、優惠或入門套組開始。未經你核准，不會發布任何內容。",
    label: "選擇開始方式",
    goal: { title: "從目標開始", body: "選擇想改善的地方" },
    offer: { title: "優惠", body: "推廣你確認的優惠" },
    pack: { title: "入門套組", body: "為一個據點準備第一批行動" },
  },
  views: {
    due: "到期",
    fixPack: "Fix Pack",
    fixPackLead: "由 Fimmick 團隊準備的草稿，請逐一核准或拒絕。",
  },
  queue: {
    eyebrow: "有實證支持的工作清單",
    title: "行動",
    lead: "依已量測的發現或你設定的目標排序。開啟一項即可審閱、核准及送出。",
    newAction: "新增",
    navLabel: "行動分類",
    tabs: { all: "全部", needs_input: "需要資料", drafts: "草稿", awaiting_approval: "待核准", completed: "已完成" },
  },
  panel: { label: "行動詳情", preview: "預覽", close: "關閉詳情", fullPage: "開啟完整頁面" },
  bulk: {
    title: "{count} 份草稿可核准",
    body: "沒有缺少資料或警告的評論回覆與社群貼文。請逐份閱讀後再核准。",
    open: "審閱並核准",
    dialogTitle: "核准草稿",
    dialogBody: "請勾選每份已閱讀的草稿。每次核准只鎖定該版本；匯出前不會發布，也不計用量。",
    read: "我已閱讀這份草稿",
    approve: "核准已選的 {count} 份",
    approving: "核准中…",
    cancel: "關閉",
    approved: "已核准",
    failed: "無法核准：請開啟審閱",
    done: "已核准 {total} 份中的 {approved} 份",
    version: "第 {n} 版",
  },
  gettingStarted: {
    title: "開始使用",
    lead: "五個步驟，完成第一份送出的工作。全部完成後，這份清單會自動隱藏。",
    progress: "已完成 {done} / {total}",
    done: "已完成",
    items: { ownership: "擁有權已確認", brand: "設定品牌語氣", google: "連結 Google 商家", approve: "核准第一份草稿", deliver: "匯出或複製" },
  },
  select: {
    signedInAs: "已登入：{email}",
    title: "選擇工作台",
    lead: "開啟時會再次確認您的角色與據點範圍。",
    open: "開啟 {name}",
    allLocations: "所有據點",
    locations: { one: "1 個據點", other: "{n} 個據點" },
    markets: { hk: "香港", tw: "台灣" },
    noScan: "尚未掃描",
    score: "分數 {n}",
    noScore: "尚無分數",
    coverage: "涵蓋率 {n}%",
    noCoverage: "涵蓋率未知",
    urgent: { zero: "沒有緊急行動", one: "1 項緊急行動", other: "{n} 項緊急行動" },
    emptyTitle: "尚未連結任何工作台",
    alreadyScanned: "我已經掃描過我的店家",
    signOut: "登出並改用另一個電子郵件登入",
  },
  auth: { help: "說明", helpLabel: "關於 Kinnso OS 的常見問題", home: "Kinnso OS 首頁" },
  access: {
    readOnly: "唯讀",
    ownerOnly: "僅限店家負責人",
    askOwner: "只有工作台負責人可以在「設定 › 團隊」變更角色與據點。",
    viewer: { title: "檢視者權限", body: "您可以檢視證據、行動與成效；起草、核准、送出與帳務需要負責人或經理。" },
    viewerAction: { title: "檢視者權限", body: "您可以檢視證據與紀錄；編輯、起草、核准與匯出需要負責人或經理。" },
    viewerAssets: { title: "檢視者權限", body: "您可以檢視素材與使用權；上傳與確認使用權需要負責人或經理。" },
    outOfScope: { title: "超出您負責的據點", body: "您可以檢視這個行動；編輯、核准與送出需要負責人或該據點的經理。" },
    createReadOnly: { title: "您的角色或據點僅能檢視", body: "在這裡開始新工作需要負責人或此據點的經理。" },
    brand: { title: "{role}權限", body: "您可以檢視店家資料；只有負責人可以儲存變更。" },
    billing: { title: "僅限店家負責人", body: "您可以檢視方案與限制；只有負責人可以變更方案或付款。" },
    teamViewer: { title: "{role}權限", body: "您可以檢視工作台成員；只有負責人可以管理成員與權限。" },
    teamManager: { title: "{role}權限", body: "您可以在負責的據點準備與核准工作；只有負責人可以管理成員與帳務。" },
    forbidden: { title: "您的角色無法使用該頁面", body: "您的角色或據點不允許該頁面或操作，因此已帶您回到今日。" },
    notMember: { title: "無法開啟「{name}」", body: "您不是該工作台的成員，或您的權限已被移除。", hint: "請從下方選擇您可以開啟的工作台，或請負責人邀請您。" },
  },
}
