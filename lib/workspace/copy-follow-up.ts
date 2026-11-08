import type { LocalizedText } from "@/lib/domain";
import type { AuditEvent } from "./audit";

/** A successful clipboard copy, never an assertion that it was posted. */
export const COPY_FOLLOW_UP_EVENT = "action.copy_follow_up_recorded" satisfies AuditEvent;
export type CopyFollowUpDecision = "pending" | "not_yet" | "later";
export interface HomeCopyFollowUp {
  id: string;
  workspaceId: string;
  actionId: string;
  locationId: string | null;
  versionId: string;
  versionNo: number;
  title: LocalizedText;
  canRecord: boolean;
}
export const copyFollowUpCopy = {
  en: { title: "Have you posted it?", body: "You copied this text. Tell us when you have put it up.", laterSaved: "Okay, we will ask again tomorrow.", posted: "Posted it", notYet: "Not yet", later: "Later", saved: "Noted. Your other task is ready on Today.", failed: "Could not save that answer. Try again.", unavailable: "Text copied. We could not save the reminder; you can still open this draft from To do." },
  "zh-HK": { title: "你貼咗未？", body: "你複製咗呢段文字，貼好就話我知。", laterSaved: "好，聽日再提你。", posted: "貼咗", notYet: "未貼", later: "遲啲", saved: "記低咗，可以睇返今日要做嘅嘢。", failed: "未記低到，再試一次。", unavailable: "文字複製咗，但未記低到提醒；你可以喺待辦開返張稿。" },
  "zh-TW": { title: "你貼上了嗎？", body: "你複製了這段文字，貼好後告訴我們。", laterSaved: "好，明天再提醒你。", posted: "貼好了", notYet: "還沒貼", later: "晚點", saved: "記下了，可以繼續看今天的事。", failed: "還沒存到，請再試一次。", unavailable: "文字已複製，但提醒未儲存；你仍可從待辦開啟草稿。" },
} as const;
