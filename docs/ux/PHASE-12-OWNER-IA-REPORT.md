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
also carry `?action=` and optionally `?version=`. Save/approve/export stay on
the task page; Kinnso only prepares a draft.

## Verification

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
- Hosted browser acceptance is still to be run after deployment.
