/**
 * First-run wizard strings (Phase 5), reached as copy[locale].onboarding.
 * Three steps: signed in, verify ownership, business basics. Ownership is
 * proven by Google or assigned by Fimmick, never self-declared (guardrail 15);
 * generated content uses owner-confirmed facts only (guardrail 14).
 * zh-HK is Hong Kong written Chinese; zh-TW uses Taiwan terms (店家, 負責人).
 * {name}, {ref}, {n} and {total} are filled with lib/copy-ui.ts `fill`.
 */

type Item = { title: string; body: string }

export type OnboardingCopy = {
  title: string
  intro: string
  claimBadge: string
  plan: { kept: string; growth: string; multi: string }
  steps: { label: string; signedIn: string; verify: string; basics: string; stepOf: string; done: string }
  ownership: { verified: string; assigned: string; pending: string }
  evidence: {
    badge: string
    title: string
    fallbackName: string
    ownership: string
    report: string
    viewReport: string
    website: string
    notMine: string
    notMineOwned: string
    notMineScan: string
  }
  noClaim: Item & { badge: string; action: string }
  google: Item & { action: string; why: string; whyAnswer: string; readOnly: string }
  fimmick: Item & {
    why: string
    whyAnswer: string
    timelineLabel: string
    timeline: [string, string, string]
    quoteRef: string
    quoteRefNoContacts: string
    contacts: { whatsapp: string; line: string; phone: string; email: string }
  }
  verified: Item
  basics: {
    intro: string
    businessName: string
    address: string
    connectionsLater: string
    moreSettings: string
    primaryLocation: string
    market: string
    timezone: string
    voice: string
    voices: { warm: string; professional: string; playful: string; direct: string }
    claims: string
    factsNote: string
    finish: string
    saving: string
    back: string
    continue: string
  }
  brandSaved: { title: string; voice: string; notSet: string; body: string; claims: string; open: string; later: string }
  markets: { hk: string; tw: string }
  errors: {
    lookup: string
    reload: string
    readSettings: string
    forbidden: string
    failed: string
    network: string
    resultUnavailable: string
    requestStatus: string
  }
}

export const onboardingEn: OnboardingCopy = {
  title: "Set up your workspace",
  intro: "Prove you run the business, check a few details, then see your first recommended action.",
  claimBadge: "Claiming report {ref}",
  plan: { kept: "Selected plan kept", growth: "Growth", multi: "Multi-location" },
  steps: { label: "Setup steps", signedIn: "Signed in", verify: "Verify ownership", basics: "Business basics", stepOf: "Step {n} of {total}", done: "Done" },
  ownership: { verified: "Verified with Google", assigned: "Assigned by Fimmick", pending: "Not verified yet" },
  evidence: {
    badge: "Report being claimed",
    title: "Is this your business? {name}",
    fallbackName: "this business",
    ownership: "Ownership",
    report: "Public report",
    viewReport: "View scan report",
    website: "Website",
    notMine: "Not your business?",
    notMineOwned: "This report is already attached to your workspace and cannot be detached here. Contact the Fimmick team and quote report {ref}.",
    notMineScan: "Scan the right business instead",
  },
  noClaim: {
    badge: "No report to claim",
    title: "Start from a scan",
    body: "A workspace starts from a scan report. Run a free scan, unlock the report, then claim it from the report page.",
    action: "Free scan",
  },
  google: {
    title: "Verify ownership with Google",
    body: "Sign in with the Google account that manages this business's Business Profile.",
    action: "Verify with Google",
    why: "why Google",
    whyAnswer: "Google confirms that you manage this Business Profile. Only then do we create the workspace and attach the report. We never match on email, and nothing is published.",
    readOnly: "We only read the Business Profile. You can disconnect at any time under Shop › Google and Instagram, which deletes the stored credential.",
  },
  fimmick: {
    title: "Ask Fimmick to assign your workspace",
    body: "The Fimmick team checks that you run the business, then assigns this report to your workspace.",
    why: "why we check",
    whyAnswer: "Ownership is proven, never self-declared, and we do not match on email. This stops anyone claiming a business they don't run.",
    timelineLabel: "What happens next",
    timeline: ["Get in touch and quote the report reference.", "We check that you run the business.", "We assign the workspace; then return to this page to finish."],
    quoteRef: "Quote report {ref} when you get in touch.",
    quoteRefNoContacts: "Contact your Fimmick representative and quote report {ref}.",
    contacts: { whatsapp: "WhatsApp us", line: "Message us on LINE", phone: "Call us", email: "Email us" },
  },
  verified: { title: "Ownership confirmed", body: "Check the prefilled details, then open your results." },
  basics: {
    intro: "Check your business details. We then open your scan results with the first recommended action.",
    businessName: "Business name",
    address: "Address (optional)",
    connectionsLater: "You can add Instagram, connect Google and set your brand voice later.",
    moreSettings: "More settings (optional)",
    primaryLocation: "Primary location",
    market: "Market",
    timezone: "Timezone",
    voice: "Brand voice",
    voices: { warm: "Warm, local and sincere", professional: "Concise and professional", playful: "Playful and energetic", direct: "Direct and matter-of-fact" },
    claims: "Approved facts (one per line)",
    factsNote: "Ingredients, allergens, prices and legal claims are only used once you confirm them.",
    finish: "Finish and see results",
    saving: "Saving…",
    back: "Back",
    continue: "Continue",
  },
  brandSaved: {
    title: "Saved brand settings",
    voice: "Brand voice",
    notSet: "Not set",
    body: "Your brand profile is kept as it is. To change it, open the business profile.",
    claims: "Saved facts",
    open: "Open business profile",
    later: "After setup, open the business profile from your workspace.",
  },
  markets: { hk: "Hong Kong", tw: "Taiwan" },
  errors: {
    lookup: "We couldn't check this report and your access just now. Nothing has been changed.",
    reload: "Try again",
    readSettings: "We couldn't read your saved settings. Try again before continuing.",
    forbidden: "Only the verified owner can finish this workspace.",
    failed: "We couldn't finish setup just now. Try again shortly.",
    network: "Network error. Check your connection and try again.",
    resultUnavailable: "We couldn't open your results just now. Your details are still here; try again.",
    requestStatus: "We couldn't read the status of your request. Try again before applying.",
  },
}

export const onboardingZhHK: OnboardingCopy = {
  title: "設定你的工作台",
  intro: "證明你經營這門生意，核對幾項資料，便可看到第一項建議待辦。",
  claimBadge: "認領報告 {ref}",
  plan: { kept: "已保留所選方案", growth: "增長方案", multi: "多地點方案" },
  steps: { label: "設定步驟", signedIn: "已登入", verify: "驗證擁有權", basics: "商戶基本資料", stepOf: "第 {n} 步，共 {total} 步", done: "已完成" },
  ownership: { verified: "已由 Google 驗證", assigned: "由 Fimmick 指派", pending: "尚未驗證" },
  evidence: {
    badge: "認領中的報告",
    title: "這是你的商戶嗎？{name}",
    fallbackName: "此商戶",
    ownership: "擁有權",
    report: "公開報告",
    viewReport: "查看掃描報告",
    website: "網站",
    notMine: "不是你的商戶？",
    notMineOwned: "此報告已附加到你的工作台，不能在此解除。請聯絡 Fimmick 團隊並提供報告編號 {ref}。",
    notMineScan: "改為掃描正確的商戶",
  },
  noClaim: {
    badge: "沒有要認領的報告",
    title: "先由一次掃描開始",
    body: "工作台由一份掃描報告建立。先免費掃描並解鎖報告，再從報告頁認領。",
    action: "免費掃描",
  },
  google: {
    title: "以 Google 驗證擁有權",
    body: "使用管理此商戶 Google 商家檔案的 Google 帳戶登入。",
    action: "以 Google 驗證",
    why: "為何使用 Google",
    whyAnswer: "Google 會確認你管理此商家檔案，我們才會建立工作台並附加報告。我們不會憑電郵配對，也不會發佈任何內容。",
    readOnly: "我們只會讀取商家檔案。你可隨時在「舖 › Google 同 Instagram」解除連接，我們儲存的憑證會一併刪除。",
  },
  fimmick: {
    title: "請 Fimmick 指派你的工作台",
    body: "Fimmick 團隊核實你經營此商戶後，會把報告指派到你的工作台。",
    why: "為何需要核實",
    whyAnswer: "擁有權必須經過驗證，不能自行聲明，我們亦不會憑電郵配對。這樣可防止他人認領不屬於自己的商戶。",
    timelineLabel: "接下來會怎樣",
    timeline: ["聯絡我們並提供報告編號。", "我們核實你經營此商戶。", "我們指派工作台，你再回到此頁完成設定。"],
    quoteRef: "聯絡時請提供報告編號 {ref}。",
    quoteRefNoContacts: "請聯絡你的 Fimmick 對接人，並提供報告編號 {ref}。",
    contacts: { whatsapp: "WhatsApp 聯絡", line: "LINE 聯絡", phone: "致電查詢", email: "電郵查詢" },
  },
  verified: { title: "擁有權已確認", body: "核對預填資料後，便可查看結果。" },
  basics: {
    intro: "核對商戶資料後，我們會開啟掃描結果及第一項建議待辦。",
    businessName: "商戶名稱",
    address: "地址（選填）",
    connectionsLater: "Instagram、Google 連接及品牌語氣，都可以稍後再設定。",
    moreSettings: "更多設定（選填）",
    primaryLocation: "主要地點",
    market: "市場",
    timezone: "時區",
    voice: "品牌語氣",
    voices: { warm: "親切、本地、真誠", professional: "簡潔、專業", playful: "活潑、有活力", direct: "直接、務實" },
    claims: "已確認的事實（每行一項）",
    factsNote: "材料、致敏原、價格及法律聲明，必須經你確認後才會使用。",
    finish: "完成並查看結果",
    saving: "儲存中…",
    back: "返回",
    continue: "繼續",
  },
  brandSaved: {
    title: "已儲存的品牌設定",
    voice: "品牌語氣",
    notSet: "未設定",
    body: "你的品牌資料會保持不變。如需修改，請開啟商戶資料。",
    claims: "已儲存的事實",
    open: "開啟商戶資料",
    later: "完成設定後，可從工作台開啟商戶資料。",
  },
  markets: { hk: "香港", tw: "台灣" },
  errors: {
    lookup: "暫時未能核對此報告及你的存取權。我們沒有作出任何更改。",
    reload: "再試一次",
    readSettings: "暫時未能讀取你已儲存的設定。請再試一次後才繼續。",
    forbidden: "只有已驗證的店主可以完成此工作台。",
    failed: "暫時未能完成設定，請稍後再試。",
    network: "網絡連線失敗，請檢查後再試。",
    resultUnavailable: "暫時未能開啟結果。你輸入的資料仍然保留，請再試一次。",
    requestStatus: "暫時未能讀取你的申請狀態。請再試一次後才申請。",
  },
}

export const onboardingZhTW: OnboardingCopy = {
  title: "設定您的工作台",
  intro: "證明您經營這家店，核對幾項資料，就能看到第一項建議待辦。",
  claimBadge: "認領報告 {ref}",
  plan: { kept: "已保留選擇的方案", growth: "成長方案", multi: "多據點方案" },
  steps: { label: "設定步驟", signedIn: "已登入", verify: "驗證擁有權", basics: "店家基本資料", stepOf: "第 {n} 步，共 {total} 步", done: "已完成" },
  ownership: { verified: "已透過 Google 驗證", assigned: "由 Fimmick 指派", pending: "尚未驗證" },
  evidence: {
    badge: "認領中的報告",
    title: "這是您的店家嗎？{name}",
    fallbackName: "這家店",
    ownership: "擁有權",
    report: "公開報告",
    viewReport: "查看掃描報告",
    website: "網站",
    notMine: "不是您的店家？",
    notMineOwned: "這份報告已附加到您的工作台，無法在這裡解除。請聯絡 Fimmick 團隊並提供報告編號 {ref}。",
    notMineScan: "改為掃描正確的店家",
  },
  noClaim: {
    badge: "沒有要認領的報告",
    title: "先從一次掃描開始",
    body: "工作台由一份掃描報告建立。先免費掃描並解鎖報告，再從報告頁面認領。",
    action: "免費掃描",
  },
  google: {
    title: "透過 Google 驗證擁有權",
    body: "使用管理這家店 Google 商家檔案的 Google 帳戶登入。",
    action: "透過 Google 驗證",
    why: "為什麼使用 Google",
    whyAnswer: "Google 會確認您管理這個商家檔案，我們才會建立工作台並附加報告。我們不會用電子郵件比對，也不會發佈任何內容。",
    readOnly: "我們只會讀取商家檔案。您可以隨時在「店裡 › Google 與 Instagram」中斷連線，我們儲存的憑證也會一併刪除。",
  },
  fimmick: {
    title: "請 Fimmick 指派您的工作台",
    body: "Fimmick 團隊確認您經營這家店後，會把報告指派到您的工作台。",
    why: "為什麼需要確認",
    whyAnswer: "擁有權必須經過驗證，不能自行聲明，我們也不會用電子郵件比對。這樣可以防止他人認領不屬於自己的店家。",
    timelineLabel: "接下來的流程",
    timeline: ["聯絡我們並提供報告編號。", "我們確認您經營這家店。", "我們指派工作台，您再回到這個頁面完成設定。"],
    quoteRef: "聯絡時請提供報告編號 {ref}。",
    quoteRefNoContacts: "請聯絡您的 Fimmick 窗口，並提供報告編號 {ref}。",
    contacts: { whatsapp: "WhatsApp 聯絡", line: "LINE 聯絡", phone: "電話洽詢", email: "電子郵件洽詢" },
  },
  verified: { title: "擁有權已確認", body: "核對預先填好的資料後，就能查看結果。" },
  basics: {
    intro: "核對店家資料後，我們會開啟掃描結果與第一項建議待辦。",
    businessName: "店家名稱",
    address: "地址（選填）",
    connectionsLater: "Instagram、Google 連線與品牌語氣，都可以之後再設定。",
    moreSettings: "更多設定（選填）",
    primaryLocation: "主要據點",
    market: "市場",
    timezone: "時區",
    voice: "品牌語氣",
    voices: { warm: "親切、在地、真誠", professional: "簡潔、專業", playful: "活潑、有活力", direct: "直接、務實" },
    claims: "已確認的事實（每行一項）",
    factsNote: "食材、過敏原、價格與法律聲明，必須經您確認後才會使用。",
    finish: "完成並查看結果",
    saving: "儲存中…",
    back: "返回",
    continue: "繼續",
  },
  brandSaved: {
    title: "已儲存的品牌設定",
    voice: "品牌語氣",
    notSet: "未設定",
    body: "您的品牌資料會維持不變。如需修改，請開啟店家資料。",
    claims: "已儲存的事實",
    open: "開啟店家資料",
    later: "完成設定後，可以從工作台開啟店家資料。",
  },
  markets: { hk: "香港", tw: "台灣" },
  errors: {
    lookup: "目前無法確認這份報告與您的存取權。我們沒有做任何變更。",
    reload: "再試一次",
    readSettings: "目前無法讀取您已儲存的設定。請再試一次後再繼續。",
    forbidden: "只有已驗證的負責人可以完成這個工作台。",
    failed: "目前無法完成設定，請稍後再試。",
    network: "網路連線失敗，請檢查後再試。",
    resultUnavailable: "目前無法開啟結果。您輸入的資料仍然保留，請再試一次。",
    requestStatus: "目前無法讀取您的申請狀態。請再試一次後再申請。",
  },
}
