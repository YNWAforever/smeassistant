import type { Metadata } from "next";
import Link from "next/link";

import { requireOperator } from "@/lib/auth/operator";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";

export const dynamic = "force-dynamic";
/** Unlisted internal tooling: never index it, and never link to it from a merchant surface. */
export const metadata: Metadata = { title: "Access requests", robots: { index: false, follow: false } };

/**
 * The operator queue (Phase 2 item 23).
 *
 * English copy on a locale-prefixed route: a deliberate, recorded exception to
 * CLAUDE.md section 5's trilingual rule, because the audience is a handful of
 * Fimmick operators rather than merchants. Locale-prefixed so proxy.ts -- the
 * file that gates every owner route -- needs no exception.
 *
 * Reachable with ASSISTED_ASSIGNMENT_ENABLED off, because DEC-06's safe default
 * is to build the queue and withhold only real approvals.
 */
export default async function OpsAccessRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireOperator();
  const { locale } = await params;
  const requests = await accessRequestRepository().listPending(100);
  const enabled = assistedAssignmentEnabled();

  return (
    <div className="settings-page">
      <h1>Access requests</h1>
      <p>
        Pending requests to be assigned a workspace, newest first. Filing a request is not proof of ownership; verify
        independently before deciding.
      </p>
      {!enabled && (
        <p className="limitation-note" role="status">
          Decisions are disabled: no named accountable operating role and no approved independent-verification procedure
          are recorded yet (DEC-06). You can read requests; you cannot approve or reject one.
        </p>
      )}
      {requests.length === 0 ? (
        <p>No pending requests.</p>
      ) : (
        <div className="compact-action-list">
          {requests.map((request) => (
            <Link key={request.id} href={`/${locale}/ops/access-requests/${request.id}`}>
              <div>
                <strong>{request.business_name ?? request.share_slug}</strong>
                <small>
                  {request.region.toUpperCase()} · {request.place_id ? "Google listing" : "Manual entry"} · requested{" "}
                  {request.requested_at} · {request.requester_email ?? "unknown address"}
                  {request.job_workspace_id ? " · job already claimed" : ""}
                </small>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
