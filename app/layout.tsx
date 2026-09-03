import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";
import "./ramp-refresh.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "SME Scanner Visibility Workspace",
  description: "為中小企而設的證據優先能見度工作台：找出變化、準備行動、由店主審批，再以重新掃描證明改善。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body className="antialiased">{children}<Toaster richColors position="top-right" /></body>
    </html>
  );
}
