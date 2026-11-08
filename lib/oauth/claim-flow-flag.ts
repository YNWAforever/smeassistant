/**
 * Google-verified ownership ships off by default. Both claim routes check this
 * before any work; the report card also hides its link while the flag is off.
 * Public email/grant self-service ownership has no enabling switch.
 */
export function claimViaOAuthEnabled(): boolean {
  return process.env.WORKSPACE_CLAIM_VIA_OAUTH_ENABLED === "true";
}
