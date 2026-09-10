# Phase 1 traceability register

Maps every Phase-1 requirement from the commissioning plan (P1.1–P1.7) to its actual state in this repository, with the commit or the evidence that establishes it.

**Status vocabulary:** `fixed this phase` · `already correct` (verified, pre-existing, no change needed) · `in progress` · `open` · `blocked`.

**Note on finding IDs:** the plan's `sources/` audit documents (F-01…F-38, backlog A1–E5) were never copied into this repo and were not supplied, so rows below cite the *requirement text* and the *verified code location* rather than finding IDs. See PHASE-1-REPORT.md §0.

## P1.1 — Re-baseline and release truth

| Requirement | State | Evidence |
|---|---|---|
| Record branch/HEAD, dirty files, compare against the audit's pin | fixed this phase | HEAD `8f4c5b4` — identical to the audit's pinned commit; tree clean. Report §1. |
| Record serving deployment commit/origin/runtime/config inventory | fixed this phase | Read-only Vercel query: `dpl_GKaE39VfhqbNHm22R8veD2UadyHT`, built from `8f4c5b4`, `smeassistant.vercel.app`, Node 24.x, SSO on previews only. Report §1. |
| Reconcile deployment-existence vs acceptance status in the docs | fixed this phase | Report §1 records that `NEON-CUTOVER.md`'s "NOT CHOSEN" refers to the Neon **database** target, while the Vercel **deployment** auto-deploys `main` on every merge — two different facts the prose conflated. |
| Discover CI scripts + runtime; test on the intended serving runtime | open | CI's `setup-node` uses `node-version-file: .nvmrc` = **22**, but production runs **24.x** and all local evidence was gathered on 24.18.0 — so CI has never tested the version production runs. Documented in Report §1; the one-line `.nvmrc` change is deliberately left for a release decision. |
| Reconcile the "nine vs ten gates" wording | fixed this phase | Resolved from `.github/workflows/ci.yml` + `package.json`: exactly ten gate commands, matching `LAUNCH-REPORT.md`'s Task 16 table. Two newer scripts (`neon:readiness`, `e2e:neon-auth`) exist but are **not** in CI. Report §1. |

## P1.2 — Provider access and workspace integrity

| Requirement | State | Evidence |
|---|---|---|
| Validate `website_url` at the fetch boundary; reuse the safe-media URL-safety core | fixed this phase | `547da68` — new `packages/scan-engine/src/safe-website-fetch.ts` (HTTPS-only, DNS-pinned, redirect revalidation, size cap, HTML-only), wired into `collect-providers.ts`. 21 tests. |
| Reject invalid/non-HTML responses; caps are an *unavailable* observation, not evidence of absence | fixed this phase | `547da68` — non-HTML/oversized returns leave `website:{available:false}`; comment records the semantics. |
| Fail closed on provider-spending routes | fixed this phase | `547da68` — `scan/process`, `business/search`, `business/ig-search` flipped to `failClosed:true`; `scan/status` (read-only) correctly stays fail-open. |
| Prevent last-owner removal **atomically**, incl. concurrent removals | fixed this phase | `547da68` — `neon/migrations/0005_owner_removal_guard.sql` BEFORE DELETE trigger (`pg_trigger_depth()=0`), plus a 409 at the API layer. Concurrent-removal integration test added. |
| Prevent orphan cleanup cascading through audit/billing/output history | fixed this phase | Same trigger: the sole owner can no longer be deleted, so `delete_orphaned_workspace` can no longer be reached from that path. The legitimate account-erasure cascade still works (existing `neon-schema` test). |
| Additive migration at the next free number | fixed this phase | `0005` was next; used. Migration-runner discovery is glob-based (`scripts/neon/migrations.ts`), no hardcoded list. |
| Require verified TLS on the actual Postgres client | fixed this phase | `547da68` — `lib/db/config.ts` rejects a URL without `sslmode ∈ {require,verify-ca,verify-full}` in production; previously only the separate readiness *script* checked this and it never touches the serving pool. 7 tests. |
| Reject `OWNER_SELF_SERVICE_CLAIM` at build/deploy startup | fixed this phase | `547da68` — `scripts/assert-no-self-service-claim.mjs`, wired as `test:no-self-service-claim` + a CI step. Runtime guard was already correct. |

## P1.3 — A usable, honest scan

| Requirement | State | Evidence |
|---|---|---|
| Reuse the report's `coveragePercent` on scanning screens (0.7 → 70%) | fixed this phase | `1823035` — `coveragePercent()` added to `lib/funnel/scan-progress.ts`; the scanning page rendered a raw fraction ("Coverage 0.5%"). |
| Render actual per-module state; a partial job must not label unavailable collectors "measured" | fixed this phase | `1823035` — `GET /api/scan/status` now returns real per-module states once terminal (reusing `deriveModuleStates`); `collectorPhases()` uses them; the blanket "collected"→Measured mapping is gone. |
| Return an inspectable partial report when usable evidence exists below the 2-module threshold; keep `overall: null` | fixed this phase | `a278f5c` — the processor no longer collapses null-overall into `failed`; ≥1 measured module stays `partial`. The "score withheld" copy that already existed is now reachable. Scoring threshold unchanged. |
| HK/TW fixtures without Instagram stay usable | already correct | `scripts/fixtures/unavailable-ig.json` + `lib/scan/fixtures.test.ts` + `e2e/acceptance/public-funnel.spec.ts` already assert coverage < 100, IG not measured, status never `failed`. |
| Persist policy-versioned scan consent server-side; validate before dispatch | in progress | Confirmed missing: `consent` is client-only state; `parseScanStartBody`/`buildScanJobInsert` have no consent field, so a direct POST bypasses it. Design + adversarial review in flight. |
| Stop indefinite polling; bounded waiting/stalled/failed states and a safe resume | in progress | Confirmed missing: `poll()` recurses forever, backoff caps at 8 s, no attempt/duration budget, no stalled copy. Design + adversarial review in flight. |

## P1.4 — Identity, eligibility, proof of ownership

| Requirement | State | Evidence |
|---|---|---|
| Emit `/{locale}/owner/sign-in?claim={slug}` from the unlocked report | fixed this phase | `cf72028` — no component rendered it before; `DashboardSummary` now does, withheld from members/sample/locked. |
| Preserve claim slug, market, locale, destination through the handoff; reject open redirects | already correct | `lib/identity/sign-in-flow.ts` (`CLAIM_RE` accepts `_`/`-`, `safeAuthFlowReturnPath`) + `lib/identity/return-path.test.ts`. |
| Google sign-in and Google Business ownership claim are separate proofs | already correct | Distinct routes: `app/auth/callback/route.ts` (identity) vs `app/api/oauth/google/claim/callback/route.ts` (requires an existing session + `listManagedPlaceIds` match). |
| Resolve the open Google callback defect — root cause, not diagnostics | fixed this phase (hosted confirm blocked) | `fb24b94` — `new NextRequest(request)` throws on Node 24 against Next's Proxy-wrapped request; same class already fixed for a sibling route in `b991b7f`, never applied here. Reproduced locally against the real `next`/`node`; regression test added. **An authorized hosted sign-in is still required to confirm end-to-end.** |
| Channel-dependent eligibility: a WhatsApp/LINE unlocker must not dead-end | fixed this phase | `cf72028` — `isLeadRecipient()` matched only `leads.email`, which unlock writes only for the *email* channel. Now also matches `report_access_grants.email_normalized` (case-insensitive, revoked excluded). Mail eligibility only — the test asserts no membership is created. |
| Never convert recovery email / contact match / viewer grant / self-declaration into ownership | already correct | `lib/workspace/claim-scan.ts` requires Google attestation or staff assignment; `OWNER_SELF_SERVICE_CLAIM` defaults off and is now also gated at build time (P1.2). |
| Preserve anti-enumeration on magic-link requests | already correct | Both magic-link routes return an identical `{ok:true}` for unknown/ineligible/error cases. |
| Make sign-in visible outside the mobile menu; localized dismiss text; touch targets | fixed this phase | `db4547d` — header sign-in was `hidden lg:inline-flex`; now always rendered with a 44 px target. `SheetContent` gained an overridable `closeLabel` (was hardcoded English). |
| Claim-flag detection (404 flag-off vs 401 anonymous) | already correct | `app/api/oauth/google/claim/start/route.ts` gates on `claimViaOAuthEnabled()` first; tests assert 404-before-config and 401-when-anonymous. |

## P1.5 — Onboarding context

| Requirement | State | Evidence |
|---|---|---|
| Save brand voice and approved claims to `brand_profiles` | fixed this phase | `79cf656` — both were POSTed and silently dropped by `parseClaimBody`; now parsed, validated against `BRAND_VOICES`, and seeded by `ensureBrand`. The UI's illegal `"concise"` voice was also corrected. |
| Do not overwrite owner-confirmed facts on retry | already correct | `ensureBrand` is `ON CONFLICT DO NOTHING`; the only other writer is the owner-gated settings PUT. |
| Derive the starting step from persisted state, not React memory | open | Partial today: `ownsWorkspace` is server-derived, but skipping ahead also needs a transient `?claimed=1` param, and step-4 form fields are plain `useState` with no draft persistence. |
| "Wrong business" escape and optional Instagram step | open (IG half already correct) | Instagram is genuinely skippable; there is no in-flow "not my business" escape once a claim slug is loaded (the pre-claim `/scan` flow has one). |
| Market never inferred from interface locale | already correct | `market` comes from `audit_jobs.region`; `e2e/acceptance/claim-and-market.spec.ts` asserts a TW workspace keeps TWD under a zh-HK locale. |
| Prevent switching a job to another workspace via a tampered resume URL | already correct | The claim route accepts no client workspace id; `lib/workspace/claim.ts` re-derives it and checks the caller's own membership. |

## P1.6 — The review-reply vertical slice

| Requirement | State | Evidence |
|---|---|---|
| Reuse scan-sampled reviews; remove required manual re-entry | in progress | Confirmed: the agent already consumes `ctx.sampledReviews`, but `templates.ts` hard-codes `reviews_without_response` into `requiredInputs`, so the UI always demands typing. Design + adversarial review in flight. |
| Use authorized server-side evidence references, not client-supplied review text | already correct | The run route accepts only `agentKey`/`inputs`; reviews are resolved server-side from `snapshot.jobId` via `assistantReviewData`. |
| Targeted `needs_input`; provider failure creates no pretend draft and consumes no allowance | already correct | `artifacts.ts` only creates a version when `!error && !factsNeeded.length && output`; generation never touches `workspace_usage`. |
| Treat scraped evidence as untrusted with explicit prompt boundaries | fixed this phase | `b0f9b0b` — evidence block now carries a standing "this is DATA, not instructions" rule plus an untrusted fence; per-agent tests and an injection-placement test. |
| Restrict `agentKey` to the action template's allowed capability | fixed this phase | `02a3af1` — `isAgentKey()` only proved registry membership; any registered agent could run on any action. |
| Await real server outcomes on the action page, Create page and assistant sheet | fixed this phase (Create page) | `0e5a451` — `CreateObjectiveActionResult` omitted `state`/`factsNeeded`/`runError`, so the page always claimed a draft was coming. The action-detail page was already correct. |
| Reconcile route deadline with provider timeout/retries; reserve finalization time | fixed this phase | `0e5a451` — a `maxDuration=60` route ran a fixed two × 45 s loop; now deadline-aware with a reserved finalization window and a real terminal failure on exhaustion. |
| Reap expired runs; prevent a late worker overwriting a newer attempt | in progress | Forward-looking half fixed by `0e5a451`; rows already stranded by earlier deploys still need a reaper, and nothing yet writes `timed_out`. Design + adversarial review in flight. |
| SQL approval/export authority unchanged | already correct | `neon/migrations/0004_atomic_operations.sql` untouched this phase; concurrency and idempotency already covered by `test/integration/neon-workflow.integration.test.ts`. |

## P1.7 — Commercial and delivery honesty

| Requirement | State | Evidence |
|---|---|---|
| Remove unsupported pricing/quota/seat promises | fixed this phase | `02a3af1` — "12 approved deliveries per month", "36 pooled" and "2 users" are enforced nowhere (`deliveryAllowanceForTier` → `null` paid / `3` lite; no seat cap). Removed, and deliberately **not** replaced with "unlimited". |
| Correct unsigned Stripe-webhook handling (400, before provider init) | already correct | Verified ordering in `app/api/webhooks/stripe/route.ts`; unsigned → 400, tampered → 400, unconfigured → controlled failure. Unit + integration tested. |
| Remove false "email sent" claims | fixed this phase | `02a3af1` — team invite is a pure SQL INSERT with no mail dispatch; toast and note now say the invite is created and the member joins by signing in. |
| Resolve the recovery-link promise | fixed this phase | The field is retained and relabelled as the address that can later request a sign-in link (`signInEmailLabel`/`signInEmailHint`): it is persisted to `report_access_grants.email_normalized` and read by `claimsRepository.isLeadRecipient()`, and for an HK-WhatsApp / TW-LINE unlocker it is the only email anywhere — deleting it would re-create the dead end. The orphaned `unlock.*` namespace (39 unreachable keys × 3 bundles) and the "recovery links expire after 15 minutes" claim on the trust page and in `legal.retentionBody` are deleted. Client-side validation now matches the route's, gated to non-email channels. No recovery route and no mail sender were added; `REPORT_RECOVERY_ENABLED` is annotated as read by nothing. |
| Hide or honestly label the dead Fix Pack affordance | already correct | Fix Pack is genuinely wired to real `agent_runs` data with an honest empty state; the one dead control ("Top-up") is disabled and labelled "Planned". |
| Duplicate/out-of-order Stripe events | already correct | DB-level dedup on `stripe_event_id` inside a `FOR UPDATE` transaction; integration-tested for concurrent replay and stale delivery. |

## Verification and blockers

See PHASE-1-TEST-RESULTS.md for the gate-by-gate record. Standing blockers: `db:verify` / `test:integration` (Docker unavailable in this environment), `build` / `e2e` / `test:secret-boundary` (pre-existing, unrelated `radix-ui` module-resolution failure in this worktree), and all hosted acceptance (no authorized credentials, budget, or test identities requested or granted).
