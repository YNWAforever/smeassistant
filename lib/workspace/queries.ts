import { listMemberships, type Membership } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/admin";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";
import { deliveryAllowanceForTier } from "@/lib/workspace/entitlement";

/**
 * Read models for the workspace shell and the select-workspace page
 * (CLAUDE.md Phase 2 items 5–6, §3.10).
 *
 * Every read goes through the service-role client *after* the caller has
 * been authorized (`requireMembership` / `requireUser` in lib/auth.ts); this
 * module never decides access, it only shapes rows. Numbers are copied from
 * the tables that own them (`scan_snapshots.overall_score`, `.coverage`) and
 * are never recomputed here (guardrail 2, §7).
 */

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  market: "hk" | "tw";
  tier: "lite" | "paid";
  timezone: string;
  isDemo: boolean;
  instagramHandle: string | null;
  industry: string | null;
  district: string | null;
};

export type LocationSummary = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  isPrimary: boolean;
  placeId: string | null;
};

export type UsageSummary = { period: string; approvedDeliveries: number; allowance: number | null };

export type WorkspaceContext = {
  workspace: WorkspaceSummary;
  locations: LocationSummary[];
  usage: UsageSummary;
  unreadNotifications: number;
  membership: Membership;
  account: { name: string; email: string };
};

export type WorkspaceCardLocation = LocationSummary & {
  latestScore: number | null;
  latestCoverage: number | null;
  urgentActions: number;
  lastScanAt: string | null;
};

export type WorkspaceCard = {
  workspace: WorkspaceSummary;
  role: WorkspaceRole;
  locations: WorkspaceCardLocation[];
};

export type LatestReportRef = { shareSlug: string; createdAt: string; status: string | null };

const DEFAULT_TIMEZONE = "Asia/Hong_Kong";

/** Action states that no longer count as open (mirrors the partial index on `actions.dedupe_key`). */
export const CLOSED_ACTION_STATES = ["completed", "dismissed", "cancelled", "expired"] as const;

interface WorkspaceRow {
  id: string;
  slug: string | null;
  business_name: string | null;
  market: string | null;
  tier: string | null;
  timezone: string | null;
  is_demo: boolean | null;
  instagram_handle: string | null;
  industry: string | null;
  district: string | null;
}

interface LocationRow {
  id: string;
  workspace_id?: string;
  slug: string;
  name: string;
  address: string | null;
  district: string | null;
  is_primary: boolean | null;
  place_id?: string | null;
}

interface UsageRow {
  period: string;
  approved_deliveries: number | null;
  allowance: number | null;
}

interface SnapshotRow {
  overall_score: number | string | null;
  coverage: number | string | null;
  observed_at: string;
}

const WORKSPACE_COLUMNS = "id, slug, business_name, market, tier, timezone, is_demo, instagram_handle, industry, district";
const LOCATION_COLUMNS = "id, workspace_id, slug, name, address, district, is_primary, place_id";

/** 'YYYY-MM' in the workspace's timezone (§3.10). An unknown IANA name falls back to UTC rather than throwing. */
export function currentPeriod(timezone: string, now: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit" };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timezone || DEFAULT_TIMEZONE }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" }).formatToParts(now);
  }
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/** The local part of the email is the only display name we have: there is no profile table. */
export function accountNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local || email;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summariseWorkspace(row: WorkspaceRow): WorkspaceSummary {
  const market = row.market?.toLowerCase() === "tw" ? "tw" : "hk";
  return {
    id: row.id,
    slug: row.slug ?? "",
    name: row.business_name?.trim() || "Workspace",
    market,
    tier: row.tier === "paid" ? "paid" : "lite",
    timezone: row.timezone || DEFAULT_TIMEZONE,
    isDemo: Boolean(row.is_demo),
    instagramHandle: row.instagram_handle ?? null,
    industry: row.industry ?? null,
    district: row.district ?? null,
  };
}

function summariseLocation(row: LocationRow): LocationSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address ?? null,
    district: row.district ?? null,
    isPrimary: Boolean(row.is_primary),
    placeId: row.place_id ?? null,
  };
}

function fail(what: string, category: string): never {
  console.error(`[workspace] ${what} failed`, { category });
  throw new Error(`Unable to load ${what}`);
}

async function loadWorkspaceRow(workspaceId: string): Promise<WorkspaceRow> {
  const { data, error } = await supabaseServer()
    .from("workspaces")
    .select(WORKSPACE_COLUMNS)
    .eq("id", workspaceId)
    .maybeSingle<WorkspaceRow>();
  if (error || !data) fail("workspace", "workspace_query_failed");
  return data;
}

async function loadLocationRows(workspaceIds: string[]): Promise<LocationRow[]> {
  if (workspaceIds.length === 0) return [];
  const { data, error } = await supabaseServer()
    .from("locations")
    .select(LOCATION_COLUMNS)
    .in("workspace_id", workspaceIds)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true })
    .returns<LocationRow[]>();
  if (error) fail("locations", "workspace_query_failed");
  return data ?? [];
}

/**
 * The usage row for the current period, created lazily with the allowance the
 * tier carries at creation time (§3.10). A concurrent insert loses the race to
 * the primary key and simply re-reads.
 */
async function loadOrCreateUsage(workspaceId: string, tier: WorkspaceSummary["tier"], period: string): Promise<UsageSummary> {
  const db = supabaseServer();
  const read = async (): Promise<UsageRow | null> => {
    const { data, error } = await db
      .from("workspace_usage")
      .select("period, approved_deliveries, allowance")
      .eq("workspace_id", workspaceId)
      .eq("period", period)
      .maybeSingle<UsageRow>();
    if (error) fail("usage", "workspace_query_failed");
    return data ?? null;
  };
  let row = await read();
  if (!row) {
    const allowance = deliveryAllowanceForTier(tier);
    const { error } = await db.from("workspace_usage").insert({ workspace_id: workspaceId, period, allowance });
    if (error && error.code !== "23505") fail("usage", "workspace_usage_insert_failed");
    row = (await read()) ?? { period, approved_deliveries: 0, allowance };
  }
  return {
    period: row.period,
    approvedDeliveries: row.approved_deliveries ?? 0,
    allowance: row.allowance ?? null,
  };
}

async function countUnreadNotifications(workspaceId: string, userId: string): Promise<number> {
  const { count, error } = await supabaseServer()
    .from("workspace_notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) fail("notifications", "workspace_query_failed");
  return count ?? 0;
}

/** Open urgent actions, for one location or (locationId omitted) the whole workspace. */
export async function countUrgentActions(workspaceId: string, locationId?: string): Promise<number> {
  let query = supabaseServer()
    .from("actions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("priority", "urgent")
    .not("action_state", "in", `(${CLOSED_ACTION_STATES.join(",")})`);
  if (locationId) query = query.eq("location_id", locationId);
  const { count, error } = await query;
  if (error) fail("actions", "workspace_query_failed");
  return count ?? 0;
}

async function latestSnapshot(locationId: string): Promise<SnapshotRow | null> {
  const { data, error } = await supabaseServer()
    .from("scan_snapshots")
    .select("overall_score, coverage, observed_at")
    .eq("location_id", locationId)
    .order("observed_at", { ascending: false })
    .limit(1)
    .returns<SnapshotRow[]>();
  if (error) fail("snapshots", "workspace_query_failed");
  return data?.[0] ?? null;
}

/** Everything the shell needs for one accepted membership (Phase 2 item 6). */
export async function loadWorkspaceContext(membership: Membership): Promise<WorkspaceContext> {
  const workspace = summariseWorkspace(await loadWorkspaceRow(membership.workspaceId));
  const [locationRows, usage, unreadNotifications] = await Promise.all([
    loadLocationRows([workspace.id]),
    loadOrCreateUsage(workspace.id, workspace.tier, currentPeriod(workspace.timezone)),
    countUnreadNotifications(workspace.id, membership.userId),
  ]);
  const email = membership.email || "";
  return {
    workspace,
    locations: locationRows.map(summariseLocation),
    usage,
    unreadNotifications,
    membership,
    account: { name: accountNameFromEmail(email), email },
  };
}

/** One card per accepted membership: the workspace plus each location's latest snapshot and urgent count (Phase 2 item 5). */
export async function listWorkspaceCards(userId: string): Promise<WorkspaceCard[]> {
  const memberships = await listMemberships(userId);
  if (memberships.length === 0) return [];
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const { data: workspaceRows, error } = await supabaseServer()
    .from("workspaces")
    .select(WORKSPACE_COLUMNS)
    .in("id", workspaceIds)
    .returns<WorkspaceRow[]>();
  if (error) fail("workspaces", "workspace_query_failed");
  const byId = new Map((workspaceRows ?? []).map((row) => [row.id, summariseWorkspace(row)]));
  const locationRows = await loadLocationRows(workspaceIds);

  const cards: WorkspaceCard[] = [];
  for (const membership of memberships) {
    const workspace = byId.get(membership.workspaceId);
    if (!workspace) continue;
    const locations = await Promise.all(
      locationRows
        .filter((row) => row.workspace_id === workspace.id)
        .map(async (row): Promise<WorkspaceCardLocation> => {
          const [snapshot, urgentActions] = await Promise.all([latestSnapshot(row.id), countUrgentActions(workspace.id, row.id)]);
          return {
            ...summariseLocation(row),
            latestScore: toNumber(snapshot?.overall_score),
            latestCoverage: toNumber(snapshot?.coverage),
            urgentActions,
            lastScanAt: snapshot?.observed_at ?? null,
          };
        }),
    );
    cards.push({ workspace, role: membership.role, locations });
  }
  return cards;
}

/** The newest report attached to the workspace, for the "workspace ready" home page until Phase 3 wires the brief. */
export async function latestWorkspaceReport(workspaceId: string): Promise<LatestReportRef | null> {
  const { data, error } = await supabaseServer()
    .from("audit_jobs")
    .select("share_slug, created_at, status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<Array<{ share_slug: string | null; created_at: string; status: string | null }>>();
  if (error) fail("reports", "workspace_query_failed");
  const row = data?.[0];
  if (!row?.share_slug) return null;
  return { shareSlug: row.share_slug, createdAt: row.created_at, status: row.status };
}
