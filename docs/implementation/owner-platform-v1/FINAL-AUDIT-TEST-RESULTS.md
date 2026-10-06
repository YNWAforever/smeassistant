# Final audit — test results (2026-10-06)

Companion to [`FINAL-AUDIT-REPORT.md`](FINAL-AUDIT-REPORT.md). Every gate was run locally and sequentially, in the order used by `.github/workflows/ci.yml`. No hosted target, ambient database, real provider, real mail or real OAuth consent was used.

**Environment:** Windows 11 Pro, Node 24.18.0, pnpm 9.12.0 (corepack), Docker 29.8.1. Exported: `SCAN_SOURCES=fixture VITEST_MAX_WORKERS=1 NEON_INTEGRATION=1 RATE_LIMIT_SECRET=<ci placeholder> NEXT_PUBLIC_SITE_URL=http://localhost:3100`. Unset: `DATABASE_URL DATABASE_URL_UNPOOLED NEON_AUTH_BASE_URL`. Databases are owned disposable `postgres:16` containers created by the harness; acceptance uses the owned identity server, mailer and LLM fixtures (`test/e2e/safety.ts`, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false`).

## Final candidate: `5dfc433` (the PR head before this docs commit)

| Gate | Command | Exit | Counts | Notes |
|---|---|---|---|---|
| install | `corepack pnpm install --frozen-lockfile` | 0 | — | |
| lint | `corepack pnpm lint` | 0 | 0 errors, 38 warnings | same 38 warnings as baseline |
| typecheck | `corepack pnpm typecheck` | 0 | — | root + `pnpm -r typecheck` |
| test | `corepack pnpm test` | **1**, then **0** on rerun | rerun: root 368 files / 4,452 tests + `safe-media` 62 + region 23 + scoring 183 + contracts 20 + scan-engine 299; 0 skipped | first run: 2 timeouts at the 5 s default (`tests/scan-claim-single-path.test.ts`, `app/api/offers/[offerId]/promotions/route.test.ts` "answers 404 before any lookup when the flag is off"); both pass in isolation (29/29) and in the full rerun |
| test:secret-boundary | `corepack pnpm test:secret-boundary` | 0 | "Secret boundary passed across 61 public artifacts." | |
| test:no-supabase | `corepack pnpm test:no-supabase` | 0 | — | "only the approved pinned Neon transitive library is permitted" |
| test:no-self-service-claim | `corepack pnpm test:no-self-service-claim` | 0 | — | "OWNER_SELF_SERVICE_CLAIM is not enabled." |
| db:verify | `corepack pnpm db:verify` | 0 | `0001`–`0014` applied and replayed, 23 functions, 0 seeded rows | owned PostgreSQL |
| test:integration | `corepack pnpm test:integration` | **1**, then **0** on rerun | rerun: 49 files / 539 tests | first run: 2 timeouts at 30 s (`neon-fixture` "relay disconnect closes the remote backend…", `neon-recovery` "preserves a new application user… across … an owned database restart"); both pass in isolation (3/3) and in the full rerun |
| build | `corepack pnpm build` | 0 | — | Turbopack; Windows path fix from PR #35 holds |
| e2e | `corepack pnpm e2e` | 0 | 31 passed | |
| e2e:acceptance | `corepack pnpm e2e:acceptance` | 0 | 44 passed | includes FA-03 (2 new) and the FA-13 assertions |

The `test` and `integration` reruns used the same head `5dfc433`, with the same environment and nothing changed in between. The only working-tree difference was line-ending churn in two snapshot files written by the unit run, restored before rerunning.

**Interpretation of the first-run failures.** All four were timeouts, not assertion failures. None of the four tests exercises a file this branch changes. All four passed in isolation and in the full reruns. `neon-recovery` also timed out under load in the first full run (below). These are load-sensitive timeouts on this Windows machine, recorded as flakes rather than hidden. Raising their timeouts is a candidate follow-up, not part of this change.

## Earlier run: `103afff` (FA-03, FA-10, FA-12 only)

| Gate | Exit | Counts / notes |
|---|---|---|
| install, lint, typecheck | 0 | lint 0 errors / 38 warnings |
| test | 0 | root 368 / 4,448 + 62 + region 23 + scoring 183 + contracts 20 + scan-engine 299 |
| secret-boundary, no-supabase, no-self-service-claim, db:verify | 0 | |
| test:integration | 1 | 538 / 539; `neon-recovery` timed out at 30 s; passed twice in isolation (12–15 s test time) |
| build | 0 | |
| e2e | 0 | 31 passed |
| e2e:acceptance | 1 | 42 / 44: both new FA-03 cases failed. The **spec setup** was wrong, not the product: an outsider Google sign-in that ends in `no_access` leaves no session the owner pages accept in the fixture identity, so the test was redirected to sign-in. Fixed in `e1dcfbe` (revoked viewer) and re-run: 2 / 2. |

A later rerun of integration and acceptance on `e1dcfbe` was stopped deliberately when FA-13 was approved, because the source was about to change. Its two orphaned fixture containers were removed by exact ID.

## Targeted checks run during the pass

| Check | Command | Result |
|---|---|---|
| FA-03 / onboarding unit | `vitest run components/select-workspace-page.test.tsx components/onboarding-page.test.tsx` | 18 / 18 |
| FA-13 + sign-in unit | `vitest run components/auth components/select-workspace-page.test.tsx app/api/owner/sign-in` | 7 files / 56 tests |
| FA-12 regression | `vitest run tests/terminology.test.ts` | 1 / 1; the stray term is confirmed present at `3558697`, so the test would fail there |
| FA-10 integration | `vitest run --config vitest.integration.config.ts test/integration/neon-membership.integration.test.ts` | 24 / 24 |
| FA-10 mutation | same file, `-t FA-10`, with `isLeadRecipient` reverted to the pre-`cf72028` leads-only SQL (restored afterwards, no diff) | fails as intended: `expected false to be true` |
| guided sign-in acceptance | `playwright test --config playwright.acceptance.config.ts e2e/acceptance/guided-sign-in.spec.ts` | 17 / 17 (one earlier run: 16 / 17, with "owned Google-style handoff shows processing…" failing once on a cold `next dev` compile; it passed on rerun and in the full acceptance gate) |

## Not run (blocked or out of scope)

- Every hosted checklist section (§1–§22): owner actions, listed in the report §6.
- Real-model drafts and `scripts/eval-workflows.ts` (FA-08): no DEC-04 budget supplied.
- Real Google OAuth claim end to end: unit-level only (S1).
- Whether real Neon Auth keeps a usable session after `no_access` (report §2.4): not observable with the fixture identity.
- CI on `ubuntu-latest` runs when the PR is opened.

Logs: session scratchpad `final-audit-gates/` (`summary.txt`, `gate-*.log`, `*-rerun.log`, `run1-103afff/`). They are not committed.
