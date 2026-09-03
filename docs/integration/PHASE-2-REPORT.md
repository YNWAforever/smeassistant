# Phase 2 report — auth, ownership, onboarding, workspace shell

**Date:** 2026-09-03 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete for everything that runs without Docker. The owner surface now has real authentication, real membership
authorization, OAuth-verified ownership, a four-step onboarding backed by the database, and a workspace shell with no demo literal.

---

## 1. What now exists

### 1.1 Authentication (`lib/auth.ts`, `app/auth/callback`, magic-link routes, `proxy.ts`)

- `lib/auth.ts` — `getUser` (verified email required, never throws), `requireUser`, `requireMembership(slug, locale, {minRole, locationId})`,
  `authorizeWorkspaceRequest` (401/403/404 for route handlers), `listMemberships`, `roleAtLeast`, `inLocationScope`, `signOut`. Every decision
  goes through upstream's `authorizeWorkspace`; staff sessions are never accepted (§3.9). Managers with a `location_scope` are in scope only for
  those locations. Database errors throw rather than silently deny.
- `app/auth/callback/route.ts` — upstream's owner callback verbatim: pending-membership bind on every verified sign-in, access-request signal,
  the `claimScan` block untouched with `selfServiceEnabled: process.env.OWNER_SELF_SERVICE_CLAIM === "true"` (the env is never set, guardrail 15).
  Only the landing targets changed: claim → `/{locale}/owner/onboarding?claim=…&claimed=…`, otherwise a validated `returnTo`, else
  `/{locale}/owner/select-workspace`; errors → `/{locale}/owner/sign-in?error=…`.
- `POST /api/owner/magic-link` and `POST /api/workspace-invites/magic-link` — ported; still mail only when a lead / pending member exists;
  `emailRedirectTo` carries `claim`, `locale`, `returnTo` to `/auth/callback`.
- `proxy.ts` — refreshes the Supabase session under `/{locale}/owner*` and 307s unauthenticated requests to sign-in with `returnTo`.
  Pure helpers (`isOwnerGatedPath`, `signInRedirectFor`, `safeReturnTo`) live in `lib/funnel/locale-redirect.ts` with tests. Without Supabase
  env the gate is skipped with one warning so local dev and e2e keep working; page-level `requireMembership` remains the authority.

### 1.2 Ownership (`lib/oauth/*`, `app/api/oauth/google/**`, `POST /api/workspaces/claim`)

- Google OAuth connect and claim flows ported verbatim; `claimViaOAuthEnabled()` is the first check in both claim routes. The signed state
  gained an optional `locale` so callbacks land on the right prefix. Claim success → onboarding; connect success → the workspace's
  integrations page. Connect start accepts `?workspace=<slug>` because one person can belong to several workspaces here.
- `lib/workspace/claim.ts::completeWorkspaceClaim` — completes a workspace only when the job already carries a `workspace_id` for which the
  caller holds an accepted **owner** membership; it never attaches a job (guardrail 15). Idempotently writes the primary `locations` row
  (place id, Instagram handle, website, district, address from the job), `brand_profiles` default, `workspace_usage` for the current period in
  the workspace timezone, sets `audit_jobs.location_id`, and calls `buildSnapshot`/`deriveActions` hooks that are no-ops until Phase 3.
- `POST /api/workspaces/[id]/{instagram-handle,members,notification-preferences}` — ported behind `authorizeWorkspaceRequest`; members and
  Instagram handle are owner-only per §3.9 (upstream let managers invite). Every mutation writes `audit_events`.

### 1.3 Pages and shell (`app/[locale]/owner/**`, `components/*`)

- `/owner/sign-in` — magic-link form (email + carried `claim`/`returnTo`/`plan`), inbox-sent state, callback error copy. No Google sign-in.
- `/owner/select-workspace` — one card per workspace plus one per location with latest snapshot score/coverage, urgent-action count, role.
  Empty state links to the scanner and offers sign-out (server action).
- `/owner/onboarding` — step 1 real claim evidence from the job; step 2 "Verify with Google" when `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true`,
  otherwise "Ask Fimmick to assign your workspace" (no email matching); step 3 GBP state + Instagram handle confirm; step 4 brand basics →
  `POST /api/workspaces/claim` → the new workspace. Steps 3–4 stay locked until the workspace is owned.
- `/owner/[workspaceSlug]/layout.tsx` — `requireMembership` → `loadWorkspaceContext` → `WorkspaceShell` with the **real** workspace name,
  avatar initial, locations, usage `n / allowance`, account name/email, role label, unread count. Every `kam-man-house` / 錦汶館 / `Willy Lai` /
  `tin-hau` / `yik-yam` literal is gone from the shell; the demo page and the prototype bridge pass `demoShellWorkspaceFor(locale)` and render as before.
- `/owner/[workspaceSlug]` — an honest "workspace ready" home (name, market, tier, locations with latest snapshot, latest report link).
  The real brief arrives in Phase 3. The other sub-routes still come from the prototype bridge on demo data until Phases 3–6.

### 1.4 Data layer (`supabase/migrations/20260903000000_workspace_layer.sql`, `…000001_workspace_rpcs.sql`)

All DDL from §3.3, re-runnable, RLS on with zero policies, service-role grants, explicit `on delete` on every FK, slug backfill for existing
workspaces, the private `workspace-assets` bucket. The four version/delivery RPCs raise `version_conflict`, `not_approved`,
`allowance_exceeded` and write `audit_events`. `verify-migrations.sh` EXPECTED and the hardening sweep list gained the 13 new FKs / tables.
Upstream's Docker integration harness is ported (`test/integration/*`, `vitest.integration.config.ts`) with a new workspace-layer test;
`scripts/gen-types.ts`, `supabase/seed/demo-workspace.sql` and `scripts/seed-demo.ts` (refuses non-localhost targets) are written.

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint .` | 0 errors (34 warnings, vendored packages + upstream-verbatim test stubs) |
| `vitest run` | **107 files, 1136 tests, all passing** (Phase 1: 797) |
| `next build` | green; 39 routes incl. 4 owner pages, `/auth/callback`, 9 new API routes |
| `playwright test` | 13 passed, 3 skipped (need Supabase / SerpApi / `E2E_MAGIC_LINK_LOCAL`) |
| `test:secret-boundary` | passed across 31 public artifacts (script created this phase — see §3.2) |
| Live `next start` | `/zh-HK/owner/select-workspace` and `/zh-HK/owner/<slug>` 307 → sign-in with `returnTo`; sign-in 200 with the email form and no Google button; `/zh-HK/demo-workspace` still renders 錦汶館 with the demo bar; bridge pages still 200 |
| `db:verify`, `test:integration`, `db:types`, `seed:demo` | **not run** — Docker Desktop still will not start on this machine |

---

## 3. Fixes made during integration

1. **Server page importing from a client module.** The sign-in page called `isSignInErrorCode` from `components/sign-in-page.tsx` (`"use client"`),
   which Next rejects at request time. Moved the pure helper to `lib/funnel/sign-in.ts`. Caught by the new Playwright owner-shell spec.
2. **`test:secret-boundary` pointed at a file that never existed.** Phases 0–1 declared the script but never created it, so the gate could not
   have run. Ported upstream's sweep as `scripts/assert-secret-boundary.mjs` and widened it to the service-role key, rate-limit secret, Stripe,
   Resend and OpenRouter keys.
3. Stream C added a `workspace_claim` scope (10/h per user) to `lib/security/rate-limit.ts`.

---

## 4. Known gaps and follow-ups

- **Docker-dependent checks are unexercised**: the migration dry run, the integration suite (invite bind, claim, version RPCs), type generation and
  the demo seed. Run them once Docker is available; the migration corpus passes every static contract test.
- **Register `<origin>/auth/callback`** in Supabase Auth redirect URLs and `GOOGLE_OAUTH_CLAIM_REDIRECT_URI` in GCP before enabling
  `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` (prepared, not applied).
- Onboarding step 4 sends `brand_voice` / `approved_claims`, but `POST /api/workspaces/claim` only writes the `brand_profiles` default row;
  the brand settings route in Phase 3+ should persist them.
- "Ask Fimmick to assign" is copy-only (there is no access-request API in this app; the legacy staff console assigns).
- `lib/supabase/database.types.ts` does not exist; ported code uses local row interfaces as upstream does.
- The e2e "magic link → onboarding → shell shows real name" journey is written but skipped without a local Supabase.

---

## 5. Not done, by design

No migration applied, nothing pushed or deployed, no paid provider called, `OWNER_SELF_SERVICE_CLAIM` never set. Phase 3 (snapshots,
comparability, actions, home brief, insights) has not started; `completeWorkspaceClaim`'s snapshot/action hooks are the seam it fills.
