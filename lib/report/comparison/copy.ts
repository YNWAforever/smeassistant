import type { PrototypeLocale } from "@/lib/copy";
import type { UnavailableReason } from "./types";

export const comparisonCopy = {
  en: {
    title: "Changes since the previous comparable scan", currentReportTitle: "Current scan results", currentReportBody: "This summary describes the current scan. A comparable score change has not been evaluated.", previousScan: "Previous scan", currentScan: "Current scan",
    increased: "Increased", decreased: "Decreased", unchanged: "Unchanged", sampleCoverage: "Sample coverage", instagramSample: "Instagram sampled posts", posts: "{n} posts",
    noSearch: "No comparable search measurements", evidence: "Evidence and observation dates", previous: "Previous", current: "Current",
    percentagePoints: "pp", omitted: "{n} query measurements were omitted from the previous scan and {m} from the current scan.",
    unavailableGroups: "{n} search groups were not comparable and are withheld.",
    unavailable: { no_history_access: "Comparing with earlier scans needs workspace access. Sign in as the business owner to see changes over time.", no_earlier_scan: "There is no earlier finished scan of this location to compare with yet.", insufficient_evidence: "An earlier scan exists, but one of the two didn't collect enough complete evidence to compare. A rescan with fuller coverage may make a comparison possible.", not_comparable: "Earlier scans checked different searches, settings or sources, so a like-for-like comparison isn't possible.", no_accessible_pair: "No authorized comparable scan is available.", missing_location: "Comparison is unavailable because the scan location was not recorded.", invalid_current_scan: "The current scan cannot be compared safely.", lookup_failed: "Comparison is temporarily unavailable.", history_limit: "No comparable scan was found within the bounded history." },
  },
  "zh-HK": {
    title: "與上次可比較掃描的變化", currentReportTitle: "目前掃描結果", currentReportBody: "此摘要說明目前掃描結果；可比較的評分變化尚未評估。", previousScan: "上次掃描", currentScan: "目前掃描",
    increased: "上升", decreased: "下降", unchanged: "不變", sampleCoverage: "樣本涵蓋範圍", instagramSample: "Instagram 已抽樣帖文", posts: "{n} 則帖文",
    noSearch: "沒有可比較的搜尋量度", evidence: "證據及觀察日期", previous: "上次", current: "目前",
    percentagePoints: "個百分點", omitted: "上次掃描省略了 {n} 項查詢量度，目前掃描省略了 {m} 項。",
    unavailableGroups: "有 {n} 組搜尋不可比較，已予保留。",
    unavailable: { no_history_access: "與較早的掃描比較需要工作台權限。請以商戶負責人身份登入，查看隨時間的變化。", no_earlier_scan: "此地點暫時未有較早而已完成的掃描可供比較。", insufficient_evidence: "已有較早的掃描，但其中一次未有收集到足夠完整的證據作比較。覆蓋較全面的重新掃描或可進行比較。", not_comparable: "較早的掃描檢查了不同的搜尋、設定或來源，因此無法作同等比較。", no_accessible_pair: "目前沒有已獲授權的可比較掃描。", missing_location: "掃描地點未有記錄，因此無法比較。", invalid_current_scan: "目前掃描未能安全比較。", lookup_failed: "暫時無法提供比較。", history_limit: "在有限的歷史記錄內找不到可比較掃描。" },
  },
  "zh-TW": {
    title: "與上次可比較掃描的變化", currentReportTitle: "目前掃描結果", currentReportBody: "此摘要說明目前掃描結果；可比較的評分變化尚未評估。", previousScan: "上次掃描", currentScan: "目前掃描",
    increased: "上升", decreased: "下降", unchanged: "不變", sampleCoverage: "樣本涵蓋範圍", instagramSample: "Instagram 已抽樣貼文", posts: "{n} 則貼文",
    noSearch: "沒有可比較的搜尋衡量結果", evidence: "證據與觀察日期", previous: "上次", current: "目前",
    percentagePoints: "個百分點", omitted: "上次掃描省略了 {n} 項查詢衡量，目前掃描省略了 {m} 項。",
    unavailableGroups: "有 {n} 組搜尋無法比較，已予保留。",
    unavailable: { no_history_access: "與較早的掃描比較需要工作台權限。請以店家負責人身分登入，查看隨時間的變化。", no_earlier_scan: "此據點目前還沒有較早且已完成的掃描可供比較。", insufficient_evidence: "已有較早的掃描，但其中一次沒有收集到足夠完整的證據來比較。涵蓋更完整的重新掃描或許能進行比較。", not_comparable: "較早的掃描檢查的是不同的搜尋、設定或來源，因此無法進行同基準比較。", no_accessible_pair: "目前沒有已授權的可比較掃描。", missing_location: "掃描地點未記錄，因此無法比較。", invalid_current_scan: "目前掃描無法安全比較。", lookup_failed: "暫時無法提供比較。", history_limit: "在有限的歷史記錄內找不到可比較掃描。" },
  },
} satisfies Record<PrototypeLocale, {
  title: string; currentReportTitle: string; currentReportBody: string; previousScan: string; currentScan: string; increased: string; decreased: string; unchanged: string;
  sampleCoverage: string; instagramSample: string; posts: string; noSearch: string; evidence: string; previous: string; current: string; percentagePoints: string;
  omitted: string; unavailableGroups: string; unavailable: Record<UnavailableReason, string>;
}>;