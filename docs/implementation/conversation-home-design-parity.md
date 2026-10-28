# Conversation Home design parity + Today hybrid

Design-parity Approve: **Willy Approved 2026-10-28 ~23:09 HKT via Rio**, including the Today-above-composer hybrid, as recorded in `/workspace/phase1/sme-conversation-home-design-parity-brief.md`. Base: `main` at `a9b97e0ea57ea844216578a4d0b343f8e93ba05d` (Stages 1–3).

**Production conversation flag still OFF.** The server gate, Production force-off, Today default route, and hosted configuration are unchanged. This is a Preview/development opt-in. No CloudAgent was used; implementation and validation ran in the local Codex CLI at `xhigh`.

## What changed

- The conversation route uses a centered cream frame, beige sidebar, charcoal text, burnt-orange icons, peach active navigation, and hairline cards. The existing workspace switcher, Today / To do / Better? / Shop routes, Ask Kinnso, location selector, and four-link mobile navigation remain available.
- The home starts with 「想為間舖做啲咩？」, shop/language/source chips, and a compact Today summary **above** the composer. Counts come from the same authorized, location-scoped `getHomeBrief` read as Today: open tasks, draft versions, and tasks completed this month. These are activity counts, not business-performance claims. A failed summary stays unavailable rather than becoming zero; `location=all` retains the existing authorized task scope without inventing an aggregate score.
- 「開始討論」 saves the first browser-local note. The accessible save label stays compatible with existing tests and explains the actual action. Subsequent notes retain the existing save operation. There are no generated chat replies or new model calls.
- 「加入文件」 and the document chip open the existing Stage 2 panel. Uploads still use the existing text/Markdown/CSV version endpoint and limits. A saved local thread is required before citing an immutable document version; the entry point never uploads or cites automatically. The composer shows the number of cited versions when present.
- Six cards use the existing workflow keys. All / Get started / Content & reviews / Search & results filter them. Choosing any card only fills and focuses the note composer; it does not create a thread, run a workflow, generate content, or create a task.
- Continue work and recent local discussions appear before the tool panels. Continue links retain exact saved-version deep links. The sidebar receives only titles from the mounted local scope. Its provider resets synchronously when the account, workspace, or location changes and clears titles on unmount; recent threads remain in the existing account/workspace/location-scoped localStorage format.
- Search, documents, and connections use native disclosure panels. Their mounted components retain pending form state, confirmations, and citations when closed and reopened. Existing labels, source limitations, budget states, confirmation checkbox, immutable confirmed brief, observation baselines/windows, and delivery counting are retained.

## Visual evidence

The [concept deck](https://smeassistant-conversation-home.laichiwillyjp.chatgpt.site/) is the visual reference. Its sample shop and findings are not app data. The supplied references are archived with the implementation screenshots for review:

| Reference | Implemented home |
| --- | --- |
| [Concept home](../ux/conversation-design-parity/reference-home.png) | [Desktop zh-HK](../ux/conversation-design-parity/home-desktop-zh-HK.png) |
| [Concept continue/recent](../ux/conversation-design-parity/reference-continue.png) | [Mobile zh-HK](../ux/conversation-design-parity/home-mobile-zh-HK.png) |

Screenshots are explicitly labelled **OFFLINE SYNTHETIC**. They render the real components and compiled app CSS at Desktop Chrome and iPhone 13 sizes, with synthetic read models and blocked external requests. They prove local layout and interaction, not authenticated hosted Preview access, real GSC findings, or business outcomes. The screenshots intentionally show honest empty local discussions. E2E also creates a local discussion and checks recent/sidebar navigation.

## Validation

- `pnpm test`: full app suite (6,571 tests, including isolated safe-media tests) plus 525 workspace-package tests passed.
- Final focused conversation/route/shell run: 57 tests passed, including Production/off rejection before reads, scoped summary counts, and summary-read failure.
- `pnpm e2e:conversation`: 24 tests passed across desktop and mobile. Includes all three locales, seed-only templates, blocked/corrupt storage, account/workspace/location isolation, immutable document citations, source budgets/partial results, confirm-before-task, observation-window limits, delivery count, and no horizontal overflow.
- A subsequent four-test desktop/mobile visual pass covered the final sidebar treatment, Today/default routing, template filters, attachments, recent navigation, and return from a thread to templates.
- Full lint, workspace typecheck, production build, route JavaScript budgets, and secret boundary passed. Conversation first-load JS: 239 KB / 300 KB. Final label/style refinements also passed targeted lint and root typecheck.
- CI workflow configuration is unchanged. Remote CI status and the final full tip SHA are recorded in the PR and `/workspace/cli-logs/sme-design-parity.last.txt`.

The local Corepack shim required `COREPACK_HOME=/tmp/sme-design-parity-corepack` because its system cache was not writable. No tracked dependency or lockfile changed.

## Preview review steps

1. In an already opted-in Preview/development environment (`CONVERSATION_HOME_ENABLED=true`, never Production), sign into an authorized workspace and visit `/zh-HK/owner/<workspace>/conversation?location=<location>`.
2. Compare the hero, cream/beige frame, chips, Today-before-composer order, six cards and filters with the references. Review the same screen at 390 px; the desktop sidebar yields to the existing mobile navigation.
3. Choose a template and confirm it only fills the composer. Start a discussion, reload, and return through Recent discussions. Switch account/workspace/location and confirm the prior scope is absent.
4. Use Add document, upload a supported file, cite its saved version, then add a newer version and verify the citation still opens the old text. Before a thread exists, verify the explanatory cite limitation remains visible.
5. Open Search gaps. Review a source-backed brief and verify adding a task requires its checkbox and explicit confirmation. Close and reopen the panel; the confirmed brief remains fixed. Observe retains missing-baseline, later-window, coverage, and partial-language restrictions.
6. Return through Today and existing task/version links. In a flag-off or Production-equivalent environment, verify the conversation route returns 404, its switch/chrome are absent, and Today remains the default home.

Authenticated hosted Preview visual acceptance remains a reviewer step; the local harness does not claim that access. This work is for a **draft PR only**, with no merge or ready-for-review transition.
