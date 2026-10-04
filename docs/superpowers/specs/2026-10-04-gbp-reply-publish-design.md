# P4.6 — Conditional single publishing connector (Google Business Profile review reply): design

**Date:** 2026-10-04 · **Branch:** `p46-gbp-reply-publish` (from `origin/main` at `cef0a4d`, PR #32) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §7 P4.6 (source E4; Blueprint §2.3 keeps publishing restricted in v1) is "NEW, SEPARATE AUTHORIZATION". A later explicit decision must name **one** provider, operation, account scope, test target, budget and revocation/retry policy. The plan requires a connector sub-release to have all of the following:

- least-privilege authorization;
- encrypted token storage;
- server-verified account/location binding;
- explicit user confirmation of the exact approved immutable version and destination;
- idempotent dispatch;
- a provider result/receipt;
- honest uncertain/failure reconciliation;
- audited revocation and role checks;
- no duplicate posts when a response is lost.

Two further rules:

- **Separate states.** "Exported, user-marked-applied and provider-verified-published remain separate states."
- **No application-side counting.** "Publishing cannot overwrite the existing export accounting semantics. Any new delivery-counting rule requires a commercial and SQL-contract decision, not an application-side increment."

DEC-13 (one provider and operation) and DEC-14 (delivery units for future publishing) in `BUSINESS-AND-HOSTED-DECISIONS.md` were decided by the user on 2026-10-04 (below). Turning the feature on still needs a **separate release approval** (§9).

Phase 4 order: P4.4 and P4.1–P4.3 are merged (PRs #27–#30), and P4.5 is merged (PR #31). This is the last unbuilt slice in the master plan.

### Baseline at `cef0a4d`

- **Google connection.**
  - `/api/oauth/google/{start,callback}` requests `business.manage` (`lib/oauth/google-connection.ts`, `GBP_SCOPE`). A consent missing that scope is refused.
  - Tokens are AES-256-GCM sealed (`lib/security/token-crypto.ts`) into `oauth_connections` (`provider='google_gbp'`, `status active|expired|revoked|error`, at most one `active` row per workspace). The seal/unseal pair is `encryptToken`/`decryptToken`.
  - `claimsRepository().replaceGoogleConnection` / `disconnectGoogleConnection` manage the row under a workspace lock.
  - **The stored tokens have never been read back:** `decryptToken` has no production call site (`lib/repositories/claims.ts:91-93`). P4.6 adds the first such read, plus the first use of `refreshAccessToken` / `needsRefresh`.
- **Google APIs used today.** `lib/oauth/google-business-profile.ts::listManagedPlaceIds` lists accounts (Account Management v1) and locations (Business Information v1, `readMask=name,metadata`), returning `{ placeId, locationName }`. It never includes tokens or response bodies in errors, and pages are bounded (`MAX_PAGES = 10`, 10 s per call).
- **Versions and deliveries.**
  - `approve_output_version` supersedes other approved versions of the action, so the approved version is the current one.
  - `export_output_version` is the 0011 definition. It counts the first export of a version: lazy `workspace_usage` row (lite 3, paid unlimited), `allowance_exceeded`, `first_exported_at`, `delivery_state='exported'`, `counted`. The same idempotency key returns `existing`. `lib/workspace/offer-sql.test.ts` pins its body.
  - `deliveries` (`0002`) already allows `mode='publish'` and the states `publishing`, `published`, `failed` and `cancelled`. `output_versions.delivery_state` allows the same values.
- **Routes and authority.**
  - `/api/versions/[versionId]/{approve,request-changes,reject,export}` call `authorizeVersionMutation(req, versionId, "action_mutation")` (`app/api/actions/_shared/mutation.ts`): owner, or manager in location scope.
  - The export route also sends the in-app delivery and allowance notices.
- **Controls.**
  - `rateLimitBucketKey(scope, ...ids)` and `enforceRateLimit` / `consumeRateLimit` over `consume_rate_limit` (`lib/security/rate-limit.ts`) are atomic and fail closed.
  - `lib/capabilities.ts` has `google_business_publish: "Requires connection"`.
- **Template.** `review-response` (`lib/workspace/templates.ts`), agent `review_reply`. The action's `location_id` gives the location's `place_id`.
- **Migrations:** `0001`–`0013`. Hosted databases have 0013 applied (test branch and production, 2026-10-04).

## Decisions (user, 2026-10-04)

| Question | Decision |
|---|---|
| DEC-13 provider and operation | **Google Business Profile: reply to one review** (v4 `PUT …/reviews/{id}/reply`). A review has at most one reply, so the operation targets one resource. |
| Destination | The owner **picks from a live list** of the location's newest 50 *unreplied* reviews. The best match is pre-selected, and an explicit confirmation is still required. |
| Existing reply | **Never overwrite.** If the review already has a reply with different text, refuse ("already replied on Google"). If its text equals our approved version, treat it as published. |
| Authority | Owner, or manager in location scope, may publish (the same rule as export). **Deleting** a published reply is **owner only** and audited. |
| DEC-14 counting | **Once per approved version**, at its first export **or** first verified publish, whichever comes first. Enforced in SQL. |
| Test destination | A Fimmick-owned GBP listing, under a separate release approval (§9). |
| Architecture | **Synchronous publish plus reconcile, no background worker.** Flag `GBP_REPLY_PUBLISH_ENABLED`, off unless exactly `"true"`. Migration `0014`. |

## 1. Data — `neon/migrations/0014_publish_reply.sql`

This migration is additive and local only. Applying it to a hosted database is Willy's action (§9).

### 1.1 Columns and indexes

```sql
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS target_ref text;           -- accounts/{a}/locations/{l}/reviews/{r}
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS provider_receipt jsonb;    -- non-secret: { review_name, reply_update_time }
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS failure_reason text;       -- §5 reason codes; never provider text
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.output_versions ADD COLUMN IF NOT EXISTS first_published_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_publish_version_key
  ON public.deliveries (version_id) WHERE mode = 'publish' AND state IN ('publishing', 'published');
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_publish_target_key
  ON public.deliveries (target_ref) WHERE mode = 'publish' AND state IN ('publishing', 'published');
```

A guarded `CHECK` makes `target_ref` required when `mode = 'publish'`. No new table or foreign key is added, so the delete graph is unchanged. Review text, reviewer names and reply text are **never** stored on the delivery. The reply text already lives in `output_versions.body`.

### 1.2 `begin_publish_output_version(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text) returns jsonb`

SECURITY INVOKER, `SET search_path = ''`, EXECUTE revoked from PUBLIC and granted to `sme_app_runtime` (the 0004/0011 convention).

1. **Same key, same answer.** If a delivery with `p_idempotency_key` exists, return `{kind:'existing', delivery_id, state}`.
2. Lock the version `FOR UPDATE`.
   - Missing → `version_not_found`.
   - Call `perform public.offer_current_for_version(v)`, the same guard as approve and export.
   - `approval_state <> 'approved'` → `not_approved`.
3. **One active publish.**
   - An active publish (`publishing|published`) for this version → `already_publishing`, with that delivery's id in the error detail.
   - An active publish for `p_target_ref` from any version → `target_busy`.
   - The unique indexes are the backstop for races.
4. **Allowance checked before Google is called.** If the version has never counted a delivery (`first_exported_at IS NULL AND first_published_at IS NULL`):
   - lazily create the period's `workspace_usage` row (the same insert as export);
   - lock it;
   - raise `allowance_exceeded` if `allowance IS NOT NULL AND approved_deliveries >= allowance`.

   **Nothing is incremented here.**
5. Insert the delivery: `mode='publish'`, `channel='google_business'`, `state='publishing'`, `counted=false`, `target_ref`, `payload={version_no}`, `created_by=p_actor`.
6. Set the version's `delivery_state='publishing'`.
7. Insert the audit event `delivery.publish_started` (payload: `version_no`, `version_id`, `action_id`, `idempotency_key`; no text).
8. Return `{kind:'begun', delivery_id, state:'publishing'}`.

### 1.3 `finish_publish_output_version(p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text) returns jsonb`

1. Lock the delivery. It must be `mode='publish'` and `state='publishing'`.
   - Already `published` or `failed` → return `{kind:'existing', state, counted}`. Reconcile and publish can race, and the second finisher is a no-op.
   - Otherwise → `delivery_not_publishing`.
2. `p_outcome` must be `published` or `failed`; anything else → `invalid_outcome`.
3. **`published`:**
   - Lock the version.
   - `counts := first_exported_at IS NULL AND first_published_at IS NULL`.
   - If `counts`, increment the period's `approved_deliveries`. This is **unconditional**, with no allowance re-check: the allowance was checked at `begin`, and the reply is already public on Google (ruling P2).
   - Set the delivery's `state='published'`, `counted=counts`, `verified_at=now()` and `provider_receipt=p_receipt`.
   - Set the version's `first_published_at = coalesce(first_published_at, now())` and `delivery_state='published'`.
   - Audit event `delivery.published` (with `counted`).
4. **`failed`:**
   - Set the delivery's `state='failed'` and `failure_reason=p_reason` (a §5 code).
   - Restore the version's `delivery_state`: `'exported'` if `first_exported_at IS NOT NULL`, else `'export_ready'`.
   - Audit event `delivery.publish_failed` (with reason).
5. Return `{kind:'finished', state, counted}`.

### 1.4 `cancel_published_reply(p_delivery_id uuid, p_actor uuid) returns jsonb`

The owner check is done in the route, which uses the `minRole: "owner"` authorization (§3.4). SQL refuses anything other than `mode='publish'` and `state='published'` with `delivery_not_published`.

- Sets the delivery's `state='cancelled'`.
- Sets the version's `delivery_state` to `'exported'` if `first_exported_at IS NOT NULL`, else `'cancelled'`.
- **No usage refund.** `counted` is untouched, and `first_published_at` stays, so a later re-publish or export of the same version never counts again.
- Audit event `delivery.publish_cancelled`.

A cancelled delivery leaves the active indexes, so the same approved version may be published again later. That needs the full confirmation again and never counts again.

### 1.5 `export_output_version`: re-created with an enumerated change

The 0011 body is kept except for these changes, which are listed in a comment above the function:

- **(a)** A new local, `counts := first_export AND v.first_published_at IS NULL`.
  - The allowance, usage-increment block runs on `counts` instead of `first_export`.
  - The `deliveries.counted` value and the audit `counted` field use `counts`.
- **(b)** The `first_exported_at` update still runs on `first_export`. Its `delivery_state` becomes `case when v.delivery_state = 'published' then 'published' else 'exported' end`, so exporting a published version never downgrades the "verified on Google" state.
- **(c)** The return value's `counted` uses `counts`.

Nothing else changes: the idempotency return, mode check, offer guard, period, lazy row, audit event name and return shape stay the same. `lib/workspace/offer-sql.test.ts` is updated so it pins the new body, and a new test asserts that the diff from the 0011 body is exactly (a)–(c).

### 1.6 Mirrors and rollout file

- `lib/db/schema/business.ts` (Drizzle) and `lib/db/database.types.ts` (`db:types`) gain the new columns.
- The migration catalog, journal and hardening contract tests cover 0014.
- `docs/implementation/owner-platform-v1/rollout/apply-0014.sql` is the single `DO $apply$` block, in the same style as `apply-0013.sql`:
  - it checks the sha256 checksums of journal entries 0001–0013;
  - it takes advisory lock `(1936549221,3)` and runs `SET LOCAL ROLE smeassistant_migrator`;
  - it applies 0014 and records its checksum;
  - it runs the post-apply checks: columns, both indexes, four functions as SECURITY INVOKER with grants, and the `export_output_version` body hash.

## 2. Server

### 2.1 `lib/publishing/flag.ts`

`gbpReplyPublishEnabled(env = process.env): boolean`: `env.GBP_REPLY_PUBLISH_ENABLED === "true"`. `"TRUE"`, `"1"` or a padded value stay off.

### 2.2 `lib/oauth/google-reviews.ts` (the only module that talks to the reviews API)

It follows the `google-business-profile.ts` conventions:
- an injected `fetchImpl`;
- `AbortSignal.timeout(10_000)` on every call;
- errors carry only a code, never the token or response body.

```ts
type GbpErrorCode = "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "provider_error" | "timeout" | "network";
class GbpError extends Error { code: GbpErrorCode }

findLocationForPlace(accessToken, placeId, fetchImpl?): Promise<{ accountName: string; locationName: string } | null>
listUnrepliedReviews(accessToken, location, fetchImpl?): Promise<GbpReviewTarget[]>     // newest first, ≤ 50, reply-less only
getReview(accessToken, reviewName, fetchImpl?): Promise<{ name: string; replyComment: string | null; replyUpdateTime: string | null }>
putReply(accessToken, reviewName, comment, fetchImpl?): Promise<void>
deleteReply(accessToken, reviewName, fetchImpl?): Promise<void>

type GbpReviewTarget = { reviewName: string; reviewer: string; starRating: 1|2|3|4|5|null; createTime: string; excerpt: string }  // excerpt ≤ 200 chars
```

- `findLocationForPlace` reuses the account and location paging from `google-business-profile.ts`, refactored there into an exported helper that keeps the account name, which v4 paths need.
- Reviews use `https://mybusiness.googleapis.com/v4/{accountName}/{locationName}/reviews`. The list is ordered `updateTime desc`, with at most 3 pages of 50 to find 50 unreplied reviews.
- HTTP status maps to error code:
  - 401 → `unauthorized`
  - 403 → `forbidden`
  - 404 → `not_found`
  - 429 → `rate_limited`
  - other non-2xx → `provider_error`
- An abort is `timeout`, and a fetch rejection is `network`.
- Reply comparison uses `sameReply(a, b)`: CRLF becomes LF, and the strings are trimmed and NFC-normalized before the exact comparison.

### 2.3 `lib/publishing/connection.ts` — `withGbpAccessToken(workspaceId, fn)`

- Loads the workspace's `active` `google_gbp` row through the new repository method.
- No active row, or `business.manage` missing from `scopes` → `connection_missing`.
- Decrypts the access token. If `needsRefresh(expires_at)`, it calls `refreshAccessToken(decrypt(refresh_token))`:
  - on success it re-seals and stores the new access token and `expires_at`, under the workspace lock that `replaceGoogleConnection` uses;
  - on `null` it marks the row `expired` and fails with `connection_expired`.
- Runs `fn(accessToken)`. If `fn` throws `GbpError('unauthorized')` and the token wasn't just refreshed, it refreshes once and retries `fn` once. A second `unauthorized` marks the row `expired` and fails with `connection_expired`.
- **A 403 never changes the connection row** (ruling P3). It surfaces as `provider_forbidden`.
- Tokens exist only in local variables. They are never logged, returned or put in errors.

### 2.4 `lib/repositories/publishing.ts`

The pg repository, following the `lib/repositories/workflow.ts` pattern:
- `beginPublish`, `finishPublish`, `cancelPublish` wrap the three functions and map `P0001` messages to a `PublishError` code;
- `getPublishDelivery(deliveryId)` returns the delivery, the workspace, location and action ids, the template key, the version body and `target_ref`;
- `latestPublishForVersion(versionId)`;
- `activeGbpConnection(workspaceId)`;
- `storeRefreshedToken(...)`;
- `markConnection(id, 'expired')`.

### 2.5 `lib/publishing/eligibility.ts` — `publishEligibility(version, action, location, connection, flag)`

This function is pure. It returns `{ ok: true }` or `{ ok: false, reason }`. The reasons:
- `flag_off`
- `not_review_response` (template must be `review-response`)
- `not_approved`
- `no_location_listing` (`action.location_id` null, or the location has no `place_id`)
- `connection_missing`
- `too_long` (body over **4,096 UTF-8 bytes**)
- `empty_body`

The page uses it to show or hide the button, and every route checks it again.

### 2.6 Rate limits (`lib/security/rate-limit.ts` scopes)

All are atomic and fail closed (an unavailable limiter → 503):

| Scope | Key | Limit |
|---|---|---|
| `gbp_publish` | workspace id | 20 per day |
| `gbp_publish_global` | `"all"` | 200 per day |
| `gbp_targets` | workspace id | 60 per hour |
| `gbp_reconcile` | delivery id | 30 per day |

Publish consumes both `gbp_publish` and `gbp_publish_global`. Delete consumes `gbp_publish`.

## 3. Routes

All four routes are Node runtime with `maxDuration = 30`. All require a session. Version and action routes use `authorizeVersionMutation` / the delivery's action scope with the stated minimum role. Bodies are zod-validated, and idempotency keys match `^[A-Za-z0-9_-]{16,64}$` (the export route's rule). With the flag off, every route except reconcile returns **404**.

### 3.1 `GET /api/versions/[versionId]/publish/targets`

Owner, or manager in scope. Steps:
1. eligibility;
2. the `gbp_targets` limit;
3. `withGbpAccessToken` → `findLocationForPlace(location.place_id)`. If there is no match: `409 location_not_managed`;
4. `listUnrepliedReviews`.

Returns `{ targets: GbpReviewTarget[], preselected: reviewName | null }`.
- `preselected` is the newest target whose normalized first 40 characters match a sampled review in the action's evidence. Otherwise it is the newest target, or null if the list is empty.
- Nothing is stored or logged.

### 3.2 `POST /api/versions/[versionId]/publish` `{ reviewName, idempotencyKey, confirmVersionNo }`

Owner, or manager in scope. In order:
1. Eligibility. `confirmVersionNo` must equal the version's `version_no`: the client proves it confirmed **this** version, and a mismatch returns `409 version_changed`.
2. `reviewName` must be under the location that `findLocationForPlace` resolves for the action's `place_id`. A mismatch returns `403 target_not_in_location`.
3. Rate limits.
4. `beginPublish`. On `kind:'existing'`, return the current state of that delivery. Mapped errors: `409` for `not_approved`, `already_publishing`, `target_busy`, `allowance_exceeded`, `offer_expired`.
5. `withGbpAccessToken`, then:
   - **(a) Pre-read** with `getReview`.
     - The reply equals the body → go to verify.
     - A different reply → finish `failed: already_replied`, with no write.
   - **(b)** `putReply`.
   - **(c) Read-back** with `getReview`. If the reply equals the body → finish `published`, with receipt `{ review_name, reply_update_time }`.
6. Errors and uncertain outcomes are handled per §5.

Response:
- `200 { deliveryId, state: 'published'|'failed'|'publishing', counted, reason?, usage }`;
- `publishing` means **uncertain**.

On `counted`, the route sends the same in-app notices the export route sends (delivery and allowance-at-80 %). The delivery notice title is "Approved reply published to Google".

### 3.3 `POST /api/deliveries/[deliveryId]/reconcile`

Owner, or manager in the delivery's location scope.

**Allowed while the flag is off.** It only reads from Google and settles a delivery, so an uncertain row never strands.

Steps:
1. The `gbp_reconcile` limit.
2. The delivery must be `publishing` and older than 15 s; otherwise return its current state.
3. `getReview`:
   - the reply equals the body → `published` (counted per §1.3);
   - no reply → `failed: not_applied`;
   - a different reply → `failed: already_replied`;
   - `not_found` → `failed: review_not_found`;
   - auth or transport errors leave it `publishing` and return the reason.

The action detail page calls this automatically once on load for each of its `publishing` deliveries, and offers a **Check on Google** button.

### 3.4 `DELETE /api/deliveries/[deliveryId]/reply`

**Owner only** (`minRole: "owner"`), and the flag must be on.

1. The delivery must be `published`.
2. `getReview` checks that the reply on Google still equals our version. If not → `409 reply_changed_on_google`, and nothing is deleted.
3. `deleteReply`. A `not_found` response for the reply counts as already deleted.
4. `cancelPublish`.

Returns `{ state: 'cancelled' }`.

## 4. Page — action detail delivery card (`components/workspace-actions.tsx`)

**Shown when:** the version is approved, the template is review-response and the flag is on. Otherwise the card is unchanged.

**Button visibility:**
- **Publish to Google** appears only when `publishEligibility` is ok and the user's role may publish. Viewers and out-of-scope managers see the existing read-only permission banner.
- `connection_missing` shows the existing "Connect Google" link to the integrations settings.

**Confirm dialog:**
- Loads targets and lists them as a radio list: stars, reviewer, date and excerpt. The preselected review is checked.
- Shows the **full approved reply text** read-only, with "Version N · approved".
- A required checkbox: "I confirm this exact approved version will be posted publicly as the owner's reply to the selected review."
- The **Publish** button is disabled until a review is selected and the box is checked.
- The client generates the idempotency key once per dialog opening and reuses it on retry.
- Copy is trilingual in `lib/copy.ts`: zh-HK 香港書面中文, zh-TW 台灣用語, en.

**States on the card:**
- **Published on Google** (verified time, with "Delete reply" for owners only, behind a confirm dialog).
- **Couldn't confirm** (publishing: "We couldn't confirm Google received it. Nothing will be sent again automatically.", with **Check on Google**).
- **Failed** (reason copy per §5; publishing again is allowed when the reason permits).
- **Deleted from Google**.

These states sit beside the existing export state. Export and copy stay available, and exported and published are shown as separate facts.

**Capability:** `lib/capabilities.ts` gains `googleBusinessPublishCapability({ enabled, connectionActive })`. It returns `"Beta"` when both are true; otherwise it returns the existing `"Requires connection"`. The static map keeps `"Requires connection"`.

## 5. Failure handling

Every Google call happens after `begin`, so each outcome is recorded against a delivery. Only `published` counts.

| Situation | Delivery result | Connection row | Owner can retry? |
|---|---|---|---|
| Pre-read: different reply already exists | `failed: already_replied` (no write) | unchanged | No; the review is answered |
| Pre-read or read-back: reply equals our body | `published` | unchanged | — |
| Refresh fails, or 401 twice | `failed: connection_expired` | `expired` → existing reconnect prompt | After reconnecting |
| 403 | `failed: provider_forbidden` | **unchanged** (P3) | Yes |
| 404 on the review | `failed: review_not_found` | unchanged | Pick another review |
| 429 | `failed: provider_rate_limited` | unchanged | Later |
| Timeout, 5xx or network error **before** the PUT was sent (pre-read) | `failed: provider_unavailable` | unchanged | Yes |
| Timeout, 5xx or network error **on or after** the PUT | stays `publishing` (**uncertain**) | unchanged | Only through reconcile; **never a blind re-PUT** |
| PUT returned 2xx but the read-back fails or differs from our body | stays `publishing` (**uncertain**); never marked published unverified | unchanged | Through reconcile |
| Reconcile: no reply on Google | `failed: not_applied` | unchanged | Yes, with a new key |
| Over 4,096 bytes, wrong template, unmanaged location, target not in location, flag off | refused before `begin`; no delivery row | — | — |

**Logs** carry only `{ category, deliveryId }` (and `versionId` where there's no delivery). Review text, reviewer names, reply text, tokens and Google response bodies are never logged. A log-spy test enforces this.

## 6. Authority (by construction)

- The authority matrix (§3.9 of CLAUDE.md) extends unchanged: publish follows export (owner, or manager in scope), and delete is owner only.
- Server checks run in every route.
- The UI mirrors them but is never the authority.
- The assistant (P4.3) gains no publish capability, and its draft intents remain non-mutating.

## 7. Testing

No test calls Google, and every Google call goes through an injected `fetchImpl` or a repository fake.

- **`lib/oauth/google-reviews.test.ts`:**
  - URL and path construction;
  - pagination to 50 unreplied reviews across at most 3 pages;
  - each status mapped to its code, and timeout/network handling;
  - `sameReply` normalization;
  - errors never contain the token or the body.
- **`lib/publishing/connection.test.ts`:**
  - refresh when needed;
  - refresh failure marks the row expired;
  - one retry after a 401;
  - a 403 leaves the row unchanged;
  - no token appears in thrown errors.
- **`lib/publishing/eligibility.test.ts`:** every reason, including the 4,096-byte boundary measured with multibyte Chinese text.
- **SQL integration (Docker Postgres, `test:integration`):**
  - `begin`: same-key idempotency; `already_publishing`; `target_busy`; `allowance_exceeded` with no increment; the offer guard.
  - `finish`: published and failed; the second finisher is a no-op.
  - `cancel`: no refund; re-publish never counts again.
  - **The DEC-14 matrix:**
    - export then publish counts 1;
    - publish then export counts 1;
    - a failed publish then export counts 1;
    - publish, cancel, re-publish counts 1;
    - two concurrent `begin`s produce one winner.
  - Exporting a published version keeps `delivery_state='published'`.
  - The INVOKER, `search_path`, grants and RLS contract tests.
  - The `export_output_version` diff equals exactly the §1.5 changes.
- **Route tests:**
  - flag off → 404, while reconcile still works;
  - the authorization matrix: viewer and out-of-scope manager get 403 on targets, publish and reconcile; a manager gets 403 on delete;
  - rate limits, and 503 when the limiter is unavailable;
  - `version_changed`, `target_not_in_location`, and every §5 row through a fake GBP;
  - a log spy proves no text or token is logged.
- **Component tests:**
  - the dialog's confirm gating;
  - the states;
  - owner-only delete;
  - the automatic reconcile once on load.
- **No new acceptance (e2e) spec.** The CI workflow is unchanged apart from the new unit and integration files.

## 8. Docs

- `PHASE-4-REPORT.md` gets a P4.6 section with rulings, verification output and open owner actions.
- `BUSINESS-AND-HOSTED-DECISIONS.md`: DEC-13 and DEC-14 are marked decided (2026-10-04) with the table above.
- `DEPLOY.md` and `.env.example` gain `GBP_REPLY_PUBLISH_ENABLED` (unset by default).
- `HOSTED-ACCEPTANCE-CHECKLIST.md` gets a new section covering:
  - the GBP API access prerequisite;
  - applying 0014;
  - a non-production flag-on run against the Fimmick-owned listing (publish, read-back, reconcile, delete);
  - the evidence to record.

## 9. Rollout and rollback

1. **Merge with the flag off.** No production behaviour changes. The four routes 404, except reconcile, which has nothing to reconcile.
2. **Willy applies 0014** using `rollout/apply-0014.sql` in the Neon SQL Editor, as `neondb_owner`, in a single DO block: test branch first, then production. Merging doesn't depend on that order, because the code paths need the flag.
3. **Prerequisites outside the code (owner):**
   - Request Google Business Profile API access for the GCP project; quota stays at 0 until Google approves it.
   - No reconnect is needed: the scope is already `business.manage`.
4. **Separate release approval:** turn the flag on in a non-production deployment only, and run the checklist section against the Fimmick-owned listing. Turning it on in production is a further explicit owner decision.
5. **Rollback** is turning the flag off. Replies already published stay on Google, and the owner can remove them in Google directly. Reconcile keeps working, so no delivery strands. The data is additive.

## 10. Rulings made in this design

- **P1. Synchronous publish plus reconcile, no worker.** One write per review makes the operation naturally targetable, and the uncertain state is honest and recoverable. Cost if wrong: a slow Google request ties up a ≤ 30 s request, which the UI shows as uncertain.
- **P2. Allowance is checked at `begin`; the increment at `finish` is unconditional.**
  - Refusing to count something already public would be dishonest.
  - The overshoot is bounded by in-flight publishes, at most one per version.
  - Cost if wrong: a lite workspace could exceed 3 by a concurrent publish in the same instant.
- **P3. A 403 does not change the connection row.**
  - A 403 can mean the GCP project isn't approved, or the API isn't enabled.
  - Marking connections revoked would push every merchant into a pointless reconnect.
  - Cost if wrong: a merchant who truly lost access sees `provider_forbidden` rather than a reconnect prompt.
- **P4. Reconcile works while the flag is off.** It only reads from Google, and never stranding an uncertain delivery outweighs keeping the switch absolute. Cost if wrong: one read-only Google call per uncertain delivery after rollback.
- **P5. Never a blind re-PUT.** A PUT replaces any reply, including one another person posted after our timeout, so recovery always reads first. Cost if wrong: an owner whose PUT failed silently presses "Check on Google" before re-publishing.

## 11. Not in this slice

- Instagram or any second provider.
- GBP posts, photos or Q&A.
- Editing a published reply. Edits go through a new version, and the old reply must be deleted first, by the owner.
- Background retries or webhooks.
- Bulk publishing.
- Publishing upstream Fix Pack drafts (`agent_runs`).
- Activating the flag in any environment.
- Any marketing claim of direct publishing.

## 12. Deliverables

- `neon/migrations/0014_publish_reply.sql`, its mirrors and `rollout/apply-0014.sql`.
- `lib/oauth/google-reviews.ts`, plus a small refactor in `lib/oauth/google-business-profile.ts` (exported account and location paging).
- `lib/publishing/{flag,connection,eligibility}.ts` and `lib/repositories/publishing.ts`.
- New rate-limit scopes and the capability helper.
- `app/api/versions/[versionId]/publish/{route.ts,targets/route.ts}`, `app/api/deliveries/[deliveryId]/{reconcile,reply}/route.ts`.
- Changes to the action detail delivery card, and trilingual copy.
- Tests per §7, and docs per §8.
