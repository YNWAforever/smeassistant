# P4.6 GBP Review-Reply Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner, or a manager in location scope, can publish one approved review-response version as the owner's reply to a review they choose on the connected Google Business Profile listing.
- It is published only after a confirmation that names the exact version.
- It is verified by reading the reply back from Google.
- It counts once per version (first export or first verified publish).
- An uncertain outcome is reconciled rather than retried blindly.
- An owner can delete it.
- It is off unless `GBP_REPLY_PUBLISH_ENABLED` is exactly `"true"`.

**Architecture:**
- **Data.** Migration `0014` adds publish columns and two partial unique indexes. It adds three SECURITY INVOKER functions (`begin_publish_output_version`, `finish_publish_output_version`, `cancel_published_reply`) and re-creates `export_output_version` with an enumerated change, so counting stays in SQL.
- **Google.** A new reviews client (`lib/oauth/google-reviews.ts`) and a token helper (`lib/publishing/connection.ts`) make the first production use of the stored GBP tokens.
- **Routes and UI.** Four routes (targets, publish, reconcile, delete reply). A publish card is added to the action detail delivery section.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Neon PostgreSQL through `pg` repositories, Vitest 4 with Testing Library and jsdom, pnpm 9.12.0 via `corepack pnpm`.

**Spec:** `docs/superpowers/specs/2026-10-04-gbp-reply-publish-design.md` (approved 2026-10-04). Section numbers below (§n) refer to it.

## Global Constraints

- **Flag.** `GBP_REPLY_PUBLISH_ENABLED` is on only for the exact string `"true"`. When it is off:
  - targets, publish and delete-reply return `404 { error: "not_enabled" }` before any SQL or Google call;
  - reconcile still works (ruling P4);
  - the Publish button is hidden.
- **Safe before 0014 is applied.** The code may be deployed before 0014. With the flag off, no runtime query may name a 0014 column (`target_ref`, `provider_receipt`, `failure_reason`, `verified_at`, `first_published_at`) or a 0014 function, unless a `deliveries` row with `mode = 'publish'` was found first by a query that uses only pre-0014 columns. `test/integration/neon-publish-flag-off.integration.test.ts` (Task 6) proves this against a database migrated only to 0013.
- **Never stored or logged:** review text, reviewer names, reply text, tokens, Google response bodies.
  - Logs carry only `{ category: "gbp_publish_<reason>", deliveryId?, versionId? }`.
  - Errors thrown by the Google client carry only a `GbpErrorCode`.
- **No test calls Google.** Every Google call goes through an injected `fetchImpl` or a mocked module. Likewise no real model, paid provider or mail.
- **Migrations.** Do not edit `0001`–`0013`. `0014` is additive, with SECURITY INVOKER functions and `SET search_path = ''`. EXECUTE is revoked from PUBLIC and granted to `sme_app_runtime`, matching the 0011 re-creations (and P4.5 ruling R2).
- **Counting rule (DEC-14):** a version counts at most once, at its first export or its first verified publish. It is enforced only in SQL, never incremented in TypeScript.
- **Reason codes, exactly** (stored in `deliveries.failure_reason` and returned as `reason`): `already_replied | connection_expired | provider_forbidden | review_not_found | provider_rate_limited | provider_unavailable | not_applied`.
- **Eligibility reasons, exactly:** `flag_off | not_review_response | not_approved | no_location_listing | connection_missing | too_long | empty_body`. `too_long` means over 4,096 UTF-8 bytes (`Buffer.byteLength(body, "utf8") > 4096`). `empty_body` means `body.trim() === ""`.
- **Rate limits.** Each is consumed through `consumeRateLimit` with `rateLimitBucketKey(scope, id)`, with **no** IP fingerprint, so a workspace limit is per workspace. All fail closed (503):
  - `gbp_publish`: 20 per 86,400 s per workspace id;
  - `gbp_publish_global`: 200 per 86,400 s under the key `"all"`;
  - `gbp_targets`: 60 per 3,600 s per workspace id;
  - `gbp_reconcile`: 30 per 86,400 s per delivery id.
- **Authority.**
  - targets, publish and reconcile: `minRole: "manager"` with the action's location (an out-of-scope manager or viewer gets 403);
  - delete-reply: `minRole: "owner"`.
  - The UI mirrors this but is never the authority.
- **Idempotency keys** match `^[A-Za-z0-9_-]{16,64}$`.
- **Copy.** Every new string exists in en, zh-HK and zh-TW in `lib/copy.ts`, under `workspace.publish`. zh-HK uses 香港書面中文, zh-TW uses 台灣用語, en is concise. The confirmation sentence is fixed by §4.
- **Windows hygiene.**
  - `git restore` the line-ending churn in `lib/agents/__snapshots__/agents.test.ts.snap` and `lib/pocket-assistant/__snapshots__/demo.test.ts.snap`.
  - Record load-timeout flakes that pass alone.
  - For integration runs, use `NEON_INTEGRATION=1 corepack pnpm exec vitest run --config vitest.integration.config.ts <files>`.
- **Commits.** Conventional commits, prefixed `(P4.6)`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Lost response after the PUT.** The PUT reaches Google, but the connection drops before 2xx or before the read-back. The delivery must stay `publishing`, nothing is sent again, and "Check on Google" settles it to `published` and counts once (Task 5/6 test `put timeout leaves publishing; reconcile then publishes and counts once`).
2. **Google normalises the reply text** (trailing whitespace, CRLF, NFC versus NFD Chinese). Our own reply must be recognised as ours and not marked `already_replied` (Task 2 `sameReply` tests, Task 5 read-back test with a CRLF and NFD variant).
3. **Two tabs publish the same version to two different reviews at the same moment.** Exactly one `begin` wins; the other gets `already_publishing` and makes no Google call (Task 1 concurrency test, Task 5 route test).
4. **A token expires between page load and click,** or the refresh token was revoked in Google. One refresh and one retry happen. A second 401 gives `connection_expired`, and the connection row becomes `expired` (Task 4 tests). A 403 never touches the row (Task 4).
5. **A long Chinese reply near the limit.** 1,366 CJK characters (4,098 bytes) is refused as `too_long` before `begin`, and 1,365 characters (4,095 bytes) is allowed (Task 3 eligibility test).

---

### Task 1: Migration `0014`, the publish functions, the export re-creation and the publishing repository

**Files:**
- Create:
  - `neon/migrations/0014_publish_reply.sql`
  - `lib/repositories/publishing.ts`
  - `test/integration/neon-publish-reply.integration.test.ts`
  - `lib/workspace/publish-sql.test.ts`
- Modify:
  - `lib/workspace/offer-sql.test.ts`: keep its 0004-vs-0011 assertions on the 0011 text. If any assertion reads the "latest" export definition across all migrations, point it at 0011 explicitly.
  - `lib/db/schema/business.ts`: the new columns on the `deliveries` and `outputVersions` mirrors.
  - `lib/db/database.types.ts`: regenerate with `corepack pnpm db:types`.
  - `test/integration/fixtures/legacy-final-catalog.json`: 5 columns, 2 indexes, 1 check constraint, 3 functions.
  - `scripts/neon/catalog.ts`: function count 20 → 23.
  - `test/integration/neon-schema.integration.test.ts`: the expected list gains `0014_publish_reply.sql`; the column count goes up by 5; tables unchanged.
  - `test/integration/neon-catalog.integration.test.ts`: only if it enumerates names.

**Interfaces:**
- Produces, in SQL, exactly spec §1.1–§1.5:
  - Constraint `deliveries_publish_target_check`: `CHECK (mode <> 'publish' OR target_ref IS NOT NULL)`, added guarded (`IF NOT EXISTS` via `pg_constraint`).
  - Indexes `deliveries_active_publish_version_key` and `deliveries_active_publish_target_key`.
  - `public.begin_publish_output_version(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text) returns jsonb`
  - `public.finish_publish_output_version(p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text) returns jsonb`
  - `public.cancel_published_reply(p_delivery_id uuid, p_actor uuid) returns jsonb`
  - The `export_output_version` re-creation, with the comment block listing changes (a)–(c).
  - Errors are raised as `P0001` with messages `version_not_found | not_approved | already_publishing | target_busy | allowance_exceeded | delivery_not_publishing | delivery_not_published | invalid_outcome`, plus the offer guard's messages unchanged.
- Produces, in `lib/repositories/publishing.ts`:
  - `type PublishErrorCode = "version_not_found" | "not_approved" | "already_publishing" | "target_busy" | "allowance_exceeded" | "delivery_not_publishing" | "delivery_not_published" | "invalid_outcome" | "offer_not_found" | "offer_inactive" | "offer_changed" | "offer_expired"`
  - `class PublishError extends Error { constructor(readonly code: PublishErrorCode) }`. Any other database error is rethrown unchanged.
  - `type PublishState = "publishing" | "published" | "failed" | "cancelled"`
  - `type PublishDelivery = { id: string; workspaceId: string; versionId: string; actionId: string; locationId: string | null; templateKey: string; versionNo: number; body: string; state: PublishState; targetRef: string; counted: boolean; failureReason: string | null; verifiedAt: string | null; createdAt: string }`
  - `publishingRepository(client?: Executor)` returns:
    - `begin(input: { versionId: string; actorId: string; targetRef: string; idempotencyKey: string }): Promise<{ kind: "begun" | "existing"; deliveryId: string; state: PublishState }>`
    - `finish(input: { deliveryId: string; actorId: string; outcome: "published" | "failed"; receipt: { review_name: string; reply_update_time: string | null } | null; reason: string | null }): Promise<{ kind: "finished" | "existing"; state: PublishState; counted: boolean }>`
    - `cancel(input: { deliveryId: string; actorId: string }): Promise<{ state: "cancelled" }>`
    - `publishDeliveryIds(workspaceId: string, versionIds: string[]): Promise<Array<{ id: string; versionId: string; state: string; createdAt: string }>>`. **Pre-0014-safe:** it selects only `id, version_id, state, created_at` where `mode = 'publish'`.
    - `getDelivery(deliveryId: string): Promise<PublishDelivery | null>`. It first runs the pre-0014-safe check that the row exists with `mode = 'publish'`; only then does it read 0014 columns, joined to `output_versions` and `actions`.

- [ ] **Step 1: Write the failing integration tests** in `neon-publish-reply.integration.test.ts`. Reuse the seed in `test/integration/neon-offer-freshness.integration.test.ts` (a workspace, location, action, and an approved version), with a lite workspace (allowance 3).
  - `0014 applies after 0013 and a second applyMigrations returns []`
  - `begin on an approved version returns begun, sets the version delivery_state publishing and does not touch workspace_usage`
  - `begin with the same idempotency key returns existing with the same delivery id`
  - `begin on a draft returns not_approved; a second begin for a version with an active publish returns already_publishing`
  - `begin for a target already published by another version returns target_busy`
  - `two parallel begins for one version: exactly one begun` (`Promise.all` on two pool connections)
  - `begin raises allowance_exceeded when approved_deliveries = allowance and the version never counted; it does not raise when the version was already exported`
  - `finish published counts once: counted true, approved_deliveries +1, verified_at set, first_published_at set, delivery_state published`
  - `finish failed stores failure_reason, counts nothing, and restores delivery_state to export_ready (or exported when first_exported_at is set)`
  - `a second finish on a finished delivery returns existing and changes nothing`
  - DEC-14 matrix, each asserting the final `approved_deliveries` delta is exactly 1:
    - `export then publish`
    - `publish then export`
    - `failed publish then export`
    - `publish, cancel, publish again`
  - `export of a published version keeps delivery_state published and returns counted false`
  - `cancel on published sets cancelled, keeps counted and first_published_at, refunds nothing; cancel on publishing raises delivery_not_published`
  - `the four functions are SECURITY INVOKER with search_path '' and EXECUTE for sme_app_runtime only` (query `pg_proc` and `has_function_privilege`)
  - `a publish delivery without target_ref violates deliveries_publish_target_check`
- [ ] **Step 2: Write `lib/workspace/publish-sql.test.ts`**, using the `definitions`/`only` helpers in `offer-sql.test.ts` (export them from a small shared helper, or copy them):
  - `export_output_version in 0014 equals the 0011 text after applying exactly changes (a)-(c)`. Build the expected text from the 0011 definition with explicit `replace` calls, one per enumerated edit, and assert each replacement matched exactly once.
  - `0014 defines the three new functions exactly once each, with REVOKE and GRANT`.
- [ ] **Step 3: Run both files.** Expected: FAIL.
- [ ] **Step 4: Write the migration,** then the mirrors, the catalog fixture, the count, and `publishing.ts`. Run `corepack pnpm db:types`.
- [ ] **Step 5: Run the integration file, `neon-schema`, `neon-catalog`, `neon-offer-freshness`, `offer-sql.test.ts` and `publish-sql.test.ts`,** then `corepack pnpm db:verify` and `corepack pnpm typecheck`. Expected: PASS. `db:verify` replays to `[]`.
- [ ] **Step 6: Commit** `feat(P4.6): publish columns, begin/finish/cancel functions and once-per-version counting (0014)`.

---

### Task 2: Google reviews client

**Files:**
- Create:
  - `lib/oauth/google-reviews.ts`
  - `lib/oauth/google-reviews.test.ts`
- Modify:
  - `lib/oauth/google-business-profile.ts`: export `listManagedLocations(accessToken, fetchImpl?): Promise<Array<{ accountName: string; locationName: string; placeId: string }>>`, built from the existing `listAllAccounts` and `listAllLocations`. `listManagedPlaceIds` becomes a map over it, with unchanged output, and its existing tests stay green.

**Interfaces:**
- Produces exactly the spec §2.2 signatures: `GbpErrorCode`, `GbpError` (with `readonly code`), `GbpReviewTarget`, `findLocationForPlace`, `listUnrepliedReviews(accessToken, location: { accountName: string; locationName: string }, fetchImpl?)`, `getReview`, `putReply`, `deleteReply`.
- Also produces:
  - `sameReply(a: string, b: string): boolean`: `normalize("NFC")`, `\r\n` → `\n`, `trim()`.
  - `reviewNameIsUnder(reviewName: string, location: { accountName: string; locationName: string }): boolean`. True only for `${accountName}/${locationName}/reviews/<id>`, where `<id>` matches `^[A-Za-z0-9_-]+$`.
- **v4 location naming.** Business Information v1 names a location `locations/{id}`, so v4 paths are `${accountName}/${locationName}/reviews…`, e.g. `accounts/1/locations/2/reviews/3`.
- **Constants.**
  - `REVIEWS_BASE = "https://mybusiness.googleapis.com/v4"`
  - list: `pageSize=50`, `orderBy=updateTime desc`, at most 3 pages;
  - `excerpt`: the first 200 code points of `comment` (an empty string when absent);
  - `starRating` maps the enum `ONE`…`FIVE` to 1–5, and anything else to `null`;
  - `reviewer` is `reviewer.displayName ?? ""`.
- **Calls.**
  - `putReply` sends `PUT …/reply` with JSON `{ comment }`.
  - `deleteReply` sends `DELETE …/reply`; a 404 resolves (already deleted).
  - `getReview` sends `GET …/reviews/{id}`; it returns `replyComment: reviewReply?.comment ?? null`.

- [ ] **Step 1: Write the failing tests:**
  - `findLocationForPlace returns account and location for a matching placeId across a second accounts page; null when absent`
  - `listUnrepliedReviews skips replied reviews, stops at 50 and at 3 pages, maps star enums and truncates excerpts to 200 code points`
  - `status mapping: 401 unauthorized, 403 forbidden, 404 not_found, 429 rate_limited, 500 provider_error`
  - `an AbortSignal timeout gives timeout; a rejected fetch gives network`
  - `putReply sends PUT with {comment} and a bearer header; deleteReply treats 404 as success`
  - `thrown errors never contain the access token or the response body` (the fake body contains `SECRET_BODY`, and the token is `tok_SECRET`)
  - `sameReply: CRLF vs LF, trailing spaces and NFD vs NFC are equal; one changed character is not`
  - `reviewNameIsUnder rejects another location, a path with extra segments and an encoded slash`
  - the existing `listManagedPlaceIds` tests stay green
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/oauth`. Expected: FAIL on the new file.
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run** `corepack pnpm exec vitest run lib/oauth` and `corepack pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.6): Google Business Profile reviews client with code-only errors`.

---

### Task 3: Flag, eligibility, limits, target preselection and the capability helper

**Files:**
- Create:
  - `lib/publishing/flag.ts`, `lib/publishing/eligibility.ts`, `lib/publishing/limits.ts`, `lib/publishing/preselect.ts`
  - matching `*.test.ts` files
- Modify:
  - `lib/security/rate-limit.ts`: add the four scopes and policies from Global Constraints, with one-line comments in the existing style.
  - `lib/capabilities.ts`: add `googleBusinessPublishCapability`.
  - the existing capabilities test file.

**Interfaces:**
- `gbpReplyPublishEnabled(env?: Record<string, string | undefined>): boolean`
- `type EligibilityReason = "flag_off" | "not_review_response" | "not_approved" | "no_location_listing" | "connection_missing" | "too_long" | "empty_body"`
- `publishEligibility(input: { enabled: boolean; templateKey: string; approvalState: string; placeId: string | null; connectionActive: boolean; body: string }): { ok: true } | { ok: false; reason: EligibilityReason }`
  - Checks run in exactly the order of the reason union above, and the first failure wins.
  - `connectionActive` means an `active` `google_gbp` row whose `scopes` include `GBP_SCOPE_REQUIRED`.
- `consumePublishLimits(kind: "publish" | "targets" | "reconcile" | "delete", ids: { workspaceId: string; deliveryId?: string }, client?: RateLimitClient): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number } | { allowed: false; unavailable: true }>`
  - `publish` consumes `gbp_publish`, then `gbp_publish_global`; `delete` consumes `gbp_publish`; `targets` consumes `gbp_targets`; `reconcile` consumes `gbp_reconcile` keyed by `deliveryId`.
  - Each key is `rateLimitBucketKey(scope, id)`, with no request fingerprint.
  - When no client is passed, it defaults to the same `workflowRepository().consumeRateLimit` adapter that `enforceRateLimit` uses.
  - A `RateLimitUnavailableError` returns `{ allowed: false, unavailable: true }` and logs `{ category: "gbp_publish_limiter_unavailable" }`.
- `preselectTarget(targets: GbpReviewTarget[], candidateTexts: string[]): string | null`:
  - normalise with NFC, collapse whitespace and lowercase, then compare the first 40 code points;
  - return the first target (newest first) whose excerpt prefix equals any candidate's prefix;
  - otherwise return `targets[0]?.reviewName ?? null`.
- `googleBusinessPublishCapability(input: { enabled: boolean; connectionActive: boolean }): Capability` returns `"Beta"` only when both are true, otherwise `"Requires connection"`. The `CAPABILITIES` map is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - flag: `only "true" enables; "TRUE", "1", " true" and unset do not`
  - eligibility: one test per reason, in order, plus:
    - `too_long at 4097 bytes, ok at 4096`
    - `1365 CJK characters (4095 bytes) ok; 1366 (4098 bytes) too_long`
    - `whitespace-only body is empty_body`
  - limits:
    - `publish consumes gbp_publish then gbp_publish_global with keys built from rateLimitBucketKey and no fingerprint`
    - `a refused workspace bucket does not consume the global bucket`
    - `limiter error returns unavailable`
  - preselect:
    - `matches a candidate by 40-code-point prefix ignoring case and whitespace`
    - `falls back to the newest`
    - `null for no targets`
  - capability: `Beta only when enabled and connected`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `corepack pnpm exec vitest run lib/publishing lib/capabilities lib/security/rate-limit` and `corepack pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.6): publish flag, eligibility, limits, target preselection and capability`.

---

### Task 4: Token access — `withGbpAccessToken`

**Files:**
- Create:
  - `lib/publishing/connection.ts`
  - `lib/publishing/connection.test.ts`
- Modify:
  - `lib/repositories/publishing.ts`: add the connection methods below.
  - `lib/repositories/claims.ts`: update the `decryptToken` comment at lines 91–93. Tokens are no longer write-only; name `lib/publishing/connection.ts` as the one reader.

**Interfaces:**
- Repository (pre-0014-safe, because `oauth_connections` is unchanged):
  - `activeGbpConnection(workspaceId: string): Promise<{ id: string; accessTokenEncrypted: string; refreshTokenEncrypted: string | null; scopes: string[]; expiresAt: string | null } | null>`
  - `storeRefreshedToken(input: { connectionId: string; workspaceId: string; accessTokenEncrypted: string; expiresAt: string | null }): Promise<void>`. This runs in a transaction that first runs `SELECT id FROM workspaces WHERE id=$1 FOR UPDATE`, the lock `replaceGoogleConnection` takes. It updates only `WHERE id=$2 AND status='active'`.
  - `markConnectionExpired(connectionId: string): Promise<void>`. It updates only `WHERE id=$1 AND status='active'` and sets `updated_at=now()`.
- `type ConnectionFailure = "connection_missing" | "connection_expired"`
- `class GbpConnectionError extends Error { constructor(readonly code: ConnectionFailure) }`
- `withGbpAccessToken<T>(workspaceId: string, fn: (accessToken: string) => Promise<T>, deps?: { repository?: Pick<ReturnType<typeof publishingRepository>, "activeGbpConnection" | "storeRefreshedToken" | "markConnectionExpired">; refresh?: typeof refreshAccessToken; now?: () => number }): Promise<T>`. It behaves exactly as spec §2.3:
  - A `GbpError("forbidden")` from `fn` is rethrown unchanged and the row is untouched.
  - Every other `GbpError` from `fn` is rethrown unchanged.

- [ ] **Step 1: Write the failing tests** (fake repository, a fake `refresh`, `encryptToken`/`decryptToken` with a test key):
  - `no active row gives connection_missing; a row without business.manage gives connection_missing`
  - `a fresh token is passed to fn without refreshing`
  - `an expiring token is refreshed, the re-sealed token stored, and fn gets the new token`
  - `refresh returning null marks the row expired and throws connection_expired`
  - `fn throwing unauthorized once triggers one refresh and one retry; a second unauthorized marks expired and throws connection_expired`
  - `a just-refreshed token that gets unauthorized is not refreshed again`
  - `forbidden is rethrown and the row is never marked`
  - `no thrown error message or logged argument contains the plaintext access or refresh token` (spy on `console.error`)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `corepack pnpm exec vitest run lib/publishing` and `corepack pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.6): first read of stored GBP tokens with one refresh and expiry marking`.

---

### Task 5: Targets and publish routes

**Files:**
- Create:
  - `app/api/versions/[versionId]/publish/targets/route.ts`
  - `app/api/versions/[versionId]/publish/route.ts`
  - `app/api/versions/[versionId]/publish/publish.test.ts`
  - `lib/publishing/run-publish.ts`
  - `lib/workspace/delivery-notices.ts`
- Modify:
  - `app/api/versions/[versionId]/export/route.ts`: replace its inline delivery and allowance-at-80 % notice block with `sendDeliveryNotices` (no behaviour change; its tests stay green).
  - `lib/repositories/publishing.ts`: add `publishSubject` and `candidateReviewTexts`.

**Interfaces:**
- `sendDeliveryNotices(input: { workspaceId: string; actionId: string; kind: "export" | "copy" | "publish"; usage: Usage }): Promise<void>`. It is best-effort and never throws. The titles are the export route's existing strings; for `publish` they are `localized("Approved reply published to Google", "已將核准回覆發佈到 Google")`. The allowance notice is unchanged.
- Repository additions:
  - `publishSubject(versionId: string): Promise<{ workspaceId: string; actionId: string; locationId: string | null; placeId: string | null; templateKey: string; versionNo: number; approvalState: string; body: string } | null>`. Pre-0014-safe.
  - `candidateReviewTexts(versionId: string): Promise<string[]>`. It resolves the action's `source_snapshot_id` to its job, reads the raw data through the same query `assistantReviewData` uses, and returns `filterSelectedReviews(sampledReviewsFromRawData(raw), action.provided_inputs.selected_reviews).map(r => r.text)` (helpers from `lib/workspace/evidence-inputs.ts`). Any failure returns `[]`.
- `runPublish(input: { workspaceId: string; deliveryId: string; actorId: string; reviewName: string; body: string }, deps?: { repository?; fetchImpl?: typeof fetch; withToken?: typeof withGbpAccessToken }): Promise<{ state: PublishState; counted: boolean; reason?: string }>`. It follows spec §3.2 step 5 and the §5 table exactly:
  - pre-read: equal → finish published; different → finish failed `already_replied`; `not_found` → failed `review_not_found`; `timeout`, `network` or `provider_error` → failed `provider_unavailable`;
  - PUT; then read-back: equal → published; otherwise stay `publishing`;
  - a `timeout`, `network` or `provider_error` on the PUT or read-back → stay `publishing`, **no second PUT**;
  - `rate_limited` → failed `provider_rate_limited`; `forbidden` → failed `provider_forbidden`; `GbpConnectionError("connection_expired")` → failed `connection_expired`.
  - The receipt is `{ review_name, reply_update_time }` from the read-back.
- Route order, for both routes: `UUID_RE` check → flag (404) → `publishSubject` (404 when null) → `authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "manager", locationId })`, mapping a failure to its status → eligibility (409 `{ error: reason }`) → limits (429 with `Retry-After`, or 503).
- `GET …/publish/targets` → `withGbpAccessToken(findLocationForPlace)`, then:
  - null location → 409 `location_not_managed`;
  - otherwise `listUnrepliedReviews` and `preselectTarget(targets, await candidateReviewTexts(versionId))`;
  - `200 { targets, preselected }`;
  - Google or connection errors → 502 `{ error: <reason code> }`.
- `POST …/publish` body is zod `{ reviewName: string, idempotencyKey: string, confirmVersionNo: number int }`:
  1. `confirmVersionNo !== versionNo` → 409 `version_changed`.
  2. Resolve the location as in targets. `!reviewNameIsUnder(reviewName, location)` → 403 `target_not_in_location`.
  3. Limits `publish`.
  4. `begin`. A `PublishError` → 409 `{ error: code }`. `existing` → return that delivery's current state without calling Google.
  5. `runPublish`.
  6. `getUsage(...)` as the export route does. On `counted`, `sendDeliveryNotices(kind: "publish")`.
  7. `200 { deliveryId, state, counted, reason?, usage }`.
- `export const runtime = "nodejs"; export const maxDuration = 30;` on both routes.

- [ ] **Step 1: Write the failing route tests.** Mock `@/lib/auth`, `@/lib/repositories/publishing`, `@/lib/publishing/connection` (passing through to `fn` with a fixed token), `@/lib/publishing/limits`, `@/lib/workspace/usage` and the notices. Use a fake `fetchImpl` injected through `runPublish` deps and the client.
  - `flag off: both routes 404 not_enabled and no repository call`
  - `viewer 403; manager out of scope 403; owner and in-scope manager pass`
  - `eligibility reasons return 409 with the reason; too_long never reaches begin`
  - `targets: location_not_managed 409; returns targets and preselected from candidate texts`
  - `publish: version_changed 409; target_not_in_location 403; limiter refused 429 with Retry-After; limiter unavailable 503`
  - `publish happy path: pre-read no reply, PUT, read-back equal → published, counted, notices sent once`
  - `read-back with CRLF and NFD variant of our body → published`
  - `pre-read finds a different reply → failed already_replied and no PUT was sent`
  - `pre-read finds our body → published without a PUT`
  - `put timeout leaves publishing with exactly one PUT sent and finish never called` (Task 6 extends this to reconcile)
  - `401 twice → failed connection_expired; 403 → failed provider_forbidden; 429 → failed provider_rate_limited; 404 → failed review_not_found`
  - `same idempotency key returns the existing delivery and sends nothing to Google`
  - `already_publishing from begin → 409 and no Google call`
  - `no console.error argument contains the reply body, review text, reviewer name or token` (spy)
  - the export route tests stay green after the notice extraction
- [ ] **Step 2: Run the files.** Expected: FAIL.
- [ ] **Step 3: Implement** `delivery-notices.ts` (and switch the export route to it), the repository additions, `run-publish.ts` and the two routes.
- [ ] **Step 4: Run** `corepack pnpm exec vitest run app/api/versions lib/publishing lib/workspace`, then `corepack pnpm typecheck` and `corepack pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.6): publish targets and publish routes with verified read-back`.

---

### Task 6: Reconcile and delete-reply routes, and the flag-off proof

**Files:**
- Create:
  - `app/api/deliveries/[deliveryId]/reconcile/route.ts`
  - `app/api/deliveries/[deliveryId]/reply/route.ts`
  - `app/api/deliveries/[deliveryId]/deliveries.test.ts`
  - `lib/publishing/reconcile.ts`
  - `test/integration/neon-publish-flag-off.integration.test.ts`
- Modify: `app/api/versions/[versionId]/publish/publish.test.ts`. Extend the PUT-timeout test into `put timeout leaves publishing; reconcile then publishes and counts once`, which calls the reconcile route with the same fake.

**Interfaces:**
- `reconcileDelivery(delivery: PublishDelivery, actorId: string, deps?: { repository?; fetchImpl?: typeof fetch; withToken?: typeof withGbpAccessToken }): Promise<{ state: PublishState; counted: boolean; reason?: string }>`. It follows spec §3.3 step 3:
  - equal → finish published;
  - `replyComment === null` → finish failed `not_applied`;
  - different → failed `already_replied`;
  - `not_found` → failed `review_not_found`;
  - any other error, or `GbpConnectionError` → state stays `publishing`, returning `reason` (`connection_expired` / `provider_forbidden` / `provider_rate_limited` / `provider_unavailable`) without finishing.
- `POST /api/deliveries/[deliveryId]/reconcile`. **No flag check.**
  1. `UUID_RE`.
  2. `getDelivery` (404 when null).
  3. Authorize: `minRole: "manager"`, `locationId` from the delivery.
  4. Not `publishing` → `200 { deliveryId, state, counted }`. `publishing` younger than 15,000 ms → `200 { state: "publishing", reason: "too_soon" }`.
  5. Limits `reconcile`.
  6. `withGbpAccessToken(getReview)`, then `reconcileDelivery`.
  7. On `counted`, `sendDeliveryNotices(kind: "publish")`.
- `DELETE /api/deliveries/[deliveryId]/reply`. Flag check first (404).
  1. `getDelivery`.
  2. Authorize with `minRole: "owner"`.
  3. Not `published` → 409 `delivery_not_published`.
  4. Limits `delete`.
  5. `getReview`: a different reply → 409 `reply_changed_on_google`. Equal, or no reply → `deleteReply`, then `cancel`.
  6. `200 { state: "cancelled" }`. Google errors → 502 `{ error: reason }`, with no cancel.
- Both routes: `runtime = "nodejs"`, `maxDuration = 30`.

- [ ] **Step 1: Write the failing tests:**
  - reconcile:
    - `works with the flag off`
    - `viewer 403; out-of-scope manager 403`
    - `a published delivery returns its state without a Google call`
    - `under 15 s returns too_soon without a Google call`
    - `equal → published and counted once; null → not_applied; different → already_replied; not_found → review_not_found; timeout → stays publishing with provider_unavailable`
    - `limiter refused 429`
  - delete:
    - `flag off 404`
    - `manager 403; owner passes`
    - `not published 409`
    - `changed on Google 409 and no DELETE sent`
    - `equal → DELETE then cancel, 200 cancelled`
    - `Google 500 → 502 and no cancel`
  - `neon-publish-flag-off.integration.test.ts`, against a fixture migrated **only to 0013** (`applyMigrations` with the 0014 entry filtered out), recording every statement as `neon-preview-flag-off.integration.test.ts` does:
    - `with the flag off, targets, publish and delete answer 404 and send no SQL`
    - `reconcile for an unknown delivery answers 404 without naming a 0014 column`
    - `publishDeliveryIds runs without error and names no 0014 column`
    - `export_output_version still exports and counts on the 0013 schema` (the export path is unaffected by deploy order)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the unit files, the Task 5 file, and the flag-off integration file, then `corepack pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(P4.6): reconcile and owner-only reply delete, flag-off proof without 0014`.

---

### Task 7: Publish card on the action detail page, and copy

**Files:**
- Create:
  - `lib/publishing/page-state.ts`
  - `components/workspace/gbp-publish-card.tsx`
  - `components/workspace/gbp-publish-card.test.tsx`
  - `lib/publishing/page-state.test.ts`
- Modify:
  - `app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx`: load `publishPanel` and pass it to the view.
  - `components/workspace/action-detail-view.tsx` and `components/workspace/action-detail-client.tsx`: accept `publishPanel: PublishPanel | null` and render `<GbpPublishCard>` inside the existing `delivery-card` `SectionCard`, below the export button.
    - The card heading's `CapabilityBadge` uses `googleBusinessPublishCapability` when `publishPanel` is non-null.
    - The paragraph "No verified direct-publishing connector is present…" stays when `publishPanel` is null or not enabled. When `publishPanel.enabled` is true, it becomes the `workspace.publish.deliveryIntro` copy.
  - `lib/copy.ts`: add the `workspace.publish` strings to all three locales.
  - `test/integration/neon-publish-flag-off.integration.test.ts`: add the case `loadPublishPanel with the flag off runs on the 0013 schema and names no 0014 column`.

**Interfaces:**
- `type PublishPanel = { enabled: boolean; eligibility: { ok: true } | { ok: false; reason: EligibilityReason }; canPublish: boolean; canDelete: boolean; deliveries: Array<{ id: string; versionId: string; state: PublishState; reason: string | null; verifiedAt: string | null; createdAt: string }> }`
- `loadPublishPanel(input: { workspaceId: string; templateKey: string; locationPlaceId: string | null; role: WorkspaceRole; inScope: boolean; versions: Array<{ id: string; approval_state: string; body: string }>; enabled?: boolean }): Promise<PublishPanel | null>`:
  - Returns `null` when `templateKey !== "review-response"`.
  - Calls `publishDeliveryIds` (pre-0014-safe) **always**.
  - Reads the 0014 columns through `getDelivery` **only** for the ids found.
  - Reads `activeGbpConnection` **only** when `enabled`.
  - Eligibility uses the latest approved version (none → `not_approved`).
  - `canPublish = enabled && eligibility.ok && role !== "viewer" && (role === "owner" || inScope)`; `canDelete = enabled && role === "owner"`.
  - With the flag off and no publish rows, it returns `{ enabled: false, … deliveries: [] }`, and the card renders nothing.
- `<GbpPublishCard locale versionId versionNo body panel workspaceSlug onChanged />`. A client component; spec §4 fixes its behaviour:
  - "Publish to Google" opens a dialog that fetches targets, renders a radio list (stars, reviewer, date, excerpt), checks the preselected one, and shows the full body read-only with "Version N · approved".
  - The required checkbox carries the fixed confirmation sentence. Publish stays disabled until a review is selected and the box is checked.
  - The idempotency key is made once per dialog opening with `crypto.randomUUID().replaceAll("-", "")`.
  - It renders the state for the latest delivery of the selected version:
    - **Published on Google:** verified time, plus "Delete reply" (owner) behind a confirm dialog.
    - **Couldn't confirm:** with "Check on Google".
    - **Failed:** with reason copy.
    - **Deleted from Google.**
  - On mount, it POSTs reconcile **once** for each `publishing` delivery older than 15 s, then calls `onChanged` (`router.refresh()`).
  - `connection_missing` shows a link to `/{locale}/owner/{workspaceSlug}/settings/integrations`.
- `workspace.publish` copy keys, in all three locales:
  - `deliveryIntro`, `publishButton`, `dialogTitle`, `pickReview`, `noTargets`, `versionLabel` (`"Version {n} · approved"`), `confirm`, `publishConfirm`, `cancel`, `checkOnGoogle`, `deleteReply`, `deleteConfirm`
  - `state.published` / `state.publishing` / `state.failed` / `state.cancelled`
  - `reasons.<each reason code and eligibility code>`
  - The en `confirm` is exactly: "I confirm this exact approved version will be posted publicly as the owner's reply to the selected review."
  - The en `state.publishing` is exactly: "We couldn't confirm Google received it. Nothing will be sent again automatically."

- [ ] **Step 1: Write the failing tests.**
  - `page-state.test.ts`:
    - `null for another template`
    - `flag off reads no connection and returns deliveries only when publish rows exist`
    - `canPublish false for viewer and out-of-scope manager; canDelete only for owner`
    - `eligibility uses the latest approved version`
  - `gbp-publish-card.test.tsx`:
    - `renders nothing when disabled with no deliveries`
    - `Publish is disabled until a review is selected and the confirmation is checked`
    - `preselected review is checked`
    - `posts reviewName, idempotencyKey and confirmVersionNo; reuses the key on retry`
    - `uncertain state shows Check on Google and calls reconcile`
    - `reconciles once on mount for a publishing delivery older than 15 s`
    - `Delete reply only for owners and asks for confirmation`
    - `connection_missing shows the integrations link`
    - `zh-HK and zh-TW render their own strings`
  - The flag-off integration case named above.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement,** then wire the page, view and client.
- [ ] **Step 4: Run** `corepack pnpm exec vitest run components/workspace lib/publishing` and the flag-off integration file, then `corepack pnpm typecheck` and `corepack pnpm lint`. Expected: PASS, and the existing `action-detail-client.test.tsx` is still green.
- [ ] **Step 5: Commit** `feat(P4.6): publish card with exact-version confirmation, uncertain state and owner delete`.

---

### Task 8: Rollout file, records and the full gate run

**Files:**
- Create: `docs/implementation/owner-platform-v1/rollout/apply-0014.sql`
- Modify:
  - `docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`: a P4.6 section with rulings P1–P5 plus any made during execution, and the runbook "`apply-0014.sql`".
  - `docs/implementation/owner-platform-v1/PHASE-4-TEST-RESULTS.md`: a P4.6 section.
  - `docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md`: P4.6 rows.
  - `docs/implementation/owner-platform-v1/BUSINESS-AND-HOSTED-DECISIONS.md`: DEC-13 and DEC-14 decided 2026-10-04, using the spec's decisions table.
  - `docs/implementation/owner-platform-v1/HOSTED-ACCEPTANCE-CHECKLIST.md`: a new section per spec §8, with an Effect line.
  - `docs/integration/DEPLOY.md` and `.env.example`: `GBP_REPLY_PUBLISH_ENABLED=` (unset by default), with one line on what it enables.

**Interfaces:**
- `apply-0014.sql` follows `apply-0013.sql`'s header and structure exactly:
  - one `DO $apply$` block;
  - `SET LOCAL ROLE smeassistant_migrator`, then a `current_user` check;
  - `pg_advisory_xact_lock(1936549221, 3)`;
  - the journal must be exactly ordinals 1–13, with the names and sha256 checksums `loadMigrations()` computes;
  - the exact text of `0014_publish_reply.sql`;
  - journal row 14 with its checksum;
  - the post-apply checks from spec §1.6.
- Its header states:
  - 0014 is **not** required before deploying the P4.6 code (Task 6 proves the flag-off path against 0013);
  - 0014 **is** required before setting the flag;
  - applying it changes `export_output_version`, but before any publish exists the new body counts exports exactly as before (`first_published_at` is null everywhere);
  - a second run refuses with the journal message.

- [ ] **Step 1: Write `apply-0014.sql`.** Rehearse it twice on a disposable `postgres:16`:
  1. Migrate to 0013 with the runner.
  2. Create the roles as the 0013 rehearsal did.
  3. Run the file. Expected: the success notice.
  4. Run it again. Expected: the journal refusal and no change.

  Record both outputs and the checksum in the report.
- [ ] **Step 2: Update the records and docs** listed above. Name every owner action:
  - request GBP API access for the GCP project;
  - apply 0014 on the test branch, then production;
  - the separate non-production release approval with the Fimmick-owned listing;
  - the production flag decision.
- [ ] **Step 3: Run the full gate sequentially:**
  - `corepack pnpm typecheck`
  - `corepack pnpm lint`
  - `corepack pnpm test`
  - `corepack pnpm db:verify`
  - `corepack pnpm test:integration` (Docker running)
  - `corepack pnpm test:secret-boundary`, `corepack pnpm build` and `corepack pnpm e2e`. On Windows these may hit the known Turbopack radix resolve error; run the `--webpack` diagnostic and record that CI is the gate.

  Record the exact counts and results in `PHASE-4-TEST-RESULTS.md`, and `git restore` the snapshot line-ending churn.
- [ ] **Step 4: Commit** `docs(P4.6): rollout statement, DEC-13/14 record, checklist and gate results`.
