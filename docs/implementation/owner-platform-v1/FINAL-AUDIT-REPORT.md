# Final audit — verification and bounded fixes (2026-10-06)

**Scope.** Verification of the final-audit brief (`SMEAssistant — Final-audit brief, findings ledger, plan and Opus handoff`, 2026-10-05) against the repository, plus the three approved fixes (FA-03, FA-10, FA-12), FA-13 (found in this pass and approved by Willy on 2026-10-06), and the FA-04 design note. Nothing was deployed, pushed, migrated, mailed, published or spent; no production data, Vercel setting or flag was read or changed in this pass.

**Environment.**

| Item | Value |
|---|---|
| Baseline | `origin/main` = `3558697` (PR #41), matching the brief. Local `main` in the primary checkout is stale at `a71c5df` (PR #28); nothing newer than `3558697` exists on `origin`. |
| Candidate | branch `final-audit-fixes` = `3558697` + `ae0cbb8` (FA-03) + `9a40135` (FA-10) + `103afff` (FA-12) + `e1dcfbe` (FA-03 spec setup) + `5dfc433` (FA-13), worktree `.claude/worktrees/final-audit` |
| Runtime | Windows 11, Node 24.18.0, pnpm 9.12.0 (corepack), Docker 29.8.1 (owned `postgres:16` and acceptance fixtures) |
| Hosted | not observed. Deployed SHA, env values and migration journal remain owner-reported (see §6) |

Gate results for the candidate are in [`FINAL-AUDIT-TEST-RESULTS.md`](FINAL-AUDIT-TEST-RESULTS.md).

---

## 1. Summary

| ID | Class | Outcome this pass |
|---|---|---|
| FA-01 | R, blocker | Unchanged: no hosted core-journey row has been run. Owner action (§6). |
| FA-02 | R, blocker | Confirmed in code: with `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` not `true`, step 2 asks Fimmick, and with `OPERATOR_EMAILS` unset no one can act in-app (§3, S3). Config values not read. |
| FA-03 | U | **Fixed** (`ae0cbb8`). Wording differs from the brief in two places, both for accuracy (§2.1). |
| FA-04 | U (hypothesis) | Design note (§4); **implemented 2026-10-06 on `fa04-home-today`** after Willy chose it as the next work (§4.1). Owner walkthroughs (FA-01) still pending. |
| FA-05 | I | Unchanged (DEC-10). |
| FA-06 | I | Unchanged; closed. |
| FA-07 | R | Unchanged; owner action. |
| FA-08 | R | Unchanged: no DEC-04 budget supplied, so no real-model eval was run. |
| FA-09 | I | Re-verified flag-off refusal for every Phase 4 capability (§3.4 a). |
| FA-10 | D → closed | **Already fixed in `cf72028` (2026-09-10).** Added the missing end-to-end DB test (`9a40135`), verified to fail on the old predicate (§2.2). |
| FA-11 | O / I | Unchanged (DEC-06). |
| FA-12 | U | **Fixed** (`103afff`). There were **seven** occurrences, not two, including the live zh-HK report module label (§2.3). |
| **FA-13** | U (new) | **Found in this pass, approved 2026-10-06, fixed** (`5dfc433`). A memberless sign-in lands on a no-access card whose only control was "Change account", the same dead end as FA-03, on the screen most memberless users actually see (§2.4). |
| **FA-14** | R (new) | **New, report-only.** Measurement reads the `0014` column `first_published_at` on the flag-off path. It is safe only while `0014` is applied (§3.4 c). |

---

## 2. Approved fixes

### 2.1 FA-03 — select-workspace empty state and onboarding step 2

| Field | Record |
|---|---|
| Journey / role | Signed-in user without an accepted membership (owner mid-claim, invited colleague, revoked member) |
| Evidence | `components/select-workspace-page.tsx` (empty state, footer); `components/onboarding-page.tsx` step 2 |
| Expected vs actual (baseline) | Expected: one real path. Actual: 「先免費掃描並解鎖報告，或等待店主邀請你加入」. Unlocking never creates a workspace, and invitation mail is not built (DEC-07). The footer said links "fail closed" / 「深層連結會被安全拒絕」. zh-TW shared the zh-HK string. |
| Root cause | Copy written before P1/P2 shipped the real claim and team-join paths |
| Fix | The empty state now has a lead line plus an owner step and a colleague step, built by `noWorkspaceCopy(locale, oauthClaimEnabled)` (`lib/workspace/no-workspace-copy.ts`, shared with FA-13). The page passes `claimViaOAuthEnabled()`. The free scan is the only link out. The secondary "Sign out" now reads "Sign out and use another email" for the colleague case. The footer is removed. Onboarding step 2's Google button now reads 「以 Google 驗證擁有權」 / "Verify ownership with Google", so the copy that names it matches. |
| Deviations from the brief | (1) **Flag-aware owner step.** The supplied copy names 「以 Google 驗證擁有權」, which renders only while `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=true`. With the flag off, which is the shipped default and possibly production (FA-02), it names the report's real button 「登入認領此商戶」 / 「登入認領此店家」 / "Sign in to claim this business", then Fimmick assignment. (2) **Nav label.** There is no 「設定」 group; the item is 「團隊與權限」 / "Team & roles", so that label is used instead of 「設定 › 團隊」. The flag-on zh-HK text is otherwise verbatim. **Willy to confirm both, and the zh-TW/en wording.** |
| Acceptance tests | Unit `components/select-workspace-page.test.tsx`: in all 3 locales × flag on/off, the text contains lead, owner and colleague lines; `.empty-state a` hrefs equal exactly `[/{locale}/scan]`; retired copy and footer are absent. The Google control is named only when the flag is on; the zh-HK flag-on string is pinned verbatim. Acceptance `e2e/acceptance/guided-sign-in.spec.ts` "a memberless account sees one real path…" (en, zh-HK at 375 px): the seeded viewer signs in, its membership is deleted (a revoked member, one of the real audiences), then select-workspace shows the flag-off owner step and the colleague step, no "Google", links equal `[/{locale}/scan]`, and `scrollWidth <= clientWidth`. |
| Level reached | unit + acceptance (fixture identity); hosted not run |
| Status | fixed: see the gate results |

### 2.2 FA-10 — WhatsApp/LINE unlocker sign-in eligibility

| Field | Record |
|---|---|
| Journey / role | Owner who unlocked by WhatsApp/LINE/phone with a recovery email, then signs in on a new device (S1 variant, S3 filing) |
| Evidence | `PHASE-1-REPORT.md:157`; `lib/repositories/claims.ts:71-76`; `app/api/report-access/unlock/route.ts:91,120,139-140`; `neon/migrations/0004_atomic_operations.sql:191-205`; `app/api/access-requests/route.ts:63` |
| Expected vs actual | Expected: the recovery email can request a sign-in link and file an access request. **Actual at `3558697`: it can.** `isLeadRecipient` matches `leads.email` **or** a non-revoked `report_access_grants.email_normalized`, case-insensitively. |
| Root cause of the Sep finding | Fixed in `cf72028` (2026-09-10); traceability P1.4 already recorded it. The brief found "no closure record" because the closure lives in the traceability register rather than a report. |
| Chain, now proven hop by hop | Form `recoveryEmail` → route `recoveryEmail` (falls back to the contact when channel = email); `route.test.ts` asserts the RPC args → `complete_report_unlock(p_recovery_email)` writes `lower(btrim())` into the grant → `isLeadRecipient` → `POST /api/owner/magic-link` mails, and `POST /api/access-requests` accepts. |
| Test added | `test/integration/neon-membership.integration.test.ts` "FA-10: a real complete_report_unlock over WhatsApp or LINE…". It runs the real SQL function for WhatsApp and LINE, then asserts `leads.email` is null, the recovery email is eligible in any case, a stranger is not, and no `workspace_members` row exists; with no recovery email, nothing is eligible. **Mutation check:** with the predicate reverted to the pre-`cf72028` leads-only form, the test fails (`expected false to be true`). |
| Fix needed | None. No schema change. |
| Level reached | unit (route) + integration (SQL function and predicate); acceptance not added (needs a non-email unlock plus a second-device sign-in in the fixture mailer); hosted not run |
| Status | closed: verified |

### 2.3 FA-12 — 能見度, never 可見度

| Field | Record |
|---|---|
| Evidence (baseline) | `lib/messages/zh-HK.json:215` `report.moduleIg` 「IG 可見度」 (**live**: labels the IG module on every zh-HK report), `:471-473` share text, report meta title and description; `components/landing-page.tsx:85`; `lib/llm-summary.ts:25` (label in the zh-HK executive-summary prompt, so it can surface in owner text); `app/[locale]/r/[slug]/opengraph-image.tsx:45` (glyph subset only, not drawn) |
| Expected vs actual | The brief counted 2; there were 7. zh-TW already used 能見度 for the same keys. |
| Fix | All 7 replaced; the Cantonese register is unchanged. |
| Acceptance test | `tests/terminology.test.ts` walks `app`, `components`, `lib`, `packages` (`.ts/.tsx/.json/.mjs/.css`) and asserts zero files contain the stray term (built from code points so the test does not match itself). Confirmed the string is present at baseline, so the test would have failed there. |
| Status | fixed: see the gate results |

### 2.4 FA-13 — the sign-in no-access card

| Field | Record |
|---|---|
| Journey / role | Memberless sign-in **without** a claim slug (owner who hasn't claimed yet, colleague not yet added, revoked member) |
| Evidence | `lib/identity/complete-sign-in.ts:111-113` returns `no_access`; `components/auth/sign-in-completion.tsx` rendered `signInCopy.noAccess` and only "Change account" |
| Expected vs actual (baseline) | Expected: the same one real path as FA-03. Actual: no path forward. This is the **primary** landing for a memberless sign-in; select-workspace is reached only by navigating on, so FA-03 alone left most of these users at a dead end. |
| Fix | The card keeps the `role="alert"` no-access line, then shows `noWorkspaceCopy(...).owner` and `.colleague`, a primary link `/{locale}/scan` (`a.primary`: flex-centred, 44 px, no underline), and "Change account" demoted to `.secondary`. `app/[locale]/owner/sign-in/complete/page.tsx` passes `claimViaOAuthEnabled()`. |
| Acceptance tests | Unit `components/auth/sign-in-completion.test.tsx` "no-access names the owner and colleague paths…" (en flag off/on, zh-HK off, zh-TW on): owner and colleague text present, the only anchor is `/{locale}/scan`, exactly one button remains (Change account), "Google" appears iff the flag is on. The existing no-access and change-account tests still pass. Acceptance `guided-sign-in` "an accepted fixture account is not required for no-access recovery…" now also asserts the en flag-off owner and colleague sentences and the scan link `href="/en/scan"`. |
| Open question | In the fixture identity, an outsider who reaches `no_access` has no session the owner pages accept (`/owner/select-workspace` → sign-in). Whether real Neon Auth leaves a usable session after `no_access` is **not verified**; checklist §7 should note it. Either way the card itself now carries the path. |
| Level reached | unit + acceptance (fixture identity); hosted not run |
| Status | fixed: see the gate results |

---

## 3. Scenario traces (S1–S7)

Levels: **code** (read) → **unit** (fixture, mocked ports) → **integration** (owned PostgreSQL) → **acceptance** (Playwright, owned identity, mailer and LLM, `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false`) → **hosted** (never, for any scenario).

### S1 First-time owner: scan → report → unlock → claim → sign-in → Google claim → onboarding → workspace

| Step | User action → server chain | Highest level |
|---|---|---|
| Scan | `POST /api/scan/start` (fail-closed rate limit, validated identity XOR manual, consent persisted server-side) → `audit_jobs` queued → `POST /api/scan/process` (`claim_audit_job` lease) → status poll | acceptance (`public-funnel` "manual scan reaches a report and unlocks it", fixture provider) |
| Report | `loadReport` → `authorizeReport` public/viewer/member; coverage-aware score, `null` withheld | acceptance |
| Unlock | `POST /api/report-access/unlock` → `complete_report_unlock` (lead, 3 consents, grant, event; idempotent) → `sme_report_grant` cookie | acceptance + integration (`neon-workflow` idempotency) |
| Claim CTA | `DashboardSummary` → `/owner/sign-in?claim={slug}` (「登入認領此商戶」) | unit |
| Sign-in | magic link or Google → `/api/owner/sign-in/complete` → `completeSignIn` binds invitations, then `finishClaim` → onboarding | acceptance (`claim-and-market` callback, `guided-sign-in`) |
| Google claim | `GET /api/oauth/google/claim/start` (flag → config → session → job/place/unclaimed → signed state) → callback (`listManagedPlaceIds` match) → workspace + owner + attach | **unit only.** Acceptance runs with the flag off; a real consent cannot be fixture-driven. |
| Onboarding 1–4 → workspace | `POST /api/workspaces/claim`, only when the job is already attached to a workspace the caller owns; idempotent completion (locations, brand, usage, snapshot, actions) | acceptance (`claim-and-market`: assigned → 200 + one snapshot; unassigned → 409 `not_attached`) |

**Gap:** the only fixture-reachable path to a workspace is staff/fixture pre-attachment; the OAuth claim has never run end-to-end at any level above unit. This is FA-01/FA-02.

### S2 Returning owner on a new device

Sign-in → `completeSignIn` → `returnTo` or `selectorDestination` → select-workspace cards → `?location=` carried by `WorkspaceShell.scopedHref`. **acceptance** (`returning-sign-in` per role; `permissions` context denial). Re-run in this pass's acceptance gate.

### S3 Owner without a verifiable Google listing

Onboarding step 2 (flag off) → contacts + `AccessRequestStatus`/form → `POST /api/access-requests` (session, rate limit, `isLeadRecipient(slug, user.email)` else 404, one open request per job/user) → status on select-workspace and onboarding. **integration** (`neon-assisted-assignment`) + unit (`access-requests/route.test.ts`).
**With `OPERATOR_EMAILS` unset:** `isAllowedOperatorEmail` is false for every email, so `/ops/access-requests` is unreachable for everyone. With `ASSISTED_ASSIGNMENT_ENABLED` unset, `PATCH /api/ops/access-requests/[id]` returns 404 before reading the body. The request therefore stays "pending" on the owner's screen indefinitely; resolution is a developer SQL action (`INCIDENT-RUNBOOK.md`). This is FA-02/FA-11, confirmed in code.
**Note:** filing requires the signed-in email to be a lead or recovery email on that report; a different email gets a uniform 404. FA-10 makes WhatsApp/LINE unlockers eligible here too.

### S4 Review reply

| Step | Highest level |
|---|---|
| Action → run → draft (`POST /api/actions/[id]/run`, role and scope checked, owned LLM) | acceptance (`merchant-loop`) |
| Request changes → new version (`decide_output_version`, `create_output_version` with `version_conflict`) | integration (`neon-workflow`, `neon-artifacts`) |
| Approve exact version (`approve_output_version`, idempotent, supersedes) → export counts once (`export_output_version`) | acceptance (`merchant-loop` "exact draft approval/download, repeat usage"; `permissions` "lite permits three … blocks the fourth") + integration (concurrency, `23505`) |
| Mark applied | integration (`neon-action-applications`) |
| Comparable rescan → `Attributed` measurement | integration (`neon-snapshots`) |
| LLM output cannot approve or charge | acceptance (`merchant-loop`) |

Real-model draft quality: **not run** (FA-08, DEC-04).

### S5 Team

Invite (`POST /api/workspaces/[id]/members`, owner only) → pending row → invitee verified sign-in → `bindInvitations` (preserves role and `location_scope`) → mutations re-checked per location → owner removal → `0005` guard refuses sole-owner removal, including a concurrent double attempt. **integration** (`neon-membership`) + **acceptance** (`permissions`: per-role reads, spoofed-context denial, revocation, expired invitation link). Invitation **mail** is not built (DEC-07), so the invitee must be told out of band, which is why the FA-03 colleague copy says "sign in again with that same email".

### S6 Failure and recovery

Stalled scan → `ScanStuckCard` / Resume (unit `scan-stuck-card.test.tsx`, `scanning-page.test.tsx`); lease reclaim and dead letter (integration `neon-dead-letter*`, `neon-scan-claim-budget`); provider failure → partial report with coverage, never zero (acceptance fixture `SCAN_FIXTURE=unavailable-ig` + `report-scan-*`); rate limit → truthful 429 / `rateLimitUnavailableResponse` (unit). **Hosted gap (FA-05):** no cron, so nothing reclaims an abandoned scan unless someone presses Resume.

### S7 Mobile (375 px)

Sign-in start card at 375 px in en/zh-HK/zh-TW (acceptance `guided-sign-in` visual cases); memberless select-workspace at 375 px without horizontal scroll (new, FA-03). **Not covered:** S1 scan/report/unlock and S4 action detail at 375 px; "first screen of home shows the next action" is untested and, from render order, likely false (FA-04).

### 3.4 Recent-development checks (PRs #27–#41)

**(a) Flag-off refusal and empty shells.** Every Phase 4 capability refuses at the route before SQL when its flag is unset:

| Flag | Refusal | Proof |
|---|---|---|
| `OFFER_PROMOTIONS_ENABLED` | `app/api/offers/_shared.ts:11` 404 | `app/api/offers/offers.test.ts`, `…/promotions/route.test.ts` (unit; no integration flag-off file) |
| `WORK_PACKS_ENABLED` | `app/api/packs/_shared.ts` | `neon-work-packs-flag-off.integration.test.ts` |
| `CONTEXTUAL_ASSISTANT_ENABLED` | suggestions return `[]`; run strips `origin` | `neon-assistant-flag-off.integration.test.ts` |
| `PREVIEW_DRAFT_ENABLED` | start/preview routes | `neon-preview-flag-off.integration.test.ts` |
| `GBP_REPLY_PUBLISH_ENABLED` | publish guard, reply route | `neon-publish-flag-off.integration.test.ts` |
| `ASSISTED_ASSIGNMENT_ENABLED` | decision route 404 before body | `ops/access-requests/[requestId]/route.test.ts` |

Owner nav: Offers is omitted when off (`lib/workspace/shell.ts:103`); packs have no nav entry and the home link is flag-gated; Insights is not flagged. The topbar assistant is always mounted in **live** mode (`shell.ts:105`), which is the pre-P4.3 live assistant, not an empty shell. The flag adds only suggestions and `origin`, and it never shows demo data on a real workspace (guardrail 12 holds). **No flag-off empty shell found.**

**(b) `export_output_version` after `0014`.** `0014_publish_reply.sql:308-309` counts an export only when `first_exported_at` **and** `first_published_at` are both null; `finish_publish_output_version` mirrors it (`:163`). Integration "DEC-14: a version counts exactly once" covers export→publish, publish→export, failed publish→export, and publish→cancel→publish (`neon-publish-reply`). **Holds.**

**(c) Measurement on a pre-`0014` schema (new FA-14).** Since PR #40, `measurementRepository().exports` (`lib/repositories/measurements.ts:44-48`) selects `first_published_at` on **every comparable rescan, flag on or off**; the comment says so and relies on `neon:readiness` requiring the full journal. On a pre-`0014` database, `post-process.ts:101-103` would throw inside the completion hook. The ledger retries, but the workspace never gets the measurement or the "scan completed" notification. This is safe today **only** because `0014` is owner-reported applied on both hosted databases (§2 of the checklist would verify it). It contradicts the P4.6 ruling E2 ("no `0014` column is read on the flag-off path"), which predates #40. Smallest fix if ever needed: guard the column with a catalog check, or keep the journal check as a deploy gate. Recommended: verify §2 and record it; no code change.

---

## 4. FA-04 — home design note and copy table (not implemented)

**Observed render order** (`components/workspace/home-brief.tsx`): header (rescan, location select) → problem banners → `workspace-agent-strip` 「AI 能見度團隊已完成分析 · n 項待你決定」 with a 4-step ladder and the delivery-counting rule → all-locations banner → `owner-brief-grid` whose **first** card is the priority action → score card → month brief → 「資料來源可靠度」 → 「先看證據，再看圖表」. At 375 px the priority card is therefore below a full-width methodology strip. This is not measured; the 375 px first-screen rule is untested.

**Proposal.**
1. Promote the existing `brief-priority-card` to the top as 「今日要做」: title, one-line why-now (already in `why-now-box`), owner time (already in `brief-action-meta`), one button (already there). No new data.
2. Collapse the agent strip, 資料來源可靠度 and 先看證據，再看圖表 into one 「為何可信」 disclosure below the score card. Keep the content; change only its default visibility.
3. Empty state: replace 「最新快照沒有產生新的行動…」 with a concrete next step (rescan if paid, else "check back after your next scan" plus the calendar reminder from FA-05).
4. Acceptance: Playwright at 375×812 asserts the priority title and its button are in the first viewport (`boundingBox().y + height <= 812`); then 3 recorded owner walkthroughs.

| Current (zh-HK) | Proposed (zh-HK) | Proposed (en) | Note |
|---|---|---|---|
| AI 能見度團隊已完成分析 · n 項待你決定 | 今日要做 | Do this today | becomes the top card's label |
| 為何現在做 | 為何是現在 | Why now | unchanged meaning |
| n 分鐘 店主時間 | 約 n 分鐘 | About n min | owner vocabulary |
| 審閱草稿 / 審閱所需資料 | 開始處理 / 補充資料 | Start / Add the missing facts | one verb |
| 資料來源可靠度 · 先看證據，再看圖表 | 為何可信（展開） | Why you can trust this (expand) | one disclosure |
| 暫時沒有需要你決定的行動 | 本週沒有新行動，下次掃描後再看 | Nothing new this week; check after your next scan | names a real step |
| 快照 | 這次掃描 | This scan | brief §3 vocabulary pass |
| 可比較 / 已量度 | 可以比較 / 已查到 | Comparable / Found | precise term moves to a tooltip |

zh-TW follows in the same register (店家/核准/您) when implemented. Dependencies: FA-01 walkthroughs.

### 4.1 Implemented (2026-10-06, branch `fa04-home-today`)

Approved by Willy after the audit closed, as the code track while hosted checks are pending. What shipped, against the proposal above:

- **Order:** intro → problems → all-locations banner → 今日要做 card → score/proof → this month → decision queue (now standalone) → work pack / Fix Pack → closed 「為何可信」 `<details>` holding the AI-team strip, source reliability, change ledger, evidence gallery and footnote. A broken Google connection stays visible above it through the problems banner (`google_connection` is an owner failure kind).
- **Copy (`lib/copy.ts` home, 3 locales):** label 今日要做 / Do this today; button 開始處理 / Start, or 補充資料 / Add the missing facts; 為何是現在 (zh-TW 為什麼是現在) / Why now; disclosure 為何可信 / Why you can trust this. Empty week: 本週沒有新行動，下次掃描後再看。, plus 想現在檢查，可按「重新掃描」。 only for a paid owner or manager (the same rule RescanButton uses).
- **Not changed:** the 「快照」 vocabulary pass and the other rows of the copy table above (out of scope).
- **375 px:** moving the strip was not enough (the button ended 14–24 px under the bottom nav). Willy chose to put Rescan and the location select in one row on phones; the title's mobile top margin also went from 24 to 12 px. Measured clearance: en 32 px, zh-HK 18 px.
- **Tests:** `components/workspace/home-brief.test.tsx` "today-first layout (FA-04)" (6 cases, written first and seen failing); `e2e/acceptance/home-today.spec.ts` (en, zh-HK, zh-TW at 375×812: title and button bottoms ≤ the bottom nav's top, `scrollY` 0, disclosure closed then opens, no horizontal scroll).
- **Seen, not changed:** on desktop the lite-tier Rescan note wraps awkwardly beside the button (pre-existing).

---

## 5. New findings

| ID | Class | Journey / role | Evidence | Expected vs actual | Impact | Smallest fix | Acceptance test | Status |
|---|---|---|---|---|---|---|---|---|
| FA-13 | U | Memberless sign-in without a claim slug | §2.4 | — | — | — | — | **fixed** (`5dfc433`, approved 2026-10-06) |
| FA-14 | R | Comparable rescan; system | §3.4 (c) | Flag-off path reads a `0014` column | Silent completion-hook failure only on a pre-`0014` database | Verify the journal (checklist §2); optional catalog guard | `neon:readiness` READY with `0014` in the journal | open; owner verification |

**Intentional limitations reconfirmed:** FA-05 (no scheduler), FA-06 (billing closed, pinned by `pricing-page.test.tsx`), FA-09 (Phase 4 off), invitation and recovery mail not built (DEC-07).

**Unverified risks (no new evidence this pass):** FA-01, FA-02 config values, FA-07, FA-08, tenant isolation under concurrent revocation beyond the integration suite, Blob signed-URL expiry, real mail, Stripe test mode, real-device mobile.

---

## 6. Hosted checklist sections: owner actions and what to observe

Statuses in `HOSTED-ACCEPTANCE-CHECKLIST.md` are unchanged by this pass (all `not run` unless recorded there).

| Section | What the human must observe |
|---|---|
| §1 env inventory | Values of `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `SCAN_SOURCES`, `REPORT_RECOVERY_ENABLED`, `EVIDENCE_SNAPSHOT_*`; presence of `GOOGLE_OAUTH_CLAIM_REDIRECT_URI`, `OPERATOR_EMAILS`; no `readable-secret` (FA-07) |
| §2 migration journal | `0001`–`0014` with matching checksums on production (closes FA-14) |
| §3 `launch:check` | Deployed SHA; after this branch merges it should be the merge commit, not `3558697` |
| §4 375 px | Landing, report, sign-in, no-access card (FA-13), select-workspace empty state (FA-03), home first screen (FA-04) without horizontal scroll |
| §5–§8 | Negative claim refused; magic link delivered, redeemed and expiry/replay refused; Google sign-in completes (last attempt failed 2026-09-09), and a memberless Google account sees the FA-13 card with the owner/colleague steps — note whether a session survives `no_access`; positive Google claim lands on `/owner/{slug}` with the report attached, HK then TW |
| §11 | Only after DEC-06: an operator assigns one request in-app, audited |
| §13 | One approved version exported; usage +1 exactly once |
| §18–§19 | Live scan with coverage; comparable pair → `Attributed` (DEC-04 budget) |

---

## 7. Close-out

| Item | Value |
|---|---|
| Baseline SHA | `3558697` |
| Candidate | `final-audit-fixes` @ `5dfc433` (not pushed) |
| Completed IDs | FA-03 (fixed), FA-10 (closed: already fixed, now proven end-to-end), FA-12 (fixed), FA-13 (fixed), FA-04 (design note), §3.4 checks (a)(b)(c) |
| Blocked IDs | FA-01, FA-02, FA-07, FA-08 (owner, hosted or budget); FA-14 (journal verification) |
| Decisions needed from Willy | FA-02 path (OAuth claim on + redirect URI, or DEC-06 operator); confirm FA-03/FA-13 wording deviations and zh-TW/en; DEC-03 test account and listing; DEC-04 budget (live scans and FA-08 eval); DEC-07 (invitation and recovery mail); DEC-10 |
| Evidence | this file; `FINAL-AUDIT-TEST-RESULTS.md`; `IMPLEMENTATION-TRACEABILITY.md` "Final audit" section |
| Next action | Willy: run checklist §1–§2 and decide FA-02; review and merge this branch (push and PR on request) |
