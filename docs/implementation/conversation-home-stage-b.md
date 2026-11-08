# Conversation workbench — Stage B boutique wrap

Stage B Approve: Willy via Rio, under the approved continuous plan (~10:57 HKT), as recorded in `KEEP_STAGE_B_BRIEF.md` and `/workspace/phase1/sme-conversation-workbench-stage-b-brief.md`. Scope follows the next plan's Stage B. Base: `main` at `4f20fde582f26be2aff97d4afd6b7ca680ce8c06` (#122 Stage A).

**Production conversation flag still OFF.** Today remains the default home. This is a visual wrap on the existing gated Preview conversation route; no hosted environment changes are part of this work.

## Surfaces

- Selected threads now use a hairline card with a local-browser label, the existing workspace-time formatter, a note stack and a separate task-link area. Notes and saved task/version links retain their existing behavior.
- 「加入文件」 still opens and focuses the same document form. Upload controls sit in a beige well; each document version has a compact disclosure and explicit cite button. Cited immutable versions sit in a peach card, with source text disclosed on request.
- Search gaps use visible source-limit callouts, a saved-read selector, query rows, and a separate brief card. The confirmation checkbox and explicit add-task control sit together in a peach well. The immutable confirmed brief, task link, observation limits and later-window result remain visible in their existing flow.
- Connectors use individual hairline cards, visible reason/status copy, scope/read-time metadata, budgets and request controls. Missing reads never receive a success treatment or fabricated data.

All colors reuse the #121 conversation shell's existing `--paper`, `--paper-2`, `--border`, `--brand-soft`, `--brand-text` and ink tokens. There is no new theme system or dependency. At mobile widths, document actions and metadata stack; long notes, filenames and citations wrap. The shell retains its cream palette under a dark appearance preference.

## Preserved boundaries

Component changes are presentation markup/classes only. Existing request, upload, cite, storage, search, confirmation and observation handlers are unchanged. Native tool/version disclosures keep mounted state when closed.

Stage 2–3 budgets, partial/empty/unavailable copy, coverage limits, confirmation-before-todo, immutable brief and citation IDs, observation baselines/windows, and delivery counting are retained. Templates remain seed-only. No new model/provider/backend, persistence model, docs/search owner-role API change, Production/default-home change or Stage C–D work is included. 今日／待辦／好啲？／舖／問 Kinnso and existing location/thread/task/version deep links remain available.

## Visual proof

These screenshots are **OFFLINE SYNTHETIC**, labelled in the rendered harness. They use real components and compiled app CSS, synthetic browser-local notes/documents/search records and blocked external traffic. They demonstrate local layout and interaction; they are not authenticated hosted Preview, live shop data, real Google/paid-provider reads or business-outcome evidence.

| Surface | Desktop | Mobile (~390 px) |
| --- | --- | --- |
| Thread + documents/cite | [Screenshot](../ux/conversation-stage-b/thread-documents-desktop-zh-HK.png) | [Screenshot](../ux/conversation-stage-b/thread-documents-mobile-zh-HK.png) |
| Search brief + confirmation | [Screenshot](../ux/conversation-stage-b/search-confirm-desktop-zh-HK.png) | [Screenshot](../ux/conversation-stage-b/search-confirm-mobile-zh-HK.png) |
| Connectors + budget gates | [Screenshot](../ux/conversation-stage-b/connectors-desktop-zh-HK.png) | [Screenshot](../ux/conversation-stage-b/connectors-mobile-zh-HK.png) |

The Stage B browser case checks long-note/filename overflow, immutable citation display, keyboard checkbox confirmation, form/confirmation state across disclosures, missing later-window honesty, unchanged delivery counts, and at least 4.5:1 text contrast for the expanded gates under a dark appearance preference. Existing Stage 1–3 route, storage, seed-only, budget, citation, confirmation, partial and observe regressions also run.

Hosted signed-in Preview review should open a selected thread, attach/cite a supported document, and inspect Search gaps/Documents/Connectors on desktop and mobile. Use the existing authorized source state; missing data remains an honest empty/unavailable state. Local screenshots do not replace that review.

## Validation

- `pnpm lint`: passed with the same 10 existing warnings; changed TSX files also passed targeted ESLint.
- `pnpm typecheck`: root and all four workspace packages passed. The subsequent production builds also checked the final browser test changes.
- `VITEST_MAX_WORKERS=2 pnpm test`: 6,580 app tests (including the isolated 62 safe-media tests) and 525 workspace-package tests passed, 7,105 total.
- `pnpm e2e:conversation`: all 32 desktop/mobile tests passed, including the new Stage B expanded-surface case and all existing Stage 1–3 regressions. The focused Stage B run also passed both viewports.
- `pnpm build`: passed. `pnpm test:js-budget`: all routes passed; conversation first load was 241 / 300 KB gzipped.
- `pnpm test:secret-boundary`: passed across 109 public artifacts.
- `git diff --check`: passed.

Local commands used `COREPACK_HOME=/tmp/sme-stage-a-corepack` for the available writable package-manager cache. Dependency manifests and lockfile are unchanged. Logs are under `/workspace/cli-logs/sme-stage-b.*.log`.

Remote CI, draft PR creation, independent PR-diff review and hosted Preview acceptance are parent/reviewer steps, not claimed here. This handoff explicitly requires a local commit only: no push, PR, merge or Production environment write.
