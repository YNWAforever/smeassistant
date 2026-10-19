# PR #92 — version parameter regression repair

Date: 2026-10-20, Asia/Hong_Kong.
Base: `098f43f907987f415c95c10a92b8ea59d5ee078b`.
Branch: `codex/owner-home-next-step-20261019`.

## Root cause and reproduced evidence

CI run `39294097908` completed with 5,762 unit passes and two failures in
`action-detail-version-param.test.tsx`. Its older assertions expected an unknown
version to select the latest draft or leave the editor visible. The required
fail-closed behavior deliberately removed that editor. This file was omitted
from the earlier six-file, 222-test local cohort.

There was also a real input-retention defect: the outer invalid-version guard
unmounted the entire editor. Returning to a valid version reset its unsaved
draft and child owner-check input. This was not solved by changing assertions.

Reproduction, retry 0:

- Original file: **6 PASS / 2 FAIL**, matching the CI failures.
- Updated contract plus recovery regressions, before the product repair:
  **12 PASS / 3 FAIL**. It reproduced selecting the newest draft after clearing
  the invalid parameter, losing unsaved text, and offering an unsafe home exit.

## Minimal repair

- Keep the previous valid editor mounted, hidden and inert while an invalid
  parameter is displayed. The error view offers same-page recovery and no
  home link that could discard existing input.
- First-load unknown or empty parameters never mount a fallback editor.
- Scope the retained editor by workspace and action. A different workspace
  cannot restore the previous merchant's editor or unsaved input.
- Preserve existing dirty-version switching protection. Clearing the query
  restores the existing selection; it does not silently choose another draft.
- Localize recovery in EN / zh-HK; zh-TW inherits the existing Chinese copy.
- The offline router fixture models same-path query changes without a reload.
  It does not replace product version validation or real authentication.

No API, SQL/schema, approval, export, usage, Auth or deployment policy was
changed. The branch's Vercel automatic-deployment exclusion remains false.

## Final local verification

Runner prefix:
`node test-results/owner-home-next-step-20261019/pr92-version-param-fix-20261020/run.cjs`

| Arguments | Result | Exit | RAM MiB before |
| --- | --- | --- | --- |
| `unit final-unit` | **237 PASS**, 7 files, retry 0 | 0 | 6360 |
| `typecheck final-typecheck-fixed` | App and four packages PASS | 0 | 5526 |
| `lint final-lint` | 0 errors, 40 warnings in unchanged files | 0 | 5498 |
| `build final-build` | Safe Webpack build and 171-public-artifact secret sweep PASS | 0 | 6011 |
| `browser final-browser` | **11 PASS**, retry 0, one worker | 0 | 6016 |

Every gate rechecked the 4096 MiB physical RAM minimum, disk headroom, an OS-only
environment allowlist, disabled Corepack network and the loopback transport
guard. No real credentials were loaded. A first typecheck caught two unsupported
Testing Library `exact` options; anchored accessible-name regexes corrected
those without changing the assertions, and the affected gates were rerun.

All five final gates match the same 16-file source snapshot, with zero source
changes during execution. Snapshot fingerprint:
`949161f703448fb18d06e67e40ec49258fa8039fe2366a810721deee1024e06b`.
Staged and committed blobs are checked against tested bytes, allowing CRLF-to-LF
normalization only.

The 15 version-parameter cases cover initial named/default/unknown/empty
versions, EN/zh-HK, mounted query changes and clearing, unsaved draft recovery,
the recovery URL, dirty valid-version refusal, workspace reset and input anchors.
The browser suite retains the earlier nine cases and adds two EN/zh-HK 390×844
cases that preserve both unsaved draft text and owner-check notes through an
invalid query and same-page recovery. No owner-check POST or other mutation is
made by recovery; fixture usage remains 2/3.

## Evidence boundaries

Local logs/receipts and RED states are retained under
`test-results/owner-home-next-step-20261019/pr92-version-param-fix-20261020/`.
Screenshots are under the existing ignored browser result directory; the prior
nine-case output was archived before rerunning.

The old 222-unit / 9-browser result remains historical evidence at `840250e`.
The counts above certify this repair, not a real login or production acceptance.
Browser session/router/HTTP state is mocked. Real Auth/Google, hosted
SSR/hydration, Safari/physical devices, production UAT/Eldage, new real Home SQL
execution and fresh empty-database seed boot remain NOT_RUN locally.
No database/container, paid provider, external publishing, merge or deployment
was performed. CI results on the pushed exact PR head are separate evidence.
