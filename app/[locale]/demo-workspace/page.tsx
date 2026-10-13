import type { Metadata } from "next";

import { PublicDemoWorkspacePage } from "@/components/public-demo-workspace";
import { normaliseLocale } from "@/lib/copy";
import { demoWorkspaceTitle, seoDescription } from "@/lib/seo-copy";

import { publicMetadata } from "../_meta";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return publicMetadata({
    locale,
    path: "/demo-workspace",
    title: demoWorkspaceTitle(locale),
    description: seoDescription(locale, "demoWorkspace"),
  });
}

/** Fixed, sanitised Kam Man House data — never the database (guardrail 12). */
export default async function DemoWorkspace({ params }: { params: Promise<{ locale: string }> }) {
  return <PublicDemoWorkspacePage locale={normaliseLocale((await params).locale)} />;
}
