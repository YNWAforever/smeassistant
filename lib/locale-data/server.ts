import "server-only";

import type { PrototypeLocale } from "@/lib/copy";
import { localeData } from "@/lib/locale-data/all";

import type { LocaleData } from "./types";

/** One locale's dictionaries, for a layout to hand to LocaleDataProvider. */
export function serverLocaleData(locale: PrototypeLocale): LocaleData {
  const data = localeData[locale];
  if (!data) throw new Error(`Missing bundled dictionaries for ${locale}`);
  return data;
}
