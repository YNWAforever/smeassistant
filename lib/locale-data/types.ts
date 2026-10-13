import type { Copy } from "@/lib/copy";
import type en from "@/lib/messages/en.json";

/** The upstream message bundle shape; the three locale files share one key set (tests/i18n.test.ts). */
export type Messages = typeof en;

/** Everything a page needs to render text in one locale. */
export type LocaleData = { copy: Copy; messages: Messages };
