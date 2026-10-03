/**
 * P4.2 gate. Work packs ship dark: every pack route answers 404, the pack page
 * calls notFound(), Home renders exactly today's card and no code path reads or
 * writes work_packs / work_pack_items until this is exactly "true". Exactly
 * "true", matching OFFER_PROMOTIONS_ENABLED, so no truthy-looking typo ("TRUE",
 * "1") can switch the feature on.
 */
export function workPacksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WORK_PACKS_ENABLED === "true";
}
