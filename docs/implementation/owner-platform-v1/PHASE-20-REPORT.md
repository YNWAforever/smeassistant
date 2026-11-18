# Phase 20 report — Instagram publishing and insights

Status: **implemented behind flags, released dark, live verification Not tested.** Written 2026-11-19 (Singapore).

This report closes the Phase 20 plan ([PHASE-20-INSTAGRAM-GRAPH-PLAN.md](PHASE-20-INSTAGRAM-GRAPH-PLAN.md)) after P20.1–P20.4 were released. It records what exists, what is verified, what the owner must do before anything can run live, and what remains **Not tested**. Nothing here claims a live Meta call, a live publish, a live insights read, a capacity number or an assistive-technology result.

## 1. What shipped, by sub-phase

| Sub-phase | Released as | State | Evidence |
|---|---|---|---|
| P20.1 Connection | PR #196 / `410f3663` | Dark behind `INSTAGRAM_OAUTH_ENABLED` (unset) | OAuth start/callback + sealed token storage, connect/disconnect card in Business → Integrations, fake-transport and token-crypto suites, 36/36 hosted matrix per release |
| P20.2a Publish primitives | PR #197 / `716686f4` | Dark behind `INSTAGRAM_PUBLISH_ENABLED` (unset) | Graph container → status → media_publish → read-back client, content-free error taxonomy, publish token refresh helper, eligibility; nothing callable over HTTP |
| P20.2b Delivery path | PR #198 / `72244ca6` | Released dark | Migration 0023 (`begin_publish_instagram` only), publish + reconcile routes, `instagram_publish` / `_global` / `_reconcile` limits, atomic SQL guard pins |
| P20.2c Publish UI + copy | PR #199 / `32b2a540` | Released dark | `loadInstagramPublishPanel`, action-detail delivery card, en/zh-HK/zh-TW copy, 10 card + 5 loader tests |
| P20.3 Insights | PR #200 / `fef1d522` | Released dark | Migration 0024 (`instagram_insights` table), Graph account/media readers, pull + read routes, Results card, copy, db:verify + catalog/integration updates |
| P20.4 Hardening | PR #201 / `751e1562` | Released dark | Disconnect/reconnect observation cleanup with audit counts, pull-time 365-day retention, 429 refusal test, route/pipeline suites |
| P20.5 Acceptance and release | this report | **Live acceptance not run** | No owner-run live test has happened; see §4 |

Each release passed its PR CI (`verify` + `Kinnso enabled acceptance` + Vercel), the final-main CI, an exact deployment check and a fresh 36-visit read-only hosted matrix (3 locales × 3 widths × 4 surfaces, 9 keyboard checks). Release records live under `work/phase-19/p20*/release.json` in the local work directory (ignored by git).

## 2. Current production state (exact)

- Migrations **0023 and 0024 are not applied to any hosted database**. The published production deployment therefore cannot create a delivery or read an observation row even if a flag were flipped.
- `INSTAGRAM_OAUTH_ENABLED`, `INSTAGRAM_PUBLISH_ENABLED` and `INSTAGRAM_INSIGHTS_ENABLED` are **unset** in every environment.
- No Meta app Review, no credentials and no connected account exist. The integration cards are unreachable; the publish and insights routes answer `not_enabled` before auth or SQL.
- No scheduler, no automatic publish and no automatic pull exist. Every write path requires an explicit owner/manager action and an approved immutable version (publishing only).
- Production business data has not been mutated by any Phase 20 work; every hosted check was read-only.

## 3. Verified in this phase (automated, no Meta)

- Fake-transport suites cover the Graph protocol shape, error taxonomy (`unauthorized`, `forbidden`, `rate_limited`, `not_found`, `already_published`, `media_url_unreachable`, `unavailable`), token refresh/expiry boundaries, one-retry-then-expire behaviour, missing permission and missing scope paths, and the container-status state machine.
- Publish path: ineligible version/template/caption/URL refusals happen before Meta; idempotent retry reuses the key; ambiguous outcomes stay `publishing` and are settled only by reconcile; reconcile matches the caption snapshot and never publishes again.
- Insights path: account and per-media readers, unavailable reasons (`missing_permission`, `not_supported`, `provider_error`, `no_data`), `unauthorized` escaping for refresh, missing/expired connection writing nothing, 365-day retention and disconnect/reconnect cleanup.
- Schema: `pnpm db:verify` replays the full corpus on an owned disposable PostgreSQL; catalog assertions cover the new table, policy, index and function counts (tables 50, columns 578, constraints 275, indexes 136, triggers 16, functions 34, seeded rows 0). Integration suites exercise the migration lists and the new table.
- Copy: en/zh-HK/zh-TW parity enforced by types and tests; reason codes never reach owners raw.
- Hosted: each release's read-only matrix passed 36/36 visits with 9 keyboard checks, 0 console errors and no horizontal overflow; unauthenticated Instagram routes fail closed.

## 4. Not tested (must not be inferred from the above)

- **Live Meta OAuth consent** (requires a Business app, App Review and a professional test account).
- **Live Instagram publish** (requires migrations 0023/0024 applied, `INSTAGRAM_PUBLISH_ENABLED=true`, an approved feed-post version, a public HTTPS image and explicit owner authorization).
- **Live Instagram insights pull** (`INSTAGRAM_INSIGHTS_ENABLED=true`, connected account with `instagram_manage_insights`).
- **Assistive technology**: NVDA, VoiceOver, TalkBack, real-device and actual microphone validation remain **Not tested**.
- No capacity, throughput, latency or provider-quota claim is made.

## 5. Prerequisites for the first live acceptance (owner-owned)

1. Create the Meta Business app and Instagram Graph API product; register the redirect URI byte-exactly for each origin; complete App Review for `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.
2. Set `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`/`INSTAGRAM_OAUTH_REDIRECT_URI` and `OAUTH_TOKEN_ENCRYPTION_KEY`; set `INSTAGRAM_OAUTH_ENABLED=true` and connect the professional account from Business → Integrations.
3. Apply `0023_instagram_publish.sql` and `0024_instagram_insights.sql` through the owner-runner process after `db:verify` passes on the replay fixture; record the journal rows.
4. Run one **supervised** publish and one insights pull with the owner present; record account type, Graph API version, granted permissions, timestamps, delivery/permalink receipt ids and the observed metric values. Enable one flag at a time and turn it off after the test.
5. Record the outcome in this phase report; anything not executed stays **Not tested**.

## 6. Guardrail mapping

- Evidence/provenance: every insight row carries scope, metric, window, fact type (`Observed`), observed time and, when missing, an explicit unavailable reason.
- Unavailable ≠ zero: null values require a reason and render as "Unavailable"; the published card never shows a number without its receipt time.
- Owner approval and no auto-publish: publishing requires the current approved immutable version and an explicit confirmed action; no scheduler exists and tests assert refusal paths.
- Separate states: delivery `publishing` vs `published` vs `failed` stay distinct; reconcile is a separate user action.
- Server-enforced scope: routes re-verify membership/role and connection scopes; wrong-workspace ids fail closed.
- Append-only accountability: connect, disconnect, publish start/published/failed, reconcile and insights pull write audit events; payloads carry counts and ids only, never tokens, captions or raw provider text.
- Secrets: tokens are encrypted with the existing token crypto, never logged or returned; tests inject fake transports and CI needs no Meta credentials.

## 7. Risks and open items

- Meta metric names change: unknown/unreturned metrics become `not_supported`/`no_data` rows rather than breaking the pull; the metric list is a code constant and needs review on Graph version bumps.
- Public image URL requirement: the owner supplies a public HTTPS URL; signed private bucket URLs are not implemented.
- Rate limits: our own fail-closed buckets sit in front of Meta's limits; exact provider counting is not claimed.
- Insights retention is pull-time only (no scheduler); a workspace that stops pulling keeps old rows until its next pull or disconnect.
- P20.5's live acceptance is the only remaining step; no further code is planned for Phase 20 unless the live test exposes a gap.
