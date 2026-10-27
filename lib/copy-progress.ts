import type { PrototypeLocale } from "@/lib/copy"
import type { BadgeKey, ProfileItemKey } from "@/lib/workspace/progress"

/**
 * Today's progress panel, badges, photo strip and task-type labels. Every line
 * describes what the owner did or can do next; none claims a result.
 */
export type ProgressCopy = {
  title: string
  monthDone: string
  monthEmpty: string
  ringLabel: string
  streak: { none: string; one: string; many: string; keep: string }
  sources: string
  badgesTitle: string
  badgeEarned: string
  badgeLocked: string
  itemDone: string
  itemTodo: string
  nextBadge: string
  badges: Record<BadgeKey, { name: string; how: string }>
  profile: { title: string; levelOf: string; levels: [string, string, string, string]; next: string; open: string }
  profileItems: Record<ProfileItemKey, string>
  photos: { title: string; empty: string; add: string; manage: string; stockCredit: string }
  effortNote: string
}

export const progressCopy: Record<PrototypeLocale, ProgressCopy> = {
  en: {
    title: "Your month",
    monthDone: "{done} done · {open} to go",
    monthEmpty: "Nothing on your list this month yet.",
    ringLabel: "{percent}% of this month's tasks done",
    streak: { none: "Do one task this week to start a streak.", one: "1 week in a row", many: "{n} weeks in a row", keep: "Do one task this week to keep it going." },
    sources: "What we could check",
    badgesTitle: "Badges",
    badgeEarned: "Earned",
    badgeLocked: "Not yet",
    itemDone: "Done",
    itemTodo: "To do",
    nextBadge: "Next: {how}",
    badges: {
      first_confirm: { name: "First confirm", how: "confirm your first draft" },
      first_copy: { name: "First post out", how: "copy or export a confirmed text" },
      five_done: { name: "Five done", how: "finish 5 tasks" },
      profile_complete: { name: "Full profile", how: "fill in all 6 shop details" },
      streak_4: { name: "4-week streak", how: "do a task 4 weeks in a row" },
    },
    profile: { title: "Shop profile", levelOf: "{done} of {total} filled in", levels: ["Just started", "Getting there", "Almost done", "Complete"], next: "Next: {item}", open: "Fill in" },
    profileItems: { voice: "Brand voice", facts: "Seats, hours and other facts", claims: "Lines you're happy to say", photo: "A confirmed photo", google: "Google connected", instagram: "Instagram account" },
    photos: { title: "Your photos", empty: "Add photos of your shop and food. Kinnso only uses the ones you confirm.", add: "Add photos", manage: "All photos", stockCredit: "Sample photo · {credit} / Pexels" },
    effortNote: "These count what you did, not results. Results show on Better? after a comparable scan.",
  },
  "zh-HK": {
    title: "你今個月",
    monthDone: "做完 {done} 項 · 仲有 {open} 項",
    monthEmpty: "今個月未有待辦。",
    ringLabel: "今個月做完 {percent}%",
    streak: { none: "今個星期做一件，開始連續紀錄。", one: "連續 1 個星期", many: "連續 {n} 個星期", keep: "今個星期做一件，保持紀錄。" },
    sources: "今次查到邊啲",
    badgesTitle: "徽章",
    badgeEarned: "已拎到",
    badgeLocked: "未拎到",
    itemDone: "填咗",
    itemTodo: "未填",
    nextBadge: "下一個：{how}",
    badges: {
      first_confirm: { name: "第一次確認", how: "確認第一份草稿" },
      first_copy: { name: "第一次出稿", how: "複製或匯出一份確認咗嘅稿" },
      five_done: { name: "做完五件", how: "做完 5 項待辦" },
      profile_complete: { name: "資料齊晒", how: "填齊 6 項舖頭資料" },
      streak_4: { name: "連續四星期", how: "連續 4 個星期都做一件" },
    },
    profile: { title: "舖頭資料", levelOf: "填咗 {done} / {total} 項", levels: ["啱啱開始", "做緊", "差少少", "齊晒"], next: "下一步：{item}", open: "去填" },
    profileItems: { voice: "品牌語氣", facts: "座位、營業時間等資料", claims: "你肯講嘅句子", photo: "一張確認咗嘅相", google: "連接 Google", instagram: "Instagram 帳戶" },
    photos: { title: "你嘅相", empty: "上載舖頭同食物嘅相。Kinnso 只會用你確認咗嘅相。", add: "加相", manage: "所有相", stockCredit: "示意圖 · {credit} / Pexels" },
    effortNote: "呢度計嘅係你做咗幾多，唔係效果。效果要等可以比較嘅掃描，喺「好啲？」睇。",
  },
  "zh-TW": {
    title: "你這個月",
    monthDone: "完成 {done} 項 · 還有 {open} 項",
    monthEmpty: "這個月還沒有待辦。",
    ringLabel: "這個月完成 {percent}%",
    streak: { none: "這週做一件，開始連續紀錄。", one: "連續 1 週", many: "連續 {n} 週", keep: "這週做一件，保持紀錄。" },
    sources: "這次查到哪些",
    badgesTitle: "徽章",
    badgeEarned: "已取得",
    badgeLocked: "尚未取得",
    itemDone: "已填",
    itemTodo: "未填",
    nextBadge: "下一個：{how}",
    badges: {
      first_confirm: { name: "第一次確認", how: "確認第一份草稿" },
      first_copy: { name: "第一次發稿", how: "複製或匯出一份已確認的稿" },
      five_done: { name: "完成五件", how: "完成 5 項待辦" },
      profile_complete: { name: "資料齊全", how: "填齊 6 項店家資料" },
      streak_4: { name: "連續四週", how: "連續 4 週都做一件" },
    },
    profile: { title: "店家資料", levelOf: "已填 {done} / {total} 項", levels: ["剛開始", "進行中", "快完成", "齊全"], next: "下一步：{item}", open: "去填寫" },
    profileItems: { voice: "品牌語氣", facts: "座位、營業時間等資料", claims: "你願意說的句子", photo: "一張已確認的照片", google: "連接 Google", instagram: "Instagram 帳號" },
    photos: { title: "你的照片", empty: "上傳店面和餐點的照片。Kinnso 只會使用你確認的照片。", add: "新增照片", manage: "所有照片", stockCredit: "示意圖 · {credit} / Pexels" },
    effortNote: "這裡計算的是你做了多少，不是成效。成效要等可比較的掃描，在「有好一點？」查看。",
  },
}
