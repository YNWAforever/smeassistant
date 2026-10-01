/** Offer pages and routes stay off unless OFFERS_ENABLED is exactly "true" (spec D10). */
export function offersEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OFFERS_ENABLED === "true";
}
