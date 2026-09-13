/**
 * DEC-06 gate (Phase 2 item 19). DEC-06 -- assisted-verification procedure,
 * operator authorization and queue ownership -- is still pending, and its
 * recorded safe default is to build the protected request, status and queue
 * code but NOT to enable real approvals.
 *
 * So the queue is reachable by an allowlisted operator with this off; only the
 * decision route is gated. Exactly "true", matching
 * WORKSPACE_CLAIM_VIA_OAUTH_ENABLED, so no truthy-looking typo can enable real
 * ownership assignment.
 */
export function assistedAssignmentEnabled(): boolean {
  return process.env.ASSISTED_ASSIGNMENT_ENABLED === "true";
}
