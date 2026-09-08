import type { PrototypeLocale } from "@/lib/copy";

export const comparisonCopy = {
  en: {
    title: "Changes since the previous comparable scan", previousScan: "Previous scan", currentScan: "Current scan",
    increased: "Increased", decreased: "Decreased", unchanged: "Unchanged", sampleCoverage: "Sample coverage",
    noSearch: "No comparable search measurements", evidence: "Evidence and observation dates", previous: "Previous", current: "Current",
    percentagePoints: "pp", omitted: "{n} query measurements were omitted from the previous scan and {m} from the current scan.",
    unavailableGroups: "{n} search groups were not comparable and are withheld.",
    unavailable: { no_accessible_pair: "No authorized comparable scan is available.", missing_location: "Comparison is unavailable because the scan location was not recorded.", invalid_current_scan: "The current scan cannot be compared safely.", lookup_failed: "Comparison is temporarily unavailable.", history_limit: "No comparable scan was found within the bounded history." },
  },
  "zh-HK": {
    title: "與上次可比較掃描的變化", previousScan: "上次掃描", currentScan: "目前掃描",
    increased: "上升", decreased: "下降", unchanged: "不變", sampleCoverage: "樣本涵蓋範圍",
    noSearch: "沒有可比較的搜尋量度", evidence: "證據及觀察日期", previous: "上次", current: "目前",
    percentagePoints: "個百分點", omitted: "上次掃描省略了 {n} 項查詢量度，目前掃描省略了 {m} 項。",
    unavailableGroups: "有 {n} 組搜尋不可比較，已予保留。",
    unavailable: { no_accessible_pair: "目前沒有已獲授權的可比較掃描。", missing_location: "掃描地點未有記錄，因此無法比較。", invalid_current_scan: "目前掃描未能安全比較。", lookup_failed: "暫時無法提供比較。", history_limit: "在有限的歷史記錄內找不到可比較掃描。" },
  },
  "zh-TW": {
    title: "與上次可比較掃描的變化", previousScan: "上次掃描", currentScan: "目前掃描",
    increased: "上升", decreased: "下降", unchanged: "不變", sampleCoverage: "樣本涵蓋範圍",
    noSearch: "沒有可比較的搜尋衡量結果", evidence: "證據與觀察日期", previous: "上次", current: "目前",
    percentagePoints: "個百分點", omitted: "上次掃描省略了 {n} 項查詢衡量，目前掃描省略了 {m} 項。",
    unavailableGroups: "有 {n} 組搜尋無法比較，已予保留。",
    unavailable: { no_accessible_pair: "目前沒有已授權的可比較掃描。", missing_location: "掃描地點未記錄，因此無法比較。", invalid_current_scan: "目前掃描無法安全比較。", lookup_failed: "暫時無法提供比較。", history_limit: "在有限的歷史記錄內找不到可比較掃描。" },
  },
} satisfies Record<PrototypeLocale, {
  title: string; previousScan: string; currentScan: string; increased: string; decreased: string; unchanged: string;
  sampleCoverage: string; noSearch: string; evidence: string; previous: string; current: string; percentagePoints: string;
  omitted: string; unavailableGroups: string; unavailable: Record<string, string>;
}>;