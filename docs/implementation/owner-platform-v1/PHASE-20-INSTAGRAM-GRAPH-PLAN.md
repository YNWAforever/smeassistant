# Phase 20 — Instagram publishing and insights (proposed scope)

Status: **P20.1 connection, P20.2a publish primitives, P20.2b delivery path and P20.2c publish UI + copy implemented behind flags; live verification Not tested.** The account connection (OAuth start/callback, long-lived token storage, owner-only disconnect, Business → Integrations UI, flags, unconfigured-environment behaviour) shipped in P20.1 behind `INSTAGRAM_OAUTH_ENABLED`. P20.2a added the Graph publish protocol client, the publish token-refresh helper, publish eligibility and `INSTAGRAM_PUBLISH_ENABLED` (all unset). P20.2b added the Instagram publish delivery path (`neon/migrations/0023_instagram_publish.sql`, version publish and delivery reconcile routes, rate limits, run/reconcile pipelines) and P20.2c added the action-detail delivery card and en/zh-HK/zh-TW copy, but **the migration is not applied to any hosted database**, so no delivery can be created and the card only appears once the flag is on. No Meta app, credentials or App Review approvals exist, so no live consent, publish or insight call has been executed and every live acceptance item remains **Not tested**. Direct publishing stays disabled under guardrail 6 ("Never auto-publish") until the migration is applied, the owner completes the Meta prerequisites and explicitly authorizes a publish.

Baseline: application code `eaa1e13a` on `main` (2026-11-17). Requested by the owner on 2026-11-18: post to a connected Instagram account and read that account's insights from the product.

## 1. Outcome

An owner can, from an already-approved exact content version:

1. connect a professional Instagram account through Meta's OAuth consent;
2. explicitly publish that approved version as a feed post, with a receipt and audit trail;
3. read account-level and per-media insights inside the product, labelled honestly as platform-reported observations.

Instagram remains read-only for evidence elsewhere: the confirmed public handle keeps powering scan-time public evidence, and nothing in this phase changes what anonymous scanning may collect.

## 2. What exists today (evidence)

| Area | Current state | Evidence |
|---|---|---|
| Instagram "connection" | Plain owner-confirmed handle; explicitly **not** OAuth | [`supabase/migrations/20260826000001_workspaces_instagram_handle.sql`](../../../supabase/migrations/20260826000001_workspaces_instagram_handle.sql) |
| Handle save API | Owner-only, writes `workspaces.instagram_handle`, syncs primary location, audits `integration.updated` | [`app/api/workspaces/[workspaceId]/instagram-handle/route.ts`](../../../app/api/workspaces/[workspaceId]/instagram-handle/route.ts) |
| Instagram evidence | Public posts via RapidAPI search only; card copy "Read public posts only. Never posts." | [`lib/scanner/ig-search/`](../../../lib/scanner/ig-search), [`lib/copy-workspace-business.ts`](../../../lib/copy-workspace-business.ts) |
| Content drafting | Social-post agent drafts text; explicitly does not publish or connect | [`lib/agents/agents/social-post.ts`](../../../lib/agents/agents/social-post.ts) |
| Publishing subsystem | Exists for **Google review replies only** (`gbpReplyPublishEnabled`, GBP token); no Instagram code | [`lib/publishing/`](../../../lib/publishing), [`app/api/deliveries/[deliveryId]/reply/route.ts`](../../../app/api/deliveries/[deliveryId]/reply/route.ts) |
| Insights | None. No Graph API call, metric map or storage anywhere | repository search: no `manage_insights`, `/media`, `/insights` |
| OAuth connectors | Google only (GBP connection, GBP claim, GSC token) | [`lib/oauth/`](../../../lib/oauth) |
| Token storage | Encrypted `oauth_connections` with `provider in ('instagram','google_gbp','ga4')`; `'instagram'` reserved but unimplemented | [`supabase/migrations/20260801000000_workspaces_oauth_connections.sql`](../../../supabase/migrations/20260801000000_workspaces_oauth_connections.sql), [`lib/security/token-crypto.ts`](../../../lib/security/token-crypto.ts) |

## 3. Prerequisites (owner/Meta console, before any live verification)

These are outside the repository and must be completed by the owner; each produces evidence recorded in the phase report.

| # | Action | Where | Evidence to record | Blocks |
|---|---|---|---|---|
| P1 | Instagram **professional** (Business or Creator) account | Instagram app | Account type + handle | Everything |
| P2 | That account linked to a Facebook Page the owner controls | Meta Business Suite | Page id + link confirmation | Instagram Graph API |
| P3 | Meta **developer app** of the Business type | developers.facebook.com | App id, app mode | OAuth |
| P4 | Add **Instagram Graph API** product; allow redirect URI `<APP_ORIGIN>/api/oauth/instagram/callback` (preview + production) | Meta app dashboard | Registered URI list | OAuth callback |
| P5 | Request permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, plus `pages_show_list` and `pages_read_engagement` (advanced access / App Review, with screen recording). The two page permissions are what let the long-lived user token enumerate the Facebook Page that owns the professional account; without them `/me/accounts` cannot resolve an account at all. | Meta app dashboard | Approval status per permission, review date | Publish, insights, connection |
| P6 | Business verification for the app's business | Meta Business Suite | Verification status | Advanced access |
| P7 | Long-lived token policy confirmed (60-day token, refresh window) | Meta docs + app settings | Documented policy | Token refresh |
| P8 | Hosted secrets set for preview and production: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, and the flag `INSTAGRAM_OAUTH_ENABLED` (exactly `"true"`; unset = unavailable) | Vercel project settings | Presence only, never values | OAuth |
| P9 | Feature flags set deliberately: `INSTAGRAM_PUBLISH_ENABLED`, `INSTAGRAM_INSIGHTS_ENABLED` (exactly `"true"`; default unset = unavailable) | Vercel settings | Flag state per environment | All live calls |
| P10 | Pin the Graph API version (for example `v23.0`) and record it | Repo config + docs | Version constant | All calls |

Until P1–P7 exist, the implementation can be built and tested against an injected fake transport, but every live acceptance item remains **Not tested**.

## 4. Architecture

### 4.1 OAuth and connection lifecycle

- `GET /api/oauth/instagram/start` — owner-only; `404 not_enabled` while `INSTAGRAM_OAUTH_ENABLED` is not exactly `"true"`, `503 unavailable` when the flag is on but the app id/secret/redirect or encryption key is missing. Signs a `state` value derived from `OAUTH_TOKEN_ENCRYPTION_KEY` with a domain-separated key (same pattern as [`lib/oauth/google-connection.ts`](../../../lib/oauth/google-connection.ts)); redirects to Meta consent with the P5 scopes. `?workspace=<slug>` is only a selector: the membership lookup is filtered by the session user and the role must be `owner`.
- `GET /api/oauth/instagram/callback` — verifies state, re-checks the session/owner membership, exchanges the code, converts the short-lived token to a long-lived one, verifies every requested permission was granted (`/me/permissions`), resolves the professional account through `/me/accounts` (`instagram_business_account`), and stores ciphertext in `oauth_connections` (`provider='instagram'`, `account_ref={"id":"<ig user id>","username":"<handle>"}`, `scopes`, `expires_at`, `status='active'`). Audits `integration.updated`. Every outcome redirects to the integrations page with a content-free `?instagram=<code>` (`ok`, `declined`, `invalid`, `invalid_state`, `unauthenticated`, `forbidden`, `unavailable`, `no_instagram_account`, `missing_permissions`, `storage_failed`); no provider text or token is ever placed in the redirect.
- Refresh: `refreshInstagramToken` re-exchanges the long-lived token and `needsInstagramRefresh` uses a 7-day skew. Both are implemented and tested in P20.1 but have no caller until P20.2/P20.3 use the token; a refresh failure must mark `status='expired'` and surface the reconnect action (never retry publish silently).
- `DELETE /api/workspaces/[workspaceId]/instagram-connection` — owner-only; revokes the stored credential (`status='revoked'`, ciphertext cleared), does not call Meta's deauthorize endpoint (the dialog points the owner at Instagram's own app-permissions page), and audits the disconnect. Idempotent: `disconnected: false` means there was nothing usable left to withdraw.
- Unconfigured environment (no app id/secret/encryption key) returns `503 unavailable` on every route; no partial flows.

### 4.2 Publishing

- Reuses the existing delivery model: approved `output_versions` row → `deliveries` row with `mode='publish'`, `channel='instagram'`, unique `idempotency_key`. No new approval mechanism, no new scheduling. **P20.2b prerequisite discovered in P20.2a:** `begin_publish_output_version` hardcodes `channel='google_business'` and the review-response eligibility checks, so an additive migration (hand-applied after `db:verify`, following the migration rulebook) must add the Instagram path; P20.2a is therefore transport/helper/eligibility only and cannot create a delivery.
- `POST /api/versions/[versionId]/publish-instagram` (owner or in-scope manager, per the existing delivery authorization model; mirrors the existing version publish route rather than inventing a delivery-first route):
  1. re-verify the version is the currently approved immutable version;
  2. create a media container (`image_url` publicly fetchable, caption) for a single feed image;
  3. poll container status with bounded attempts;
  4. `media_publish`; persist `provider_receipt` (media id, permalink, created time);
  5. transition delivery `publishing → published`, count the delivery per existing rules, audit `delivery.published`.
- `POST /api/deliveries/[deliveryId]/reconcile-instagram` settles an uncertain (`publishing`) delivery by reading the media back, mirroring the Google reconcile route.
- Failure taxonomy maps Meta errors to user-actionable copy (token invalid, permission missing, media URL unreachable, rate limited, transient); transient errors are retryable with the same idempotency key; no duplicate publish on retry.
- Limits: Meta's 25 posts per 24 hours plus a per-workspace publish limit via the existing `consume_rate_limit` RPC, with `retry_after` surfaced.
- Flags: `INSTAGRAM_PUBLISH_ENABLED` must be exactly `"true"` in that environment. Default off.

### 4.3 Media

Instagram publishing requires a publicly fetchable image URL. The plan uses the existing private assets bucket with a short-lived signed URL, or a dedicated public upload path if Meta cannot fetch signed URLs reliably. The chosen strategy is an open decision (see 9.3); whichever is chosen must not expose other workspace assets and must be recorded with its lifetime.

### 4.4 Insights

- New additive migration creating `instagram_insights`: `workspace_id`, `account_ref`, `scope` (`account` | `media`), `media_ref`, `metric`, `period_start`, `period_end`, `value numeric`, `fact_type` (`Observed` for returned values), `unavailable_reason`, `observed_at`, plus the standard RLS/revoke/grant block required by the migration rulebook.
- `POST /api/workspaces/[workspaceId]/instagram-insights/pull` (owner or in-scope manager): reads account metrics and the latest N media metrics, stores one row per metric per window, audits `insights.pulled`.
- `GET /api/workspaces/[workspaceId]/instagram-insights` returns rows plus explicit unavailable reasons (missing permission, expired token, unsupported metric, Graph error).
- UI on Business → Insights: values with metric definition, window and observed timestamp; missing values render as **Unavailable** with the reason, never as zero.
- Cadence: on-demand pull first. A scheduled pull is out of scope unless the owner separately approves a runner, consistent with the existing decision not to add schedulers as incidental work.

## 5. Data and schema changes

- No change to `oauth_connections`; `'instagram'` is already permitted. P20.1 uses the existing row shape with `account_ref` holding JSON `{"id","username"}` (free text, no other reader) so the later phases keep the IG user id and the UI shows the handle.
- New `instagram_insights` table per 4.4 (one additive migration, hand-applied after `db:verify`, following the repository migration rulebook).
- `deliveries.payload` holds the container/media ids and caption snapshot; `provider_receipt` (existing, `0014_publish_reply.sql`) holds the Meta response.
- New rate-limit bucket keys: `instagram_publish`, `instagram_insights_pull`.
- No new auth system, no new scheduler, no new storage provider.

## 6. Honesty, permission and guardrail rules

- Publishing requires an approved immutable version and an explicit user action. No scheduler, no auto-publish, no retries that publish without a user-visible state change (guardrails 5, 6).
- Insights are platform-reported observations with window, definition and timestamp; a missing metric is **Unavailable**, never zero; no causal or revenue claim (guardrails 1, 2, 4).
- Credentials are encrypted with `lib/security/token-crypto.ts`, never logged, never returned by an API, and deleted on disconnect (guardrail 9).
- Every connect, publish, reconcile, pull and disconnect writes an audit event.
- Tests never call Meta: a typed fake transport is injected; the secret-boundary sweep stays green; CI needs no Meta credentials.
- Existing Instagram evidence behavior (public posts only) is unchanged; publishing is a separate, explicit state transition.

## 7. Work breakdown

Each sub-phase is its own reviewed PR with targeted tests, typecheck, lint, docs and a guarded release (PR CI, final-main CI, exact deployment, 36-visit read-only hosted matrix). CI must pass with all Instagram flags off and no Meta credentials.

| Sub-phase | Scope | Acceptance |
|---|---|---|
| P20.1 Connection | OAuth start/callback, state signing, token storage/refresh, connect + disconnect UI in Business → Integrations, flags, unconfigured-environment behavior | Fixture consent (fake transport) unit tests; token-crypto round trips; unauthenticated hosted route fails closed; live consent **Not tested** until P1–P8 exist |
| P20.2 Publishing (single feed image) | Delivery publish route + UI, container → publish pipeline, receipt, reconcile, idempotency, limits, failure taxonomy | Fake-transport suite incl. duplicate-retry and permission-denied paths; live publish only with owner present on a test professional account |
| P20.2a Publish primitives (implemented) | Graph publish client (container → status → media_publish → read-back), publish token-refresh helper, publish eligibility, `INSTAGRAM_PUBLISH_ENABLED`; no route, UI or delivery write | Unit suites with fake transport: protocol shape, error taxonomy, token refresh/expiry, eligibility; nothing callable, flag off |
| P20.2b Delivery path (released dark) | `neon/migrations/0023_instagram_publish.sql` adds `begin_publish_instagram` (channel `instagram`, caption/image snapshot in the delivery payload; finishing reuses the generic 0014 function); `POST /api/versions/[versionId]/publish-instagram`; `POST /api/deliveries/[deliveryId]/reconcile-instagram`; `instagram_publish` / `instagram_publish_global` / `instagram_reconcile` limits; bounded container-status poll + single `media_publish` + read-back; reconcile matches the caption snapshot against recent media | Fake-transport route/pipeline suites; live publish **Not tested** and impossible until 0023 is applied and both flags + Meta credentials exist |
| P20.2c Publish UI + copy (implemented, dark) | `loadInstagramPublishPanel` (flag, connection with both publish scopes, feed-post template, owner/in-scope-manager mirror) and the action-detail delivery card: approved-caption preview with character count, public-HTTPS image URL form, explicit-confirmation dialog, published/uncertain/failed states with reason copy, automatic and manual `reconcile-instagram`; en/zh-HK/zh-TW copy in the workspace dictionary | Component + loader suites and copy type parity; keyboard/read-only hosted checks; live publish **Not tested** until 0023 is applied and the flag + Meta credentials exist |
| P20.3 Insights | Pull route, storage, UI, unavailable reasons for account and per-media metrics | Fixture suite incl. missing-permission and expired-token cases; live pull only after P5/P7 |
| P20.4 Hardening | Token refresh edge cases, disconnect cleanup, rate-limit refusal UX, audit coverage, runbook | Targeted suites; review of failure paths |
| P20.5 Acceptance and release | Owner-run live acceptance record, docs update (integration runbook, DEPLOY env section, this plan → report), release verification | Recorded account type, API version, permission list, timestamps, receipt ids; anything not executed stays **Not tested** |

**P20.1 implementation record (behind `INSTAGRAM_OAUTH_ENABLED`, default off).** Modules: [`lib/oauth/instagram-connection.ts`](../../../lib/oauth/instagram-connection.ts) (flag/config, state signing, consent URL, code → long-lived exchange, permission check, account resolution, refresh), [`lib/repositories/instagram-connection.ts`](../../../lib/repositories/instagram-connection.ts) (read/replace/refresh/expire/revoke on `oauth_connections`, no schema change), routes under `app/api/oauth/instagram/` and `app/api/workspaces/[workspaceId]/instagram-connection/`. The card sits in Business → Integrations beside the existing public-handle form, which is unchanged and still powers scan-time public evidence. The Graph version is pinned by `INSTAGRAM_API_VERSION` (default `v23.0`). Tests inject a fake Meta transport; CI needs no Meta credentials and every live item stays **Not tested**.

**P20.2a implementation record (behind `INSTAGRAM_PUBLISH_ENABLED`, default off).** Modules: [`lib/oauth/instagram-graph.ts`](../../../lib/oauth/instagram-graph.ts) (create container, bounded status read, media_publish, read-back; content-free `InstagramGraphError` taxonomy including `already_published`), [`lib/publishing/instagram-connection.ts`](../../../lib/publishing/instagram-connection.ts) (publish token helper: refresh under lock, one retry on unauthorized, expire on failure), [`lib/publishing/instagram-eligibility.ts`](../../../lib/publishing/instagram-eligibility.ts) (approved current version, feed-post templates only, public HTTPS image URL, 2,200-character caption), and the repository token methods in [`lib/repositories/instagram-connection.ts`](../../../lib/repositories/instagram-connection.ts). Nothing exposed these over HTTP and no delivery was written at that point; P20.2b added the migration, routes and limits.

**P20.2b implementation record (behind `INSTAGRAM_PUBLISH_ENABLED`, default off).** [`neon/migrations/0023_instagram_publish.sql`](../../../neon/migrations/0023_instagram_publish.sql) adds only `public.begin_publish_instagram` (SECURITY INVOKER, runtime EXECUTE only): it mirrors 0014's guards (offer currency, approved version, one active publish per version and per account, lazy allowance check) and inserts `channel='instagram'` with `payload = {version_no, image_url, caption}`; 0014's `finish_publish_output_version` stays byte-identical and settles both channels. [`lib/publishing/instagram-run-publish.ts`](../../../lib/publishing/instagram-run-publish.ts) runs the container → bounded status poll → one `media_publish` → read-back pipeline and only finishes a definite outcome; [`lib/publishing/instagram-reconcile.ts`](../../../lib/publishing/instagram-reconcile.ts) settles an uncertain row by matching the stored caption against the account's recent media (one match published, none `not_applied`, two+ stays uncertain). [`lib/publishing/instagram-limits.ts`](../../../lib/publishing/instagram-limits.ts) consumes `instagram_publish` (10/day/workspace), `instagram_publish_global` (100/day) and `instagram_reconcile` (30/day/delivery), fail-closed. Routes: `app/api/versions/[versionId]/publish-instagram/route.ts` (flag 404 before SQL, owner/manager scope, connection + scope check, eligibility, idempotency) and `app/api/deliveries/[deliveryId]/reconcile-instagram/route.ts` (available with the flag off). Released dark as PR #198 / `72244ca6`; **migration 0023 is not applied to any hosted database**, so the route cannot create a delivery even with the flag on.

**P20.2c implementation record (behind `INSTAGRAM_PUBLISH_ENABLED`, default off).** [`lib/publishing/page-state.ts`](../../../lib/publishing/page-state.ts) adds `loadInstagramPublishPanel`, the README-level mirror of the Google panel: it reads only publish-mode deliveries of this action's versions, keeps `channel='instagram'` rows, and reports `enabled`, `connectionActive` (an active connection that names an account and carries `instagram_basic` + `instagram_content_publish`), `templateAllowed` (feed-post templates only), `mayAct` (owner or in-scope manager) and `canPublish`. It returns null for a non-feed-post template on a database without 0023, so no query runs for review actions while the flag is off; existing receipts stay visible and reconcilable after the flag is turned off. [`components/workspace/instagram-publish-card.tsx`](../../../components/workspace/instagram-publish-card.tsx) is the delivery card: it never decides authority, shows the latest Instagram delivery of the selected version (published time, uncertain "Check status", failed reason), auto-settles uncertain rows older than 60 s once per page load, previews the immutable approved caption with its 2,200-character count, and opens an explicit-confirmation dialog for an owner-supplied public HTTPS image URL. The image URL is checked in the browser for feedback and again by the route before Meta is called; the idempotency key is stable across a retry of the same image and regenerated after a terminal outcome. Wired through `action-detail-props` → `ActionDetailView` → the editor and `ApprovalPanel`; en/zh-HK/zh-TW copy lives in [`lib/copy-workspace.ts`](../../../lib/copy-workspace.ts) under `workspace.instagramPublish`. **No UI can publish while 0023 is unapplied and the flag is off**, and live publish remains **Not tested**.

## 8. Verification and acceptance

- **CI (no Meta):** automated only with the injected fake transport; no network calls; existing gates unchanged; secret-boundary sweep unchanged.
- **Hosted read-only:** each release keeps the 36-visit, 3-locale, 3-width, 9-keyboard-check matrix; unauthenticated Instagram routes return `unavailable`/redirect, not partial state.
- **Live acceptance (owner-authorized):** account type, IG API version, granted permissions, timestamps, delivery receipt ids and insight values recorded in the phase report. No live publish or insights pull runs in CI or unattended.
- **Manual accessibility:** any new UI follows the existing Phase 17 status; no assistive-technology claim is made unless an equipped tester records it.

## 9. Risks and open decisions

| Risk | Mitigation |
|---|---|
| App Review delay or rejection | Build behind flags; ship connection + read paths first; scope to feed images only |
| Long-lived token expiry/revocation | Refresh window, `status='expired'`, reconnect UI, no silent retry |
| Public media URL requirement | Signed asset URL with bounded lifetime; fallback dedicated public path only if proven necessary |
| Meta metric churn/deprecation | Store metric name + window + observed time; map unknown metrics to unavailable rather than failing the pull |
| Duplicate publish on retry | Idempotency key, container reuse policy, reconcile route |
| Rate limits (25 posts/24h) | Existing rate-limit RPC + clear `retry_after` copy |
| Accidental auto-publish | No scheduler, explicit action only, tests assert absence of background publishing |

Open owner decisions:

1. First publish surface: single feed image (recommended) versus carousel/reel/story.
2. Insights cadence: on-demand only (recommended) versus a separately approved scheduled pull.
3. Media URL strategy: signed asset URL versus dedicated public upload path. P20.2a's eligibility accepts an owner-supplied public HTTPS image URL for the first slice (private/credentialed hosts refused); the signed-asset path is deferred to a later owner decision.
4. Owner for P1–P7 (business verification and App Review screencast) and target dates.
5. Who may publish: owner only, or owner plus in-scope manager (recommended, with audit). P20.2b plans to implement owner or in-scope manager through the existing delivery authorization model; the flag stays off regardless.
6. Insight retention period and deletion on disconnect (recommended: 12 months, deleted/archived on disconnect).

## 10. Non-goals

Direct messages, comment moderation, ads, shopping tags, stories/reels scheduling, multi-account per workspace, competitor scraping, revenue or conversion attribution, auto-publish, and any change to the public-evidence scanning boundary. Instagram OAuth does not replace the confirmed public handle.

## 11. Definition of done

1. Owner connects a professional account through Meta consent; credentials encrypted; disconnect revokes and cleans up.
2. An approved exact version is published explicitly to a test professional account, with receipt, delivery state and audit event; nothing publishes automatically.
3. Account and per-media insights are visible with window, definition and timestamp, and missing values render Unavailable with a reason.
4. All gates green; release verification recorded; no guardrail weakened; CI needs no Meta credentials.
5. Anything not executed (live publish, live insights, assistive technology) is recorded as **Not tested**, not inferred.
