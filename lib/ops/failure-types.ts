/**
 * P3.5b failure model. Client-safe: plain types and constants only, so owner
 * and operator components can import them.
 */
export const FAILURE_KINDS = ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection", "workspace_processing"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Owners never see workspace_processing: nothing about it is theirs to do. */
export type OwnerFailureKind = Exclude<FailureKind, "workspace_processing">;

export const OWNER_FAILURE_KINDS: readonly OwnerFailureKind[] = ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection"];

export function isFailureKind(value: unknown): value is FailureKind {
  return typeof value === "string" && (FAILURE_KINDS as readonly string[]).includes(value);
}

/** Narrows a FailureItem/OwnerProblem's `kind` for owner-facing copy (problemTitle takes only OwnerFailureKind). */
export function isOwnerFailureKind(kind: FailureKind): kind is OwnerFailureKind {
  return (OWNER_FAILURE_KINDS as readonly FailureKind[]).includes(kind);
}

export interface FailureItem {
  kind: FailureKind;
  /** Source row id: the job id, run id or connection id. */
  id: string;
  /** SCAN-XXXXXX, RUN-XXXXXX or CONN-XXXXXX. */
  reference: string;
  /** audit_jobs.failure_correlation_id; scans only. */
  correlationId: string | null;
  occurredAt: string;
  workspace: { id: string; slug: string | null; name: string | null } | null;
  locationId: string | null;
  /** draft_failed only. */
  actionId: string | null;
  businessName: string;
  /** An allowlisted code, never provider text. */
  reason: string;
  attempts: number | null;
  operatorAction: "release" | "none";
}

export type OwnerAction = "rescan" | "contact_support" | "open_action" | "reauthorise" | "ask_owner" | "none";

export interface OwnerProblem extends FailureItem {
  ownerAction: OwnerAction;
  /** The market's first configured contact channel; contact_support only. */
  contactHref: string | null;
}

export interface OperatorHealth {
  recent: { scan_failed: { day: number; week: number }; draft_failed: { day: number; week: number } };
  open: { scan_dead_lettered: number; google_connection: number; workspace_processing: number };
  categories: Array<{ category: string; day: number; week: number }>;
}
