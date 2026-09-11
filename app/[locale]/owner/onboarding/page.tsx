import type { Metadata } from "next";
import { getMarketCtas, localeToMarket } from "@sme-scanner/region";

import { OnboardingPage, type ClaimEvidence, type SavedSetup } from "@/components/onboarding-page";
import { requireUser } from "@/lib/auth";
import { copy, normaliseLocale } from "@/lib/copy";
import { brandRepository } from "@/lib/repositories/brand";
import { membershipRepository } from "@/lib/repositories/membership";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import { claimsRepository, type ClaimJob } from "@/lib/repositories/claims";

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
  let data:ClaimJob|null;
  try { data = await claimsRepository.jobBySlug(slug); }
  catch {
    console.error("[onboarding] claim evidence lookup failed", {category:"workspace_query_failed"});
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
  try { return (await membershipRepository.accepted(userId,workspaceId))?.role === "owner"; }
  catch {
    console.error("[onboarding] ownership lookup failed",{category:"workspace_query_failed"});
    return false;
  }
}

async function hasActiveGbpConnection(workspaceId:string):Promise<boolean> {
  try {return await claimsRepository.hasActiveGoogleConnection(workspaceId);}
  catch {return false;}
}

/**
 * What the workspace already holds, so the flow resumes from the database
 * rather than from a query parameter the owner may not still have.
 *
 * `POST /api/workspaces/claim` is what creates the primary location, so a
 * workspace WITH one has finished step 4: the fields below then show the values
 * that were actually saved instead of re-proposing the scan's guesses.
 */
async function loadSavedSetup(workspaceId: string): Promise<SavedSetup | null> {
  try {
    const read = workspaceReadRepository();
    const [workspaces, locations, brand] = await Promise.all([
      read.workspaces([workspaceId]),
      read.locations([workspaceId]),
      brandRepository().get(workspaceId),
    ]);
    const primary = locations[0] ?? null;
    return {
      workspaceName: text(workspaces[0]?.business_name),
      locationName: text(primary?.name),
      locationAddress: text(primary?.address, primary?.district),
      voice: text(brand?.voice),
      approvedClaims: Array.isArray(brand?.approved_claims) ? (brand.approved_claims as string[]).join("\n") : "",
      hasLocation: Boolean(primary),
    };
  } catch {
    // A read failure must not strand the owner at step 1 with no explanation;
    // it just means the flow cannot skip ahead this time.
    console.error("[onboarding] saved setup lookup failed", { category: "workspace_query_failed" });
    return null;
  }
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
  const [gbpConnected, saved] = owned && evidence?.workspaceId
    ? await Promise.all([hasActiveGbpConnection(evidence.workspaceId), loadSavedSetup(evidence.workspaceId)])
    : [false, null];

  // Derived from persisted state alone. The OAuth callback used to hand the
  // flow a `?claimed=1` and the step was read from it, so an owner who came
  // back to the same URL later -- or simply reloaded without the parameter --
  // was dropped at step 1 with their ownership already proven.
  const resumeStep = !owned ? 1 : saved?.hasLocation ? 4 : 3;

  // The market of the business being claimed, not of the interface language
  // (guardrail 11). Resolved here because `getMarketCtas` reads env through a
  // computed key, which Next cannot inline into the client bundle -- called
  // from the client component it would always yield an empty list.
  const market = evidence?.region?.toLowerCase() === "tw" ? "tw" : evidence?.region ? "hk" : localeToMarket(locale);
  const contacts = getMarketCtas(market).map(({ channel, href }) => ({ channel, href }));

  return (
    <OnboardingPage
      locale={locale}
      claim={claim}
      plan={plan}
      resumeStep={resumeStep}
      saved={saved}
      oauthEnabled={process.env.WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true"}
      contacts={contacts}
      evidence={evidence}
      ownsWorkspace={owned}
      gbpConnected={gbpConnected}
    />
  );
}
