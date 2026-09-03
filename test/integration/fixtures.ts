import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScanProviderCollection } from "@sme-scanner/scan-engine";

export function integrationClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

let slugCounter = 0;

/** Insert a queued job and return its id and share slug. */
export async function seedQueuedJob(
  overrides: Record<string, unknown> = {},
): Promise<{ jobId: string; shareSlug: string }> {
  slugCounter += 1;
  const shareSlug = `it-slug-${process.pid.toString(36)}-${slugCounter}`;
  const supabase = integrationClient();
  const { data, error } = await supabase
    .from("audit_jobs")
    .insert({
      business_name: "Integration Cafe",
      ig_handle: "integration.cafe",
      website_url: "https://example.com",
      industry: "cafe",
      district: "Central",
      region: "hk",
      status: "queued",
      share_slug: shareSlug,
      ...overrides,
    })
    .select("id")
    .single();

  if (error) throw new Error(`seedQueuedJob failed: ${error.message}`);
  return { jobId: (data as { id: string }).id, shareSlug };
}

const COLLECTED_AT = "2026-08-11T00:00:00.000Z";

const measuredIg = {
  status: "measured" as const,
  confidence: "high" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    username: "integration.cafe",
    bio: "Coffee in Central. Open daily.",
    followers: 1200,
    following: 80,
    posts_count: 40,
    external_url: "https://example.com",
    posts_last_12: [
      {
        id: "post-1",
        caption: "Fresh coffee",
        media_type: "GraphImage",
        like_count: 30,
        comment_count: 4,
        posted_at: "2026-08-10T00:00:00.000Z",
      },
    ],
    reels_count: 2,
  },
};

const measuredGbp = {
  status: "measured" as const,
  confidence: "high" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    name: "Integration Cafe",
    rating: 4.5,
    reviews_count: 210,
    photos_count: 30,
    hours_complete: true,
    categories: ["Cafe"],
  },
};

const measuredAeo = {
  status: "measured" as const,
  confidence: "medium" as const,
  collectedAt: COLLECTED_AT,
  data: {
    available: true,
    serpapi_runs: [
      {
        query: "best cafe central hong kong",
        ai_overview_mentioned: true,
        ai_mode_mentioned: false,
        brand_organic_rank: 3,
        competitors_mentioned: [],
      },
    ],
  },
};

/**
 * Build a provider collection for the processor.
 *
 * `evidence` is deliberately omitted. processScan's callers inject
 * `persistEvidence` (it takes no default) — every real caller in this repo
 * passes `persistEvidenceSnapshots`, which uploads to Supabase Storage, and
 * this harness serves PostgREST only, with no Storage endpoint. An empty
 * candidate list keeps that call a no-op regardless of which persistEvidence
 * a given test wires in; adding candidates here would fail against the
 * container for reasons unrelated to what is under test.
 */
export function fakeProviders(
  overrides: Partial<ScanProviderCollection> = {},
): ScanProviderCollection {
  return {
    ig: measuredIg,
    gbp: measuredGbp,
    aeo: measuredAeo,
    ...overrides,
  } as ScanProviderCollection;
}

export const unavailable = (limitationCode: string) =>
  ({ status: "unavailable" as const, limitationCode });

export const failed = (limitationCode: string) =>
  ({ status: "failed" as const, limitationCode, retryable: false });
