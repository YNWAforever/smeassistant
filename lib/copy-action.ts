/**
 * Action detail strings (Phase 6), reached as copy[locale].action: the draft
 * editor, approval and delivery panels, the history tab and their toasts.
 * Approval applies to one immutable version (guardrail 5); export is the only
 * delivery and the first export of a version is the one counted (guardrails 6, 7).
 * zh-HK is Hong Kong written Chinese; zh-TW keeps the zh-HK wording except where
 * Taiwan terms differ (店家, 核准, 量測, 據點).
 * {n}, {version} and {total} are filled with lib/copy-ui.ts `fill`.
 */

export type ActionCopy = {
  /** "Version {n}". */
  versionLabel: string
  noVersion: string
  guardrailBadge: { flagged: string; checked: string; notChecked: string }
  provenance: {
    aria: string
    scanEvidence: string
    finding: string
    action: string
    priorityRecorded: string
    agentInput: string
    inputsMissing: string
    inputsReady: string
    run: string
    notRun: string
    outputVersion: string
    approval: string
    unsaved: string
    export: string
    exportRecorded: string
    exportAfterApproval: string
    measurement: string
  }
  toasts: {
    runInProgress: string
    usagePending: string
    unreachable: string
    forbidden: string
    tooMany: string
    agentUnavailable: string
    failed: string
    factsNeeded: string
    runUnconfirmed: string
    runFailed: string
    versionCreated: string
    runCompleted: string
    fillAll: string
    checklistSaved: string
    inputsRecorded: string
    ownerReviewRecorded: string
    conflict: string
    nothingToSave: string
    emptyVersion: string
    savedAs: string
    cannotCreateVersion: string
    draftNotSaved: string
    saveBeforeApprove: string
    versionClosed: string
    alreadyApproved: string
    approved: string
    changesRequested: string
    rejected: string
    onlyApproved: string
    notApproved: string
    clipboard: string
    counted: string
    copiedAgain: string
    exportedAgain: string
    stillOffline: string
  }
  /** The role a member previews or holds, as the toolbar badge names it. */
  roles: { owner: string; manager: string; viewer: string }
  /** The same roles as the preview menu lists them. */
  roleOptions: { owner: string; manager: string; viewer: string }
  toolbar: { back: string; previewRole: string; offline: string; online: string }
  header: {
    unsaved: string
    unassigned: string
    nextLabel: string
    due: string
    next: { inspect: string; inputs: string; saveFirst: string; export: string; review: string; generate: string }
  }
  offline: { title: string; body: string; reconnect: string }
  tabs: { draft: string; evidence: string; workflow: string; history: string }
  /** The owner path on an action: edit, confirm, then send. Checklist actions do not use it. */
  ownerSteps: { aria: string; edit: string; confirm: string; send: string }
  editor: {
    generatedOutput: string
    approvedAsset: string
    approved: string
    sourceFinding: string
    sourcePreserved: string
    businessDetails: string
    businessDetailsHint: string
    editInBrand: string
    inputsAria: string
    neverGuesses: string
    assetPlaceholder: string
    textOnly: string
    noAssets: string
    goToAssets: string
    prefilled: string
    saveAndGenerate: string
    caption: string
    draft: string
    placeholder: string
    characters: string
    altText: string
    altTextNote: string
    guardrailTitle: string
    guardrailSubtitle: string
    checkedClean: string
    notAgentChecked: string
    noInventedFacts: string
    reconcileTitle: string
    reconcileBody: string
    reconcileReload: string
    lastRunFailed: string
    reviseWithOperator: string
    regenerate: string
    generate: string
    saveManual: string
    saving: string
    saveFailed: string
    unsaved: string
    saved: string
    noSavedDraft: string
    compareAria: string
    latestSaved: string
    altTextPrefix: string
    compareHelp: string
    keepEdits: string
    discardEdits: string
    waitingLatest: string
    conflictTitle: string
    conflictBody: string
    loadLatest: string
  }
  checklistPanel: { eyebrow: string; title: string; action: string; measurement: string; note: string }
  approval: {
    eyebrow: string
    approvedTitle: string
    safeDecision: string
    scope: string
    comment: string
    commentPlaceholder: string
    approved: string
    saveFirst: string
    approve: string
    dialogTitle: string
    dialogBody: string
    keepReviewing: string
    requestChanges: string
    reject: string
    rejectTitle: string
    rejectBody: string
    cancel: string
    rejectVersion: string
  }
  delivery: {
    eyebrow: string
    titleSocial: string
    title: string
    noConnector: string
    allowanceTitle: string
    allowanceBody: string
    billing: string
    exportAgain: string
    exportApproved: string
    copyText: string
    publishDirect: string
  }
  history: {
    eyebrow: string
    title: string
    none: string
    agent: string
    member: string
    safetyEyebrow: string
    safetyTitle: string
    noConflict: string
    idempotent: string
    noAudit: string
  }
  sticky: { unsaved: string; viewer: string; note: string; save: string; export: string; approve: string }
}

export const actionEn: ActionCopy = {
  versionLabel: "Version {n}",
  noVersion: "No version yet",
  guardrailBadge: { flagged: "{n} flagged", checked: "Checked", notChecked: "Not checked" },
  provenance: {
    aria: "Action provenance and lifecycle",
    scanEvidence: "Scan evidence",
    finding: "Finding",
    action: "Action",
    priorityRecorded: "Priority factors recorded",
    agentInput: "Agent input",
    inputsMissing: "{n} inputs missing",
    inputsReady: "Inputs ready",
    run: "Run",
    notRun: "Not run yet",
    outputVersion: "Output version",
    approval: "Approval",
    unsaved: "Unsaved changes",
    export: "Export",
    exportRecorded: "Export recorded",
    exportAfterApproval: "Available after exact-version approval",
    measurement: "Measurement",
  },
  toasts: {
    runInProgress: "A draft is still being written, so nothing new was started or charged; check back in a moment.",
    usagePending: "The previous generation is not yet confirmed. Reload its status first.",
    unreachable: "The server could not be reached; your text is kept on this device.",
    forbidden: "Your role or location scope does not allow this action.",
    tooMany: "Too many requests; try again shortly.",
    agentUnavailable: "No agent is available for this action yet.",
    failed: "The request failed. Try again, or contact Fimmick if it keeps happening.",
    factsNeeded: "The agent needs owner facts before drafting; nothing was guessed.",
    runUnconfirmed: "The generation is not yet confirmed; your existing draft is preserved. Reload its status.",
    runFailed: "Generation did not complete; your existing draft is preserved.",
    versionCreated: "Agent output created immutable version {n}; the previous draft was not overwritten.",
    runCompleted: "Run completed",
    fillAll: "Fill in every required input first.",
    checklistSaved: "Saved what you set.",
    inputsRecorded: "Owner inputs recorded; generating again.",
    ownerReviewRecorded: "Owner-supplied review recorded; generating again.",
    conflict: "Version conflict: load the latest version first.",
    nothingToSave: "There are no changes to save.",
    emptyVersion: "A version cannot be empty.",
    savedAs: "Saved as immutable version {n}",
    cannotCreateVersion: "Your current role or connection state cannot create a version.",
    draftNotSaved: "This draft was not saved and cannot become a version.",
    saveBeforeApprove: "Save changes before approving this exact version.",
    versionClosed: "This version is closed and can no longer be approved.",
    alreadyApproved: "{version} was already approved; nothing was duplicated.",
    approved: "{version} approved; safe export is now available.",
    changesRequested: "Changes requested for this version",
    rejected: "Version rejected",
    onlyApproved: "Only the selected saved and approved version can be exported.",
    notApproved: "This version is not approved.",
    clipboard: "Clipboard unavailable; copy the text manually.",
    counted: "Export recorded; one approved delivery was added to monthly usage.",
    copiedAgain: "Approved text copied; this version was already counted, nothing more was used.",
    exportedAgain: "Exported again; this version was already counted, nothing more was used.",
    stillOffline: "Still offline; check your connection.",
  },
  roles: { owner: "Owner", manager: "Manager", viewer: "Viewer" },
  roleOptions: { owner: "Owner", manager: "Manager", viewer: "Viewer" },
  toolbar: { back: "Back to actions", previewRole: "Preview role", offline: "Offline", online: "Online" },
  header: {
    unsaved: "Unsaved changes",
    unassigned: "Unassigned",
    nextLabel: "Direct next step",
    due: "Due ",
    next: {
      inspect: "Inspect the evidence",
      inputs: "Provide the required inputs",
      saveFirst: "Save a new version first",
      export: "Export approved version",
      review: "Review and approve {version}",
      generate: "Generate the first draft",
    },
  },
  offline: {
    title: "You are offline",
    body: "Text remains on this device, but save, approval and export stay blocked until the server confirms a safe transition.",
    reconnect: "Reconnect",
  },
  tabs: { draft: "Draft & approval", evidence: "Source evidence", workflow: "Workflow states", history: "Version & audit history" },
  ownerSteps: { aria: "What you do", edit: "Edit", confirm: "Confirm", send: "Copy" },
  editor: {
    generatedOutput: "Generated output",
    approvedAsset: "Approved asset · {n} available",
    approved: "Approved",
    sourceFinding: "Source finding",
    sourcePreserved: "Source preserved as evidence",
    businessDetails: "Business details used",
    businessDetailsHint: "See what the next draft will use",
    editInBrand: "Edit in Brand settings",
    inputsAria: "Required inputs",
    neverGuesses: "The agent never guesses facts. Provide the inputs below, then generate again.",
    assetPlaceholder: "Choose an approved asset or text only",
    textOnly: "Text only (no photo)",
    noAssets: "No approved assets yet; upload and confirm rights first, or choose text only.",
    goToAssets: "Go to assets",
    prefilled: "Prefilled from a fact already saved in Brand settings; edit as needed.",
    saveAndGenerate: "Save inputs and generate",
    caption: "Caption",
    draft: "Draft",
    placeholder: "No draft yet. Generate one, or write here and save it as version 1.",
    characters: "characters",
    altText: "Image alt text",
    altTextNote: "Required for accessible export; confirm it matches the approved asset.",
    guardrailTitle: "Brand guardrail check",
    guardrailSubtitle: "Generated content uses owner-confirmed facts only.",
    checkedClean: "This version was checked and nothing was flagged. It still needs your approval before export.",
    notAgentChecked: "This version was not agent-checked (edited by hand).",
    noInventedFacts: "Do not add ingredients, allergens, pricing or offer dates unless the owner confirmed them.",
    reconcileTitle: "The generation outcome is not confirmed",
    reconcileBody: "A draft may already have been created. Reload the saved draft and run status before deciding whether to generate again.",
    reconcileReload: "Reload draft and run status",
    lastRunFailed: "Last generation failed: ",
    reviseWithOperator: "Revise with operator as a new version",
    regenerate: "Regenerate with the agent as a new version",
    generate: "Generate a draft",
    saveManual: "Save manual edits as a new version",
    saving: "Saving…",
    saveFailed: "Save failed; your content is retained. Retry or resolve the version conflict.",
    unsaved: "Unsaved changes",
    saved: "Saved · {version}",
    noSavedDraft: "No saved draft yet",
    compareAria: "Compare drafts",
    latestSaved: "Latest saved draft for comparison",
    altTextPrefix: "Image alt text: ",
    compareHelp: "Compare this saved draft with your retained edits. Keeping your edits still requires saving a new version and a new approval.",
    keepEdits: "Keep my edits over Version {n}",
    discardEdits: "Discard my edits and use the latest draft",
    waitingLatest: "Waiting for the latest draft; your local edits are retained. Use Load latest safely to retry.",
    conflictTitle: "Another reviewer changed this output",
    conflictBody: "Unsaved text is preserved locally. Load the latest version, compare, then create a new version.",
    loadLatest: "Load latest safely",
  },
  checklistPanel: {
    eyebrow: "How this is completed",
    title: "You complete this one, not an agent",
    action: "Action",
    measurement: "Measurement",
    note: "There is no version to approve or export, and no approved delivery is counted.",
  },
  approval: {
    eyebrow: "Approval decision",
    approvedTitle: "{version} approved",
    safeDecision: "One safe owner decision",
    scope: "Approval applies only to this immutable version. Any edit must be saved as a new version and approved again.",
    comment: "Reviewer comment",
    commentPlaceholder: "Optional note for the audit trail",
    approved: "Approved",
    saveFirst: "Save changes before approving an exact version.",
    approve: "Confirm this version",
    dialogTitle: "Confirm this version?",
    dialogBody: "You are confirming {version}. Nothing posts automatically to Google or Instagram.",
    keepReviewing: "Keep reviewing",
    requestChanges: "Change the draft",
    reject: "Reject draft",
    rejectTitle: "Reject this version?",
    rejectBody: "The version remains in history but cannot be exported; a new version can be saved later.",
    cancel: "Cancel",
    rejectVersion: "Reject version",
  },
  delivery: {
    eyebrow: "Delivery",
    titleSocial: "Export for Instagram",
    title: "Export the approved version",
    noConnector: "Nothing posts automatically to Google or Instagram. Copy this text and paste it yourself.",
    allowanceTitle: "This month's approved-delivery allowance is used up",
    allowanceBody: "The version stays approved; upgrade the plan or wait for next month's allowance to export it.",
    billing: "View billing and plans",
    exportAgain: "Export again (not counted twice)",
    exportApproved: "Download text file",
    copyText: "Copy text",
    publishDirect: "Publish directly · Connection required",
  },
  history: {
    eyebrow: "Immutable output versions",
    title: "Version history",
    none: "No versions yet.",
    agent: "Agent",
    member: "Member",
    safetyEyebrow: "Conflict and idempotency",
    safetyTitle: "Safety states",
    noConflict: "No active conflict",
    idempotent: "Repeated approval or export returns the original transition without duplicate work or usage.",
    noAudit: "No audit events yet.",
  },
  sticky: {
    unsaved: "Unsaved",
    viewer: "Viewer access is read only",
    note: "Confirming does not publish. Copy the text to use it.",
    save: "Save",
    export: "Export",
    approve: "Approve",
  },
}

export const actionZhHK: ActionCopy = {
  versionLabel: "第 {n} 版",
  noVersion: "尚未有版本",
  guardrailBadge: { flagged: "{n} 項違規", checked: "已檢查", notChecked: "未經檢查" },
  provenance: {
    aria: "行動來源及生命週期",
    scanEvidence: "掃描證據",
    finding: "發現",
    action: "行動",
    priorityRecorded: "已記錄優先因素",
    agentInput: "Agent 輸入",
    inputsMissing: "缺 {n} 項資料",
    inputsReady: "資料齊備",
    run: "執行",
    notRun: "尚未執行",
    outputVersion: "輸出版本",
    approval: "審批",
    unsaved: "有未儲存修改",
    export: "匯出",
    exportRecorded: "已記錄匯出",
    exportAfterApproval: "核准指定版本後可用",
    measurement: "量度",
  },
  toasts: {
    runInProgress: "草稿仍在生成中，今次沒有重新開始，亦沒有額外收費；請稍候查看結果。",
    usagePending: "上次生成結果仍未確認，請先重新讀取狀態。",
    unreachable: "無法連接伺服器；文字已保留在此裝置。",
    forbidden: "你的角色或地點範圍不允許此操作。",
    tooMany: "請求過於頻繁，請稍後再試。",
    agentUnavailable: "此行動目前沒有可用的 Agent。",
    failed: "操作失敗，請再試一次；如持續出現，請聯絡 Fimmick。",
    factsNeeded: "生成前需要店主提供資料；沒有猜測任何事實。",
    runUnconfirmed: "生成結果仍未確認；現有草稿已保留，請重新讀取狀態。",
    runFailed: "生成未能完成；現有草稿已保留。",
    versionCreated: "Agent 輸出已建立為不可變更的第 {n} 版；沒有覆蓋原稿。",
    runCompleted: "執行已完成",
    fillAll: "請先填妥所有所需資料。",
    checklistSaved: "已記錄你設定的內容。",
    inputsRecorded: "已記錄店主資料；正在重新生成。",
    ownerReviewRecorded: "已記錄店主提供的評論；正在重新生成。",
    conflict: "版本衝突：請先載入最新版本。",
    nothingToSave: "目前沒有需要儲存的修改。",
    emptyVersion: "版本內容不能為空。",
    savedAs: "已儲存為不可變更的第 {n} 版",
    cannotCreateVersion: "目前角色或連線狀態不允許建立版本。",
    draftNotSaved: "此草稿未能儲存，無法建立版本。",
    saveBeforeApprove: "請先儲存修改，再核准指定版本。",
    versionClosed: "此版本已關閉，不能再核准。",
    alreadyApproved: "{version}早已核准；沒有重複記錄。",
    approved: "{version}已核准；現在可安全匯出。",
    changesRequested: "已要求修改此版本",
    rejected: "已拒絕此版本",
    onlyApproved: "只有目前已儲存及已核准的指定版本可以匯出。",
    notApproved: "此版本尚未核准。",
    clipboard: "無法存取剪貼簿；請手動複製。",
    counted: "已記錄匯出；本月核准後交付用量增加 1 次。",
    copiedAgain: "已複製核准文字；此版本已計算，不再重複扣除。",
    exportedAgain: "已再次匯出；此版本已計算，不再重複扣除。",
    stillOffline: "仍然離線；請檢查網絡連線。",
  },
  roles: { owner: "店主", manager: "經理", viewer: "檢視者" },
  roleOptions: { owner: "店主", manager: "經理", viewer: "檢視者" },
  toolbar: { back: "返回行動", previewRole: "預覽角色", offline: "離線", online: "在線" },
  header: {
    unsaved: "未儲存修改",
    unassigned: "未指派",
    nextLabel: "下一步",
    due: "到期：",
    next: {
      inspect: "查看證據",
      inputs: "提供所需資料",
      saveFirst: "先儲存新版本",
      export: "匯出已核准版本",
      review: "審閱並核准{version}",
      generate: "生成第一份草稿",
    },
  },
  offline: {
    title: "你目前離線",
    body: "文字會保留在此裝置，但儲存、審批及匯出會暫停，直至伺服器確認安全轉換。",
    reconnect: "重新連接",
  },
  tabs: { draft: "草稿與審批", evidence: "來源證據", workflow: "流程狀態", history: "版本及審計紀錄" },
  ownerSteps: { aria: "你要做嘅三步", edit: "改稿", confirm: "確認", send: "複製文字" },
  editor: {
    generatedOutput: "改稿",
    approvedAsset: "已核准素材 · 共 {n} 項可用",
    approved: "已核准",
    sourceFinding: "來源發現",
    sourcePreserved: "原始來源保留作證據",
    businessDetails: "生成所用的商戶資料",
    businessDetailsHint: "查看即將用於生成的資料",
    editInBrand: "在品牌設定中修改",
    inputsAria: "所需資料",
    neverGuesses: "Agent 不會猜測事實。請提供以下資料，再重新生成。",
    assetPlaceholder: "選擇已核准素材或純文字",
    textOnly: "純文字（不使用相片）",
    noAssets: "尚未有已核准素材；可先上載並確認使用權，或選擇純文字。",
    goToAssets: "前往素材",
    prefilled: "已按品牌設定中已儲存的資料預填，可自行修改。",
    saveAndGenerate: "儲存資料並重新生成",
    caption: "帖文說明",
    draft: "草稿",
    placeholder: "尚未生成草稿。按「生成草稿」或直接撰寫，儲存後成為第 1 版。",
    characters: "個字元",
    altText: "圖片替代文字",
    altTextNote: "無障礙匯出所需；請確認描述與已核准素材相符。",
    guardrailTitle: "品牌保障檢查",
    guardrailSubtitle: "生成內容只使用店主確認的事實。",
    checkedClean: "已檢查這個版本，未發現違規。仍需你審批後才可匯出。",
    notAgentChecked: "這個版本沒有經過 Agent 檢查（手動編輯）。",
    noInventedFacts: "除非店主已確認，否則不要加入食材、致敏原、價格或優惠日期。",
    reconcileTitle: "暫時未能確認生成結果",
    reconcileBody: "草稿可能已經生成。請先重新讀取草稿同執行狀態，確認後先決定是否再生成。",
    reconcileReload: "重新讀取草稿與執行狀態",
    lastRunFailed: "上次生成失敗：",
    reviseWithOperator: "用助理修改並建立新版本",
    regenerate: "以 Agent 重新生成為新版本",
    generate: "生成草稿",
    saveManual: "儲存手動修改為新版本",
    saving: "儲存中…",
    saveFailed: "儲存失敗；內容仍保留，請重試或處理版本衝突。",
    unsaved: "有未儲存修改",
    saved: "已儲存 · {version}",
    noSavedDraft: "尚未儲存草稿",
    compareAria: "比較草稿",
    latestSaved: "最新已儲存草稿（供比較）",
    altTextPrefix: "圖片替代文字：",
    compareHelp: "比較以上內容與你保留嘅修改，再選擇下一步。保留修改後仍須儲存為新版本並重新批准。",
    keepEdits: "保留我的修改，以第 {n} 版為基礎",
    discardEdits: "放棄本機修改，使用最新草稿",
    waitingLatest: "正在讀取最新草稿；本機修改仍保留。請再按「安全載入最新狀態」重試。",
    conflictTitle: "另一位審閱者已更新輸出",
    conflictBody: "未儲存文字仍保留在本機。載入最新版本、比較內容，再建立新版本。",
    loadLatest: "安全載入最新狀態",
  },
  checklistPanel: {
    eyebrow: "如何完成",
    title: "此行動由你完成，不經 Agent",
    action: "行動",
    measurement: "量度",
    note: "沒有可審批或匯出的版本，也不會扣除核准後交付額。",
  },
  approval: {
    eyebrow: "確認",
    approvedTitle: "{version}已核准",
    safeDecision: "確認呢一版",
    scope: "確認只計呢一版。改完要另存一版，再確認一次。",
    comment: "審閱者備註",
    commentPlaceholder: "審計紀錄的選填備註",
    approved: "已核准",
    saveFirst: "先儲存修改，才可核准指定版本。",
    approve: "確認呢一版",
    dialogTitle: "確認呢一版？",
    dialogBody: "只會確認{version}，唔會自動貼上 Google 或 Instagram。",
    keepReviewing: "繼續審閱",
    requestChanges: "唔啱，改返",
    reject: "拒絕草稿",
    rejectTitle: "拒絕這個版本？",
    rejectBody: "版本會保留在審計紀錄，但不能匯出；其後可另存新版本。",
    cancel: "取消",
    rejectVersion: "拒絕此版本",
  },
  delivery: {
    eyebrow: "發出",
    titleSocial: "發出去 Instagram",
    title: "發出呢一版",
    noConnector: "未連接發佈，所以唔會自動貼上 Google 或 Instagram。複製後要你自己貼上。",
    allowanceTitle: "本月核准後交付額已用完",
    allowanceBody: "版本仍已核准並保留；升級方案或等待下月額度後即可匯出。",
    billing: "查看帳單與方案",
    exportAgain: "再次匯出（不重複計算）",
    exportApproved: "下載文字檔",
    copyText: "複製",
    publishDirect: "直接發佈 · 需要連接",
  },
  history: {
    eyebrow: "不可變更的輸出版本",
    title: "版本紀錄",
    none: "尚未有版本。",
    agent: "Agent",
    member: "成員",
    safetyEyebrow: "衝突及冪等性",
    safetyTitle: "安全狀態",
    noConflict: "目前沒有衝突",
    idempotent: "重複審批或匯出會返回原本結果，不會重複工作或用量。",
    noAudit: "尚未有審計事件。",
  },
  sticky: {
    unsaved: "未儲存",
    viewer: "檢視者只讀",
    note: "確認唔會自動發佈；複製後要自己貼上",
    save: "儲存",
    export: "匯出",
    approve: "核准",
  },
}

export const actionZhTW: ActionCopy = {
  versionLabel: "第 {n} 版",
  noVersion: "尚未有版本",
  guardrailBadge: { flagged: "{n} 項違規", checked: "已檢查", notChecked: "未經檢查" },
  provenance: {
    aria: "行動來源及生命週期",
    scanEvidence: "掃描證據",
    finding: "發現",
    action: "行動",
    priorityRecorded: "已記錄優先因素",
    agentInput: "Agent 輸入",
    inputsMissing: "缺 {n} 項資料",
    inputsReady: "資料齊備",
    run: "執行",
    notRun: "尚未執行",
    outputVersion: "輸出版本",
    approval: "核准",
    unsaved: "有未儲存修改",
    export: "匯出",
    exportRecorded: "已記錄匯出",
    exportAfterApproval: "核准指定版本後可用",
    measurement: "量測",
  },
  toasts: {
    runInProgress: "草稿仍在產生中，這次沒有重新開始，也沒有額外計費；請稍候查看結果。",
    usagePending: "上次生成結果仍未確認，請先重新讀取狀態。",
    unreachable: "無法連接伺服器；文字已保留在此裝置。",
    forbidden: "你的角色或據點範圍不允許此操作。",
    tooMany: "請求過於頻繁，請稍後再試。",
    agentUnavailable: "此行動目前沒有可用的 Agent。",
    failed: "操作失敗，請再試一次；如持續出現，請聯絡 Fimmick。",
    factsNeeded: "生成前需要店家提供資料；沒有猜測任何事實。",
    runUnconfirmed: "生成結果仍未確認；現有草稿已保留，請重新讀取狀態。",
    runFailed: "生成未能完成；現有草稿已保留。",
    versionCreated: "Agent 輸出已建立為不可變更的第 {n} 版；沒有覆蓋原稿。",
    runCompleted: "執行已完成",
    fillAll: "請先填妥所有所需資料。",
    checklistSaved: "已記錄你設定的內容。",
    inputsRecorded: "已記錄店家資料；正在重新生成。",
    ownerReviewRecorded: "已記錄店家提供的評論；正在重新生成。",
    conflict: "版本衝突：請先載入最新版本。",
    nothingToSave: "目前沒有需要儲存的修改。",
    emptyVersion: "版本內容不能為空。",
    savedAs: "已儲存為不可變更的第 {n} 版",
    cannotCreateVersion: "目前角色或連線狀態不允許建立版本。",
    draftNotSaved: "此草稿未能儲存，無法建立版本。",
    saveBeforeApprove: "請先儲存修改，再核准指定版本。",
    versionClosed: "此版本已關閉，不能再核准。",
    alreadyApproved: "{version}早已核准；沒有重複記錄。",
    approved: "{version}已核准；現在可安全匯出。",
    changesRequested: "已要求修改此版本",
    rejected: "已拒絕此版本",
    onlyApproved: "只有目前已儲存及已核准的指定版本可以匯出。",
    notApproved: "此版本尚未核准。",
    clipboard: "無法存取剪貼簿；請手動複製。",
    counted: "已記錄匯出；本月核准後交付用量增加 1 次。",
    copiedAgain: "已複製核准文字；此版本已計算，不再重複扣除。",
    exportedAgain: "已再次匯出；此版本已計算，不再重複扣除。",
    stillOffline: "仍然離線；請檢查網絡連線。",
  },
  roles: { owner: "店主", manager: "經理", viewer: "檢視者" },
  roleOptions: { owner: "店家", manager: "經理", viewer: "檢視者" },
  toolbar: { back: "返回行動", previewRole: "預覽角色", offline: "離線", online: "在線" },
  header: {
    unsaved: "未儲存修改",
    unassigned: "未指派",
    nextLabel: "下一步",
    due: "到期：",
    next: {
      inspect: "查看證據",
      inputs: "提供所需資料",
      saveFirst: "先儲存新版本",
      export: "匯出已核准版本",
      review: "審閱並核准{version}",
      generate: "生成第一份草稿",
    },
  },
  offline: {
    title: "你目前離線",
    body: "文字會保留在此裝置，但儲存、核准及匯出會暫停，直至伺服器確認安全轉換。",
    reconnect: "重新連接",
  },
  tabs: { draft: "草稿與核准", evidence: "來源證據", workflow: "流程狀態", history: "版本及審計紀錄" },
  ownerSteps: { aria: "你要做的三步", edit: "改稿", confirm: "確認", send: "複製文字" },
  editor: {
    generatedOutput: "生成輸出",
    approvedAsset: "已核准素材 · 共 {n} 項可用",
    approved: "已核准",
    sourceFinding: "來源發現",
    sourcePreserved: "原始來源保留作證據",
    businessDetails: "生成所用的店家資料",
    businessDetailsHint: "查看即將用於生成的資料",
    editInBrand: "在品牌設定中修改",
    inputsAria: "所需資料",
    neverGuesses: "Agent 不會猜測事實。請提供以下資料，再重新生成。",
    assetPlaceholder: "選擇已核准素材或純文字",
    textOnly: "純文字（不使用相片）",
    noAssets: "尚未有已核准素材；可先上傳並確認使用權，或選擇純文字。",
    goToAssets: "前往素材",
    prefilled: "已按品牌設定中已儲存的資料預填，可自行修改。",
    saveAndGenerate: "儲存資料並重新生成",
    caption: "帖文說明",
    draft: "草稿",
    placeholder: "尚未生成草稿。按「生成草稿」或直接撰寫，儲存後成為第 1 版。",
    characters: "個字元",
    altText: "圖片替代文字",
    altTextNote: "無障礙匯出所需；請確認描述與已核准素材相符。",
    guardrailTitle: "品牌保障檢查",
    guardrailSubtitle: "生成內容只使用店家確認的事實。",
    checkedClean: "已檢查這個版本，未發現違規。仍需你核准後才可匯出。",
    notAgentChecked: "這個版本沒有經過 Agent 檢查（手動編輯）。",
    noInventedFacts: "除非店家已確認，否則不要加入食材、致敏原、價格或優惠日期。",
    reconcileTitle: "暫時未能確認生成結果",
    reconcileBody: "草稿可能已經生成。請先重新讀取草稿同執行狀態，確認後先決定是否再生成。",
    reconcileReload: "重新讀取草稿與執行狀態",
    lastRunFailed: "上次生成失敗：",
    reviseWithOperator: "用助理修改並建立新版本",
    regenerate: "以 Agent 重新生成為新版本",
    generate: "生成草稿",
    saveManual: "儲存手動修改為新版本",
    saving: "儲存中…",
    saveFailed: "儲存失敗；內容仍保留，請重試或處理版本衝突。",
    unsaved: "有未儲存修改",
    saved: "已儲存 · {version}",
    noSavedDraft: "尚未儲存草稿",
    compareAria: "比較草稿",
    latestSaved: "最新已儲存草稿（供比較）",
    altTextPrefix: "圖片替代文字：",
    compareHelp: "比較以上內容與你保留嘅修改，再選擇下一步。保留修改後仍須儲存為新版本並重新批准。",
    keepEdits: "保留我的修改，以第 {n} 版為基礎",
    discardEdits: "放棄本機修改，使用最新草稿",
    waitingLatest: "正在讀取最新草稿；本機修改仍保留。請再按「安全載入最新狀態」重試。",
    conflictTitle: "另一位審閱者已更新輸出",
    conflictBody: "未儲存文字仍保留在本機。載入最新版本、比較內容，再建立新版本。",
    loadLatest: "安全載入最新狀態",
  },
  checklistPanel: {
    eyebrow: "如何完成",
    title: "此行動由你完成，不經 Agent",
    action: "行動",
    measurement: "量測",
    note: "沒有可核准或匯出的版本，也不會扣除核准後交付額。",
  },
  approval: {
    eyebrow: "核准決定",
    approvedTitle: "{version}已核准",
    safeDecision: "一項安全的店家決定",
    scope: "核准只適用於這個不可變更版本。任何修改都必須另存新版本，再次核准。",
    comment: "審閱者備註",
    commentPlaceholder: "審計紀錄的選填備註",
    approved: "已核准",
    saveFirst: "先儲存修改，才可核准指定版本。",
    approve: "確認這一版",
    dialogTitle: "核准這個指定版本？",
    dialogBody: "決定會記錄在{version}，不會自動發佈或扣除用量。",
    keepReviewing: "繼續審閱",
    requestChanges: "不合適，修改草稿",
    reject: "拒絕草稿",
    rejectTitle: "拒絕這個版本？",
    rejectBody: "版本會保留在審計紀錄，但不能匯出；其後可另存新版本。",
    cancel: "取消",
    rejectVersion: "拒絕此版本",
  },
  delivery: {
    eyebrow: "送出",
    titleSocial: "匯出至 Instagram",
    title: "匯出已核准版本",
    noConnector: "尚未連接發布，所以不會自動貼上 Google 或 Instagram。複製後請自行貼上。",
    allowanceTitle: "本月核准後交付額已用完",
    allowanceBody: "版本仍已核准並保留；升級方案或等待下月額度後即可匯出。",
    billing: "查看帳單與方案",
    exportAgain: "再次匯出（不重複計算）",
    exportApproved: "下載文字檔",
    copyText: "複製",
    publishDirect: "直接發佈 · 需要連接",
  },
  history: {
    eyebrow: "不可變更的輸出版本",
    title: "版本紀錄",
    none: "尚未有版本。",
    agent: "Agent",
    member: "成員",
    safetyEyebrow: "衝突及冪等性",
    safetyTitle: "安全狀態",
    noConflict: "目前沒有衝突",
    idempotent: "重複核准或匯出會返回原本結果，不會重複工作或用量。",
    noAudit: "尚未有審計事件。",
  },
  sticky: {
    unsaved: "未儲存",
    viewer: "檢視者只讀",
    note: "確認不會自動發布；複製後請自行貼上",
    save: "儲存",
    export: "匯出",
    approve: "核准",
  },
}
