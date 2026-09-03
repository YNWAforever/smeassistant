/**
 * The X6 kill switch. Off by default, exactly like OWNER_SELF_SERVICE_CLAIM --
 * both /api/oauth/google/claim/start and .../claim/callback check this
 * directly as their very first step, and the report page's UI card only
 * renders when it's also true. Both layers matter: the route check is what
 * actually closes the flow (these URLs aren't secret), the UI check just
 * keeps the link from appearing while it's off. A separate flag from
 * OWNER_SELF_SERVICE_CLAIM on purpose: that one gates a server-side
 * entitlement decision inside claim-scan.ts's dual-signal path, which this
 * design does not touch.
 */
export function claimViaOAuthEnabled(): boolean {
  return process.env.WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true";
}
