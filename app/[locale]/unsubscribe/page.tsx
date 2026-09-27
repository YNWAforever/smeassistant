import type { Metadata } from "next";

import { UnsubscribeClient } from "@/components/mail/unsubscribe-client";
import { normaliseLocale } from "@/lib/copy";
import { t } from "@/lib/i18n";
import { resolveUnsubscribeSecret, verifyUnsubscribeToken } from "@/lib/mail/unsubscribe-token";

import { firstParam } from "../_params";

/**
 * Verifies `?token=` server-side only to choose the confirm view or the
 * neutral invalid view (docs/superpowers/specs/2026-09-27-mail-outbox-
 * design.md §5) -- it never mutates and never calls mailOutboxRepository.
 * A GET here (mail scanners prefetch links, and so does a person just
 * opening the mailed link) is read-only for exactly that reason.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return {
    title: t(locale, "mail.unsubscribeTitle"),
    // Belongs to one specific mailed link; never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function Unsubscribe({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const token = firstParam(query.token) ?? "";
  const secret = resolveUnsubscribeSecret();
  const valid = Boolean(token && secret && verifyUnsubscribeToken(token, secret));
  return <UnsubscribeClient locale={normaliseLocale(locale)} token={token} valid={valid} />;
}
