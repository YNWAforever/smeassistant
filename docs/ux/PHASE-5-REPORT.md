# Phase 5 report: onboarding and states

Date: 2026-10-20 · Branch: `ux/phase-5-onboarding-states`, cut from `ux/phase-4-workspace` · Not pushed.

Decisions taken on 2026-10-20 (all recommendations accepted):

| # | Decision |
|---|---|
| 1 | The getting-started checklist **hides itself once every step is done**. Nothing about it is stored, so no migration. |
| 2 | Error pages show **Next's error digest as a reference** the owner can quote to Fimmick. |
| 3 | After Google verification, onboarding goes **straight to Business basics**. |
| 4 | The scanning-page shift (Phase 3 open question 1) is **fixed here**. |

There are no changes to API contracts, migrations, `packages/*`, auth logic or the OAuth claim flow. The data access added is one read in the existing repository, `anyApprovedVersion(workspaceId)`, scoped to the workspace. Server checks are unchanged; every notice in this phase explains, none authorises.

## What changed

| Commit | Result |
|---|---|
| `f7d7a3d` | **Error, not-found and loading pages.** <br>• An `error.tsx` for public pages and one inside the workspace shell. <br>• A root `global-error.tsx`. <br>• A workspace not-found that leads back to Today. <br>• Loading skeletons for Today, Actions and Insights. <br>Error pages offer a retry that re-fetches the page, show Next's digest as a reference, and never show the error message. |
| `2669498` | **One role notice.** Nine hand-written permission banners become `RoleNotice`, which says what the role can do and who can change it. That covers Actions, action detail, Team, Brand, Plan, Assets, New, Today's `?forbidden=1` and select-workspace's `?denied=`. |
| `580ab79` | **A quiet header** for sign-in, onboarding and choosing a workspace: brand, language and Help only. Sign-in reads "Sign in to your Kinnso OS workspace". |
| `a26ae1d` | **Onboarding as a three-step wizard** (details below). |
| `8c648d4` | **Choosing a workspace** (details below). |
| `e66871b` | **Getting-started checklist on Today** (details below). |
| `1db1ac5`, `8dcf035` | **Shared empty states** for Actions (empty and filtered), Due, Fix Pack, Insights before the first scan, Assets, Activity, Notifications and Locations. Each has one illustration, one line and at most one next step. |
| `99fbd9f` | **Scanning page no longer jumps** (see Measures). |

### Onboarding

- **Steps:** a tracker shows Signed in ✓ → Verify ownership → Business basics. A verified owner lands on basics, with a "Verified with Google" or "Assigned by Fimmick" mark.
- **Explanations:** "Why Google" and "why we check" sit in inline explainers beside the heading, not inside it. "Not your business?" sits behind a disclosure.
- **Fimmick path** (the shipped default while `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is off): it shows what happens next in three steps and the report reference to quote.
- **Lookup failures:** if the claim or ownership lookup fails, the page now shows an error with a retry. It used to fall back to "Start from a scan" or "Verify with Google", which misstated where the owner stood.
- **Copy:** all 44 inline strings moved to `lib/copy-onboarding.ts` (`copy[locale].onboarding`), in one written register per locale. zh-TW addresses the reader as 您, as the rest of the zh-TW copy does.

### Choosing a workspace

- **One card per workspace.** The card opens all locations, and each location row shows:
  - its latest score, or "No score yet" or "No scan yet"
  - coverage
  - its urgent count

  Scores are never combined across locations.
- **Empty state:** the free scan stays the only link out. The owner and colleague paths move behind "I've already scanned".
- **Copy:** strings are in `copy[locale].shell.select`.

### Getting-started checklist

- **Steps**, each read from the workspace's own data:
  1. Ownership confirmed
  2. Brand voice set
  3. Google Business connected
  4. A first draft approved
  5. A first counted delivery
- **Placement:** it sits below today's priority, so the priority stays above the fold.
- **Links** go only where the role may go; managers get no links to owner-only pages.
- **Hidden** for viewers, on demo workspaces, and when a read fails (rather than showing a wrong tick).

## Phase 4 fixes found along the way

The acceptance suite runs only in CI. Its first run on PR #99 showed regressions from Phase 4, which I fixed on `ux/phase-4-workspace` (`191d45c`, pushed) and merged into this branch:

1. **The brand link carried `?location=`.** The acceptance sign-in fixture waits for the plain workspace URL, so almost every acceptance test failed at sign-in. The brand link is plain again.
2. **Phones had no way to sign out or switch workspace.** The sidebar's account controls are hidden on phones, and the old More › Locations route was gone. Settings now has "Switch workspace or sign out".
3. **Specs:**
   - The starter-pack spec now opens Actions › New › Starter pack.
   - Sign-out on phones now goes through Settings.
   - `page-readiness` now also warms URLs with `?mode=` and `?open=`.

Codex's three findings on PR #99 were also fixed there (`01fca04`).

## Measures

The local fixture was captured on 20 pages and states, in en and zh-HK, at 390 and 1440 px (80 captures). They cover sign-in, onboarding (no claim, owner, non-owner), select-workspace, Today, not-found, a forced error, viewer and forbidden notices, and the empty states.

| Check | Result |
|---|---|
| axe-core (WCAG 2.2 AA) | **0 violations** on every capture |
| Horizontal overflow | none |
| Cumulative layout shift | ≤ 0.001 |
| One `h1` per page | yes, including error and not-found, whose state title is the `h1` |
| Console errors | none, apart from the deliberate test error |

**Scanning page.** Before this phase, the ready, stalled or failed card was inserted above the recovery cards and pushed them down. Now:
- The outcome card takes the recovery cards' place; those cards only matter while a scan runs.
- The hero keeps its lead paragraph's space once the scan ends. The paragraph is hidden and not read.
- The source list stays, so each source still shows its own final state.

| Scanning, from load to "ready" (Phase 4 page vs. this phase) | Before | After |
|---|---|---|
| CLS, en 390 / zh-HK 390 | 0.110 / 0.132 | **0.008 / 0.001** |
| CLS, en 1440 / zh-HK 1440 | 0.027 / 0.035 | **< 0.001** |

**Status codes:**
- Signed-out owner pages still answer **307** to sign-in.
- Unmatched owner URLs still answer **404**.
- Forbidden pages still redirect to `?forbidden=1`.
- See deviation 1 for an unknown action id.

Captures:
- [Error, zh-HK 390](phase-5/error-zh-HK-390.jpg)
- [Not found, en 1440](phase-5/notfound-en-1440.jpg)
- [Forbidden notice, zh-HK 390](phase-5/viewer-forbidden-zh-HK-390.jpg)
- [Viewer notice, en 1440](phase-5/viewer-actions-en-1440.jpg)
- [Sign-in, zh-HK 390](phase-5/signin-zh-HK-390.jpg)
- [Onboarding, owner, en 1440](phase-5/onb-owner-en-1440.jpg)
- [Onboarding, Fimmick path, zh-HK 390](phase-5/onb-viewer-zh-HK-390.jpg)
- [Choose a workspace, en 1440](phase-5/select-en-1440.jpg)
- [Today with checklist, en 1440](phase-5/today-en-1440.jpg)
- [Fix Pack empty, en 390](phase-5/fixpack-en-390.jpg)
- [Filtered queue empty, en 390](phase-5/filtered-en-390.jpg)
- [Scanning ready, zh-HK 390](phase-5/scan-ready-zh-HK-390.jpg)
- [Settings with account row, zh-HK 390](phase-5/settings-zh-HK-390.jpg)

## Verification

All gates ran one after another.

| Gate | Result |
|---|---|
| `corepack pnpm typecheck` | pass |
| `corepack pnpm lint` | 0 errors, 40 warnings (unchanged) |
| `corepack pnpm test` | 5,965 + 62 root tests. Packages: scoring 183, region 23, contracts 20, scan-engine 299. All pass. |
| `corepack pnpm build` | pass |
| `test:secret-boundary`, `test:no-supabase`, `test:no-self-service-claim` | pass |
| `corepack pnpm e2e`, `e2e:acceptance` | **Not run locally** (needs Docker); CI runs both. Acceptance specs follow the new onboarding wording. |

New tests:
- `components/states/route-states.test.tsx`: retry, digest, no error message, Today vs home page, no nested `<main>`, global error without providers.
- `components/states/role-notice.test.tsx`
- Onboarding wizard (`components/onboarding-page.test.tsx`): tracker states, verified mark, explainer beside the heading, disclosure, lookup failure, no English in zh.
- Workspace cards: no withheld score as a number, no invented coverage.
- `lib/workspace/getting-started.test.ts` and `components/workspace/getting-started.test.tsx`
- Queue empty states: filtered vs. empty; New only for roles that may start work.
- Existing tests updated for the new wording.

## Deviations from the plan

1. **An unknown action id inside a workspace now answers 200, not 404.** The workspace's `loading.tsx` starts streaming before the page can call `notFound()`. The page still shows the not-found state and carries `noindex`, and owner pages are private.
   - Unmatched URLs and signed-out redirects keep their status codes.
   - Reports keep their 404, because I did not add a loading page there for this reason.
2. **The Fix Pack empty state keeps two links**, "Start your own" and "Open your drafts", because an existing test pins the link to the owner's own drafts.
3. **The access-request form and status** (`components/workspace/access-request-*`) keep their own strings. They are shared with ops views and outside this phase.

## Open questions

1. **Deviation 1:** is a streamed 200 acceptable for unknown action ids, or should action detail skip the loading skeleton to keep a hard 404?
2. **The rest of the action detail split** is still proposed for Phase 6, alongside the e2e work.
