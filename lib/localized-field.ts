import type { Locale } from "@/lib/locale";

type FindingFields = {
  owner_message_zh: string | null;
  owner_message_en: string | null;
  owner_message_tw: string | null;
};
type SummaryFields = {
  summary_zh: string | null;
  summary_en: string | null;
  summary_tw: string | null;
};

/** Owner message for the active locale, falling back to the Cantonese source. */
export function pickFinding(f: FindingFields, locale: Locale): string {
  if (locale === "zh-TW") return f.owner_message_tw ?? f.owner_message_zh ?? "";
  if (locale === "en") return f.owner_message_en ?? f.owner_message_zh ?? "";
  return f.owner_message_zh ?? "";
}

/** Executive summary for the active locale, falling back to the Cantonese source. */
export function pickSummary(j: SummaryFields, locale: Locale): string | null {
  if (locale === "zh-TW") return j.summary_tw ?? j.summary_zh ?? null;
  if (locale === "en") return j.summary_en ?? j.summary_zh ?? null;
  return j.summary_zh ?? null;
}
