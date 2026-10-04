import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { PreviewDraftForm } from "@/components/preview/preview-draft-form";
import { PublicPageFrame } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { copy, normaliseLocale } from "@/lib/copy";
import { authorizePreview } from "@/lib/preview/eligibility";
import { previewDraftEnabled } from "@/lib/preview/flag";
import { VIEWER_GRANT_COOKIE, parseViewerGrantCookie } from "@/lib/report-access/cookie";

/**
 * /{locale}/start/[slug] (P4.5, spec §3.2): one unsaved review-reply draft
 * for the holder of this report's viewer grant. The checks mirror the route's
 * steps 1, 3 and 4 — flag, a done/partial job, a viewer grant for it — and any
 * failure is a plain 404, so the page reveals nothing about the report.
 *
 * Reads the grant cookie, so it is request-scoped.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  // Belongs to one unlocked report, which is itself noindex.
  const robots = { index: false, follow: false };
  // With the flag off the page is a 404, so its title must not name the preview (ruling R13).
  if (!previewDraftEnabled()) return { robots };
  const locale = normaliseLocale((await params).locale);
  return { title: copy[locale].funnel.preview.cardTitle, robots };
}

export default async function Start({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: requested, slug } = await params;
  // Off means nothing runs: no cookie read, no SQL.
  if (!previewDraftEnabled()) notFound();

  const cookieStore = await cookies();
  let eligible: Awaited<ReturnType<typeof authorizePreview>>;
  try {
    eligible = await authorizePreview({ slug, viewerToken: parseViewerGrantCookie(cookieStore.get(VIEWER_GRANT_COOKIE)?.value) });
  } catch {
    console.error("[start/preview] eligibility failed", { category: "preview_eligibility_failed" });
    eligible = null;
  }
  if (!eligible) notFound();

  const locale = normaliseLocale(requested);
  const p = copy[locale].funnel.preview;
  return (
    <PublicPageFrame locale={locale}>
      <main className="unlock-page">
        <section className="unlock-context">
          <Badge variant="outline">{p.badge}</Badge>
          <h1>{p.cardTitle}</h1>
          <p>{p.boundary}</p>
        </section>
        <PreviewDraftForm locale={locale} slug={slug} claimHref={`/${locale}/owner/sign-in?claim=${encodeURIComponent(slug)}`} />
      </main>
    </PublicPageFrame>
  );
}
