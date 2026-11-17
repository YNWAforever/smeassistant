# Phase 20 — Instagram publishing and insights (proposed scope)

Status: **proposed, not started.** This document scopes an owner-requested capability. No Meta app exists, no credentials were added, no migration was written, no code was changed and no hosted action was taken. Direct publishing stays disabled under guardrail 6 ("Never auto-publish") until an explicit owner authorization and a verified connector exist; this scope alone authorizes nothing.

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
| P5 | Request permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` (advanced access / App Review, with screen recording) | Meta app dashboard | Approval status per permission, review date | Publish, insights |
| P6 | Business verification for the app's business | Meta Business Suite | Verification status | Advanced access |
| P7 | Long-lived token policy confirmed (60-day token, refresh window) | Meta docs + app settings | Documented policy | Token refresh |
| P8 | Hosted secrets set for preview and production: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI` | Vercel project settings | Presence only, never values | OAuth |
| P9 | Feature flags set deliberately: `INSTAGRAM_PUBLISH_ENABLED`, `INSTAGRAM_INSIGHTS_ENABLED` (exactly `"true"`; default unset = unavailable) | Vercel settings | Flag state per environment | All live calls |
| P10 | Pin the Graph API version (for example `v23.0`) and record it | Repo config + docs | Version constant | All calls |

Until P1–P7 exist, the implementation can be built and tested against an injected fake transport, but every live acceptance item remains **Not tested**.

## 4. Architecture

### 4.1 OAuth and connection lifecycle

- `GET /api/oauth/instagram/start` — owner-only; signs a `state` value derived from `OAUTH_TOKEN_ENCRYPTION_KEY` with a domain-separated key (same pattern as [`lib/oauth/google-connection.ts`](../../../lib/oauth/google-connection.ts)); redirects to Meta consent with the P5 scopes.
- `GET /api/oauth/instagram/callback` — verifies state, exchanges the code, converts to a long-lived token, fetches the IG user id and username, stores ciphertext in `oauth_connections` (`provider='instagram'`, `account_ref=<ig user id>`, `scopes`, `expires_at`, `status='active'`), audits `integration.updated`.
- Refresh: when fewer than 10 days remain, refresh in place before use; on refresh failure mark `status='expired'`, surface a reconnect action, never retry publish silently.
- `DELETE /api/workspaces/[workspaceId]/instagram/connection` — owner-only; revokes the token at Meta best-effort, deletes or revokes the row, marks dependent insights unavailable, audits the disconnect.
- Unconfigured environment (no app id/secret/encryption key) returns `503 unavailable` on every route; no partial flows.

### 4.2 Publishing

- Reuses the existing delivery model: approved `output_versions` row → `deliveries` row with `mode='publish'`, `channel='instagram'`, unique `idempotency_key`. No new approval mechanism, no new scheduling.
- `POST /api/deliveries/[deliveryId]/publish-instagram` (owner or in-scope manager, per the existing delivery authorization model):
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

- No change to `oauth_connections`; `'instagram'` is already permitted and its reservation comment can be updated when implemented.
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
| P20.3 Insights | Pull route, storage, UI, unavailable reasons for account and per-media metrics | Fixture suite incl. missing-permission and expired-token cases; live pull only after P5/P7 |
| P20.4 Hardening | Token refresh edge cases, disconnect cleanup, rate-limit refusal UX, audit coverage, runbook | Targeted suites; review of failure paths |
| P20.5 Acceptance and release | Owner-run live acceptance record, docs update (integration runbook, DEPLOY env section, this plan → report), release verification | Recorded account type, API version, permission list, timestamps, receipt ids; anything not executed stays **Not tested** |

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
3. Media URL strategy: signed asset URL versus dedicated public upload path.
4. Owner for P1–P7 (business verification and App Review screencast) and target dates.
5. Who may publish: owner only, or owner plus in-scope manager (recommended, with audit).
6. Insight retention period and deletion on disconnect (recommended: 12 months, deleted/archived on disconnect).

## 10. Non-goals

Direct messages, comment moderation, ads, shopping tags, stories/reels scheduling, multi-account per workspace, competitor scraping, revenue or conversion attribution, auto-publish, and any change to the public-evidence scanning boundary. Instagram OAuth does not replace the confirmed public handle.

## 11. Definition of done

1. Owner connects a professional account through Meta consent; credentials encrypted; disconnect revokes and cleans up.
2. An approved exact version is published explicitly to a test professional account, with receipt, delivery state and audit event; nothing publishes automatically.
3. Account and per-media insights are visible with window, definition and timestamp, and missing values render Unavailable with a reason.
4. All gates green; release verification recorded; no guardrail weakened; CI needs no Meta credentials.
5. Anything not executed (live publish, live insights, assistive technology) is recorded as **Not tested**, not inferred.
