import type { Metadata } from "next";

import { SignInPage } from "@/components/sign-in-page";
import { isSignInErrorCode } from "@/lib/funnel/sign-in";
import { copy, normaliseLocale } from "@/lib/copy";
import { parseAuthFlow } from "@/lib/identity/sign-in-flow";

import { publicMetadata } from "../../_meta";
import { firstParam } from "../../_params";

/** Reads `claim`, `returnTo`, `plan` and `error` from the query string. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  const c = copy[locale];
  return {
    ...publicMetadata({
      locale,
      path: "/owner/sign-in",
      title: c.nav.signIn,
      description: c.funnel.trust.intro,
    }),
    // An auth entry point: reachable, but never a search result.
    robots: { index: false, follow: false },
  };
}

function flowQuery(query: Record<string, string | string[] | undefined>, locale: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ["claim", "returnTo", "method"] as const) {
    const value = query[key];
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (typeof value === "string") params.append(key, value);
  }
  // Locale is selected by the route, never by a query-string hint.
  params.set("locale", locale);
  return params;
}
export default async function OwnerSignIn({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normaliseLocale((await params).locale);
  const query = await searchParams;
  const error = firstParam(query.error);
  const flow = parseAuthFlow(flowQuery(query, locale));
  return (
    <SignInPage
      locale={flow.locale}
      claim={flow.claim ?? undefined}
      returnTo={flow.returnTo ?? undefined}
      method={flow.method ?? undefined}
      plan={firstParam(query.plan)}
      error={isSignInErrorCode(error) ? error : undefined}
    />
  );
}
