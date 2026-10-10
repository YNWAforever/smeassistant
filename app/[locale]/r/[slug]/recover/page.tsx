import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { RecoverRedeem } from "@/components/report/recover-redeem";
import { normaliseLocale } from "@/lib/copy";
import { recoveryAvailable } from "@/lib/mail/feature-flags";

/** Reads the feature flag from the environment per request. */
export const dynamic = "force-dynamic";

/** The page carries a one-use token in its URL; it must never be indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RecoverPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  if (!recoveryAvailable()) notFound();
  const locale = normaliseLocale((await params).locale);
  return (
    <main className="unlock-page">
      <Suspense>
        <RecoverRedeem locale={locale} />
      </Suspense>
    </main>
  );
}
