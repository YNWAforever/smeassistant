/**
 * P4.1 gate. Offers and promotion drafts ship dark: every offer route answers
 * 404 and the offers page calls notFound() until this is exactly "true".
 * Exactly "true", matching WORKSPACE_CLAIM_VIA_OAUTH_ENABLED and
 * ASSISTED_ASSIGNMENT_ENABLED, so no truthy-looking typo ("TRUE", "1") can
 * switch the feature on.
 */
export function offerPromotionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OFFER_PROMOTIONS_ENABLED === "true";
}
