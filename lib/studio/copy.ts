import type { PrototypeLocale } from "@/lib/copy"

/**
 * Conversation Studio copy (design §7). One object per locale: the Studio is
 * rendered client-side and its server orchestrator also writes localised
 * message text, so both sides read the same table. The module is static and
 * small enough to belong to the page bundle; unlike the workspace dictionaries
 * it is not split per locale.
 *
 * Interpolated strings use `{name}` placeholders resolved by `formatStudioCopy`.
 */
export type StudioCopy = {
  transcript: { export: string; exporting: string; failed: string; empty: string }
  nav: { label: string; aria: string }
  rail: {
    title: string
    newChat: string
    search: string
    emptyTitle: string
    emptyBody: string
    untitled: string
    listLabel: string
    archive: string
    rename: string
    open: string
    close: string
  }
  thread: { loadEarlier: string }
  header: {
    title: string
    subtitle: string
    context: string
    hideContext: string
    newChat: string
    openStudio: string
  }
  empty: {
    eyebrow: string
    title: string
    body: string
    boundary: string
    actionStarterLabel: string
    actionStarterMessage: string
    starters: Array<{ id: string; label: string; message: string }>
  }
  composer: {
    label: string
    placeholder: string
    send: string
    sending: string
    stop: string
    hint: string
    tooLong: string
  }
  evidence: {
    title: string
    hint: string
    empty: string
    loading: string
    failed: string
    remove: string
    limit: string
    documents: string
    briefs: string
  }
  status: { reading: string; thinking: string; drafting: string; finishing: string }
  message: {
    you: string
    assistant: string
    copy: string
    copied: string
    copyFailed: string
    saveVersion: string
    savingVersion: string
    versionSaved: string
    reviewVersion: string
    openAction: string
    evidence: string
    documents: string
    artifactReady: string
    warnings: string
    retry: string
  }
  context: {
    title: string
    location: string
    latestScan: string
    score: string
    coverage: string
    observed: string
    noScan: string
    openActions: string
    newAction: string
    waitingReview: string
    google: string
    pendingInputs: string
    brandFacts: string
    none: string
    limit: string
  }
  errors: {
    unauthenticated: string
    forbidden: string
    not_found: string
    invalid_input: string
    rate_limited: string
    ai_paused: string
    ai_budget_reached: string
    ai_unavailable: string
    archived: string
    conversation_busy: string
    unavailable: string
    network: string
    stream: string
  }
  share: {
    title: string
    action: string
    hint: string
    members: string
    candidates: string
    roleEditor: string
    roleViewer: string
    add: string
    remove: string
    loading: string
    failed: string
    empty: string
    close: string
    owner: string
  }
  notices: {
    boundary: string
    viewer: string
    viewerShared: string
    aiUnavailable: string
    archived: string
    needsFacts: string
    noDraftTarget: string
    failed: string
  }
}

/** Replace `{name}` placeholders from a flat record; unknown keys are left visible. */
export function formatStudioCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

const en: StudioCopy = {
  transcript: { export: "Export transcript", exporting: "Exporting…", failed: "Could not export this transcript.", empty: "No messages in this conversation yet." },
  share: {
    title: "Share conversation",
    action: "Share",
    hint: "Only the creator can add or remove members.",
    members: "Members",
    candidates: "Add a teammate",
    roleEditor: "Can continue",
    roleViewer: "Can view",
    add: "Share",
    remove: "Remove",
    loading: "Loading…",
    failed: "Could not update sharing.",
    empty: "Not shared yet.",
    close: "Close",
    owner: "Owner",
  },

  evidence: {
    title: "Evidence",
    hint: "Choose a location to attach documents and approved search briefs.",
    empty: "No documents or approved search briefs for this location.",
    loading: "Loading evidence…",
    failed: "Could not load evidence.",
    remove: "Remove",
    limit: "Up to 5 items",
    documents: "Documents",
    briefs: "Search briefs",
  },

  nav: { label: "Studio", aria: "Conversation studio" },
  rail: {
    title: "Conversations",
    newChat: "New conversation",
    search: "Search conversations",
    emptyTitle: "No conversations yet",
    emptyBody: "Start one below and it will stay here across sessions.",
    untitled: "New conversation",
    listLabel: "Your conversations",
    archive: "Archive",
    rename: "Rename",
    open: "Open conversation",
    close: "Close conversations",
  },
  thread: { loadEarlier: "Load earlier messages" },
  header: {
    title: "Studio",
    subtitle: "One continuous conversation about this workspace",
    context: "Workspace context",
    hideContext: "Hide context",
    newChat: "New conversation",
    openStudio: "Open Studio",
  },
  empty: {
    eyebrow: "Ask, decide, draft",
    title: "What should we work on?",
    body: "I can see this workspace's latest scan, open actions, drafts and brand facts. Ask a question, or tell me what you want to get done.",
    boundary: "Nothing is approved, exported or published from this conversation. You confirm every version.",
    actionStarterLabel: "Help with: {title}",
    actionStarterMessage: "Help me work on \"{title}\". What should I do first?",
    starters: [
      { id: "starter_priorities", label: "What should I do first?", message: "What should I do first, and why?" },
      { id: "starter_changed", label: "What changed?", message: "What changed since the last comparable scan?" },
      { id: "starter_missing", label: "What details do you need?", message: "What details do you need from me before you can draft?" },
      { id: "starter_draft", label: "Draft a review reply", message: "Draft a reply to the unanswered Google reviews." },
      { id: "starter_ig", label: "Plan this week's IG post", message: "Help me plan and draft this week's Instagram post. Draft a caption and a short carousel outline, then offer to save it as a version for approval on the action page. Use only confirmed shop facts; ask me for the product/offer, dates, price and photos that are missing instead of inventing them." },
    ],
  },
  composer: {
    label: "Message the Studio",
    placeholder: "Ask about this workspace, or say what you want done…",
    send: "Send",
    sending: "Sending",
    stop: "Stop",
    hint: "Enter to send · Shift+Enter for a new line",
    tooLong: "That message is too long. Keep it under {max} characters.",
  },
  status: {
    reading: "Reading the latest evidence…",
    thinking: "Thinking with this workspace's evidence…",
    drafting: "Preparing a draft…",
    finishing: "Saving the answer…",
  },
  message: {
    you: "You",
    assistant: "Studio",
    copy: "Copy text",
    copied: "Copied",
    copyFailed: "Could not copy",
    saveVersion: "Save as a version",
    savingVersion: "Saving…",
    versionSaved: "Version saved. Review and approve it on the action page.",
    reviewVersion: "Review version",
    openAction: "Open action",
    evidence: "Evidence used",
    artifactReady: "Draft ready for review",
    documents: "Attached documents",
    warnings: "Before you use this",
    retry: "Try again",
  },
  context: {
    title: "Workspace context",
    location: "Location",
    latestScan: "Latest scan",
    score: "Score",
    coverage: "Coverage",
    observed: "Observed",
    noScan: "No scan for this location yet",
    openActions: "Open actions",
    newAction: "Create a new action",
    waitingReview: "Waiting for review",
    google: "Google connection",
    pendingInputs: "Need details",
    brandFacts: "Confirmed brand facts",
    none: "None",
    limit: "Read-only. The conversation cites these rows; it never changes them.",
  },
  errors: {
    unauthenticated: "Your session has expired. Sign in again to continue.",
    forbidden: "Your role or location scope does not allow this.",
    not_found: "That conversation no longer exists.",
    invalid_input: "That message could not be sent.",
    rate_limited: "You're sending messages quickly. Wait a moment and try again.",
    ai_paused: "AI drafting is paused for maintenance. Your conversation is unchanged.",
    ai_budget_reached: "The AI budget for this period is used up. Your conversation is unchanged.",
    ai_unavailable: "The AI provider is unavailable right now. Your conversation is unchanged.",
    archived: "This conversation is archived. Start a new one to continue.",
    conversation_busy: "An answer is already being written for this conversation.",
    unavailable: "Something went wrong. Nothing was changed.",
    network: "You appear to be offline. Check the connection and try again.",
    stream: "The answer stopped before it finished. Try again.",
  },
  notices: {
    boundary: "Drafts stay drafts until an authorised person approves one exact version. Nothing publishes automatically.",
    viewer: "You can ask questions here. Drafting needs an owner or manager in scope.",
    viewerShared: "This conversation is shared with you as read-only.",
    aiUnavailable: "The Studio cannot answer right now because the AI provider is unavailable. No message was sent.",
    archived: "This conversation is archived and read-only.",
    needsFacts: "I still need these confirmed details before drafting: {facts}.",
    noDraftTarget: "I could not match that request to an open action, so there is nothing safe to draft from yet.",
    failed: "I could not answer that turn. Nothing was approved, exported or published.",
  },
}

const zhHK: StudioCopy = {
  transcript: { export: "匯出對話記錄", exporting: "匯出中…", failed: "未能匯出對話記錄。", empty: "呢個對話未有訊息。" },
  share: {
    title: "分享討論",
    action: "分享",
    hint: "只有建立者可以加入或移除成員。",
    members: "成員",
    candidates: "加入團隊成員",
    roleEditor: "可以繼續對話",
    roleViewer: "只可查看",
    add: "分享",
    remove: "移除",
    loading: "載入中…",
    failed: "未能更新分享。",
    empty: "未分享。",
    close: "關閉",
    owner: "建立者",
  },

  evidence: {
    title: "證據",
    hint: "選擇一個分店，先可以附加文件同已確認搜尋簡報。",
    empty: "呢個分店未有文件或已確認搜尋簡報。",
    loading: "載入證據中…",
    failed: "未能載入證據。",
    remove: "移除",
    limit: "最多 5 項",
    documents: "文件",
    briefs: "搜尋簡報",
  },

  nav: { label: "對話工作台", aria: "對話工作台" },
  rail: {
    title: "對話",
    newChat: "新對話",
    search: "搜尋對話",
    emptyTitle: "還沒有對話",
    emptyBody: "在下方開始，對話會一直保留，下次回來可繼續。",
    untitled: "新對話",
    listLabel: "你的對話",
    archive: "封存",
    rename: "重新命名",
    open: "開啟對話",
    close: "關閉對話清單",
  },
  thread: { loadEarlier: "載入更早訊息" },
  header: {
    title: "對話工作台",
    subtitle: "就這個工作台，持續對話",
    context: "工作台資料",
    hideContext: "收起資料",
    newChat: "新對話",
    openStudio: "開啟對話工作台",
  },
  empty: {
    eyebrow: "提問、決定、起草",
    title: "我們先處理哪一件事？",
    body: "我看得到這個工作台最新的掃描、未完成行動、草稿及品牌事實。你可以直接提問，或告訴我想完成甚麼。",
    boundary: "這個對話不會核准、匯出或發佈任何內容；每個版本都由你確認。",
    actionStarterLabel: "幫我處理：{title}",
    actionStarterMessage: "幫我處理「{title}」。我應該先做甚麼？",
    starters: [
      { id: "starter_priorities", label: "我應該先做甚麼？", message: "我應該先做甚麼？為甚麼？" },
      { id: "starter_changed", label: "有甚麼變化？", message: "同上次可比較掃描相比，有甚麼變化？" },
      { id: "starter_missing", label: "你需要甚麼資料？", message: "起草之前，你需要我補充甚麼資料？" },
      { id: "starter_draft", label: "起草評論回覆", message: "為未回覆的 Google 評論起草回覆。" },
      { id: "starter_ig", label: "計劃今個星期 IG 帖文", message: "幫我計劃同起草今個星期嘅 Instagram 帖文。先出 caption 同簡短 carousel 大綱，再問我要唔要儲存成版本，去動作頁審批。只用已確認嘅舖頭資料；產品、日期、價錢、相片等如果未有，問我攞，唔好自己填。" },
    ],
  },
  composer: {
    label: "向工作台對話",
    placeholder: "問這個工作台的狀況，或直接說你想完成甚麼…",
    send: "傳送",
    sending: "傳送中",
    stop: "停止",
    hint: "Enter 傳送 · Shift+Enter 換行",
    tooLong: "訊息太長，請保持在 {max} 字以內。",
  },
  status: {
    reading: "正在讀取最新證據…",
    thinking: "正在根據這個工作台的證據思考…",
    drafting: "正在準備草稿…",
    finishing: "正在儲存回答…",
  },
  message: {
    you: "你",
    assistant: "工作台",
    copy: "複製文字",
    copied: "已複製",
    copyFailed: "未能複製",
    saveVersion: "儲存為版本",
    savingVersion: "儲存中…",
    versionSaved: "版本已儲存。請到行動頁審閱及核准。",
    reviewVersion: "審閱版本",
    openAction: "開啟行動",
    evidence: "引用的證據",
    artifactReady: "草稿已準備好審閱",
    documents: "已附加文件",
    warnings: "使用前請注意",
    retry: "再試一次",
  },
  context: {
    title: "工作台資料",
    location: "分店",
    latestScan: "最新掃描",
    score: "評分",
    coverage: "覆蓋率",
    observed: "觀察於",
    noScan: "此分店還沒有掃描",
    openActions: "未完成行動",
    newAction: "建立新行動",
    waitingReview: "等待審閱",
    google: "Google 連接",
    pendingInputs: "需要補充",
    brandFacts: "已確認品牌事實",
    none: "沒有",
    limit: "只讀。對話會引用這些資料，但不會改動它們。",
  },
  errors: {
    unauthenticated: "登入已逾時，請重新登入後繼續。",
    forbidden: "你的角色或分店範圍不允許這個操作。",
    not_found: "這個對話已不存在。",
    invalid_input: "未能傳送這則訊息。",
    rate_limited: "你傳送得太快了，請稍後再試。",
    ai_paused: "AI 草稿功能正在維護中，對話內容沒有改變。",
    ai_budget_reached: "本期的 AI 額度已用完，對話內容沒有改變。",
    ai_unavailable: "AI 供應商暫時無法使用，對話內容沒有改變。",
    archived: "這個對話已封存，請開始新對話。",
    conversation_busy: "這個對話正在產生回答，請稍等。",
    unavailable: "出了點問題，沒有改動任何內容。",
    network: "似乎離線了，請檢查網絡後再試。",
    stream: "回答中途中斷，請再試一次。",
  },
  notices: {
    boundary: "草稿在獲授權人士核准指定版本之前仍屬草稿，不會自動發佈。",
    viewer: "你可以在這裡提問；起草需要店主或範圍內的經理。",
    viewerShared: "呢個討論以唯讀方式分享畀你。",
    aiUnavailable: "AI 供應商暫時無法使用，工作台未能回答，亦沒有傳送訊息。",
    archived: "這個對話已封存，只供閱讀。",
    needsFacts: "起草前仍需要你確認以下資料：{facts}。",
    noDraftTarget: "未能把這項要求對應到未完成行動，暫時沒有可安全起草的基礎。",
    failed: "這一輪未能回答，沒有核准、匯出或發佈任何內容。",
  },
}

const zhTW: StudioCopy = {
  transcript: { export: "匯出對話記錄", exporting: "匯出中…", failed: "未能匯出對話記錄。", empty: "這個對話沒有訊息。" },
  share: {
    title: "分享討論",
    action: "分享",
    hint: "只有建立者可以加入或移除成員。",
    members: "成員",
    candidates: "加入團隊成員",
    roleEditor: "可以繼續對話",
    roleViewer: "只可查看",
    add: "分享",
    remove: "移除",
    loading: "載入中…",
    failed: "未能更新分享。",
    empty: "未分享。",
    close: "關閉",
    owner: "建立者",
  },

  evidence: {
    title: "證據",
    hint: "選擇一個分店，才能附加文件和已確認搜尋簡報。",
    empty: "這個分店沒有文件或已確認搜尋簡報。",
    loading: "載入證據中…",
    failed: "未能載入證據。",
    remove: "移除",
    limit: "最多 5 項",
    documents: "文件",
    briefs: "搜尋簡報",
  },

  nav: { label: "對話工作台", aria: "對話工作台" },
  rail: {
    title: "對話",
    newChat: "新對話",
    search: "搜尋對話",
    emptyTitle: "還沒有對話",
    emptyBody: "在下方開始，對話會一直保留，下次回來可繼續。",
    untitled: "新對話",
    listLabel: "你的對話",
    archive: "封存",
    rename: "重新命名",
    open: "開啟對話",
    close: "關閉對話清單",
  },
  thread: { loadEarlier: "載入更早訊息" },
  header: {
    title: "對話工作台",
    subtitle: "就這個工作區，持續對話",
    context: "工作區資料",
    hideContext: "收起資料",
    newChat: "新對話",
    openStudio: "開啟對話工作台",
  },
  empty: {
    eyebrow: "提問、決定、起草",
    title: "我們先處理哪一件事？",
    body: "我看得到這個工作區最新的掃描、未完成行動、草稿及品牌事實。你可以直接提問，或告訴我想完成什麼。",
    boundary: "這個對話不會核准、匯出或發布任何內容；每個版本都由你確認。",
    actionStarterLabel: "幫我處理：{title}",
    actionStarterMessage: "幫我處理「{title}」。我應該先做什麼？",
    starters: [
      { id: "starter_priorities", label: "我應該先做什麼？", message: "我應該先做什麼？為什麼？" },
      { id: "starter_changed", label: "有什麼變化？", message: "和上次可比較掃描相比，有什麼變化？" },
      { id: "starter_missing", label: "你需要什麼資料？", message: "起草之前，你需要我補充什麼資料？" },
      { id: "starter_draft", label: "起草評論回覆", message: "為未回覆的 Google 評論起草回覆。" },
      { id: "starter_ig", label: "計劃今個星期 IG 貼文", message: "幫我計劃和起草今個星期嘅 Instagram 貼文。先出 caption 和簡短 carousel 大綱，再問我要不要儲存成版本，去動作頁審批。只用已確認的店裡資料；產品、日期、價錢、相片等如果未有，問我拿，不要自己填。" },
    ],
  },
  composer: {
    label: "向工作台對話",
    placeholder: "問這個工作區的狀況，或直接說你想完成什麼…",
    send: "傳送",
    sending: "傳送中",
    stop: "停止",
    hint: "Enter 傳送 · Shift+Enter 換行",
    tooLong: "訊息太長，請維持在 {max} 字以內。",
  },
  status: {
    reading: "正在讀取最新證據…",
    thinking: "正在根據這個工作區的證據思考…",
    drafting: "正在準備草稿…",
    finishing: "正在儲存回答…",
  },
  message: {
    you: "你",
    assistant: "工作台",
    copy: "複製文字",
    copied: "已複製",
    copyFailed: "未能複製",
    saveVersion: "儲存為版本",
    savingVersion: "儲存中…",
    versionSaved: "版本已儲存。請到行動頁審閱及核准。",
    reviewVersion: "審閱版本",
    openAction: "開啟行動",
    evidence: "引用的證據",
    artifactReady: "草稿已準備好審閱",
    documents: "已附加文件",
    warnings: "使用前請注意",
    retry: "再試一次",
  },
  context: {
    title: "工作區資料",
    location: "分店",
    latestScan: "最新掃描",
    score: "評分",
    coverage: "覆蓋率",
    observed: "觀察於",
    noScan: "此分店還沒有掃描",
    openActions: "未完成行動",
    newAction: "建立新行動",
    waitingReview: "等待審閱",
    google: "Google 連結",
    pendingInputs: "需要補充",
    brandFacts: "已確認品牌事實",
    none: "沒有",
    limit: "唯讀。對話會引用這些資料，但不會改動它們。",
  },
  errors: {
    unauthenticated: "登入已逾時，請重新登入後繼續。",
    forbidden: "你的角色或分店範圍不允許這個操作。",
    not_found: "這個對話已不存在。",
    invalid_input: "未能傳送這則訊息。",
    rate_limited: "你傳送得太快了，請稍後再試。",
    ai_paused: "AI 草稿功能正在維護中，對話內容沒有改變。",
    ai_budget_reached: "本期的 AI 額度已用完，對話內容沒有改變。",
    ai_unavailable: "AI 供應商暫時無法使用，對話內容沒有改變。",
    archived: "這個對話已封存，請開始新對話。",
    conversation_busy: "這個對話正在產生回答，請稍等。",
    unavailable: "出了點問題，沒有改動任何內容。",
    network: "似乎離線了，請檢查網路後再試。",
    stream: "回答中途中斷，請再試一次。",
  },
  notices: {
    boundary: "草稿在獲授權人士核准指定版本之前仍屬草稿，不會自動發布。",
    viewer: "你可以在這裡提問；起草需要店主或範圍內的經理。",
    viewerShared: "這個討論以唯讀方式分享給你。",
    aiUnavailable: "AI 供應商暫時無法使用，工作台未能回答，也沒有傳送訊息。",
    archived: "這個對話已封存，僅供閱讀。",
    needsFacts: "起草前仍需要你確認以下資料：{facts}。",
    noDraftTarget: "未能把這項要求對應到未完成行動，暫時沒有可安全起草的基礎。",
    failed: "這一輪未能回答，沒有核准、匯出或發布任何內容。",
  },
}

export const studioCopy: Readonly<Record<PrototypeLocale, StudioCopy>> = Object.freeze({
  en,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
})

/** The single copy lookup used by every Studio module. */
export function studioText(locale: PrototypeLocale): StudioCopy {
  return studioCopy[locale] ?? studioCopy["zh-HK"]
}
