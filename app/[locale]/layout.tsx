import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isLocale } from "@/lib/locale";

/**
 * The locale segment is a validation boundary only. `<html lang>` lives in the
 * root layout, which reads the locale from the `x-sme-locale` request header
 * the proxy stamps (lib/funnel/locale-redirect.ts) — a nested layout cannot
 * render <html>, and the global chrome (fonts, stylesheets, Toaster) must stay
 * in one place so the design is unchanged.
 *
 * Public pages bring their own chrome (`PublicPageFrame` inside
 * components/public-pages.tsx), so nothing is wrapped here.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <>{children}</>;
}
