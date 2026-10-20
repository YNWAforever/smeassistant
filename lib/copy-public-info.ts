/**
 * Methodology and Trust page strings, reached as copy[locale].siteInfo.
 * Content moved here from the old landing page (comparison table, coverage
 * rules, how the work is prepared) and from inline text in
 * components/public-pages.tsx. Agent names are not shown to customers
 * (docs/ux target IA principle 3). zh-HK is Hong Kong written Chinese,
 * zh-TW uses Taiwan terms.
 */

type Item = { title: string; body: string }

export type PublicInfoCopy = {
  methodology: {
    title: string
    lead: string
    principles: Item[]
    coverage: { title: string; body: string; formula: string; withheld: string }
    comparable: { title: string; body: string }
    labels: { title: string }
    surfaces: { title: string; items: Array<{ badge: string; name: string; body: string }> }
    work: { title: string; lead: string; steps: Item[] }
    compare: { title: string; lead: string; caption: string; headers: string[]; rows: string[][] }
    limits: { title: string; body: string }
  }
  trust: {
    badge: string
    title: string
    pillars: Item[]
    approval: { title: string; steps: Item[] }
    retention: { title: string; body: string; link: string }
  }
}

export const infoEn: PublicInfoCopy = {
  methodology: {
    title: "How we handle evidence, coverage and change",
    lead: "The score helps you decide. It is not proof of revenue and never replaces the source evidence.",
    principles: [
      { title: "Evidence before score", body: "Every finding starts from a public source, with its time, state and a plain-language limitation." },
      { title: "Coverage before comparison", body: "Measured, unavailable, unsupported and failed stay distinct. Missing evidence is excluded, never scored as zero." },
      { title: "Comparable before change", body: "Two scans are compared only when the evidence and the scoring method allow it." },
    ],
    coverage: {
      title: "Coverage-aware scoring",
      body: "Unavailable or unsupported sources lower coverage, not the score. With too little measured evidence, the score is withheld.",
      formula: "Score = weighted measured signals ÷ eligible measured weight",
      withheld: "Withheld: too little measured",
    },
    comparable: {
      title: "When we show a change",
      body: "A change appears only between comparable scans. Otherwise we say why it cannot be compared.",
    },
    labels: { title: "Six labels against false certainty" },
    surfaces: {
      title: "What we check, and what we do not claim",
      items: [
        { badge: "Supported", name: "Google Search and Maps", body: "Organic, local and business-profile evidence." },
        { badge: "Supported · conditional", name: "Google AI Overview and AI Mode", body: "Only when those surfaces appear for the query." },
        { badge: "Supported · coverage varies", name: "Instagram and your website", body: "Subject to what the provider and public pages return." },
        { badge: "Not claimed", name: "ChatGPT and Perplexity", body: "Not claimed until reproducible first-party evidence exists." },
      ],
    },
    work: {
      title: "How the work is prepared",
      lead: "Four stages, one shared set of business facts. Nothing goes out without your approval.",
      steps: [
        { title: "Find evidence", body: "Check Google, Maps, your website and supported public sources for gaps we can verify." },
        { title: "Rank one priority", body: "Order actions by impact, urgency, effort, risk and strength of evidence." },
        { title: "Prepare and check", body: "Draft replies, posts or translations, then check them against your approved facts." },
        { title: "Approve and prove", body: "Keep versions and approvals, then rescan so the change can be compared." },
      ],
    },
    compare: {
      title: "How this differs from other options",
      lead: "AI tools generate, reports diagnose and agencies execute. Kinnso OS links one evidence trail from decision to rescan.",
      caption: "Category comparison between Kinnso OS and common alternatives",
      headers: ["What matters", "Kinnso OS", "Generic AI tools", "SEO audit reports", "Agency retainers"],
      rows: [
        ["Evidence", "Source, time, coverage and limits on every finding", "Prompt-led; you verify", "Periodic snapshot and issue list", "Depends on service and reporting"],
        ["What to do now", "One action ranked by impact, effort, risk and confidence", "You reconcile the answers", "Usually a list of fixes", "Contract and project schedule"],
        ["Owner control", "Explicit approval; never auto-published", "You review and copy", "You act after delivery", "Depends on delegated authority"],
        ["Delivery", "Export after approval; publish only when connected", "Copy into each channel", "Arrange separately", "Handled by the service team"],
        ["Proof", "Comparable rescan and change record", "Usually not tracked", "Wait for the next report", "Depends on reporting cycle"],
      ],
    },
    limits: {
      title: "Limitations",
      body: "Results vary by query, location, language, device, provider availability and time. Visibility changes do not prove changes in revenue, bookings or customer intent.",
    },
  },
  trust: {
    badge: "Security, privacy and human control",
    title: "One identity, one permission boundary, one audit trail",
    pillars: [
      { title: "Evidence-safe by design", body: "Public previews leave out owner-only details, raw provider data and internal identifiers." },
      { title: "Human approval is a boundary", body: "Generated work stays a draft until an authorised person approves one exact version." },
      { title: "Server-enforced scope", body: "Every change checks role, workspace, location, plan and integration permission on the server." },
      { title: "Append-only accountability", body: "Actions, edits, decisions and deliveries each leave an audit record." },
    ],
    approval: {
      title: "Delivery is a separate step",
      steps: [
        { title: "Prepare", body: "Inputs are scoped; untrusted content is treated as data, never as instructions." },
        { title: "Review one version", body: "Editing an approved version creates a new draft and resets approval." },
        { title: "Confirm the target", body: "Delivery needs an authorised role, a connected scope and a safe retry path." },
      ],
    },
    retention: {
      title: "Retention and deletion",
      body: "Scan evidence, drafts, assets, audit events, connection tokens and billing records each need their own purpose and retention rule. Customer data is not used for model training without explicit contractual consent.",
      link: "Read measurement limitations",
    },
  },
}

export const infoZhHK: PublicInfoCopy = {
  methodology: {
    title: "我們如何處理證據、覆蓋率及變化",
    lead: "評分協助你作決定，不是收入證明，亦不能取代原始證據。",
    principles: [
      { title: "先有證據，後有評分", body: "每項發現都由公開來源開始，並附時間、狀態及淺白的限制說明。" },
      { title: "先看覆蓋，再作比較", body: "已量度、未能取得、不支援及檢查失敗各自分開。缺少的證據會被排除，不會當成零分。" },
      { title: "可以比較，才談變化", body: "只有證據及評分方法容許時，兩次掃描才會互相比較。" },
    ],
    coverage: {
      title: "兼顧覆蓋率的評分",
      body: "未能取得或不支援的來源會降低覆蓋率，不會拉低評分。已量度的證據太少時，會暫不評分。",
      formula: "評分 = 已量度訊號的加權值 ÷ 合資格的已量度權重",
      withheld: "暫不評分：量度太少",
    },
    comparable: {
      title: "甚麼時候才顯示變化",
      body: "只有可比較的掃描之間才會顯示變化；否則會說明未能比較的原因。",
    },
    labels: { title: "六個標籤，避免虛假肯定" },
    surfaces: {
      title: "我們檢查甚麼，不聲稱甚麼",
      items: [
        { badge: "已支援", name: "Google 搜尋及地圖", body: "自然搜尋、本地搜尋及商家檔案證據。" },
        { badge: "有條件支援", name: "Google AI 摘要及 AI 模式", body: "只在相關搜尋出現這些版面時量度。" },
        { badge: "已支援 · 覆蓋因來源而異", name: "Instagram 及你的網站", body: "視乎來源及公開頁面可提供的資料。" },
        { badge: "不作聲稱", name: "ChatGPT 及 Perplexity", body: "未有可重現的第一方證據前，不作支援聲稱。" },
      ],
    },
    work: {
      title: "工作如何準備",
      lead: "四個階段，共用同一套商戶資料。未經你核准，不會發出任何內容。",
      steps: [
        { title: "找出證據", body: "檢查 Google、地圖、網站及支援的公開來源，找出可核實的缺口。" },
        { title: "排出一項優先", body: "按影響、急切性、工夫、風險及證據強度排列行動。" },
        { title: "準備並檢查", body: "草擬回覆、帖文或翻譯，再對照你已確認的資料檢查。" },
        { title: "核准並驗證", body: "保留版本及核准紀錄，再重新掃描，讓變化可以比較。" },
      ],
    },
    compare: {
      title: "與其他選擇有何不同",
      lead: "AI 工具負責生成，報告負責診斷，代理商負責執行。Kinnso OS 以同一條證據線，由決定連到重新掃描。",
      caption: "Kinnso OS 與其他常見選擇的類別比較",
      headers: ["比較重點", "Kinnso OS", "一般 AI 工具", "傳統 SEO 報告", "代理商服務"],
      rows: [
        ["證據", "逐項列出來源、時間、覆蓋及限制", "按提示生成，需自行核實", "定期快照及問題清單", "視服務及報告而定"],
        ["今日先做甚麼", "按影響、工夫、風險及信心排出一項", "由你自行比較答案", "通常是一份改善清單", "按合約及專案排程"],
        ["店主控制", "每項明確核准，不會自動發佈", "需自行把關及複製", "報告後自行執行", "視授權範圍而定"],
        ["交付", "核准後匯出；連接後才可發佈", "逐項複製到各渠道", "另行安排", "由服務團隊處理"],
        ["成效證明", "重新掃描並保留可比較紀錄", "一般不會追蹤", "等待下一份報告", "視匯報週期而定"],
      ],
    },
    limits: {
      title: "限制",
      body: "結果會因搜尋字詞、地點、語言、裝置、來源可用性及時間而異。能見度變化不能證明收入、預約或顧客意向有所改變。",
    },
  },
  trust: {
    badge: "安全、私隱與人工控制",
    title: "一個身份、一條權限界線、一份審計紀錄",
    pillars: [
      { title: "設計上保護證據", body: "公開預覽不包括店主專屬資料、來源原始資料及內部識別碼。" },
      { title: "人工核准是界線", body: "生成的內容在獲授權人士核准某一個版本前，都只是草稿。" },
      { title: "伺服器強制執行範圍", body: "每項變更都會在伺服器檢查角色、工作台、地點、方案及整合權限。" },
      { title: "只可追加的責任紀錄", body: "行動、編輯、決定及交付都會留下審計紀錄。" },
    ],
    approval: {
      title: "交付是獨立一步",
      steps: [
        { title: "準備", body: "輸入受範圍限制；不受信任的內容只當作資料，不會當作指令。" },
        { title: "審閱一個版本", body: "修改已核准的版本會建立新草稿，並重設核准。" },
        { title: "確認目標", body: "交付需要獲授權的角色、已連接的範圍及安全的重試方式。" },
      ],
    },
    retention: {
      title: "保留與刪除",
      body: "掃描證據、草稿、素材、審計事件、連接憑證及帳單紀錄，各自需要用途及保留規則。未有明確合約同意，客戶資料不會用於訓練模型。",
      link: "查看量度限制",
    },
  },
}

export const infoZhTW: PublicInfoCopy = {
  methodology: {
    title: "我們如何處理證據、涵蓋率與變化",
    lead: "評分協助你做決定，不是營收證明，也不能取代原始證據。",
    principles: [
      { title: "先有證據，再有評分", body: "每項發現都從公開來源開始，並附上時間、狀態與淺顯的限制說明。" },
      { title: "先看涵蓋，再做比較", body: "已量測、無法取得、不支援與檢查失敗各自分開。缺少的證據會被排除，不會當成零分。" },
      { title: "可以比較，才談變化", body: "只有證據與評分方式允許時，兩次掃描才會互相比較。" },
    ],
    coverage: {
      title: "兼顧涵蓋率的評分",
      body: "無法取得或不支援的來源會降低涵蓋率，不會拉低評分。已量測的證據太少時，會暫不評分。",
      formula: "評分 = 已量測訊號的加權值 ÷ 符合資格的已量測權重",
      withheld: "暫不評分：量測太少",
    },
    comparable: {
      title: "什麼時候才顯示變化",
      body: "只有可比較的掃描之間才會顯示變化；否則會說明無法比較的原因。",
    },
    labels: { title: "六個標籤，避免虛假的確定" },
    surfaces: {
      title: "我們檢查什麼，不宣稱什麼",
      items: [
        { badge: "已支援", name: "Google 搜尋與地圖", body: "自然搜尋、在地搜尋與商家檔案證據。" },
        { badge: "有條件支援", name: "Google AI 摘要與 AI 模式", body: "只在相關搜尋出現這些版面時量測。" },
        { badge: "已支援 · 涵蓋因來源而異", name: "Instagram 與你的網站", body: "視來源與公開頁面可提供的資料而定。" },
        { badge: "不做宣稱", name: "ChatGPT 與 Perplexity", body: "在有可重現的第一方證據前，不做支援宣稱。" },
      ],
    },
    work: {
      title: "工作如何準備",
      lead: "四個階段，共用同一套商家資料。未經你核准，不會送出任何內容。",
      steps: [
        { title: "找出證據", body: "檢查 Google、地圖、網站與支援的公開來源，找出可驗證的缺口。" },
        { title: "排出一項優先", body: "依影響、急迫性、工作量、風險與證據強度排列行動。" },
        { title: "準備並檢查", body: "草擬回覆、貼文或翻譯，再對照你已確認的資料檢查。" },
        { title: "核准並驗證", body: "保留版本與核准紀錄，再重新掃描，讓變化可以比較。" },
      ],
    },
    compare: {
      title: "與其他選擇有何不同",
      lead: "AI 工具負責生成，報告負責診斷，代理商負責執行。Kinnso OS 用同一條證據線，從決定串到重新掃描。",
      caption: "Kinnso OS 與其他常見選擇的類別比較",
      headers: ["比較重點", "Kinnso OS", "一般 AI 工具", "傳統 SEO 報告", "代理商服務"],
      rows: [
        ["證據", "逐項列出來源、時間、涵蓋與限制", "依提示生成，需自行驗證", "定期快照與問題清單", "視服務與報告而定"],
        ["今天先做什麼", "依影響、工作量、風險與信心排出一項", "由你自行比較答案", "通常是一份改善清單", "依合約與專案排程"],
        ["店家控制", "每項明確核准，不會自動發布", "需自行把關與複製", "報告後自行執行", "視授權範圍而定"],
        ["交付", "核准後匯出；連接後才可發布", "逐項複製到各通路", "另行安排", "由服務團隊處理"],
        ["成效證明", "重新掃描並保留可比較紀錄", "一般不會追蹤", "等待下一份報告", "視回報週期而定"],
      ],
    },
    limits: {
      title: "限制",
      body: "結果會因搜尋字詞、地點、語言、裝置、來源可用性與時間而不同。能見度變化不能證明營收、預約或顧客意向有所改變。",
    },
  },
  trust: {
    badge: "安全、隱私與人工控制",
    title: "一個身分、一條權限界線、一份稽核紀錄",
    pillars: [
      { title: "設計上保護證據", body: "公開預覽不包含店家專屬資料、來源原始資料與內部識別碼。" },
      { title: "人工核准是界線", body: "生成的內容在獲授權人員核准某一個版本前，都只是草稿。" },
      { title: "伺服器強制執行範圍", body: "每項變更都會在伺服器檢查角色、工作台、據點、方案與整合權限。" },
      { title: "只可追加的責任紀錄", body: "行動、編輯、決定與交付都會留下稽核紀錄。" },
    ],
    approval: {
      title: "交付是獨立的一步",
      steps: [
        { title: "準備", body: "輸入受範圍限制；不受信任的內容只當作資料，不會當作指令。" },
        { title: "審閱一個版本", body: "修改已核准的版本會建立新草稿，並重設核准。" },
        { title: "確認目標", body: "交付需要獲授權的角色、已連接的範圍與安全的重試方式。" },
      ],
    },
    retention: {
      title: "保留與刪除",
      body: "掃描證據、草稿、素材、稽核事件、連接憑證與帳單紀錄，各自需要用途與保留規則。未經明確合約同意，客戶資料不會用於訓練模型。",
      link: "查看量測限制",
    },
  },
}
