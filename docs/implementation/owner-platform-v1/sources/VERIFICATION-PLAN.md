# VERIFICATION-PLAN — what was run, what was blocked, what remains

**Companion to `AUDIT-REPORT.md`** · 2026-09-09

Status vocabulary, used strictly: **passed** (executed, exit 0), **failed** (executed, non-zero), **blocked** (could not execute — missing image, credential or authorization), **not run** (not attempted). A pass applies only to the named command on the named commit in the named environment. Nothing here is evidence about the deployed runtime unless it says so explicitly.

---

## 1. Environment

| Item | Value |
|---|---|
| Runner | Cloud sandbox, Linux 6.18, x86_64 |
| Node | v22.22.2 (matches `.nvmrc` = 22; **production runs Node 24.x**) |
| pnpm | 9.12.0 via corepack (matches `packageManager`) |
| Install | `corepack pnpm install --frozen-lockfile` — passed, 54.6 s |
| Docker | CLI 29.4.3; daemon started manually during the audit |
| Network | Egress passes through an agent proxy that **denies Docker Hub** (`registry-1.docker.io` → 403 on CONNECT) |
| Database | None. No Neon credential was requested, supplied or used |
| Providers | None. No SerpApi, Google Places, RapidAPI, LLM, Stripe or Resend call was made |

Two commits were exercised because `main` advanced mid-audit. **`8f4c5b4` is authoritative** — it is what the production alias serves.

---

## 2. Gates actually run — `main @ 8f4c5b4` (deployed commit)

| Command | Status | Exact result |
|---|---|---|
| `corepack pnpm typecheck` | **passed** | Exit 0. Root plus `scoring`, `region`, `contracts`, `scan-engine` |
| `corepack pnpm lint` | **passed** | Exit 0. 0 errors, **30 warnings** (all pre-existing `no-unused-vars` / `no-explicit-any` in vendored packages and tests) |
| `corepack pnpm test` | **passed** | Exit 0. **268 files / 2,659 tests**: root 218/2,102 · safe-media 1/62 · region 3/23 · scoring 16/183 · contracts 3/20 · scan-engine 27/269. Run with `VITEST_MAX_WORKERS=1` |
| `corepack pnpm test:no-supabase` | **passed** | Exit 0. "No forbidden retired transport references; only the approved pinned Neon transitive library is permitted" |
| `corepack pnpm test:secret-boundary` | **passed** | Exit 0. **46 public artifacts** scanned, no sentinel leaked. Includes a successful production `next build` |
| `corepack pnpm db:verify` | **blocked** | `docker: No such image: postgres:16`. The image cannot be pulled: egress policy returns 403 for `registry-1.docker.io` |
| `corepack pnpm test:integration` | **blocked** | Same cause — global setup requires the owned `postgres:16` fixture. **0 tests executed** (Vitest also prints "No test files found" after a setup failure; that message is not a result) |
| `corepack pnpm e2e` | **blocked** | Same cause — the harness starts an owned Postgres container per worker |
| `corepack pnpm e2e:acceptance` | **blocked** | Same cause |
| `corepack pnpm e2e:live` | **not run** | Requires `E2E_AUTHORIZE_PAID_SEARCH=true` and a live origin. **Spends SerpApi quota — not authorized** |
| `corepack pnpm e2e:neon-auth` | **not run** | Requires 13 `NEON_AUTH_TEST_*` variables including an isolated hosted target. **Not chosen, not authorized** |
| `corepack pnpm launch:check --origin …` | **not run** | Would issue anonymous probes against a live origin. I ran the equivalent read-only probes manually instead (§3) and record them as observations, not as a `launch:check` pass |

**On the blocked Docker gates.** I started the daemon successfully and attempted the pull through the proxy (including a `daemon.json` proxy configuration, which I reverted). The registry remains denied by egress policy. Per the audit rules this is a **recorded blocker, not permission to substitute another database**: I did not point the suites at any other PostgreSQL instance, and I make no claim about the 24 integration files or the 54 browser cases. They remain the strongest available offline evidence tier and are still unverified by me.

### Superseded run — `main @ 30046da` (first baseline)

Recorded for completeness. `typecheck` passed (exit 0); `lint` passed (exit 0, 29 warnings); `test` passed (exit 0; root 209 files / 2,040 tests, plus 62 safe-media and 495 package tests); `test:no-supabase` passed (exit 0). The 62-test delta between commits is PR #12's new sign-in, callback-handoff and completion coverage.

---

## 3. Live observations — read-only, against `dpl_GKaE39VfhqbNHm22R8veD2UadyHT`

Anonymous, credential-free, no state mutated. These are **observations**, not a suite.

| Probe | Result | Note |
|---|---|---|
| `GET /zh-HK` | 200, `lang="zh-HK"` | Public funnel serving |
| `GET /zh-HK/owner/sign-in` | 200, both controls hydrated | Copy matched neither audited commit → this is what exposed the source/deployment divergence |
| `GET /api/oauth/google/claim/start?slug=auditprobe` | `404 {"error":"not_found"}` | Claim flag off (**F-02**) |
| `POST /api/owner/magic-link {}` | `400 {"error":"invalid_email"}` | Correct rejection |
| `POST /api/webhooks/stripe {}` | `500 {"error":"Stripe is not configured"}` | **F-19**; the repository's own `launch:check` expects 400 here, so this would fail that gate |
| `POST /api/scan/start {market:"XX"}` | `400 {"error":"business_name is required"}` | Validation active |
| DOM measurement at 375×812 | No page overflow; sign-in link 0×0 with `offsetParent === null`; hamburger item 8 of 8; "Close" untranslated | **F-28**, **F-38** |
| Vercel runtime errors, 7-day window | pg SSL warning ×38 across 9 routes; `event_record_failed backend_unavailable` ×9; SerpApi timeout ×4; `Owner auth callback failed auth_unavailable` ×3 | **F-13**, **F-34**, **F-33**; also confirms live scans |

**No live scan was started.** A scan spends SerpApi, Google Places and RapidAPI quota and I had no budget authorization. This is the largest gap in my own evidence and is R3 below.

---

## 4. Remaining tests, prepared but not run

Each is written so it can be executed once the corresponding access exists. None may be reported as passing until it actually runs against the exact authorized deployment.

### R1 — Restore the Docker-dependent gates *(no external authorization needed)*

On a runner that can pull `postgres:16`:
`docker pull postgres:16 && corepack pnpm db:verify && VITEST_MAX_WORKERS=1 NEON_INTEGRATION=1 corepack pnpm test:integration && corepack pnpm e2e && corepack pnpm e2e:acceptance`
Expected from the repository's own records: migration/catalog/replay verification, 24 integration files, 31 public browser cases, 23 acceptance cases. Record exact counts and any skips.

### R2 — Read-only environment inventory *(names only, never values)*

Confirm on the serving deployment whether `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN`, the LLM gateway key, `RESEND_API_KEY` and the Stripe variables are present. **F-11** (fail-open rate limiting) and **F-35** (historically unset secrets reaching production) both hinge on this, and it is the cheapest high-value check remaining.

### R3 — One authorized live scan

With an explicit provider budget and a named test business per market: run HK and TW scans; record job id, terminal status, per-module states, coverage, elapsed time and whether the 300 s ceiling was hit (**F-18**); confirm coverage renders correctly on both the scanning page and the report (**F-14**); and confirm an IG-less scan degrades to `partial` rather than `failed` (**F-17**).

### R4 — Hosted Neon Auth delivery and redemption

With an authorized recipient and a bounded mail budget: request one magic link, redeem it, confirm the workspace destination; request a second, let it expire, confirm rejection; then confirm replay rejection and logout revocation. **Every existing sign-in test uses a fixture identity server — none has ever redeemed a real link.**

### R5 — Completed Google sign-in *(the open production defect)*

With an authorized Google account: complete consent and record which of the six stages in `lib/identity/sign-in-diagnostics.ts` reports failure, together with the `correlationId`. This is the direct next step for **F-33**, and PR #12 was built to make it answerable.

### R6 — End-to-end ownership claim

With `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true` and both callbacks registered: probe `/api/oauth/google/claim/start` anonymously (expect 401, not 404); complete a claim for a business the test account manages; confirm `audit_jobs.workspace_id` is attached, owner membership accepted, onboarding completed and the workspace loading. Record the negative case too — an account that does *not* manage the place must be refused **and shown a message** (**F-05**).

### R7 — The work loop on hosted infrastructure

Generate a draft with the real LLM gateway; edit; approve the exact version; export; export again with the same idempotency key; confirm `approved_deliveries` increased by exactly 1 and the second export returned `counted:false`; exhaust a `lite` allowance and confirm 409 `allowance_exceeded`. Proven repeatedly on fixtures; never on hosted.

### R8 — Stripe test mode

With explicit test-event permission: one signed event per entitlement transition plus one duplicate delivery; confirm idempotency by `stripe_event_id` and the tier change. Also confirm the unsigned request returns 400 rather than the 500 observed today (**F-19**).

### R9 — Security regressions to write *(no authorization needed)*

SSRF cases for **F-08** (private addresses, redirect-to-private, oversized body, non-HTML content type); the sole-owner-removal case for **F-10**; the prompt-injection case **A7** from the capability matrix; and a coverage-formatting test for **F-14**. All four are currently untested code paths.

### R10 — Mobile browser coverage

Add a mobile Playwright project (375×812) and extend it beyond report pages to the scan wizard, unlock, sign-in, onboarding and the workspace shell. Today only report pages carry 375 px assertions.

### R11 — Successful two-scan comparison in a browser

After backlog item **D4**, capture the successful-pair rendering that the repository's own verification document records as an outstanding release gap.

---

## 5. Release acceptance criteria

A release claiming an owner can join and complete a useful AI-assisted task must show **all** of the following, recorded in `LAUNCH-REPORT.md` against one exact commit and deployment ID:

1. All ten offline gates green on the candidate commit with exact counts — including the Docker gates blocked in this audit (**R1**).
2. `launch:check` against the approved origin, with the flag expectation matching the actual configuration, exiting clean — noting the Stripe probe fails today (**F-19**).
3. **R2** environment inventory recorded, every fail-closed secret confirmed present.
4. **R4** and **R5**: one real magic-link redemption and one completed Google sign-in, with the current production failure resolved rather than merely instrumented.
5. **R6**: one end-to-end ownership claim, plus the refused-account negative case showing a message.
6. **R7**: one HK and one TW journey reaching an exported approved delivery, usage counted exactly once.
7. **R9** security regressions written and passing.
8. Owner-facing copy reconciled with enforced behaviour — allowances (**F-16**), delivery promises (**F-25**), invite emails (**F-24**).
9. A release record whose status lines describe the deployment that actually exists (**F-31**).

Until items 3–6 are recorded, hosted acceptance stays **not run** — which is exactly what the repository's own documents say today, and the one thing in them that remains accurate.

---

## 6. Honest limits of this audit

I read the code, ran the offline gates on the deployed commit, and observed the live site anonymously. I did not exercise the database, the providers, the mail path, payments or any authenticated session. Where I wrote "confirmed defect", I either observed it live or it is deterministic from code I read and quoted. Where I wrote "code risk", the behaviour is in the code but I did not see it happen. The distinction is deliberate and load-bearing: several findings would change severity — in either direction — once R2 and R3 are recorded.
