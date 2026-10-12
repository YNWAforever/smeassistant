"use client"

import type { ReactNode } from "react"

import type { PrototypeLocale } from "@/lib/copy"
import { provideLocaleData } from "@/lib/locale-data/registry"
import type { LocaleData } from "@/lib/locale-data/types"

/**
 * Registers the page's dictionaries before its children render, so
 * `copy[locale]` and `t()` work in client components while the browser bundle
 * carries no locale strings of its own (lib/locale-data/browser.ts).
 */
export function LocaleDataProvider({ locale, data, children }: { locale: PrototypeLocale; data: LocaleData; children: ReactNode }) {
  provideLocaleData(locale, data)
  return children
}
