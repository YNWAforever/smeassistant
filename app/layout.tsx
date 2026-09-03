import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./responsive.css";
import "./ramp-refresh.css";
import { Toaster } from "@/components/ui/sonner";
import { LOCALE_HEADER, resolveHtmlLang } from "@/lib/funnel/locale-redirect";
import { getSiteUrl } from "@/lib/share";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "SME Scanner Visibility Workspace",
    // Page titles come from lib/copy.ts in all three locales; the brand is
    // appended once here so no page has to repeat it.
    template: "%s · SME Scanner",
  },
  description: "為中小企而設的證據優先能見度工作台：找出變化、準備行動、由店主審批，再以重新掃描證明改善。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

/**
 * The only place `<html>`/`<body>` exist, so `<html lang>` has to be resolved
 * here — but the root layout cannot see the `[locale]` route param. `proxy.ts`
 * stamps every locale-prefixed request with `x-sme-locale`; `resolveHtmlLang`
 * turns that into a served locale, falling back to zh-HK for the paths the
 * proxy does not touch (route handlers, Next internals).
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = resolveHtmlLang((await headers()).get(LOCALE_HEADER));
  return (
    <html lang={lang}>
      <body className="antialiased">{children}<Toaster richColors position="top-right" /></body>
    </html>
  );
}
