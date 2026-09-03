import type { SupabaseClient } from "@supabase/supabase-js";
import { deliveryAllowanceForTier } from "@/lib/workspace/entitlement";
import { slugify, uniqueLocationSlug, uniqueWorkspaceSlug } from "@/lib/workspace/slug";

/**
 * Completes a workspace after ownership has been proven (CLAUDE.md §3.2.3
 * `POST /api/workspaces/claim`, Phase 2 item 3).
 *
 * Guardrail 15 in one sentence: this module NEVER attaches a job to a
 * workspace. The job must already carry `workspace_id` -- written only by the
 * OAuth-verified claim callback (Google attested ownership) or by Fimmick
 * staff assignment -- and the caller must hold an accepted `owner` membership
 * on that workspace. Anything else returns without a single write.
 *
 * Everything after the checks is idempotent: a second call with the same input
 * updates the same rows and returns the same ids, so a stuck onboarding step
 * can be retried safely.
 */

export type ClaimMarket = "hk" | "tw";

export interface CompleteWorkspaceClaimInput {
  /** `audit_jobs.share_slug` of the claimed report. */
  claimSlug: string;
  workspaceName: string;
  primaryLocation: { name: string; address?: string | null };
  market: ClaimMarket;
  /** IANA zone; defaults to the workspace's current timezone. */
  timezone?: string | null;
  userId: string;
  locale: string;
}

export type CompleteWorkspaceClaimResult =
  | { kind: "completed"; workspaceId: string; workspaceSlug: string; locationId: string }
  | { kind: "not_found" }
  | { kind: "not_attached" }
  | { kind: "forbidden" };

export interface CompleteWorkspaceClaimHooks {
  /** Builds the `scan_snapshots` row for the claimed job. */
  buildSnapshot?: (jobId: string, workspaceId: string, locationId: string) => Promise<void>;
  /** Derives `actions` from that snapshot. */
  deriveActions?: (jobId: string, workspaceId: string, locationId: string) => Promise<void>;
  now?: () => Date;
}

// TODO: Phase 3 wires lib/workspace/snapshots.ts and lib/workspace/actions.ts here.
const noopHook = async (): Promise<void> => {};

export const DEFAULT_WORKSPACE_TIMEZONE = "Asia/Hong_Kong";

const JOB_COLUMNS =
  "id, workspace_id, business_name, district, place_id, ig_handle, website_url, input_snapshot, module_results, region, status";

/** True when `Intl` accepts the zone; a bad zone must not poison every later period calculation. */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** `'YYYY-MM'` in the workspace timezone (CLAUDE.md §3.10). */
export function claimPeriod(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Pulls a field out of `audit_jobs.input_snapshot`. The v2 snapshot written
 * by lib/scan/start-job.ts uses camelCase (`instagramHandle`, `websiteUrl`),
 * older rows and fixtures use snake_case (`ig_handle`) or a nested
 * `ig.handle`; every spelling is accepted so a claim on an older scan still
 * seeds the location correctly.
 */
function snapshotString(snapshot: unknown, paths: string[][]): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  for (const path of paths) {
    let cursor: unknown = snapshot;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object") {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    const found = optionalString(cursor);
    if (found) return found;
  }
  return null;
}

function normaliseHandle(value: string | null): string | null {
  if (!value) return null;
  const handle = value.trim().replace(/^@+/, "");
  return handle || null;
}

function fail(step: string, error: unknown): never {
  console.error(`[workspace/claim] ${step} failed`, error);
  throw new Error(`${step} failed`);
}

export async function completeWorkspaceClaim(
  db: SupabaseClient,
  input: CompleteWorkspaceClaimInput,
  hooks: CompleteWorkspaceClaimHooks = {},
): Promise<CompleteWorkspaceClaimResult> {
  const buildSnapshot = hooks.buildSnapshot ?? noopHook;
  const deriveActions = hooks.deriveActions ?? noopHook;
  const now = hooks.now ?? (() => new Date());

  // --- Read-only checks. Nothing below this block runs unless all pass. ---

  const { data: job, error: jobError } = await db
    .from("audit_jobs")
    .select(JOB_COLUMNS)
    .eq("share_slug", input.claimSlug)
    .maybeSingle();
  if (jobError) fail("job lookup", jobError);
  if (!job) return { kind: "not_found" };
  // Guardrail 15: the job must already be attached by the OAuth claim
  // callback or staff assignment. This function never attaches.
  if (!job.workspace_id) return { kind: "not_attached" };

  const { data: membership, error: membershipError } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", job.workspace_id)
    .eq("user_id", input.userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (membershipError) fail("membership lookup", membershipError);
  // Owner only (§3.9: settings/claim are owner capabilities). A manager or
  // viewer on the same workspace is forbidden, exactly like a stranger.
  if (!membership || membership.role !== "owner") return { kind: "forbidden" };

  const { data: workspace, error: workspaceError } = await db
    .from("workspaces")
    .select("id, slug, tier, timezone")
    .eq("id", job.workspace_id)
    .maybeSingle();
  if (workspaceError) fail("workspace lookup", workspaceError);
  if (!workspace) return { kind: "not_found" };

  // --- Idempotent writes. ---

  const timezone = isValidTimezone(input.timezone)
    ? input.timezone
    : isValidTimezone(workspace.timezone)
      ? workspace.timezone
      : DEFAULT_WORKSPACE_TIMEZONE;
  const workspaceName = input.workspaceName.trim();

  // The slug is minted once and never rewritten: it is the URL every member
  // already has. Only a still-null slug (a pre-backfill or freshly created
  // row) gets one here.
  const workspaceSlug: string =
    typeof workspace.slug === "string" && workspace.slug
      ? workspace.slug
      : await uniqueWorkspaceSlug(db, slugify(workspaceName));

  const { error: workspaceUpdateError } = await db
    .from("workspaces")
    .update({
      business_name: workspaceName,
      timezone,
      market: input.market,
      ...(workspace.slug ? {} : { slug: workspaceSlug }),
    })
    .eq("id", workspace.id);
  if (workspaceUpdateError) fail("workspace update", workspaceUpdateError);

  const snapshot = job.input_snapshot;
  const locationFields = {
    name: input.primaryLocation.name.trim(),
    address: optionalString(input.primaryLocation.address) ?? snapshotString(snapshot, [["address"]]),
    district: optionalString(job.district) ?? snapshotString(snapshot, [["district"]]),
    place_id: optionalString(job.place_id) ?? snapshotString(snapshot, [["placeId"], ["place_id"]]),
    ig_handle: normaliseHandle(
      optionalString(job.ig_handle) ?? snapshotString(snapshot, [["instagramHandle"], ["ig_handle"], ["ig", "handle"]]),
    ),
    website_url: optionalString(job.website_url) ?? snapshotString(snapshot, [["websiteUrl"], ["website_url"]]),
  };

  const { data: existingLocation, error: locationLookupError } = await db
    .from("locations")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (locationLookupError) fail("location lookup", locationLookupError);

  let locationId: string;
  if (existingLocation) {
    locationId = existingLocation.id;
    const { error } = await db.from("locations").update(locationFields).eq("id", locationId);
    if (error) fail("location update", error);
  } else {
    const slug = await uniqueLocationSlug(db, workspace.id, slugify(locationFields.name));
    const { data: created, error } = await db
      .from("locations")
      .insert({ workspace_id: workspace.id, slug, is_primary: true, ...locationFields })
      .select("id")
      .single();
    if (error || !created) fail("location insert", error);
    locationId = created.id;
  }

  const { error: jobUpdateError } = await db.from("audit_jobs").update({ location_id: locationId }).eq("id", job.id);
  if (jobUpdateError) fail("job location update", jobUpdateError);

  // Defaults come from the table (voice 'warm', languages '{zh-HK}'); an
  // existing profile the owner already edited must not be reset.
  const { error: brandError } = await db
    .from("brand_profiles")
    .upsert({ workspace_id: workspace.id }, { onConflict: "workspace_id", ignoreDuplicates: true });
  if (brandError) fail("brand profile upsert", brandError);

  // Same posture for usage: the current period's row is created lazily with
  // the tier's allowance and never reset (approved_deliveries is money).
  const { error: usageError } = await db.from("workspace_usage").upsert(
    {
      workspace_id: workspace.id,
      period: claimPeriod(timezone, now()),
      allowance: deliveryAllowanceForTier(workspace.tier),
    },
    { onConflict: "workspace_id,period", ignoreDuplicates: true },
  );
  if (usageError) fail("usage upsert", usageError);

  await buildSnapshot(job.id, workspace.id, locationId);
  await deriveActions(job.id, workspace.id, locationId);

  // One `workspace.claimed` event per job (§3.11). The OAuth callback may
  // already have written it; a staff-assigned claim gets it here.
  const { data: existingEvents, error: eventLookupError } = await db
    .from("audit_events")
    .select("id")
    .eq("event", "workspace.claimed")
    .eq("entity_id", job.id)
    .limit(1);
  if (eventLookupError) fail("audit event lookup", eventLookupError);
  if (!existingEvents?.length) {
    const { error: eventError } = await db.from("audit_events").insert({
      workspace_id: workspace.id,
      location_id: locationId,
      actor_type: "user",
      actor_id: input.userId,
      event: "workspace.claimed",
      entity_type: "audit_job",
      entity_id: job.id,
      payload: { locale: input.locale },
    });
    // Best-effort: the claim is complete; a failed log write is logged, not surfaced.
    if (eventError) console.error("[workspace/claim] audit event not recorded");
  }

  return { kind: "completed", workspaceId: workspace.id, workspaceSlug, locationId };
}
