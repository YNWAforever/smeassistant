/**
 * How old an uncertain (`publishing`) delivery must be before it is read back
 * from Google (P4.6 spec §3.3 step 2; final-review ruling: 15 s → 60 s).
 *
 * The publish request that began the delivery may still be running: its route
 * allows `maxDuration = 30` and makes up to four 10 s Google calls (the
 * location lookup, the review pre-read, a 401 token refresh and the PUT), so
 * its PUT can land well after 15 s. Reconciling inside that time could settle
 * the row `failed: not_applied` just before the reply goes live. 60 s is
 * twice the route's ceiling, so the request that began the delivery has ended
 * before anything reads it back.
 *
 * Pure: shared by the reconcile route and the client publish card.
 */
export const RECONCILE_AFTER_MS = 60_000;
