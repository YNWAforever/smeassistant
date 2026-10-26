import { localized, resolveText, type LocalizedText } from "@/lib/domain";

// Evidence sources are persisted as English strings on actions.evidence.source
// (lib/workspace/actions.ts SOURCE_LABEL, owner objectives, offers, packs), so
// they are translated at render time. Unknown sources are shown as stored.
const SOURCE_TEXT: Record<string, LocalizedText> = {
  "Instagram public evidence": localized("Instagram public evidence", "Instagram 公開證據"),
  "Google Business Profile": localized("Google Business Profile", "Google 商家檔案", "Google 商家檔案"),
  "Search and AI surfaces": localized("Search and AI surfaces", "搜尋及 AI 介面", "搜尋與 AI 介面"),
  "Trust signals": localized("Trust signals", "信任訊號"),
  "Website checks": localized("Website checks", "網站檢查"),
  "Integration health": localized("Integration health", "連接狀態", "連線狀態"),
  "Owner objective": localized("Owner objective", "店主目標", "店家目標"),
  "Owner offer": localized("Owner offer", "店主優惠", "店家優惠"),
  "Visibility starter pack": localized("Visibility starter pack", "能見度入門套裝", "能見度入門組合"),
};

// actions.evidence.value is persisted as "raw_key: value" when a finding has
// no obvious headline number (lib/workspace/actions.ts evidenceValue), or as a
// bare state such as "not_connected". Name the known ones at render time.
const VALUE_KEY_TEXT: Record<string, LocalizedText> = {
  discovery_runs: localized("Searches checked", "已檢查搜尋次數"),
  faq_schema: localized("FAQ structured data", "FAQ 結構化資料"),
};
const VALUE_STATE_TEXT: Record<string, LocalizedText> = {
  pass: localized("pass", "通過"),
  fail: localized("fail", "未通過"),
  not_connected: localized("Not connected", "未連接", "未連線"),
  connected: localized("Connected", "已連接", "已連線"),
  expired: localized("Expired", "已過期"),
  revoked: localized("Revoked", "已撤銷"),
  error: localized("Error", "出錯", "錯誤"),
};

function stateText(value: string, locale: string): string {
  const text = VALUE_STATE_TEXT[value];
  return text ? resolveText(text, locale) : value;
}

export function evidenceValueLabel(value: string, locale: string): string {
  const pair = /^([a-z][a-z0-9_]*): (.+)$/.exec(value);
  if (!pair) return /^[a-z]+(_[a-z]+)+$/.test(value) || VALUE_STATE_TEXT[value] ? stateText(value, locale) : value;
  const [, key, raw] = pair;
  const name = VALUE_KEY_TEXT[key] ? resolveText(VALUE_KEY_TEXT[key], locale) : key.replaceAll("_", " ");
  const separator = locale === "en" || !VALUE_KEY_TEXT[key] ? ": " : "：";
  return `${name}${separator}${stateText(raw, locale)}`;
}

export function sourceLabel(source: string, locale: string): string {
  const text = SOURCE_TEXT[source];
  return text ? resolveText(text, locale) : source;
}
