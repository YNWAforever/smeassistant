# Verification evidence for the P0 cleanup

Baseline `85dbcd6cdfecbecad450977c5d9b9d5a732f94a5`; feature branch `fix/audit-p0-cleanup`. Node 24.19.0, pnpm 9.12.0, installed Vitest 4.1.11 and Playwright 1.61.1. Final source changes are the P0 implementation/test files in this PR; documentation does not change runtime behavior.

Commands use `COREPACK_HOME=/workspace/work/corepack`; browser commands also use `PLAYWRIGHT_BROWSERS_PATH=/workspace/work/browsers`. Cache paths were selected to avoid writing to the home directory. Fixture listeners/children and Docker gates used approved host permissions after nested sandbox EPERM failures. PostgreSQL uses the managed local Docker 28.4.0 daemon, owned labeled network-none containers and loopback relay. No shared database or paid provider is used.

| Gate | Command | Outcome | Evidence |
|---|---|---|---|
| typecheck | `corepack pnpm typecheck` | PASS | Application and all four packages; no TypeScript errors. |
| lint | `corepack pnpm lint` | PASS | 0 errors; 10 existing warnings in asset preview/vendor tests and source. |
| unit | `VITEST_MAX_WORKERS=1 corepack pnpm test` | PASS | 6,665 tests: 6,078 root + 62 isolated safe-media + 23 region + 183 scoring + 20 contracts + 299 engine. |
| integration | `corepack pnpm test:integration` | PASS | 57 files; 635 tests on owned local PostgreSQL containers. |
| migration replay | `corepack pnpm db:verify` | PASS | 18 migrations applied; replay []; 42 tables, 498 columns, 211 constraints, 114 indexes, 10 triggers, 27 functions. |
| production build | `corepack pnpm build` | PASS | Next 16.2.6 Turbopack. Nonfatal remote OG font fetch warnings in restricted environment; CJK OG fallback glyphs not visually certified. |
| JavaScript budgets | `corepack pnpm test:js-budget` | PASS | All routes within configured workspace 300 KB/public 240 KB gzip limits. |
| secret boundary | `corepack pnpm test:secret-boundary` | PASS | 108 public artifacts; synthetic sentinels only. Known omitted sentinel-name coverage remains F09. |
| retired transport | `corepack pnpm test:no-supabase` | PASS | Only approved pinned Neon transitive library permitted. |
| forbidden claim config | `corepack pnpm test:no-self-service-claim` | PASS | Legacy enabling configuration absent; runtime path also removed. |
| public browsers | `corepack pnpm e2e` | PASS | 40 Chromium cases; local owned fixtures; desktop/mobile/keyboard sample coverage. |
| merchant browsers | `corepack pnpm e2e:acceptance` | PASS | 107 Chromium cases; isolated Auth/mail/LLM/PostgreSQL; 12.5m. |

## Regression and review evidence

- Ownership: baseline pure claim and production-composition regressions both demonstrated attacker ownership with the forbidden flag enabled. After deletion, the expanded auth/security suite passed 317 cases; the final focused security suite passed 104 cases.
- TLS: initial fail-first tests had 10 failures against the old parser policy. Driver-effective checks now verify both URLs. Independent review found 2 more raw-space/malformed-percent encoded-key cases; both failed before canonicalization and pass afterward.
- Website: 12 initial regressions failed against the old private-fetch/body/redirect behavior. New transport tests cover private and mixed A/AAAA answers, mapped IPv6, redirect rebinding and loops, socket-pin handoff, public HTTP, final URL, streamed/declared byte limits, HTML type, deadlines and cancellation. Review's compressed-body test failed before correction; the already-aborted-signal test initially emitted one unhandled error. Both now pass without unhandled errors.
- Independent reviewer read the staged patch without editing it. Its initial verdict requested the TLS normalization and compression corrections and identified the abort helper issue. These corrections were verified by fail-first tests and the final complete suite; no second independent review is claimed.
- Initial long runs overlapped regression development and captured intentionally failing new cases; restricted runs also failed local listener/child-process permissions. They were not counted as green final runs. One final completed full unit/package command after all runtime corrections exited 0.

## Deployment and limits

Vercel metadata confirms the existing READY production deployment `dpl_Cw1TQ9LZtzurLRHpFpjYXrRzkqVB` is from baseline `85dbcd6`, not this patch. Fresh public homepage retrieval returned 200. Authenticated hosted flows, Google consent, native managed Auth delivery, real Stripe, live scans/model evaluation, Blob expiry and production load were not exercised. Browser passes above concern isolated local fixtures, not hosted acceptance. No merge or production promotion was performed.

Registry audit completed after public-repository evidence resolved its initial metadata-disclosure approval rejection. Its nonzero exit denotes reported advisories, not a failed download. Forty-two normalized advisory records and upstream 45-instance severity counts remain in the dependency CSV; F04 remains open.
