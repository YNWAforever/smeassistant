import type { PrototypeLocale } from "@/lib/copy";

/** Controlled descriptions of recorded findings; never the scan's explanatory prose. */
export const actionEvidenceCopy = {
  en: { recorded: "The scan flagged: {findings}.", websiteFaq: "Website FAQ schema", unavailable: "The recorded finding details are unavailable." },
  "zh-HK": { recorded: "掃描記錄到：{findings}。", websiteFaq: "網站常見問題結構化資料", unavailable: "暫時未能讀取已記錄嘅發現。" },
  "zh-TW": { recorded: "掃描記錄到：{findings}。", websiteFaq: "網站常見問題結構化資料", unavailable: "目前無法讀取已記錄的發現。" },
} satisfies Record<PrototypeLocale, { recorded: string; websiteFaq: string; unavailable: string }>;
