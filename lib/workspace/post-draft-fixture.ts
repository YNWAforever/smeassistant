import type { PrototypeLocale } from "@/lib/copy";

export interface PostDraftFixture {
  title: string;
  body: string;
}

export const POST_DRAFT_FIXTURES: Record<PrototypeLocale, readonly [PostDraftFixture, PostDraftFixture]> = {
  en: [
    {
      title: "Weekend opening hours",
      body: "Our weekend opening hours:\nSaturday 11:00 – 19:00\nSunday 12:00 – 18:00\nMessage us in advance if you have a question — see you at the weekend!",
    },
    {
      title: "Something new in the shop",
      body: "There’s something new in the shop this week.\nCome by and take a look — message us first if you’d like to ask.",
    },
  ],
  "zh-HK": [
    {
      title: "本週末營業時間",
      body: "本週末營業時間如下：\n星期六 11:00 – 19:00\n星期日 12:00 – 18:00\n歡迎預早查詢，週末見！",
    },
    {
      title: "舖頭今個星期有新嘢",
      body: "今個星期舖頭有新安排。\n歡迎過嚟睇吓，想問清楚可以先訊息我哋。",
    },
  ],
  "zh-TW": [
    {
      title: "本週末營業時間",
      body: "本週末營業時間如下：\n星期六 11:00 – 19:00\n星期日 12:00 – 18:00\n歡迎預早查詢，週末見！",
    },
    {
      title: "店裡這個星期有新東西",
      body: "這個星期店裡有新安排。\n歡迎過來看看，想問清楚可以先訊息我們。",
    },
  ],
};
