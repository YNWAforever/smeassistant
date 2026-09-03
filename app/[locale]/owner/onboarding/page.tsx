import type { Metadata } from "next";

import { OnboardingPage, type ClaimEvidence } from "@/components/onboarding-page";
import { requireUser } from "@/lib/auth";
import { copy, normaliseLocale } from "@/lib/copy";
import { supabaseServer } from "@/lib/supabase/admin";

import { publicMetadata } from "../../_meta";
import { firstParam } from "../../_params";

/** Session-bound and claim-specific. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  const isChinese = locale !== "en";
  return {
    ...publicMetadata({
      locale,
      path: "/owner/onboarding",
      title: isChinese ? "設定工作台" : "Set up your workspace",
      description: copy[locale].funnel.trust.intro,
    }),
    robots: { index: false, follow: false },
  };
}

interface ClaimJobRow {
  business_name: string | null;
  district: string | null;
  region: string | null;
  share_slug: string;
  workspace_id: string | null;
  place_id: string | null;
  ig_handle: string | null;
  website_url: string | null;
  /** lib/scan/start-job.ts stores the parsed input in camelCase; older rows may carry the API's snake_case. */
  input_snapshot: { instagramHandle?: unknown; websiteUrl?: unknown; ig_handle?: unknown; website_url?: unknown } | null;
}

function text(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Public claim evidence for the report being claimed: what the free scan
 * already shows on `/r/[slug]`, nothing owner-only. Read with the service role
 * after `requireUser`; a bad or unknown slug simply yields no evidence.
 */
async function loadClaimEvidence(slug: string): Promise<ClaimEvidence | null> {
  const { data, error } = await supabaseServer()
    .from("audit_jobs")
    .select("business_name, district, region, share_slug, workspace_id, place_id, ig_handle, website_url, input_snapshot")
    .eq("share_slug", slug)
    .maybeSingle<ClaimJobRow>();
  if (error) {
    console.error("[onboarding] claim evidence lookup failed", { category: "workspace_query_failed" });
    return null;
  }
  if (!data) return null;
  const snapshot = data.input_snapshot ?? {};
  return {
    shareSlug: data.share_slug,
    businessName: data.business_name,
    district: data.district,
    region: data.region,
    workspaceId: data.workspace_id,
    placeId: data.place_id,
    igHandle: text(data.ig_handle, snapshot.instagramHandle, snapshot.ig_handle),
    websiteUrl: text(data.website_url, snapshot.websiteUrl, snapshot.website_url),
  };
}

/** Accepted owner row for this user on the job's workspace — the only thing that unlocks steps 3–4. */
async function ownsWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const { count, error } = await supabaseServer()
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .not("accepted_at", "is", null);
  if (error) {
    console.error("[onboarding] ownership lookup failed", { category: "workspace_query_failed" });
    return false;
  }
  return (count ?? 0) > 0;
}

async function hasActiveGbpConnection(workspaceId: string): Promise<boolean> {
  const { count, error } = await supabaseServer()
    .from("oauth_connections")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_gbp")
    .eq("status", "active");
  if (error) return false;
  return (count ?? 0) > 0;
}

export default async function OwnerOnboarding({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = normaliseLocale((await params).locale);
  const query = await searchParams;
  const rawClaim = firstParam(query.claim);
  const claim = rawClaim && /^[a-z0-9-]{1,120}$/i.test(rawClaim) ? rawClaim : undefined;
  const search = new URLSearchParams();
  if (claim) search.set("claim", claim);
  const plan = firstParam(query.plan);
  if (plan) search.set("plan", plan);
  const returnTo = `/${locale}/owner/onboarding${search.size ? `?${search.toString()}` : ""}`;
  const user = await requireUser(locale, returnTo);

  const evidence = claim ? await loadClaimEvidence(claim) : null;
  const owned = evidence?.workspaceId ? await ownsWorkspace(user.id, evidence.workspaceId) : false;
  const gbpConnected = owned && evidence?.workspaceId ? await hasActiveGbpConnection(evidence.workspaceId) : false;

  return (
    <OnboardingPage
      locale={locale}
      claim={claim}
      plan={plan}
      claimed={firstParam(query.claimed) === "1"}
      oauthEnabled={process.env.WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true"}
      evidence={evidence}
      ownsWorkspace={owned}
      gbpConnected={gbpConnected}
    />
  );
}
