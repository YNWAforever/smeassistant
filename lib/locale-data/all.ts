import type { PrototypeLocale } from "@/lib/copy";
import { copyDictionaries } from "@/lib/copy-dictionaries";
import en from "@/lib/messages/en.json";
import zhHK from "@/lib/messages/zh-HK.json";
import zhTW from "@/lib/messages/zh-TW.json";

import type { LocaleData, Messages } from "./types";

/**
 * Every locale's dictionaries. The server, SSR and tests import this module as
 * is; Next's browser bundle swaps it for ./browser.ts (next.config.ts
 * `turbopack.resolveAlias`), so the client never downloads all three locales.
 */
export const localeData: Partial<Record<PrototypeLocale, LocaleData>> = {
  en: { copy: copyDictionaries.en, messages: en },
  "zh-HK": { copy: copyDictionaries["zh-HK"], messages: zhHK as Messages },
  "zh-TW": { copy: copyDictionaries["zh-TW"], messages: zhTW as Messages },
};
