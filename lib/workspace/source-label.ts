import { localized, resolveText, type LocalizedText } from "@/lib/domain";

// Evidence sources are persisted as English strings on actions.evidence.source
// (lib/workspace/actions.ts SOURCE_LABEL, owner objectives, offers, packs), so
// they are translated at render time. Unknown sources are shown as stored.
const SOURCE_TEXT: Record<string, LocalizedText> = {
  "Instagram public evidence": localized("Instagram public evidence", "Instagram 公開證據"),
  "Google Business Profile": localized("Google Business Profile", "Google 商戶檔案", "Google 商家檔案"),
  "Search and AI surfaces": localized("Search and AI surfaces", "搜尋及 AI 介面", "搜尋與 AI 介面"),
  "Trust signals": localized("Trust signals", "信任訊號"),
  "Website checks": localized("Website checks", "網站檢查"),
  "Integration health": localized("Integration health", "連接狀態", "連線狀態"),
  "Owner objective": localized("Owner objective", "店主目標", "店家目標"),
  "Owner offer": localized("Owner offer", "店主優惠", "店家優惠"),
  "Visibility starter pack": localized("Visibility starter pack", "能見度入門套裝", "能見度入門組合"),
};

export function sourceLabel(source: string, locale: string): string {
  const text = SOURCE_TEXT[source];
  return text ? resolveText(text, locale) : source;
}
