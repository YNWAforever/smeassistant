import type { VerificationDecision } from "./decide";
import type { WebsiteCheckKey } from "@/lib/website/checks";

/** Stored in the existing append-only action audit, never in usage or approval state. */
export interface VerificationReceipt {
  outcome: VerificationDecision;
  checkedAt: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  checks: WebsiteCheckKey[];
  priorResults: Array<{ key: WebsiteCheckKey; pass: boolean | null }>;
  freshResults: Array<{ key: WebsiteCheckKey; pass: boolean | null }>;
}
