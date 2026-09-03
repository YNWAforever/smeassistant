import type { Metadata } from "next";

import { SignInPage } from "@/components/sign-in-page";
import { isSignInErrorCode } from "@/lib/funnel/sign-in";
import { copy, normaliseLocale } from "@/lib/copy";

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

/** `returnTo` must be an in-app path; anything else is dropped (open-redirect guard shared with the callback). */
function safeReturnTo(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

/** Report slugs are `[a-z0-9-]`; anything else is not forwarded to the magic-link route. */
function safeClaim(value: string | undefined): string | undefined {
  return value && /^[a-z0-9-]{1,120}$/i.test(value) ? value : undefined;
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
  return (
    <SignInPage
      locale={locale}
      claim={safeClaim(firstParam(query.claim))}
      returnTo={safeReturnTo(firstParam(query.returnTo))}
      plan={firstParam(query.plan)}
      error={isSignInErrorCode(error) ? error : undefined}
    />
  );
}
