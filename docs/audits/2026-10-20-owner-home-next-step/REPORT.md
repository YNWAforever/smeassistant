# Owner home next step — final local verification

Date: 2026-10-20, Asia/Hong_Kong. Latest checks ran at 01:04:10–01:06:53 HKT.

**Status: PASS_LOCAL_OFFLINE.** The final 15 product/test/config files passed the
same-source focused unit, offline browser, typecheck, lint and safe Webpack /
public-artifact secret gates. This report belongs to the local delivery commit;
its exact full SHA, parent, index/blob fingerprints and remaining worktree state
are read back into `test-results/owner-home-next-step-20261019/status.json` after
commit. This is not hosted or production acceptance.

## Checkout and bounded scope

- Baseline / required parent: `46b8a8273b7e17df85bf43759388cce23256b879`.
- Branch: `codex/owner-home-next-step-20261019`.
- Worktree: `.worktrees/smeassistant-local-seo-completed-state-20261018`.
- Initial HEAD and all 17 checkpoint file fingerprints were unchanged; the
  initial index was empty. No reset or unrelated file cleanup occurred.
- The 17-file checkpoint is 15 product/test/config files, this report, and an
  ignored local gate runner. The runner, raw logs, receipts and screenshots
  remain local and are excluded from the commit. The scoped commit contains
  the 15 files plus this report.
- Three unrelated `.superpowers/sdd/` artifact paths are retained untracked.
- No new fixture/container, production/UAT/Eldage access, real Auth/Google,
  paid call, Secret/config/quota change, push, merge or deployment occurred.

## User problem and final behavior

Home previously selected only open actions, so an applied/completed review V2
still needing an owner check disappeared. Links could open a newer V3 draft.
The slice reuses existing actions, immutable versions, applications and
append-only owner-check audit records; it adds no parallel task or approval
system and makes no schema change.

- A read-only bounded query scopes workspace/location/manager access before
  the final `LIMIT 3`, reads exact-version audit metadata, and excludes an
  already independently verified application. Home serializes only check
  ID/decision/time, not private notes or evidence references.
- Home retains Completed and links explicitly to the applied V2. A newer V3
  draft has a separate explicit version link and does not inherit V2 checks.
  Existing ordinary priority links also identify their saved version.
- Detail reuses the existing owner-check API, authorization, version comparison
  and request identity. Returning home is blocked while saving or while input
  is unsaved, failed, unknown or stale. Input survives failures; retry reuses
  the request identity. A confirmed save enables full Home navigation to read
  the current saved state. A later acknowledgement does not replace a newer
  record. Viewers can inspect and return without mutation controls.
- All four owner-check outcomes remain owner statements. None confirms
  independent verification, publication or improved business results.
- Final regression exposed an invalid `?version=` falling back to V3. The
  smallest repair rejects an explicitly unavailable version before mounting
  the editor, shows localized recovery text and offers the scoped Home link.
  It does not silently select another version.

Changed product files: `components/workspace/{home-brief,action-detail-client,
owner-review-check-panel}.tsx`, `lib/copy.ts`, `lib/repositories/workspace-read.ts`,
`lib/workspace/{queries-pages,home-review-follow-up}.ts`.
Tests/config: the three existing related unit files, the two new Home projection
and repository-boundary tests, `playwright.owner-home.config.ts`, and the two
`test/offline/owner-home*` files. No existing assertions or timeouts were relaxed.

## Fresh final gates

Working directory for every command is the dedicated worktree above. Each gate
used the original normal exec approval-review route. Physical RAM was checked
again immediately before the gate, with the preserved minimum **4096 MiB**;
the existing gate defines no additional numeric disk minimum. All checks ran
sequentially. No processes or other containers were stopped.

Commands below use literal worktree-relative paths.

| Gate / exact command | Final result | Exit | RAM MiB / disk GiB before |
| --- | --- | --- | --- |
| `node test-results/owner-home-next-step-20261019/run-gate.cjs unit delivery-unit` | **222 PASS**, 6 files, retry 0, one worker | 0 | 6677 / 37.33 |
| `node test-results/owner-home-next-step-20261019/run-gate.cjs typecheck delivery-typecheck` | root `tsc --noEmit` plus all 4 package typechecks PASS | 0 | 6699 / 37.33 |
| `node test-results/owner-home-next-step-20261019/run-gate.cjs lint delivery-lint` | effective `corepack pnpm lint` / `eslint .`: 0 errors, 40 warnings | 0 | 6569 / 37.33 |
| `node test-results/owner-check-real-20261019-retry2/finalization/attempt-20261019T150559Z/run-safe-build.cjs` | Webpack build PASS; secret sweep PASS across **171 public artifacts** | 0 | 7158 / 37.32 |
| `node test-results/owner-home-next-step-20261019/run-gate.cjs browser delivery-browser` | **9 PASS**, retry 0, one worker; final-build CSS | 0 | 7831 / 37.33 |

The unit
command expands to `node node_modules/vitest/vitest.mjs run` with these six files
and `--retry=0 --maxWorkers=1`:

```text
components/workspace/home-brief.test.tsx
components/workspace/owner-review-check-panel.test.tsx
lib/workspace/queries-pages.test.ts
components/workspace/action-detail-client.test.tsx
lib/workspace/home-review-follow-up.test.ts
lib/repositories/home-review-candidates.test.ts
```

Browser command expands to `corepack pnpm exec playwright test --config
playwright.owner-home.config.ts`. Typecheck expands to `corepack pnpm typecheck`.
The safe build invokes `corepack pnpm test:secret-boundary` with
`SME_TEST_WEBPACK=1`. Its environment is an OS allowlist, invalid external
origins, loopback port-1 dummy DB and synthetic Auth/secret sentinels. Corepack
network is disabled; Node transport accepts loopback only. Browser transport
uses a blocking proxy. No ambient real DB/Auth/provider credentials are passed.

Warnings: the three sanitized `workspace_read_failed` messages are expected
negative-path assertions. Lint's 40 warnings are in unchanged files and were
not suppressed; they concern unused variables/types and one existing `<img>`.
Build reported existing Node `DEP0190` for the static-argument shell invocation.
There were no build errors and no secret-boundary hits.

Every gate's receipt includes command, timestamps, exit code, resource reading
and source snapshot. All five final source snapshots match all 15 delivered
product/test/config files, with zero changes during gates. Combined fingerprint
(SHA256 of sorted JSON path / uppercase working-file SHA256 pairs):

```text
a03ea13b4c643630bfb19228d613212ded0f577e8929d327cede085a5b76ec82
```

The report is updated after the gates as delivery documentation. Staged content
is compared against the tested bytes; Git CRLF-to-LF-only normalization is
recorded separately as working SHA256 and committed-blob SHA256. No untested
product changes may be included.

## Acceptance matrix — local synthetic evidence only

| Case | Result / evidence layer |
| --- | --- |
| Completed applied V2 remains reachable; V3 draft separate | PASS: unit + four browser locale/viewport cells |
| Home → exact V2 → record check → Home → full reload | PASS: real product UI/client validator, mock session/router/memory HTTP |
| Four existing check outcomes and independent-verification wording | PASS: unit renders; save cases covered by panel tests |
| Lost response / retry identity / one record / input retained | PASS: unit + browser lost-503-response case |
| Stale tab / explicit refresh / append correction | PASS: unit + two-page browser case |
| Newer saved record before late acknowledgement | PASS: panel unit regression |
| Dirty, unknown, denied or stale return state | PASS: panel unit + browser pending/error handling; no false success |
| Empty state / failed Home query | PASS: rendering and repository/query mock tests; read failure propagates |
| Viewer / foreign summary / workspace switch | PASS: offline unit/browser scope tests; no foreign summary data |
| Invalid exact-version URL, reload and recovery, EN / zh-HK | PASS: two browser cases; no draft/editor or check is shown for the wrong version |
| Viewing/checking adds no AI request or unrelated write; usage stays 2/3 | PASS: synthetic transport/counters only; no real usage database claim |
| Keyboard Enter / no Home horizontal overflow | PASS: all four browser happy cells |

All browser data is clearly marked OFFLINE SYNTHETIC. It uses real Home/detail
components and client validation, with a mock session, mocked Next navigation
transport and an in-memory HTTP fixture. This does not prove normal sign-in,
real API/SQL authorization, Next hosted SSR/hydration or cross-session DB
persistence. Unit remounts and full browser reloads prove fixture restoration
only. No database fixture was created in this round.

## Final screenshots

Each cell uses its real recorded viewport; PNGs are full-page captures and may
be taller than the viewport. Every cell contains `home-before.png`,
`version2-saved.png`, `home-saved-reloaded.png`, and a `result.json` receipt.
All four final Home reload screenshots were visually inspected.

Root: `test-results/owner-home-next-step-20261019/browser/`

| Locale | Viewport | Result directory |
| --- | --- | --- |
| en | 1440 × 900 Chromium | `owner-home-en-1440px-home--35293--completed-with-V3-separate` |
| zh-HK | 1440 × 900 Chromium | `owner-home-zh-HK-1440px-ho-f29e3--completed-with-V3-separate` |
| en | 390 × 844 Chromium | `owner-home-en-390px-home-→-d07bf--completed-with-V3-separate` |
| zh-HK | 390 × 844 Chromium | `owner-home-zh-HK-390px-hom-75687--completed-with-V3-separate` |

The final browser result is 9/9, no unexpected writes, usage 2/3 and no page
errors in the four recorded journey cells. The mobile cells are Chromium
viewport emulation, not Safari or a physical device.

## Preserved RED / earlier GREEN / blocked checkpoints

Earlier records remain in `test-results/owner-home-next-step-20261019/`.
New finalization evidence is in `review-retry-20261019T164544Z/`; prior report,
status and all 17 fingerprints were copied there before this continuation.

- Original pre-fix `unit red`: **4 FAIL / 95 PASS**, exit 1. Missing exact-version
  Home follow-up, protected return and query metadata. Earlier first minimal
  GREEN: **99 PASS**, exit 0. Neither is substituted for the latest 222 PASS.
- Two earlier pre-execution reviews returned `Automatic approval review failed:
  unexpected status 403 Forbidden`; neither executed the requested action.
  Available CF-Ray response identifiers: `a4d1046f2d4fdd89-HKG` and
  `a4d104a7ebce9b47-HKG`. These are not labelled request IDs. Exact original
  timestamps/request IDs were not exposed; both precede checkpoint
  `2026-10-19T16:04:59.0916872Z`. Root cause remains **UNCONFIRMED**.
- Previous permitted retry at `2026-10-19T16:31:42.7471456Z`: **3446/4096 MiB**
  RAM, disk 43.05 GiB, exit 2 before tests. It remains BLOCKED_RESOURCE history.
- This continuation's original-route retry executed at
  `2026-10-19T16:45:45.0508184Z`: RAM 7942 MiB, disk 39.90 GiB, no new 403 and
  no exposed review request ID. No permission changes or alternative route.
- First browser run: 9 FAIL because the offline esbuild harness omitted Next's
  client environment replacement. Narrow diagnostics captured `process is not
  defined`. Harness now uses empty offline `process.env`, with no credentials.
- After that harness repair, two invalid-version RED cases showed the actual
  fallback to V3 in captured DOM. The small explicit-version guard fixes this;
  final browser is 9 PASS. The initial 9 failures are not 9 product defects.
- First final typecheck exited 2: widened fixture `independent` boolean and a
  Home audit ID type mismatch. Explicit `OwnerCheckRecord` and the existing
  parser's string-or-number ID contract fix these; no runtime privilege change.
  Final typecheck and the full affected 222-test cohort were rerun successfully.

The final matrix review added separate 403-denial and connection-loss assertions:
input remains, return stays blocked, no Saved message or onSaved callback fires.
Existing product behavior passed both. All five delivery gates above were then
run against that exact final source; the earlier 220-test and browser successes
remain earlier evidence only.

No assertions were deleted, no timeout was raised, and retries remain zero.
The earlier retry2 10 real SQL/API PASS, 6334 unit PASS and 26 harness PASS are
historical baseline evidence; none was rerun or counted as new acceptance here.

## FAIL / BLOCKED / NOT_RUN and future approval

- Final local gates: PASS; remaining local FAIL/BLOCKED: none.
- NOT_RUN: execution of the new read-only Home query on PostgreSQL; the query's
  syntax/permissions/concurrency are not certified by mocked query assertions.
- NOT_RUN: strengthened seed boot on a fresh empty DB; no retry2 recreation.
- NOT_RUN: real Auth/Google, production UAT/Eldage, Safari/WebKit and physical
  devices. No new real-session or hosted/production claim follows from this work.
- NOT_RUN: paid AI/provider calls, external publication/rescan, CI or deployment.

Next proposed small pilot requires separate approval: one exact hosted SHA,
one named synthetic UAT merchant/account/workspace, one existing applied
version, one normal owner sign-in session, Home → exact version → owner check
→ Home/reload, at most three owner-check POSTs and otherwise reads. It excludes
AI, approval/export/publishing, rescans, Auth/config/quota changes, bulk requests,
Eldage and production merchant data. A separate DB authorization would name the
exact isolated target and row/read/cleanup budget before testing the new query.
This is a future proposal, not authorization to perform those operations now.