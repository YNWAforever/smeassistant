/**
 * The owner's view of their own request (Phase 2 item 22).
 *
 * Status is derived, never stored. `resolved_at` answers "is this still open";
 * the append-only log answers which outcome. The row alone cannot distinguish
 * approved from rejected -- that is the intended split, not a gap.
 */
export type MyRequestStatus = "pending" | "awaiting_information" | "approved" | "rejected" | "closed";

export function deriveRequestStatus(
  request: { resolved_at: string | null },
  events: Array<{ event: string }>,
): MyRequestStatus {
  if (request.resolved_at) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].event === "access_request.approved") return "approved";
      if (events[index].event === "access_request.rejected") return "rejected";
    }
    return "closed";
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].event === "access_request.information_requested") return "awaiting_information";
    if (events[index].event === "access_request.submitted") return "pending";
  }
  return "pending";
}
