import type { AuditEventRow } from "./queries-pages";
import type { ActionOverview } from "./overview";
import { findTemplate } from "./templates";
import type { VerificationDecision } from "@/lib/verify/decide";

export interface ActionVerificationView {
  outcome: VerificationDecision | "pending";
  checkedAt: string | null;
  sourceUrl: string | null;
  unsupported: boolean;
}

const outcomes = new Set<string>(["verified", "not_yet", "source_unavailable", "not_verifiable"]);

function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/** Read existing action audit only; another tenant/location's receipt is never evidence. */
export function actionVerificationView(
  action: ActionOverview,
  workspaceId: string,
  audit: AuditEventRow[],
): ActionVerificationView {
  // Website checks cannot establish whether a particular Google review got
  // this reply. Other templates can still use the existing comparable scans.
  const unsupported = action.templateKey === "review-response" &&
    !findTemplate(action.templateKey)?.verifyChecks?.length;
  const attempts = audit.flatMap((row) => {
    if (row.workspace_id !== workspaceId || row.location_id !== action.location.id ||
      row.entity_type !== "action" || row.entity_id !== action.id ||
      row.event !== "action.verification_checked") return [];
    const value = row.payload?.verification;
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const receipt = value as Record<string, unknown>;
    if (typeof receipt.outcome !== "string" || !outcomes.has(receipt.outcome) ||
      typeof receipt.checkedAt !== "string" || !Number.isFinite(Date.parse(receipt.checkedAt))) return [];
    return [{
      outcome: receipt.outcome as VerificationDecision,
      checkedAt: receipt.checkedAt,
      sourceUrl: sourceUrl(receipt.sourceUrl),
    }];
  }).sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
  const latest = attempts[0];
  if (action.verified) {
    return {
      outcome: "verified",
      checkedAt: action.verifiedOn ?? latest?.checkedAt ?? null,
      sourceUrl: latest?.outcome === "verified" ? latest.sourceUrl : null,
      unsupported: false,
    };
  }
  if (unsupported) return { outcome: "pending", checkedAt: null, sourceUrl: null, unsupported: true };
  return {
    // Only a durable verified application may present a successful check.
    outcome: latest?.outcome === "verified" ? "source_unavailable" : latest?.outcome ?? "pending",
    checkedAt: latest?.checkedAt ?? null,
    sourceUrl: latest?.sourceUrl ?? null,
    unsupported: false,
  };
}
