import type { PrototypeLocale } from "@/lib/copy";

import type { LocaleData } from "./types";

/**
 * Browser stand-in for ./all.ts (next.config.ts `turbopack.resolveAlias`):
 * nothing is bundled. The page layout provides the visitor's locale through
 * components/locale-data-provider.tsx before any text renders.
 */
export const localeData: Partial<Record<PrototypeLocale, LocaleData>> = {};
