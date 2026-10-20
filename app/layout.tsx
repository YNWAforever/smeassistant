import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { HydrationMarker } from "@/components/hydration-marker";
import { Toaster } from "@/components/ui/sonner";
import { LOCALE_HEADER, resolveHtmlLang } from "@/lib/funnel/locale-redirect";
import { getSiteUrl } from "@/lib/share";
import { THEME_COOKIE, themePrefAttribute } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Kinnso OS",
    // Page titles come from lib/copy.ts in all three locales; the brand is
    // appended once here so no page has to repeat it.
    template: "%s · Kinnso OS",
  },
  description: "為中小企而設的證據優先能見度工作台：找出變化、準備行動、由店主審批，再以重新掃描證明改善。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-icon",
  },
  openGraph: { siteName: "Kinnso OS", type: "website" },
};

/** Brand orange (Kinnso palette); matches the brand mark and the OG card. */
export const viewport: Viewport = { themeColor: "#f39a3d", width: "device-width", initialScale: 1 };

/**
 * The only place `<html>`/`<body>` exist, so `<html lang>` has to be resolved
 * here — but the root layout cannot see the `[locale]` route param. `proxy.ts`
 * stamps every locale-prefixed request with `x-sme-locale`; `resolveHtmlLang`
 * turns that into a served locale, falling back to zh-HK for the paths the
 * proxy does not touch (route handlers, Next internals).
 *
 * `data-theme-pref` carries the owner's saved workspace theme from its cookie
 * (lib/theme.ts). It only darkens the page while the workspace marker is
 * present, so public pages stay light, and it needs no inline script.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = resolveHtmlLang((await headers()).get(LOCALE_HEADER));
  const themePref = themePrefAttribute((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={lang} data-scroll-behavior="smooth" data-theme-pref={themePref}>
      <body className="antialiased">{children}<Toaster richColors position="top-right" /><HydrationMarker /></body>
    </html>
  );
}
