# Phase 12 — one next step, one Kinnso chat

Decision (2026-11-12): the owner surface is organised around an SME owner's
question, “what do I do now?”, not around the product's internal toolset.

## Information architecture

- Five primary destinations: **Today, Tasks, Kinnso, Results, Business**.
  Settings is reached from the account menu; it is not a competing destination.
- **Kinnso is the only owner chat**, canonical at
  `/{locale}/owner/{workspaceSlug}/conversation`. The old
  `/conversation/studio` URL permanently redirects there and preserves its
  query. `/conversation/notes` remains for browser-local notes.
- The chat is immersive: the global sidebar, mobile bottom bar and owner
  assistant launcher are hidden on the chat route. A slim topbar keeps
  notifications, theme, locale and the account menu. The chat has one local
  header: back to Today, workspace name, location, context, new chat and an
  overflow menu (export, share, old notes).
- The contextual assistant sheet is gone from owner surfaces. Home, Tasks,
  action detail and New task deep-link into Kinnso instead. The public funnel
  and demo sheets are unchanged.

## Today

- Composed as four owner-readable zones: **one next step**, **drafts waiting
  for confirmation**, **one Kinnso entry** (with three concrete suggestions)
  and an **effort-only month strip**.
- Scores, proof, evidence gallery, photo strip, agent strip, ledger and
  integration health are no longer on Today. They stay in Results, Business or
  on the task itself.
- A follow-up for a copied post and an applied review keeps its owner check on
  Today, below the primary step.
- `?location=all` asks the owner to choose a location instead of aggregating
  one; an unscanned shop starts with the free scan.

## Tasks, Results, Business, Settings

- Task metadata says **Tasks**; the list keeps filters, the side preview and
  bulk actions.
- Results owns the performance/evidence reading; Business owns the shop facts,
  locations, photos and connections. Business no longer repeats Settings
  links.
- Settings remains the hub for team, plan, notifications, activity and account.

## Kinnso context links

`AskKinnsoLink` uses an allowlisted `?ask=` key, never free text:
`explain_priority`, `compare_priorities`, `revise_action`, `write_ig`,
`reply_reviews`, `plan_week`. The server maps each key to a starter message,
and a deep link starts a fresh thread so the starter is visible. Action links
also carry `?action=` and optionally `?version=`. Kinnso prepares a draft and
can explicitly save it as a version for task-page review. Editing, approval and
copy/export remain on the task page; the chat grants no approval or delivery
authority.

## Verification

These are the recorded Phase 12 results, not fresh Phase 13 checks. Later fixes
and pending follow-ups are distinguished below; the original counts remain as
historical evidence.

- `node node_modules/typescript/bin/tsc --noEmit` — pass.
- `node node_modules/eslint/bin/eslint.js .` — 0 errors, 14 pre-existing warnings.
- `NODE_OPTIONS=--no-experimental-webstorage node node_modules/vitest/vitest.mjs run`
  — **565 files / 6,924 tests pass**. The Node flag is only a local Node 26
  workaround; CI runs the pinned Node 24.
- `node node_modules/next/dist/bin/next build` — pass; route list includes
  `/conversation` and the redirecting `/conversation/studio`.
- `node scripts/check-route-js.mjs` — every route under budget; Kinnso
  `/conversation` 251/300 KB, Today 231/300 KB.
- Isolated browser acceptance
  (`playwright.acceptance.config.ts`, owned Docker Postgres/Auth/mail/LLM):
  **124 passed, 8 skipped** (the Studio specs require
  `CONVERSATION_STUDIO_ENABLED=true`; the harness leaves it off), no failures.
  The specs now assert the redesigned surface: Today's one next step and
  `Why this?`, Business as the supporting-tools destination, Settings in the
  account menu, the `Tasks` heading, and Kinnso links instead of the removed
  owner assistant sheet.
- Signed-in hosted read-only walkthrough completed on 2026-11-13: 18 page
  visits returned 200 with no horizontal overflow or JavaScript page errors;
  11 interaction/theme checks passed. The evidence-wording guardrail issue
  found then was subsequently **fixed by [PR #174](https://github.com/YNWAforever/smeassistant/pull/174)**.
  Its separate post-fix read-only release check covered Today, Tasks and task
  evidence in all three locales at 1440px/390px (18 HTTP-200 visits, no page
  errors or overflow); no live business records were rewritten. See the
  [guardrail release evidence](PHASE-12-EVIDENCE-GUARDRAIL.md) and
  [hosted walkthrough](PHASE-12-HOSTED-WALKTHROUGH.md) for scope, the earlier
  mobile readiness retry, findings and limits. Mutation-based hosted Studio
  acceptance was not repeated.
- The transient-null-document hydration regression observed in the follow-up
  acceptance run was **fixed by [PR #175](https://github.com/YNWAforever/smeassistant/pull/175)**
  (merge `b99365f9543ef3e5dc2bbcf292ec56f1bc298a46`). The browser fixture now waits
  safely when the document root is temporarily absent. This test-readiness fix
  is separate from the original hosted mobile readiness retry.

## Phase 13 reconciliation — 2026-11-14

Persistent chat, document/search-brief attachment, sharing and explicit
save-as-version/task review are already shipped capabilities. The
[historical Studio production record](../implementation/owner-platform-v1/CONVERSATION-STUDIO-PRODUCTION-EVIDENCE.md)
contains the owner's **2026-11-11 report** that the 15-point hosted checklist
passed; it is not a fresh Phase 13 browser run. The
[reconciled roadmap](../implementation/owner-platform-v1/CONVERSATION-STUDIO-V1.1-ROADMAP.md)
retains the original planning history without presenting those features as new
pending work.

- [PR #176](https://github.com/YNWAforever/smeassistant/pull/176) adds enabled
  Kinnso acceptance alongside the existing flag-off run. It is **merged** after
  both CI jobs passed. The eight skipped checks above remain the accurate historical
  Phase 12 result; the new enabled job closes that coverage gap prospectively.
- [PR #177](https://github.com/YNWAforever/smeassistant/pull/177) preserves the
  authorized originating conversation through exact-version review, refresh
  and return. It is **pending merge**, not deployed. Its two-conversation test
  distinguishes exact return from reopening the most recent discussion.
- The dedicated browser attachment fixture passed in all three locales at
  mobile/desktop widths as part of Phase 13's **11 passing enabled local cases**.
  It exposed an existing citation-parser omission, fixed in the final follow-up.
  These results cover attachment, send and reload with an existing owned fixture;
  they do not cover Blob upload or prove live model grounding. Final PR CI and
  hosted release status belong in the [Phase 13 record](PHASE-13-OWNER-JOURNEY.md).
- Fresh production generation, upload/import, approval or export requires a
  designated authorized test workspace and explicit permission for writes and
  model spend. Read-only page verification does not exercise these operations.
