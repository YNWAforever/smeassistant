import en from "@/lib/messages/en.json";
import zhHK from "@/lib/messages/zh-HK.json";
import zhTW from "@/lib/messages/zh-TW.json";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { interpolate } from "@/lib/share";

export { interpolate };

/**
 * The upstream message namespaces this app reuses (scanner, scanning, unlock,
 * report, share, legal), copied verbatim into lib/messages/*.json. The three
 * files share one key set (tests/i18n.test.ts pins it), so English is the type.
 */
export type Messages = typeof en;

const bundles: Record<Locale, Messages> = {
  en,
  "zh-HK": zhHK as Messages,
  "zh-TW": zhTW as Messages,
};

export function getMessages(locale: string): Messages {
  return bundles[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

type MessageTree = { [key: string]: string | MessageTree };

function lookup(tree: unknown, path: string): string | undefined {
  let node: unknown = tree;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as MessageTree)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function hasMessage(locale: string, key: string): boolean {
  return lookup(getMessages(locale), key) !== undefined;
}

/**
 * Dot-path lookup ("report.overallScore", "report.print.docTitle") in the
 * requested locale, falling back to English and finally to the key itself so a
 * missing string never throws at render time. `vars` are interpolated with the
 * same {token} syntax the upstream messages use.
 */
export function t(locale: string, key: string, vars?: Record<string, string | number>): string {
  const value = lookup(getMessages(locale), key) ?? lookup(bundles.en, key) ?? key;
  return vars ? interpolate(value, vars) : value;
}
