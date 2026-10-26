/**
 * Workspace shell and owner navigation strings, reached as copy[locale].shell.
 * Four destinations: Today, To do, Better?, Shop. Settings URLs remain under Shop.
 * The assistant is "Ask Kinnso"; Chinese locales use shop language.
 */

type Item = { title: string; body: string }

export type ShellCopy = {
  brand: { name: string; tagline: string }
  skip: string
  nav: { label: string; today: string; actions: string; insights: string; business: string; settings: string; urgent: string }
  context: { owner: string; review: string; newAction: string }
  switcher: string
  allLocations: string
  usage: { label: string; note: string }
  notifications: { label: string; unread: string }
  assistant: { name: string }
  business: { title: string; lead: string; profile: Item; locations: Item; assets: Item; integrations: Item }
  settings: { title: string; lead: string; team: Item; plan: Item; notifications: Item; activity: Item; account: Item }
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
    more: string
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
  /** Empty states across the workspace (Phase 5): one line and at most one next step. */
  empty: {
    actions: Item & { action: string }
    filtered: Item & { action: string }
    due: Item
    fixPack: Item & { action: string; drafts: string }
    insights: Item & { action: string }
    assets: Item
    activity: Item
    notifications: Item
    locations: Item & { action: string }
  }
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
    waiting: string
    quiet: string
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
  nav: { label: "Workspace", today: "Today", actions: "To do", insights: "Better?", business: "Shop", settings: "Settings", urgent: "{count} urgent" },
  context: { owner: "Owner workspace", review: "Review & approve", newAction: "New action" },
  switcher: "Switch workspace or location",
  allLocations: "All locations",
  usage: { label: "Used this month", note: "1 use = the first copy or export of a confirmed text. Drafts and edits are free." },
  notifications: { label: "Notifications", unread: "Notifications, {count} unread" },
  assistant: { name: "Ask Kinnso" },
  business: {
    title: "Shop",
    lead: "Your shop’s details, people and settings.",
    profile: { title: "What we can say", body: "Your shop’s voice and confirmed facts" },
    locations: { title: "Locations", body: "Each location and its Google listing" },
    assets: { title: "Photos and menus", body: "Photos and menus, with usage rights" },
    integrations: { title: "Google and Instagram", body: "Google Business Profile, Instagram, website" },
  },
  settings: {
    title: "Settings",
    lead: "Who has access, your plan, and what we tell you.",
    team: { title: "Who can edit drafts", body: "Invite people and set their access" },
    plan: { title: "Plan and usage", body: "Approved deliveries this month and billing" },
    notifications: { title: "Notifications", body: "Choose which updates you get" },
    activity: { title: "Activity", body: "Every decision, export and scan" },
    account: { title: "Switch workspace or sign out", body: "Open another workspace, or sign out of this account" },
  },
  locked: "Owner only",
  locations: {
    title: "Locations",
    lead: "Choose a location below, or use the location menu at the top.",
    primary: "Main location",
    place: "Google listing linked",
    noPlace: "No Google listing linked",
    switch: "Open this location",
    empty: "No locations yet.",
  },
  newAction: {
    title: "New action",
    lead: "Choose what you want to write. You confirm the draft before using it.",
    label: "Choose how to start",
    goal: { title: "From a goal", body: "Pick what you want to improve" },
    offer: { title: "Offer", body: "Promote an offer you confirm" },
    pack: { title: "Starter pack", body: "A set of first actions for one location" },
  },
  views: {
    due: "Due",
    fixPack: "Fimmick drafts",
    fixPackLead: "Drafts prepared by the Fimmick team. Approve or reject each one.",
  },
  queue: {
    eyebrow: "Waiting for you",
    title: "To do",
    lead: "Pick one thing waiting for you, then open it to continue.",
    newAction: "New",
    navLabel: "More to do",
    more: "Due dates and Fimmick drafts",
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
  empty: {
    actions: { title: "Nothing to do right now", body: "New actions appear when a scan finds something worth fixing. You can also start from a goal.", action: "New action" },
    filtered: { title: "No actions match these filters", body: "Change or clear the filters. An empty list does not mean there is no evidence.", action: "Clear filters" },
    due: { title: "Nothing is due", body: "Give an action a due date and it appears here, with your next scan." },
    fixPack: { title: "No drafts from the Fimmick team", body: "When the team prepares review replies or posts for you, they wait here for your approval.", action: "Start your own", drafts: "Open your drafts" },
    insights: { title: "Insights appear after your first scan", body: "Each scan adds evidence. Changes show only once two comparable scans exist.", action: "Back to Today" },
    assets: { title: "No assets yet", body: "Upload photos or menus you have the right to use. Drafts only use assets you have approved." },
    activity: { title: "No activity yet", body: "Drafts, approvals, exports and scans are recorded here as they happen." },
    notifications: { title: "You're all caught up", body: "Scan results, approvals and exports will show up here." },
    locations: { title: "No locations yet", body: "A location is added when a scan of your business is claimed.", action: "Run a free scan" },
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
    waiting: "Something is waiting for you",
    quiet: "Nothing waiting",
    score: "Score {n}",
    noScore: "No score yet",
    coverage: "{n}% coverage",
    noCoverage: "Coverage unknown",
    urgent: { zero: "Nothing urgent", one: "1 urgent action", other: "{n} urgent actions" },
    emptyTitle: "No workspace linked yet",
    alreadyScanned: "I've already scanned my business",
    signOut: "Sign out and use another account",
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
  nav: { label: "工作台", today: "今日", actions: "待辦", insights: "好啲？", business: "舖", settings: "設定", urgent: "{count} 項緊急" },
  context: { owner: "店主工作台", review: "審閱與確認", newAction: "新行動" },
  switcher: "切換工作台或地點",
  allLocations: "所有地點",
  usage: { label: "已用次數", note: "確認後第一次複製或匯出先計 1 次；起稿同改稿唔計。" },
  notifications: { label: "通知", unread: "通知，{count} 則未讀" },
  assistant: { name: "問 Kinnso" },
  business: {
    title: "舖",
    lead: "舖頭資料、同事同設定，都喺呢度。",
    profile: { title: "可以講咩", body: "舖頭語氣同你確認過嘅資料" },
    locations: { title: "地點", body: "每個地點及其 Google 商家檔案" },
    assets: { title: "相片同餐牌", body: "上載相片同餐牌，揀邊啲可以用" },
    integrations: { title: "Google、Instagram", body: "Google 商家檔案、Instagram、網站" },
  },
  settings: {
    title: "設定",
    lead: "誰可存取、你的方案，以及我們通知你甚麼。",
    team: { title: "邊個可以改稿", body: "加同事，同埋揀邊個可以改" },
    plan: { title: "方案與用量", body: "本月已用次數及帳單" },
    notifications: { title: "通知", body: "選擇接收哪些更新" },
    activity: { title: "活動紀錄", body: "每個決定、匯出及掃描" },
    account: { title: "切換工作台或登出", body: "開啟另一個工作台，或登出此帳戶" },
  },
  locked: "只限店主",
  locations: {
    title: "地點",
    lead: "喺下面揀一間舖，或者用頁頂嘅地點選單。",
    primary: "主要地點",
    place: "已連結 Google 商家檔案",
    noPlace: "未連結 Google 商家檔案",
    switch: "開啟此地點",
    empty: "暫時未有地點。",
  },
  newAction: {
    title: "新行動",
    lead: "揀你想寫咩。寫好之後，由你確認先用。",
    label: "選擇開始方式",
    goal: { title: "由目標開始", body: "選擇想改善的地方" },
    offer: { title: "優惠", body: "推廣你確認的優惠" },
    pack: { title: "入門套裝", body: "為一個地點準備第一批行動" },
  },
  views: {
    due: "到期",
    fixPack: "Fimmick 嘅稿",
    fixPackLead: "由 Fimmick 團隊準備的草稿，請逐一確認或拒絕。",
  },
  queue: {
    eyebrow: "等你處理",
    title: "待辦",
    lead: "呢啲等緊你。揀一件，開嚟繼續做。",
    newAction: "新增",
    navLabel: "其他待辦",
    more: "到期日同 Fimmick 嘅稿",
    tabs: { all: "全部", needs_input: "需要資料", drafts: "草稿", awaiting_approval: "待確認", completed: "已完成" },
  },
  panel: { label: "行動詳情", preview: "預覽", close: "關閉詳情", fullPage: "開啟完整頁面" },
  bulk: {
    title: "{count} 份草稿可確認",
    body: "沒有缺少資料或警告的評論回覆及社交帖文。請逐份閱讀後才確認。",
    open: "審閱並確認",
    dialogTitle: "確認草稿",
    dialogBody: "請勾選每份已閱讀的草稿。每次確認只鎖定該版本；匯出前不會發佈，亦不計用量。",
    read: "我已閱讀這份草稿",
    approve: "確認已選的 {count} 份",
    approving: "確認中…",
    cancel: "關閉",
    approved: "已確認",
    failed: "未能確認：請開啟審閱",
    done: "已確認 {total} 份中的 {approved} 份",
    version: "第 {n} 版",
  },
  empty: {
    actions: { title: "暫時沒有待辦", body: "掃描發現值得處理的問題時，新行動會出現在這裡。你亦可由目標開始。", action: "新增行動" },
    filtered: { title: "沒有符合篩選條件的行動", body: "請更改或清除篩選。清單空白不代表沒有證據。", action: "清除篩選" },
    due: { title: "沒有到期項目", body: "為行動設定到期日後，它會與下次掃描一同顯示在這裡。" },
    fixPack: { title: "暫時沒有 Fimmick 團隊準備的草稿", body: "團隊為你準備評論回覆或帖文時，會在這裡等你確認。", action: "自行開始", drafts: "查看你的草稿" },
    insights: { title: "掃一次之後，先有結果睇", body: "每次掃描會記下查到嘅資料。要有兩次可以比，先會話你有咩變。", action: "返去今日" },
    assets: { title: "尚未有素材", body: "上載你有權使用的相片或餐牌。草稿只會使用你已確認的素材。" },
    activity: { title: "尚未有活動", body: "草稿、確認、匯出及掃描都會在發生時記錄在這裡。" },
    notifications: { title: "沒有新通知", body: "掃描結果、確認及匯出會在這裡顯示。" },
    locations: { title: "尚未有地點", body: "認領你商戶的掃描後，便會加入地點。", action: "免費掃描" },
  },
  gettingStarted: {
    title: "開始使用",
    lead: "五個步驟，完成第一份送出的工作。全部完成後，此清單會自動隱藏。",
    progress: "已完成 {done} / {total}",
    done: "已完成",
    items: { ownership: "擁有權已確認", brand: "設定品牌語氣", google: "連接 Google 商家", approve: "確認第一份草稿", deliver: "匯出或複製" },
  },
  select: {
    signedInAs: "已登入：{email}",
    title: "選擇工作台",
    lead: "開啟時會再次核對你的角色及地點範圍。",
    open: "開啟 {name}",
    allLocations: "所有地點",
    locations: { one: "1 個地點", other: "{n} 個地點" },
    markets: { hk: "香港", tw: "台灣" },
    noScan: "未掃過",
    waiting: "有一件等你",
    quiet: "暫時冇嘢等你",
    score: "評分 {n}",
    noScore: "暫未有評分",
    coverage: "覆蓋率 {n}%",
    noCoverage: "覆蓋率未知",
    urgent: { zero: "沒有緊急行動", one: "1 項緊急行動", other: "{n} 項緊急行動" },
    emptyTitle: "尚未連結任何工作台",
    alreadyScanned: "我已掃描過我的商戶",
    signOut: "登出並轉用另一個帳戶",
  },
  auth: { help: "說明", helpLabel: "關於 Kinnso OS 的常見問題", home: "Kinnso OS 首頁" },
  access: {
    readOnly: "只讀",
    ownerOnly: "只限店主",
    askOwner: "只有工作台店主可在「設定 › 團隊」更改角色及地點。",
    viewer: { title: "檢視者權限", body: "你可查看證據、行動及成效；起草、確認、送出及帳單需要店主或經理。" },
    viewerAction: { title: "檢視者權限", body: "你可查看證據及紀錄；編輯、起草、確認及匯出需要店主或經理。" },
    viewerAssets: { title: "檢視者權限", body: "你可查看素材及其使用權；上載及確認使用權需要店主或經理。" },
    outOfScope: { title: "超出你負責的地點", body: "你可查看此行動；編輯、確認及送出需要店主或負責該地點的經理。" },
    createReadOnly: { title: "你的角色或地點只可查看", body: "在此開始新工作需要店主或負責此地點的經理。" },
    brand: { title: "{role}權限", body: "你可查看商戶資料；只有店主可以儲存更改。" },
    billing: { title: "只限店主", body: "你可查看方案及其限制；只有店主可以更改方案或付款。" },
    teamViewer: { title: "{role}權限", body: "你可查看工作台成員；只有店主可以管理成員及其權限。" },
    teamManager: { title: "{role}權限", body: "你可在負責的地點準備及確認工作；只有店主可以管理成員及帳單。" },
    forbidden: { title: "你的角色不可使用該頁面", body: "你的角色或地點不允許該頁面或操作，所以已帶你返回今日。" },
    notMember: { title: "無法開啟「{name}」", body: "你不是該工作台的成員，或你的權限已被移除。", hint: "請從下方選擇你可開啟的工作台，或請其店主邀請你。" },
  },
}

export const shellZhTW: ShellCopy = {
  brand: { name: "Kinnso OS", tagline: "由 Fimmick 提供" },
  skip: "跳到主要內容",
  nav: { label: "工作台", today: "今天", actions: "待辦", insights: "有好一點？", business: "店裡", settings: "設定", urgent: "{count} 項緊急" },
  context: { owner: "店家工作台", review: "審閱與確認", newAction: "新行動" },
  switcher: "切換工作台或據點",
  allLocations: "所有據點",
  usage: { label: "已用次數", note: "確認後第一次複製或匯出才計 1 次；產生及修改草稿不計。" },
  notifications: { label: "通知", unread: "通知，{count} 則未讀" },
  assistant: { name: "問 Kinnso" },
  business: {
    title: "店裡",
    lead: "店裡的資料、夥伴和設定，都在這裡。",
    profile: { title: "可以說什麼", body: "店裡的語氣和你確認過的資料" },
    locations: { title: "據點", body: "每個據點及其 Google 商家檔案" },
    assets: { title: "照片和菜單", body: "店裡的照片、菜單，以及哪些可以用" },
    integrations: { title: "Google、Instagram", body: "Google 商家檔案、Instagram、網站" },
  },
  settings: {
    title: "設定",
    lead: "誰可存取、你的方案，以及我們通知你什麼。",
    team: { title: "誰可以改稿", body: "加入夥伴，選擇誰可以修改" },
    plan: { title: "方案與用量", body: "本月已用次數與帳單" },
    notifications: { title: "通知", body: "選擇接收哪些更新" },
    activity: { title: "活動紀錄", body: "每個決定、匯出與掃描" },
    account: { title: "切換工作台或登出", body: "開啟另一個工作台，或登出這個帳戶" },
  },
  locked: "僅限店家負責人",
  locations: {
    title: "據點",
    lead: "在下面選一家店，或用頁面上方的據點選單。",
    primary: "主要據點",
    place: "已連結 Google 商家檔案",
    noPlace: "未連結 Google 商家檔案",
    switch: "開啟此據點",
    empty: "目前沒有據點。",
  },
  newAction: {
    title: "新行動",
    lead: "選你想寫什麼。寫好後，由你確認再使用。",
    label: "選擇開始方式",
    goal: { title: "從目標開始", body: "選擇想改善的地方" },
    offer: { title: "優惠", body: "推廣你確認的優惠" },
    pack: { title: "入門套組", body: "為一個據點準備第一批行動" },
  },
  views: {
    due: "到期",
    fixPack: "Fimmick 準備的稿",
    fixPackLead: "由 Fimmick 團隊準備的草稿，請逐一確認或拒絕。",
  },
  queue: {
    eyebrow: "等你處理",
    title: "待辦",
    lead: "這些事在等你。選一件，打開繼續做。",
    newAction: "新增",
    navLabel: "其他待辦",
    more: "到期日與 Fimmick 準備的稿",
    tabs: { all: "全部", needs_input: "需要資料", drafts: "草稿", awaiting_approval: "待確認", completed: "已完成" },
  },
  panel: { label: "行動詳情", preview: "預覽", close: "關閉詳情", fullPage: "開啟完整頁面" },
  bulk: {
    title: "{count} 份草稿可確認",
    body: "沒有缺少資料或警告的評論回覆與社群貼文。請逐份閱讀後再確認。",
    open: "審閱並確認",
    dialogTitle: "確認草稿",
    dialogBody: "請勾選每份已閱讀的草稿。每次確認只鎖定該版本；匯出前不會發布，也不計用量。",
    read: "我已閱讀這份草稿",
    approve: "確認已選的 {count} 份",
    approving: "確認中…",
    cancel: "關閉",
    approved: "已確認",
    failed: "無法確認：請開啟審閱",
    done: "已確認 {total} 份中的 {approved} 份",
    version: "第 {n} 版",
  },
  empty: {
    actions: { title: "目前沒有待辦", body: "掃描發現值得處理的問題時，新行動會出現在這裡。您也可以從目標開始。", action: "新增行動" },
    filtered: { title: "沒有符合篩選條件的行動", body: "請變更或清除篩選。清單空白不代表沒有證據。", action: "清除篩選" },
    due: { title: "沒有到期項目", body: "為行動設定到期日後，它會和下次掃描一起顯示在這裡。" },
    fixPack: { title: "目前沒有 Fimmick 團隊準備的草稿", body: "團隊為您準備評論回覆或貼文時，會在這裡等您確認。", action: "自行開始", drafts: "查看您的草稿" },
    insights: { title: "完成第一次掃描後，成效會顯示在這裡", body: "每次掃描都會加入證據；要有兩次可比較的掃描，才會顯示變化。", action: "回到今日" },
    assets: { title: "尚無素材", body: "上傳您有權使用的照片或菜單。草稿只會使用您已確認的素材。" },
    activity: { title: "尚無活動", body: "草稿、確認、匯出與掃描都會在發生時記錄在這裡。" },
    notifications: { title: "沒有新通知", body: "掃描結果、確認與匯出會顯示在這裡。" },
    locations: { title: "尚無據點", body: "認領您店家的掃描後，就會加入據點。", action: "免費掃描" },
  },
  gettingStarted: {
    title: "開始使用",
    lead: "五個步驟，完成第一份送出的工作。全部完成後，這份清單會自動隱藏。",
    progress: "已完成 {done} / {total}",
    done: "已完成",
    items: { ownership: "擁有權已確認", brand: "設定品牌語氣", google: "連結 Google 商家", approve: "確認第一份草稿", deliver: "匯出或複製" },
  },
  select: {
    signedInAs: "已登入：{email}",
    title: "選擇工作台",
    lead: "開啟時會再次確認您的角色與據點範圍。",
    open: "開啟 {name}",
    allLocations: "所有據點",
    locations: { one: "1 個據點", other: "{n} 個據點" },
    markets: { hk: "香港", tw: "台灣" },
    noScan: "還沒掃過",
    waiting: "有件事等你",
    quiet: "暫時沒事等你",
    score: "分數 {n}",
    noScore: "尚無分數",
    coverage: "涵蓋率 {n}%",
    noCoverage: "涵蓋率未知",
    urgent: { zero: "沒有緊急行動", one: "1 項緊急行動", other: "{n} 項緊急行動" },
    emptyTitle: "尚未連結任何工作台",
    alreadyScanned: "我已經掃描過我的店家",
    signOut: "登出並改用另一個帳戶",
  },
  auth: { help: "說明", helpLabel: "關於 Kinnso OS 的常見問題", home: "Kinnso OS 首頁" },
  access: {
    readOnly: "唯讀",
    ownerOnly: "僅限店家負責人",
    askOwner: "只有工作台負責人可以在「設定 › 團隊」變更角色與據點。",
    viewer: { title: "檢視者權限", body: "您可以檢視證據、行動與成效；起草、確認、送出與帳務需要負責人或經理。" },
    viewerAction: { title: "檢視者權限", body: "您可以檢視證據與紀錄；編輯、起草、確認與匯出需要負責人或經理。" },
    viewerAssets: { title: "檢視者權限", body: "您可以檢視素材與使用權；上傳與確認使用權需要負責人或經理。" },
    outOfScope: { title: "超出您負責的據點", body: "您可以檢視這個行動；編輯、確認與送出需要負責人或該據點的經理。" },
    createReadOnly: { title: "您的角色或據點僅能檢視", body: "在這裡開始新工作需要負責人或此據點的經理。" },
    brand: { title: "{role}權限", body: "您可以檢視店家資料；只有負責人可以儲存變更。" },
    billing: { title: "僅限店家負責人", body: "您可以檢視方案與限制；只有負責人可以變更方案或付款。" },
    teamViewer: { title: "{role}權限", body: "您可以檢視工作台成員；只有負責人可以管理成員與權限。" },
    teamManager: { title: "{role}權限", body: "您可以在負責的據點準備與確認工作；只有負責人可以管理成員與帳務。" },
    forbidden: { title: "您的角色無法使用該頁面", body: "您的角色或據點不允許該頁面或操作，因此已帶您回到今日。" },
    notMember: { title: "無法開啟「{name}」", body: "您不是該工作台的成員，或您的權限已被移除。", hint: "請從下方選擇您可以開啟的工作台，或請負責人邀請您。" },
  },
}
