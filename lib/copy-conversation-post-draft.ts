import type { PrototypeLocale } from "@/lib/copy";

export type PostDraftChannel = "facebook" | "instagram" | "threads" | "googleBusinessProfile";
export type PostDraftTone = "friendly" | "straightforward" | "playful";

export type PostDraftCopy = {
  coach: {
    title: string;
    prompt: string;
    trustLine: string;
    inputPlaceholder: string;
    startCta: string;
  };
  examples: {
    label: string;
    weeklyIg: string;
    newItem: string;
    hoursNotice: string;
    disclaimer: string;
  };
  clarify: {
    channel: { question: string; notSure: string };
    tone: { question: string; friendly: string; straightforward: string; playful: string; skip: string };
  };
  card: {
    heading: string;
    status: { draft: string };
    titleLabel: string;
    bodyLabel: string;
    imageSlotLabel: string;
    imageSlotHint: string;
    channelLabel: string;
    editCta: string;
    regenerateCta: string;
  };
  confirm: { primaryCta: string; helper: string; editResets: string };
  confirmed: { status: string; done: string };
  actions: {
    copy: string;
    copied: string;
    copiedGeneric: string;
    copyFailed: string;
    saveTodo: string;
    savedTodo: string;
    saveTodoFailed: string;
    editAgain: string;
  };
  channel: {
    facebook: string;
    instagram: string;
    threads: string;
    googleBusinessProfile: string;
    notConnected: string;
    notConnectedHint: string;
  };
  honesty: {
    willNotPost: string;
    aiDraftsOnly: string;
    notConnected: string;
    pendingVerification: string;
    scheduleUnsupported: string;
    publishUnsupported: string;
    scheduleRequestReply: string;
  };
  errors: { draftFailed: string; retryCta: string; emptyIntent: string };
  empty: { noDrafts: string; noConfirmed: string };
};

export const postDraftCopy: Record<PrototypeLocale, PostDraftCopy> = {
  en: {
    coach: {
      title: "Write one post — done in a few taps",
      prompt: "One line is enough. I’ll draft it; you confirm; you copy and post yourself — nothing goes out on its own.",
      trustLine: "Nothing posts automatically · You approve every version",
      inputPlaceholder: "e.g. Help me knock out this week’s IG post",
      startCta: "Draft it",
    },
    examples: {
      label: "Say it like you’d WhatsApp a friend:",
      weeklyIg: "Help me knock out this week’s IG post",
      newItem: "Tell people what’s new in the shop",
      hoursNotice: "Need a holiday hours notice for IG",
      disclaimer: "Examples only — say it your own way.",
    },
    clarify: {
      channel: { question: "Which channel is this post for? Labels only — nothing gets connected or posted.", notSure: "Not sure yet" },
      tone: { question: "Any tone you’d like? (Optional)", friendly: "Friendly", straightforward: "Straightforward", playful: "Playful", skip: "Skip" },
    },
    card: {
      heading: "Post draft",
      status: { draft: "Draft · Not confirmed" },
      titleLabel: "Title",
      bodyLabel: "Post text",
      imageSlotLabel: "Photo (optional)",
      imageSlotHint: "Photo idea only. Add your own photo when you post.",
      channelLabel: "For: {channel}",
      editCta: "Edit",
      regenerateCta: "Try another version",
    },
    confirm: {
      primaryCta: "Confirm draft",
      helper: "Confirm = this draft is done. Still won’t post — copy it and paste yourself.",
      editResets: "Edits need confirming again.",
    },
    confirmed: { status: "Confirmed draft · Ready to copy", done: "Done — one less thing to fuss over. Copy and take it." },
    actions: {
      copy: "Copy draft",
      copied: "Copied. Paste it into {channel} when you’re ready.",
      copiedGeneric: "Copied.",
      copyFailed: "Couldn’t copy. Select the text and copy it yourself.",
      saveTodo: "Save as to-do",
      savedTodo: "Saved to To do. Nothing has been posted.",
      saveTodoFailed: "Couldn’t save to To do. Try again.",
      editAgain: "Edit again",
    },
    channel: {
      facebook: "Facebook",
      instagram: "Instagram",
      threads: "Threads",
      googleBusinessProfile: "Google Business Profile",
      notConnected: "Not connected · Pending verification",
      notConnectedHint: "Labels only for now. Connecting {channel} isn’t available in this phase.",
    },
    honesty: {
      willNotPost: "Kinnso OS won’t post this for you. Copy it and post it yourself.",
      aiDraftsOnly: "AI helps draft. Until you confirm, this isn’t treated as sent.",
      notConnected: "No accounts are connected. Channel labels only shape the draft.",
      pendingVerification: "Pending verification",
      scheduleUnsupported: "Scheduling isn’t supported yet.",
      publishUnsupported: "Posting from Kinnso OS isn’t supported yet.",
      scheduleRequestReply: "I can’t schedule or post yet. I’ll draft it now — confirm it, copy it, then post it when you want.",
    },
    errors: {
      draftFailed: "Couldn’t draft this one. Nothing was posted.",
      retryCta: "Try again",
      emptyIntent: "Tell me what the post is about first.",
    },
    empty: { noDrafts: "No post drafts yet.", noConfirmed: "No confirmed drafts yet." },
  },
  "zh-HK": {
    coach: {
      title: "寫一則帖，搞掂一件事",
      prompt: "一句就夠。我幫你出草稿，你確認，再複製自己貼——唔會自動出街。",
      trustLine: "不會自動發佈 · 每個版本由你確認",
      inputPlaceholder: "例如：幫我搞掂今個星期呢則 IG",
      startCta: "一按出草稿",
    },
    examples: {
      label: "好似 WhatsApp 朋友咁講就得：",
      weeklyIg: "幫我搞掂今個星期呢則 IG",
      newItem: "同人講下舖頭有咩新嘢",
      hoursNotice: "假期營業時間，整則 IG 通告",
      disclaimer: "只係例子，用你自己嘅講法都得。",
    },
    clarify: {
      channel: { question: "呢則帖打算放邊個平台？只係標籤，唔會連接或者發佈。", notSure: "未決定" },
      tone: { question: "想要咩語氣？（可略過）", friendly: "親切", straightforward: "簡單直接", playful: "輕鬆啲", skip: "略過" },
    },
    card: {
      heading: "帖文草稿",
      status: { draft: "草稿 · 待確認" },
      titleLabel: "標題",
      bodyLabel: "正文",
      imageSlotLabel: "相片（可選）",
      imageSlotHint: "只係相片建議，貼帖時用返你自己張相。",
      channelLabel: "平台：{channel}",
      editCta: "改一改",
      regenerateCta: "換個版本",
    },
    confirm: {
      primaryCta: "確認草稿",
      helper: "確認＝呢份草稿搞掂。仍然唔會代你發——複製自己貼就得。",
      editResets: "改完要再確認一次。",
    },
    confirmed: { status: "已確認草稿 · 可以複製", done: "搞掂——少煩一樣。複製帶走啦。" },
    actions: {
      copy: "複製草稿",
      copied: "已複製，準備好就貼去 {channel}。",
      copiedGeneric: "已複製。",
      copyFailed: "複製唔到，請自己揀晒文字再複製。",
      saveTodo: "存做待辦",
      savedTodo: "已存入待辦，未有發佈任何內容。",
      saveTodoFailed: "存唔到入待辦，請再試。",
      editAgain: "再改",
    },
    channel: {
      facebook: "Facebook",
      instagram: "Instagram",
      threads: "Threads",
      googleBusinessProfile: "Google Business Profile",
      notConnected: "未連接／待核實",
      notConnectedHint: "暫時只係標籤；呢期未支援連接 {channel}。",
    },
    honesty: {
      willNotPost: "Kinnso OS 唔會代你發佈；複製後自己貼出去。",
      aiDraftsOnly: "AI 幫你起稿；確認前唔會當已發出。",
      notConnected: "未連接任何帳戶；平台標籤只用嚟調整草稿。",
      pendingVerification: "待核實",
      scheduleUnsupported: "暫時未支援排程。",
      publishUnsupported: "暫時未支援由 Kinnso OS 發佈。",
      scheduleRequestReply: "我暫時未可以幫你排程或者發佈。可以先出草稿——你確認後複製，到時自己貼出去。",
    },
    errors: {
      draftFailed: "今次出唔到草稿，冇發佈任何內容。",
      retryCta: "再試一次",
      emptyIntent: "講低想寫咩先。",
    },
    empty: { noDrafts: "暫時未有帖文草稿。", noConfirmed: "未有已確認草稿。" },
  },
  "zh-TW": {
    coach: {
      title: "寫一則貼文，搞定一件事",
      prompt: "一句就夠。我幫你出草稿，你確認，再複製自己貼——不會自動發布。",
      trustLine: "不會自動發布 · 每個版本由你確認",
      inputPlaceholder: "例如：幫我搞定這個星期的 IG",
      startCta: "一按出草稿",
    },
    examples: {
      label: "像 WhatsApp 朋友那樣說就行：",
      weeklyIg: "幫我搞定這個星期的 IG",
      newItem: "跟大家說店裡有什麼新東西",
      hoursNotice: "假期營業時間，做一則 IG 公告",
      disclaimer: "只是例子，用你自己的說法也可以。",
    },
    clarify: {
      channel: { question: "這則貼文打算放哪個平台？只是標籤，不會連接或發布。", notSure: "還沒決定" },
      tone: { question: "想要什麼語氣？（可略過）", friendly: "親切", straightforward: "簡單直接", playful: "輕鬆一點", skip: "略過" },
    },
    card: {
      heading: "貼文草稿",
      status: { draft: "草稿 · 待確認" },
      titleLabel: "標題",
      bodyLabel: "正文",
      imageSlotLabel: "照片（可選）",
      imageSlotHint: "只是照片建議，貼文時用你自己的照片。",
      channelLabel: "平台：{channel}",
      editCta: "改一改",
      regenerateCta: "換個版本",
    },
    confirm: {
      primaryCta: "確認草稿",
      helper: "確認＝這份草稿搞定。仍然不會代你發——複製自己貼就行。",
      editResets: "改完要再確認一次。",
    },
    confirmed: { status: "已確認草稿 · 可以複製", done: "搞定——少煩一樣。複製帶走啦。" },
    actions: {
      copy: "複製草稿",
      copied: "已複製，準備好就貼到 {channel}。",
      copiedGeneric: "已複製。",
      copyFailed: "複製不到，請自己選取文字再複製。",
      saveTodo: "存成待辦",
      savedTodo: "已存入待辦，沒有發布任何內容。",
      saveTodoFailed: "存不到待辦，請再試一次。",
      editAgain: "再改",
    },
    channel: {
      facebook: "Facebook",
      instagram: "Instagram",
      threads: "Threads",
      googleBusinessProfile: "Google Business Profile",
      notConnected: "未連接／待核實",
      notConnectedHint: "暫時只是標籤；這一期未支援連接 {channel}。",
    },
    honesty: {
      willNotPost: "Kinnso OS 不會代你發布；複製後自己貼出去。",
      aiDraftsOnly: "AI 幫你起稿；確認前不會當已發出。",
      notConnected: "未連接任何帳戶；平台標籤只用來調整草稿。",
      pendingVerification: "待核實",
      scheduleUnsupported: "暫時未支援排程。",
      publishUnsupported: "暫時未支援由 Kinnso OS 發布。",
      scheduleRequestReply: "我暫時未可以幫你排程或者發布。可以先出草稿——你確認後複製，到時自己貼出去。",
    },
    errors: {
      draftFailed: "這次出不到草稿，沒有發布任何內容。",
      retryCta: "再試一次",
      emptyIntent: "先講低想寫什麼。",
    },
    empty: { noDrafts: "暫時未有貼文草稿。", noConfirmed: "未有已確認草稿。" },
  },
};
