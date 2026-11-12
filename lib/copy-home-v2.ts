import type { PrototypeLocale } from "@/lib/copy"

/**
 * Owner Home v2 copy. Home answers one question — what needs me now — and
 * deliberately carries no performance score or evidence gallery; those belong
 * to Results, one click away.
 */
export type HomeCopyV2 = {
  title: string
  lead: string
  chooseLocation: string
  nextStep: string
  whyThis: string
  whyThisBody: string
  observed: string
  review: string
  open: string
  view: string
  waiting: string
  waitingLead: string
  seeAllTasks: string
  askTitle: string
  askBody: string
  askPlaceholder: string
  askCta: string
  askIg: string
  askReply: string
  askPlan: string
  month: string
  completed: string
  waitingCount: string
  openCount: string
  results: string
  noScanTitle: string
  noScanBody: string
  noScanCta: string
  quietTitle: string
  quietBody: string
  quietCta: string
  allLocationsTitle: string
  allLocationsBody: string
  viewerNote: string
}

const en: HomeCopyV2 = {
  title: "Today",
  lead: "One next step, the drafts waiting for you, and a way to ask Kinnso.",
  chooseLocation: "Choose location",
  nextStep: "Next step",
  whyThis: "Why this?",
  whyThisBody: "This is the highest-priority open task for the selected location.",
  observed: "Observed",
  review: "Review draft",
  open: "Open task",
  view: "View task",
  waiting: "Waiting for you",
  waitingLead: "Drafts that need your confirmation before anything is used.",
  seeAllTasks: "See all tasks",
  askTitle: "Ask Kinnso to write or change something",
  askBody: "Describe what you need in your own words. Kinnso drafts; you confirm before anything is used.",
  askPlaceholder: "What do you want to get done?",
  askCta: "Ask Kinnso",
  askIg: "Write an Instagram post",
  askReply: "Reply to reviews",
  askPlan: "Plan this week",
  month: "This month",
  completed: "completed",
  waitingCount: "waiting",
  openCount: "open",
  results: "See results",
  noScanTitle: "Start with one free scan",
  noScanBody: "Connect your shop once; Kinnso will show you what is worth fixing and draft the first task.",
  noScanCta: "Run a free scan",
  quietTitle: "Nothing needs you right now",
  quietBody: "You can start something new, or ask Kinnso to plan the next step.",
  quietCta: "Start a task",
  allLocationsTitle: "Choose one location to see its next step",
  allLocationsBody: "Today never combines locations into one score. Pick a shop or location to see what needs you.",
  viewerNote: "You can read tasks and drafts. An owner or manager confirms changes.",
}

const zhHK: HomeCopyV2 = {
  title: "今日",
  lead: "一個下一步、等你確認嘅稿，同埋問 Kinnso 嘅入口。",
  chooseLocation: "揀地點",
  nextStep: "下一步",
  whyThis: "點解係呢件？",
  whyThisBody: "呢件係所選地點入面，優先次序最高嘅待辦。",
  observed: "觀察到",
  review: "睇稿",
  open: "開始做",
  view: "睇詳情",
  waiting: "等你確認",
  waitingLead: "呢啲稿要你確認咗，先會用。",
  seeAllTasks: "睇晒所有待辦",
  askTitle: "叫 Kinnso 幫你寫或者改",
  askBody: "用你自己嘅講法講低要做咩。Kinnso 會起草，你確認咗先用。",
  askPlaceholder: "你想 Kinnso 幫你做咩？",
  askCta: "問 Kinnso",
  askIg: "寫個 Instagram 帖文",
  askReply: "回覆評論",
  askPlan: "計劃今個星期",
  month: "本月",
  completed: "已完成",
  waitingCount: "等你確認",
  openCount: "未完成",
  results: "睇成效",
  noScanTitle: "先免費掃描一次",
  noScanBody: "連接一次舖頭資料，Kinnso 就會話你知有咩值得改善，再幫你起草第一件待辦。",
  noScanCta: "免費掃描",
  quietTitle: "而家冇嘢一定要你做",
  quietBody: "你可以開一件新嘢，或者問 Kinnso 幫你計劃下一步。",
  quietCta: "開新待辦",
  allLocationsTitle: "揀一間舖，睇佢嘅下一步",
  allLocationsBody: "今日唔會將幾間舖砌成一個總分。揀一間舖或者地點，睇有咩要你做。",
  viewerNote: "你可以睇待辦同草稿；改動要由店主或經理確認。",
}

const zhTW: HomeCopyV2 = {
  title: "今天",
  lead: "一個下一步、等你確認的稿，還有問 Kinnso 的入口。",
  chooseLocation: "選擇據點",
  nextStep: "下一步",
  whyThis: "為什麼是這件？",
  whyThisBody: "這件是所選據點裡，優先順序最高的待辦。",
  observed: "觀察到",
  review: "看稿",
  open: "開始做",
  view: "看詳情",
  waiting: "等你確認",
  waitingLead: "這些稿要你確認後，才會使用。",
  seeAllTasks: "看所有待辦",
  askTitle: "請 Kinnso 幫你寫或改",
  askBody: "用你自己的說法寫下要做什麼。Kinnso 會起草，你確認後才使用。",
  askPlaceholder: "你想 Kinnso 幫你做什麼？",
  askCta: "問 Kinnso",
  askIg: "寫一篇 Instagram 貼文",
  askReply: "回覆評論",
  askPlan: "規劃這個星期",
  month: "本月",
  completed: "已完成",
  waitingCount: "等你確認",
  openCount: "未完成",
  results: "看成效",
  noScanTitle: "先免費掃描一次",
  noScanBody: "連接一次店裡資料，Kinnso 就會告訴你哪裡值得改善，再幫你起草第一件待辦。",
  noScanCta: "免費掃描",
  quietTitle: "現在沒有一定要你做的事",
  quietBody: "你可以開始一件新事，或問 Kinnso 幫你規劃下一步。",
  quietCta: "開新待辦",
  allLocationsTitle: "選一間店，看它的下一步",
  allLocationsBody: "今天不會把幾間店拼成一個總分。選一間店或據點，看有什麼要你做。",
  viewerNote: "你可以看待辦和草稿；改動要由店主或經理確認。",
}

export const homeCopyV2: Record<PrototypeLocale, HomeCopyV2> = {
  en,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
}
