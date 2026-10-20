# Phase 4 report: workspace shell and information architecture

Date: 2026-10-20 · Branch: `ux/phase-4-workspace`, cut from `ux/phase-3-scan-report` · Not pushed.

Decisions taken on 2026-10-20 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | The assistant is called **"Ask Kinnso"** (zh: 問 Kinnso) |
| 2 | **Bulk approve** is allowed, but **only for review replies and social posts** |
| 3 | **Fix Pack drafts** become a "Fix Pack" view of Actions instead of a card on Today |
| 4 | **Create, Offers and Starter pack** merge into one **New** button with three modes |

There are no changes to API contracts, migrations, `packages/*`, auth or data access. Offers and Starter pack stay behind their existing flags (`OFFER_PROMOTIONS_ENABLED`, `WORK_PACKS_ENABLED`). Every approval, including bulk approval, still goes through `POST /api/versions/[id]/approve`, which re-checks role, scope and state.

## What changed

| Commit | Result |
|---|---|
| `d68d978` | **Pages moved under Business and Settings.** Old URLs answer with a **308** to their new home and keep the query string (`lib/workspace/route-redirects.ts`, called from `proxy.ts`). New index pages for Business and Settings, plus a Locations page. |
| `05048ed` | **Five-destination shell**: Today, Actions, Insights, Business, Settings. A 5-tab bar on phones, the usage meter in the sidebar, the Kinnso OS brand and the "Ask Kinnso" button in the top bar. All strings live in `lib/copy-shell.ts`. |
| `497ecf8` | **One Actions queue.** Status tabs plus **Due** (the old Calendar) and **Fix Pack** views, and a **New** button that viewers don't see. The Fix Pack and Starter pack cards are removed from Today. |
| `e442655` | **Action detail beside the queue** on screens 1280 px and wider (`?open=<id>`), with "Open full page". Each action now shows the approval flow (draft → needs approval → approved → delivered) and a collapsed compare with the previous version. The Evidence and Workflow tabs moved into their own files. |
| `3360f77` | **Bulk approve** for review replies and social posts (details below). |
| `586db8a` | **Rename**: "Ask Kinnso" in the launcher and sheet. "SME Scanner" becomes "Kinnso OS" in workspace audit labels, assistant evidence and the integrations note. |
| `2164d49` | **Fix**: in the side panel, the detail stays in one column and its approval bar stays inside the panel instead of covering the list. |

### Where things moved

| Old URL | New home |
|---|---|
| `/create` | `/actions/new` (mode "From a goal") |
| `/offers` | `/actions/new?mode=offer`, only while the Offers flag is on; otherwise the old page stays a 404 as before |
| `/calendar` | `/actions?view=due` |
| `/assets` | `/business/assets` |
| `/settings/brand` | `/business/profile` |
| `/settings/integrations` | `/business/integrations` |
| `/settings/billing` | `/settings/plan` |
| `/activity` | `/settings/activity` |
| `/more` | `/settings` |

`?location=` and any other query parameters are kept. A parameter the new URL already sets (such as `view` or `mode`) is not overwritten.

### Bulk approve

- **What can be offered:** only `review-response` and `social-post` actions that meet all of these:
  - the action is open
  - no facts are missing
  - the latest version is a draft
  - the latest version has no guardrail warnings
  - the user is an owner, or a manager whose scope covers the action's location
- **Reading first:** the dialog shows each draft's **full text**, and a draft is approved only after its "I've read this" box is ticked.
- **How it approves:** drafts go one at a time through the existing approve route, and the dialog reports each one as approved or failed. A failure is never retried automatically.
- **Guardrail 5 still holds:** each approval locks one exact version. A version that changed since the page loaded is not offered.

## Honesty and scope checks

- **Server-enforced scope.** The New button and bulk approve are hidden for viewers. Hiding them is only for convenience: every mutation still goes through the unchanged routes and their role and scope checks.
- **Integrations** shows on Business for viewers as a locked "Owner only" row. Viewers don't get a link to a page that would refuse them.
- **No dark feature through a URL.** `actions/new?mode=offer` or `mode=pack` falls back to "From a goal" while that flag is off, and Offers stays off for demo workspaces, as it was before.
- **Delivered means exported or published.** The approval flow reads "delivered" only when the version was actually exported or published.

## Measures

The local fixture workspace was captured on 19 pages, as owner and viewer, in en and zh-HK, at 390 and 1440 px (76 captures). The side panel was also captured at 1280 px, and 10 captures were taken in dark mode.

| Check | Result |
|---|---|
| HTTP status | 200 on every page; old URLs answer 308 |
| axe-core (WCAG 2.2 AA) | **0 violations** on every capture |
| Horizontal overflow | none (only the side panel's tab strip scrolls sideways, by design) |
| Cumulative layout shift | ≤ 0.001 |
| One `h1` per page | yes, including the side panel, where the action title is an `h2` |
| Console errors | none |

Captures:
- [Today, en 390](phase-4/p4-today-en-390.jpg)
- [Actions, zh-HK 390](phase-4/p4-actions-zh-HK-390.jpg)
- [Actions with the side panel, en 1440](phase-4/p4-actions-open-en-1440.jpg) and [dark](phase-4/dk-actions-open-en-1440.jpg)
- [Fix Pack view, zh-HK 390](phase-4/p4-fixpack-zh-HK-390.jpg)
- [New, en 1440](phase-4/p4-new-en-1440.jpg)
- [Business, en 1440](phase-4/p4-business-en-1440.jpg) and [as a viewer, en 390](phase-4/p4-viewer-business-en-390.jpg)
- [Settings, zh-HK 390](phase-4/p4-settings-zh-HK-390.jpg)

## Verification

All gates ran one after another on the final commit.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 40 warnings (unchanged) |
| `corepack pnpm test` | 5,931 + 62 root tests. Packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |
| `corepack pnpm e2e` | **Not run locally** (needs Docker); CI runs it. The specs now use the new URLs, and `home-today` checks the old-URL redirects. |

New tests:
- `route-redirects.test.ts` and `tests/proxy.test.ts`: every move, the query is kept, existing params are not overwritten, and Offers redirects only when its flag is on.
- `workspace-shell.test.tsx`: five destinations, the active destination for nested paths, and the Ask Kinnso label.
- `actions-queue-frame.test.tsx`: tabs, counts and the New button hidden for viewers.
- `actions/new/page.test.tsx`: the available modes per flag, and the fallback to "From a goal".
- `action-progress.test.tsx`: the approval step for every state.
- `lib/workspace/bulk-approve.test.ts` and `components/workspace/bulk-approve.test.tsx`: eligibility by template, role, scope, state and guardrails; read-before-approve; per-item outcomes.
- `offers-mode.test.tsx`: moved with the Offers page.

## Deviations from the plan

1. **`action-detail-client.tsx` is only partly split.** Two tabs moved out; about 980 lines remain. Splitting the editor and approval state safely needs the e2e suite, so it waits for Phase 6.
2. **`/packs/[id]` stays its own page.** It is a deep link from the Starter pack mode, so it did not need to move.
3. **The "Ask Kinnso" drawer reuses the existing assistant sheet**, now opened from the top bar, instead of a new component.
4. **The rename on the sign-in page and in site metadata** waits for Phases 5 and 7, where those pages are rebuilt.

## Open questions

1. **Scanning status card shift** (carried over from Phase 3). I recommend replacing the source list in place in Phase 6.
2. **The rest of the action detail split**: should it happen in Phase 6 together with the e2e work? That is my recommendation.
