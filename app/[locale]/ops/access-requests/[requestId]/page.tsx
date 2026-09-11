import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessRequestDecision } from "@/components/ops/access-request-decision";
import { requireOperator } from "@/lib/auth/operator";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";
import { recordNeonEvent } from "@/lib/workspace/audit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access request", robots: { index: false, follow: false } };

/**
 * One request, with the job's own evidence beside what the merchant said.
 *
 * Opening this page logs `access_request.reviewed`, because this is the moment
 * a merchant's details are actually seen. Logging per QUEUE view instead would
 * be noise rather than accountability.
 */
export default async function OpsAccessRequestPage({ params }: { params: Promise<{ locale: string; requestId: string }> }) {
  const operator = await requireOperator();
  const { requestId } = await params;
  const found = await accessRequestRepository().get(requestId);
  if (!found) notFound();

  await recordNeonEvent({
    workspaceId: null,
    actorType: "user",
    actorId: operator.userId,
    event: "access_request.reviewed",
    entityType: "workspace_access_request",
    entityId: requestId,
    payload: { operator_email: operator.email },
  });

  const { request, events } = found;
  const submitted = [...events].reverse().find((event) => event.event === "access_request.submitted");

  return (
    <div className="settings-page">
      <h1>{request.business_name ?? request.share_slug}</h1>
      <dl className="trust-dl">
        <div><dt>Market</dt><dd>{request.region.toUpperCase()}</dd></div>
        <div><dt>Listing</dt><dd>{request.place_id ? `Google place ${request.place_id}` : "Manual entry — no Google listing"}</dd></div>
        <div><dt>Report</dt><dd>{request.share_slug}</dd></div>
        <div><dt>Requester</dt><dd>{request.requester_email ?? "unknown address"}</dd></div>
        <div><dt>Requested</dt><dd>{request.requested_at}</dd></div>
        <div><dt>Job already claimed</dt><dd>{request.job_workspace_id ? "Yes — approving will be refused" : "No"}</dd></div>
      </dl>

      <h2>What the requester said</h2>
      {submitted ? (
        <dl className="trust-dl">
          <div><dt>Intent</dt><dd>{String(submitted.payload?.intent ?? "")}</dd></div>
          <div><dt>Contact</dt><dd>{String(submitted.payload?.preferred_contact_channel ?? "")} · {String(submitted.payload?.contact_identifier ?? "")}</dd></div>
          <div><dt>Evidence reference</dt><dd>{String(submitted.payload?.evidence_ref ?? "none given")}</dd></div>
        </dl>
      ) : (
        <p>Filed implicitly at sign-in; no intent, contact or evidence was captured.</p>
      )}

      <h2>History</h2>
      <ul className="evidence-list">
        {events.map((event, index) => (
          <li key={`${event.event}-${index}`}>
            <span>{event.created_at} · {event.event} · {String(event.payload?.reason ?? "")}</span>
          </li>
        ))}
      </ul>

      <AccessRequestDecision
        requestId={requestId}
        enabled={assistedAssignmentEnabled()}
        resolved={Boolean(request.resolved_at)}
      />
    </div>
  );
}
