import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { findLocaleData, localeDataFor } from "@/lib/locale-data/registry";
import type { Messages } from "@/lib/locale-data/types";
import { interpolate } from "@/lib/share";

export { interpolate };
export type { Messages };

/**
 * The upstream message namespaces this app reuses (scanner, scanning, report,
 * share, legal), copied verbatim into lib/messages/*.json. The three files share
 * one key set (tests/i18n.test.ts pins it), so English is the type. The
 * `unlock` namespace was removed: no t() call reached it, and five of its keys
 * described a /api/report-access/recover flow that does not exist in this app —
 * no route, no configuration reader and no mail sender.
 *
 * Bundles are read from the locale registry (lib/locale-data/registry.ts), so
 * the browser only holds the locale its page provided.
 */
export function getMessages(locale: string): Messages {
  return localeDataFor(isLocale(locale) ? locale : DEFAULT_LOCALE).messages;
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
  const value = lookup(getMessages(locale), key) ?? lookup(findLocaleData("en")?.messages, key) ?? key;
  return vars ? interpolate(value, vars) : value;
}
