import { scanReference } from "@/lib/funnel/scan-progress";
import type { FailureKind } from "./failure-types";

/** `PREFIX-` + the first six hex characters of the id, upper-cased: the scan reference's format. */
function shortReference(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export const runReference = (id: string) => shortReference("RUN", id);
export const connectionReference = (id: string) => shortReference("CONN", id);

export function referenceFor(kind: FailureKind, id: string): string {
  if (kind === "draft_failed") return runReference(id);
  if (kind === "google_connection") return connectionReference(id);
  return scanReference(id);
}

export interface FailureSearch {
  /** Null = every kind. */
  kinds: FailureKind[] | null;
  /** Lower-case, six hex characters. */
  hexPrefix: string | null;
  /** A full id, matched against the row id and (scans) the correlation id. */
  uuid: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE_RE = /^(SCAN|RUN|CONN)-([0-9A-F]{6})$/i;
const PREFIX_KINDS: Record<string, FailureKind[]> = {
  SCAN: ["scan_failed", "scan_dead_lettered", "workspace_processing"],
  RUN: ["draft_failed"],
  CONN: ["google_connection"],
};

/** Operator search: a reference, a full id, or nothing. Anything else is "invalid", never passed to SQL. */
export function parseFailureSearch(raw: string | undefined): FailureSearch | null | "invalid" {
  const q = (raw ?? "").trim();
  if (!q) return null;
  if (UUID_RE.test(q)) return { kinds: null, hexPrefix: null, uuid: q.toLowerCase() };
  const match = REFERENCE_RE.exec(q);
  if (!match) return "invalid";
  return { kinds: PREFIX_KINDS[match[1].toUpperCase()], hexPrefix: match[2].toLowerCase(), uuid: null };
}
