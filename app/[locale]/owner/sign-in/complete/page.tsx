import type { Metadata } from "next";

import { PublicPageFrame } from "@/components/product-ui";
import { SignInCompletion } from "@/components/auth/sign-in-completion";
import { normaliseLocale } from "@/lib/copy";
import { parseAuthFlow } from "@/lib/identity/sign-in-flow";

import { publicMetadata } from "../../../_meta";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return { ...publicMetadata({ locale, path: "/owner/sign-in/complete", title: "Sign in", description: "Complete owner sign in" }), robots: { index: false, follow: false } };
}

export default async function OwnerSignInComplete({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = normaliseLocale((await params).locale);
  const query = await searchParams;
  const values = new URLSearchParams({ locale });
  for (const key of ["claim", "returnTo", "method"] as const) {
    const value = query[key];
    if (typeof value === "string") values.set(key, value);
  }
  const flow = parseAuthFlow(values);
  return <PublicPageFrame locale={flow.locale}><main><SignInCompletion flow={flow} /></main></PublicPageFrame>;
}