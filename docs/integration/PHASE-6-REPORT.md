# Phase 6 report — rescan, schedules, measurements, integrations, notifications, team, brand, evidence

**Date:** 2026-09-04 · **Branch:** `feat/visibility-workspace-integration` · **Base:** sme-scanner `origin/main` `b9b4151f`
**Status:** complete. Every workspace page is real; the prototype bridge and its dispatcher are deleted. Only Phase 7
(content, SEO, accessibility, hardening, deploy prep) remains.

---

## 1. What now exists

- **Rescan** — `POST /api/workspaces/[id]/rescan` rebuilds a `ScanStartInput` from the location's newest finished job
  (`input_snapshot` v2, `parent_job_id` set, workspace and location attributed, new share slug), gated by `isWorkspacePaid`
  (403 `tier_required` on lite), manager-in-scope authorisation (viewers and out-of-scope managers 403), and a 3-per-day limit
  keyed on the workspace. The client then posts `/api/scan/process` as before. For paid workspaces the first rescan also creates
  the monthly `scan_schedules` row through upstream's ported `buildScheduleInsert`; the legacy scheduler dispatches and reaps, and
  this repo still has no cron routes. The Home rescan button is hidden for viewers and shows the plan copy on lite.
- **Measurements** — after a scan with a comparable diff, `recordMeasurements` writes one `action_measurements` row per
  action and head snapshot using the template→metric table (§ Phase 6 item 2): `Attributed` when the action's version was first
  exported before the head scan, `Observed` when both values exist without an export, `Unknown` when a value is missing. The Home
  proof card and Insights read them.
- **Notifications** — `notifyWorkspace` writes in-app rows for every accepted member on `scan.completed`, `scan.failed`,
  `version.approved`, `delivery.exported` and `usage.allowance_80` (once per period). The three email preferences are live
  through the ported PATCH route; upstream's Resend digest stays where it is.
- **Integrations** — Google connect/re-authorise from `oauth_connections` state, an inline Instagram handle confirm form on
  the ported route, website state from the latest snapshot. The evidence gallery (signed URLs, 300 s, at most six items) renders
  on Home from the snapshot's job.
- **Team** — real members table, invite (manager/viewer, magic link by the existing route), remove, role change, and a
  location-scope multi-select for managers via the new `PATCH .../members/[memberId]` (owner only; the owner row is immutable).
- **Brand** — `brand_profiles` bound to the settings page: voice, approved claims, prohibited terms, languages, facts; owner edits
  through `GET/PUT /api/workspaces/[id]/brand`, audited as `brand.updated`. This closes the Phase 2 gap where onboarding's brand
  basics had nowhere to live.
- **Bridge retired** — `app/[...path]/page.tsx` and `components/sme-prototype.tsx` are deleted; unknown owner paths are plain
  404s. `/demo-workspace` keeps its own route and demo data.

---

## 2. Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean (generated `.next/types` cleared after the bridge deletion) |
| `eslint .` | 0 errors (36 warnings, unchanged) |
| `vitest run` | **160 files, 1513 tests, all passing** (Phase 5: 1423). One re-run was needed: `lib/evidence/safe-media.test.ts`, untouched since Phase 1, has timer-bound decoder tests that can miss their budget under full parallel load; it passes alone and passed on the re-run. |
| `next build` | green; rescan, brand and member routes plus the team and brand pages added |
| `playwright test` | 27 passed, 4 skipped (need Supabase / SerpApi / magic-link / seeded workspace) |
| `test:secret-boundary` | passed across 42 public artifacts |
| Playbook Phase 6 tests | rescan 403 on lite and for viewers (unit); comparable diff → `action_measurements` row with the right fact type (unit) and read by the Home proof card; OAuth claim routes reject without the flag (Phase 2 tests re-run); invite → bind remains in the Docker suite |

---

## 3. Notes from integration

1. **Team and brand pages are member-viewable with owner-only mutations**, matching the billing page pattern; §3.1 marks the
   routes owner-only, and the API routes remain the authority, so a manager sees a read-only table and banner rather than a redirect.
2. **Notification links are locale-less** (`/owner/<slug>/...`); the proxy's locale redirect resolves them. A locale prefix at
   write time would need the member's locale, which the notification writer does not have.
3. **`scan_schedules.created_by` holds the acting owner's id**; upstream's column was staff-only because only staff created schedules.
4. **The rescan route returns 201**, matching the invite route; the playbook listed the status loosely.
5. **Measurements also cover workspace-wide actions** (`location_id` null) alongside the head location's, since they draw on the same snapshot.

---

## 4. Known gaps and follow-ups

- All Docker-backed checks remain unexercised (migration dry run, integration suite incl. invite → bind, type generation, demo seed).
- The scheduler test for a real second scan (`comparable_to` on the head snapshot) needs the Docker suite; the unit layer covers the
  linkage and the measurement rules.
- "Retry Instagram only" stays hidden, as upstream has no partial re-collection.
- `safe-media.test.ts` flakiness under load is worth a `vitest` retry or a looser timer budget in Phase 7 hardening.

---

## 5. Not done, by design

No migration applied, nothing deployed, no cron routes, no paid provider called. Phase 7 covers content, layout, SEO, accessibility,
hardening and deploy prep.
