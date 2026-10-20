import { MARKETS } from "@sme-scanner/region";

import type { PrototypeLocale } from "@/lib/copy";

/**
 * Search and share descriptions, written for a results page rather than
 * stitched from on-page fragments. The stitched versions leaked raw
 * placeholders ("Prices shown in {currency} for the {market} market…",
 * "scoring {version}"), ran to 211 characters, and gave the sample report and
 * the demo workspace the same text. Server-only: imported by metadata, so none
 * of this reaches a browser bundle.
 */
type SeoPage = "pricing" | "methodology" | "sample" | "demoWorkspace";

const hk = MARKETS.hk.pricing.amount.toLocaleString("en-US");
const tw = MARKETS.tw.pricing.amount.toLocaleString("en-US");

const SEO: Record<PrototypeLocale, Record<SeoPage, string> & { demoWorkspaceTitle: string }> = {
  en: {
    pricing: `Start with a free evidence scan. The Growth plan is HK$${hk} or NT$${tw} per location a month, and only approved, exported work is counted.`,
    methodology: "How Kinnso OS scores Google, Instagram and search evidence: what each source measures, why missing evidence lowers coverage, not the score, and when scans compare.",
    sample: "A sample visibility report for a Hong Kong restaurant: every score shows its source, date and coverage, with three evidence-backed actions to take next.",
    demoWorkspace: "Explore the owner workspace with fixed sample data: prioritised actions, drafts awaiting approval, and before-and-after evidence from comparable scans.",
    demoWorkspaceTitle: "Demo workspace",
  },
  "zh-HK": {
    pricing: `先做一次免費證據掃描。增長方案每個地點每月 HK$${hk}（台灣 NT$${tw}），只計已核准並匯出的內容。`,
    methodology: "Kinnso OS 如何為 Google、Instagram 及搜尋證據評分：每個來源量度甚麼、為何缺少證據只降低覆蓋率而不拉低分數，以及兩次掃描何時可比較。",
    sample: "一份香港餐廳的示範能見度報告：每個分數都附來源、日期及覆蓋率，並列出三項有證據支持的下一步行動。",
    demoWorkspace: "以固定示範資料體驗店主工作台：已排序的行動、待審批的草稿，以及可比較掃描的前後證據。",
    demoWorkspaceTitle: "示範工作台",
  },
  "zh-TW": {
    pricing: `先做一次免費證據掃描。成長方案每個據點每月 NT$${tw}（香港 HK$${hk}），只計已核准並匯出的內容。`,
    methodology: "Kinnso OS 如何為 Google、Instagram 及搜尋證據評分：每個來源量測什麼、為何缺少證據只降低涵蓋率而不拉低分數，以及兩次掃描何時可比較。",
    sample: "一份香港餐廳的範例能見度報告：每個分數都附來源、日期及涵蓋率，並列出三項有證據支持的下一步行動。",
    demoWorkspace: "以固定範例資料體驗店家工作台：已排序的行動、待核准的草稿，以及可比較掃描的前後證據。",
    demoWorkspaceTitle: "範例工作台",
  },
};

export function seoDescription(locale: PrototypeLocale, page: SeoPage): string {
  return SEO[locale][page];
}

export function demoWorkspaceTitle(locale: PrototypeLocale): string {
  return SEO[locale].demoWorkspaceTitle;
}
