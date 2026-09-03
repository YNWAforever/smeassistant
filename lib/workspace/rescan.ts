import type { SupabaseClient } from "@supabase/supabase-js";
import type { IgMatchProvenance } from "@sme-scanner/contracts";
import { buildScanJobInsert, type ScanStartInput } from "@/lib/scan/start-job";
import { buildScheduleInsert, type SchedulableJob, type ScheduleRefusal } from "@/lib/scheduler/create-schedule";
import { recordEvent } from "@/lib/workspace/audit";

/**
 * Owner "Rescan now" (CLAUDE.md §3.2.3, Phase 6 item 1): queue a new
 * `audit_jobs` row from the location's last finished scan, attributed to the
 * workspace and location, with `parent_job_id` pointing at that scan so
 * scan-engine's diff step compares the pair. The client then POSTs
 * `/api/scan/process { jobId }` exactly as the public funnel does — no cron
 * in this repo; the monthly cadence is a `scan_schedules` row the legacy
 * scheduler dispatches.
 *
 * The rebuilt input mirrors upstream's lib/scheduler/enqueue.ts: only the v2
 * `input_snapshot` envelope carries a confirmed identity, so a v1 snapshot is
 * refused rather than re-scanning a merchant the scanner can no longer
 * positively identify.
 */
const IG_MATCH_PROVENANCE = new Set<string>(["manual_typed", "picker_confirmed", "gbp_cross_referenced"]);
const LOCALES = new Set<string>(["en", "zh-HK", "zh-TW"]);
const OBJECTIVES = new Set<string>(["more_leads", "better_visibility", "improve_trust", "understand_performance"]);
const CONFIDENCES = new Set<string>(["high", "medium", "low"]);
const FINISHED_STATUSES = ["done", "partial"] as const;

export interface RescanSourceJob extends SchedulableJob {
  workspace_id: string | null;
  location_id: string | null;
}

export type RescanRefusal = "no_finished_job" | "snapshot_not_v2" | "insert_failed";

export type EnqueueRescanResult =
  | { ok: true; jobId: string; sourceJob: RescanSourceJob }
  | { ok: false; reason: RescanRefusal };

function requiredString(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`snapshot is missing ${key}`);
  return value.trim();
}

function optionalString(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

/**
 * Rebuild a `ScanStartInput` from a v2 `input_snapshot` so the rescan inserts
 * exactly the row `POST /api/scan/start` would have, plus `parentJobId`.
 * Throws on a non-v2 envelope or a missing required field.
 */
export function scanInputFromSnapshot(raw: unknown, parentJobId: string): ScanStartInput {
  const snapshot = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!snapshot || snapshot.version !== 2) throw new Error("snapshot must be the v2 envelope");

  const market = requiredString(snapshot, "market").toUpperCase();
  if (market !== "HK" && market !== "TW") throw new Error("snapshot market is invalid");
  const locale = requiredString(snapshot, "locale");
  if (!LOCALES.has(locale)) throw new Error("snapshot locale is invalid");
  const objective = requiredString(snapshot, "objective");
  if (!OBJECTIVES.has(objective)) throw new Error("snapshot objective is invalid");

  const placeId = optionalString(snapshot, "placeId");
  const dataId = optionalString(snapshot, "dataId");
  const dataCid = optionalString(snapshot, "dataCid");
  const hasProviderIdentity = Boolean(placeId || dataId || dataCid);
  const manualEntry = snapshot.manualEntry === true || snapshot.continueWithoutPlace === true || !hasProviderIdentity;
  const confidence = optionalString(snapshot, "placeMatchConfidence");
  const instagramHandle = (optionalString(snapshot, "instagramHandle") ?? "").replace(/^@+/, "");
  const provenance = optionalString(snapshot, "instagramMatchProvenance");

  return {
    businessName: requiredString(snapshot, "businessName"),
    instagramHandle,
    instagramMatchProvenance: instagramHandle && provenance && IG_MATCH_PROVENANCE.has(provenance) ? (provenance as IgMatchProvenance) : null,
    websiteUrl: optionalString(snapshot, "websiteUrl") ?? "",
    industry: requiredString(snapshot, "industry"),
    district: requiredString(snapshot, "district"),
    locale: locale as ScanStartInput["locale"],
    market,
    objective: objective as ScanStartInput["objective"],
    placeId,
    dataId,
    dataCid,
    placeMatchConfidence: confidence && CONFIDENCES.has(confidence) ? (confidence as ScanStartInput["placeMatchConfidence"]) : null,
    provider: hasProviderIdentity && !manualEntry ? "serpapi" : null,
    manualEntry,
    alternateNames: stringList(snapshot.alternateNames).slice(0, 10),
    address: optionalString(snapshot, "address") ?? "",
    mapsUrl: optionalString(snapshot, "mapsUrl") ?? "",
    facebookUrl: optionalString(snapshot, "facebookUrl") ?? "",
    parentJobId,
    // A rescan is a workspace action, not a funnel answer.
    userRole: null,
  };
}

/** The location's newest finished (`done|partial`) job, or null. */
export async function loadLatestFinishedJob(db: SupabaseClient, workspaceId: string, locationId: string): Promise<RescanSourceJob | null> {
  const { data, error } = await db
    .from("audit_jobs")
    .select("id, status, place_id, created_at, input_snapshot, workspace_id, location_id")
    .eq("workspace_id", workspaceId)
    .eq("location_id", locationId)
    .in("status", [...FINISHED_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<RescanSourceJob[]>();
  if (error) throw new Error("rescan source lookup failed");
  return data?.[0] ?? null;
}

export interface EnqueueRescanInput {
  workspaceId: string;
  locationId: string;
  actorId: string;
  now?: Date;
  locale?: string | null;
  ipHash?: string | null;
}

export async function enqueueRescan(db: SupabaseClient, input: EnqueueRescanInput): Promise<EnqueueRescanResult> {
  const sourceJob = await loadLatestFinishedJob(db, input.workspaceId, input.locationId);
  if (!sourceJob) return { ok: false, reason: "no_finished_job" };

  let scanInput: ScanStartInput;
  try {
    scanInput = scanInputFromSnapshot(sourceJob.input_snapshot, sourceJob.id);
  } catch {
    return { ok: false, reason: "snapshot_not_v2" };
  }

  // Server-side attribution only (CLAUDE.md 3.2.2): workspace_id + location_id
  // come from the authorized membership, never from a request body.
  const row = buildScanJobInsert(scanInput, { workspaceId: input.workspaceId, locationId: input.locationId });
  const { data: created, error } = await db.from("audit_jobs").insert(row).select("id").single<{ id: string }>();
  if (error || !created) {
    console.error("[workspace/rescan] job insert failed", { category: "rescan_insert_failed" });
    return { ok: false, reason: "insert_failed" };
  }

  await recordEvent(db, {
    workspaceId: input.workspaceId,
    locationId: input.locationId,
    actorType: "user",
    actorId: input.actorId,
    event: "scan.queued",
    entityType: "audit_job",
    entityId: created.id,
    locale: input.locale ?? null,
    ipHash: input.ipHash ?? null,
    payload: { parent_job_id: sourceJob.id, trigger: "rescan" },
  });

  return { ok: true, jobId: created.id, sourceJob };
}

export type EnsureScheduleOutcome =
  | { created: true }
  | { created: false; reason: "exists" | ScheduleRefusal | "insert_failed" | "lookup_failed" };

/**
 * Monthly cadence for paid workspaces: one `scan_schedules` row per placeId
 * (the column is unique), created from the source job the first time the
 * owner rescans. `created_by` is the acting owner — upstream's column name
 * says staff, but the schedule is the merchant's own. Refusals are returned,
 * logged by the caller, never fatal: the rescan itself has already landed.
 */
export async function ensureMonthlySchedule(
  db: SupabaseClient,
  input: { job: SchedulableJob; workspaceId: string; actorId: string; nowIso: string },
): Promise<EnsureScheduleOutcome> {
  const built = buildScheduleInsert({ job: input.job, staffUserId: input.actorId, nowIso: input.nowIso, workspaceId: input.workspaceId });
  if (!built.ok) return { created: false, reason: built.reason };

  const { data: existing, error: lookupError } = await db
    .from("scan_schedules")
    .select("id")
    .eq("place_id", built.insert.place_id)
    .limit(1)
    .returns<Array<{ id: string }>>();
  if (lookupError) return { created: false, reason: "lookup_failed" };
  if (existing?.length) return { created: false, reason: "exists" };

  const { error } = await db.from("scan_schedules").insert(built.insert);
  // 23505: a concurrent rescan created it first — same outcome as "exists".
  if (error && (error as { code?: string }).code === "23505") return { created: false, reason: "exists" };
  if (error) return { created: false, reason: "insert_failed" };
  return { created: true };
}
