import type { WorkspaceRole } from "./authorize-workspace";

/** Display eligibility mirrors the server; a concrete permitted branch is required. */
export function canRescan(input: { tier: "lite" | "paid"; role?: WorkspaceRole; locationId: string | null; inScope?: boolean }): boolean {
  return input.tier === "paid" && (input.role === "owner" || input.role === "manager") && Boolean(input.locationId) && input.inScope !== false;
}
export const rescanOwnerCopy = {
  en: { comparison: "There is no earlier visit to compare. Check again after the next scan.", next: "Check again after the next scan.", prompt: "Take another look at the shop when you are ready.", retry: "Scan again" },
  "zh-HK": { comparison: "未有上次可以比。下次掃完再睇。", next: "下次掃完再睇。", prompt: "想再睇一次舖頭？", retry: "再掃一次" },
  "zh-TW": { comparison: "還沒有上次可以比較。下次掃完再來看。", next: "下次掃完再來看。", prompt: "想再看一次店裡的狀況？", retry: "再掃一次" },
} as const;
