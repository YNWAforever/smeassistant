# Hosted acceptance checklist for main `080ddf6`

An owner runbook for the hosted rows of [`RELEASE-EVIDENCE-080ddf6.md`](RELEASE-EVIDENCE-080ddf6.md) §5. Each section is one scenario on **`https://smeassistant.vercel.app`**, deployment `dpl_E2HNGePLBHpdDVNzejLTZVrBepqN` (commit `080ddf6`) (§22 excepted: a non-production deployment of a later candidate).

> **Current candidate (2026-10-05):** `main` at `029d86a`, production deployment `dpl_51eqbSJz9sdiy8vD2ACxbj89ucWQ`; evidence in [`RELEASE-EVIDENCE-029d86a.md`](RELEASE-EVIDENCE-029d86a.md). The sections below apply unchanged to it. Run them against the current production deployment and record its ID. Two exceptions:
> - §20's Path A is done.
> - §2's expected journal now ends at `14 0014_publish_reply.sql e2c181b7…`.

## Production is the acceptance target

Hosted acceptance runs on the **production alias** `smeassistant.vercel.app`, because the owner chose to. `docs/integration/DEPLOY.md` §2 says not to treat the production alias as staging; this checklist departs from that by the owner's choice and does not change the advice.

What that means:

- Every test workspace, scan, claim, Google connection, draft, approval, export and delivery in this checklist is written to the **production database** and seen by production metrics.
- Any variable change or redeploy is a production change, governed by **DEC-01** (production alias, protection and deployment policy). Record the DEC-01 decision before the first section that redeploys.
- Mark test workspaces as internal so the value report excludes them. `workspaces.is_internal` exists (`neon/migrations/0008_workspace_internal.sql`), and the P3.4 runbook marks a workspace with a write in the Neon SQL Editor (`PHASE-3-REPORT.md` P3.4, "Runbook", step 2). That write is a separate owner data change, not part of this checklist's read-only SQL.

## Order and effect of each section

| Sections | Effect |
|---|---|
| §1–§4 | **Read-only.** Nothing is written and nothing is spent, except the optional §1 step 6, which changes production configuration. |
| §5–§9 | **Free, but write production data** (accounts, workspaces, Google connections, stored files) and, in §6, **send real email**. |
| §10–§12 | **Free, but change production configuration** and redeploy; §12 also sends email. |
| §13–§17 | **Spend model money** (and §15–§17 change production configuration). |
| §18–§20 | **Spend provider money** (live scans), or decide whether the scheduler may. |
| §21 | **Changes billing configuration** (Stripe test mode). |
| §22 | **Writes to a Fimmick-owned Google Business Profile listing** and changes **non-production** configuration (P4.6; a later candidate, not `080ddf6`). |

Each section starts with a one-line **Effect**.

**Nothing in this file is an authorization.** Before a section that names a DEC, write the decision into `BUSINESS-AND-HOSTED-DECISIONS.md` ("Acceptance authorization record"), including the budget. A blank record means stop.

## Rules for every section

1. **Never paste a secret** (API key, token, password, connection string, cookie, magic link) into a chat, a document, a ticket or a terminal. Never copy a value out of Vercel. To change a variable, type the new value straight into the Vercel dashboard.
2. **Record IDs and timestamps only.** Good: a job ID, workspace ID, action ID, version ID, delivery ID, Vercel request ID, a UTC time. Never record email addresses, phone numbers, names of real customers, review text, report share links (`/r/...` URLs), or screenshots that show them.
3. **Screenshots:** where a section asks for one, capture the mobile (375 px wide) or desktop view named, and **redact private information** (names, emails, phone numbers, review text, share links, tokens) before saving it. Save it with the section number and time in the file name, outside the repository.
4. **SQL is read-only** and runs only in the **Neon SQL Editor** on the production project. Paste each block whole. Every block starts with `BEGIN TRANSACTION READ ONLY;` and ends with `ROLLBACK;`. Tables are owned by the role `smeassistant_migrator`, so the blocks switch to it with `SET LOCAL ROLE`, which lasts only inside the read-only transaction. **This multi-statement pattern has not been rehearsed in the Neon SQL Editor.** If the editor answers `permission denied to set role`, rejects the block, or appears to run the statements outside one transaction, stop and record the section as **blocked**. Do not change grants just to run a check.
5. **Environment changes take effect on the next deployment.** After you change a variable in Vercel, redeploy (Deployments → the current production deployment → ⋯ → Redeploy) and note the new deployment ID. That new ID, not `dpl_E2HN…`, goes in the evidence cell.
6. **Statuses:** write `passed`, `failed`, `blocked` or `not run` only. A button that renders, a redirect to Google, an HTTP 201 or a "we sent you an email" message on its own is **not** a pass.
7. **Where to write results:** in `RELEASE-EVIDENCE-080ddf6.md` §5, find the row named in each section's "Fill in". Put the status in **Status**, the IDs in **Safe entity/receipt IDs**, and one line of what you saw (plus any limitation) in **Evidence and limitation**. If you used a new deployment, replace **Candidate deployment**. Manual observations and screenshots also go in evidence §6.

### Read-only SQL template

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE smeassistant_migrator;
-- the section's SELECT goes here
ROLLBACK;
```

---

## §1 R2 environment inventory (names, presence and switch states)

**Effect: read-only (step 6 optional: changes production configuration).**

- **Needs:** the owner's own Vercel access. The controller's names-only read on 2026-10-04 was owner-approved in chat (controller-reported); DEC-03 is not recorded. **Cost:** none.
- **Preconditions:** Vercel access to project `smeassistant`.
- **Steps:**
  1. Open Vercel → project `smeassistant` → Settings → Environment Variables. Filter to **Production**.
  2. Compare the names with the "Present for production" list in `RELEASE-EVIDENCE-080ddf6.md` §1 and with `.env.example`. Note any name added or removed since 2026-10-04.
  3. Confirm these names are **absent**: `OWNER_SELF_SERVICE_CLAIM`, `OFFER_PROMOTIONS_ENABLED`, `WORK_PACKS_ENABLED`, `CONTEXTUAL_ASSISTANT_ENABLED`, `PREVIEW_DRAFT_ENABLED`, `ASSISTED_ASSIGNMENT_ENABLED`, `OPERATOR_EMAILS`, `COMMERCIAL_CONTRACT_APPROVED`, `APPLICATION_MAIL_APPROVED`. Note whether `SCANS_PAUSED`, `AI_DRAFTS_PAUSED` and `MAIL_PAUSED` are absent (absent means not paused).
  4. Open **only** these non-secret values and note them:
     - `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `REPORT_RECOVERY_ENABLED`, `EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED`, `EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED`: exactly `true`, exactly `false`, or something else.
     - `SCAN_SOURCES`: `live` or `fixture` (production treats `fixture` as `live`; `docs/integration/DEPLOY.md` §3).
     - `NEXT_PUBLIC_SITE_URL`: the public origin (a public address, needed by §3).
     Do not open any other variable's value.
  5. Note which variables Vercel marks with a security warning.
  6. **Owner configuration fix (recommended, separate from the check; changes production configuration):** `BLOB_READ_WRITE_TOKEN` and `NEON_AUTH_BASE_URL` are stored as readable "encrypted" values and flagged `readable-secret`. Re-save each as **Sensitive**: edit the variable, tick Sensitive, and paste the value from its source (the Vercel Blob store settings, the Neon Auth settings), not from a copy of the current value. Then redeploy (rule 5) and note the new deployment ID.
- **Limitation:** the dashboard shows the project's current variables. A deployment is built with the variables that existed when it was built, so project-level presence today does not prove what `dpl_E2HN…` was built with.
- **Evidence:** date and time; added/removed names; the switch states, `SCAN_SOURCES` mode and `NEXT_PUBLIC_SITE_URL` origin; the warning list; the new deployment ID if step 6 was done.
- **Pass:** the names match (or every difference is explained), the step 3 names are absent, and every switch state is known. **Fail:** `OWNER_SELF_SERVICE_CLAIM` is present, a switch holds an unexpected value, or a required name is missing.
- **Fill in:** §5 row "R2 environment inventory" (Evidence column: add the switch states). If step 6 was done, add one line under §7 "Secret-boundary and logging review".

## §2 Migration journal (verifies the owner-reported applies)

**Effect: read-only.**

- **Needs:** Neon console access. **Cost:** none.
- **Steps:**
  1. Neon console → production branch → SQL Editor.
  2. Run:

     ```sql
     BEGIN TRANSACTION READ ONLY;
     SET LOCAL ROLE smeassistant_migrator;
     SELECT ordinal, name, left(checksum, 12) AS checksum_prefix
       FROM neon_migrations.journal ORDER BY ordinal;
     ROLLBACK;
     ```

  3. Compare with the expected rows (computed from the files at `080ddf6`):

     | ordinal | name | checksum_prefix |
     |---|---|---|
     | 1 | `0001_identity.sql` | `f2e65e08e94c` |
     | 2 | `0002_business.sql` | `34c46b53bc08` |
     | 3 | `0003_workflows.sql` | `b8f80980ab77` |
     | 4 | `0004_atomic_operations.sql` | `b24f2cbba798` |
     | 5 | `0005_owner_removal_guard.sql` | `c4349d2ba9a2` |
     | 6 | `0006_action_applications.sql` | `ea0f7471c0b4` |
     | 7 | `0007_action_verification.sql` | `e9f8132aa980` |
     | 8 | `0008_workspace_internal.sql` | `f9f03d6c1d70` |
     | 9 | `0009_scan_attempts.sql` | `3c35ab9965be` |
     | 10 | `0010_mail_outbox.sql` | `ec50dceefbc2` |
     | 11 | `0011_offers.sql` | `5d5a01b5796f` |
     | 12 | `0012_work_packs.sql` | `e7933f6caac5` |
     | 13 | `0013_preview_events.sql` | `98ec68e18a52` |

  4. Optional: repeat on the Neon **test branch** to confirm `0012` there.
- **Evidence:** the time of the query; the row count; "all 13 match" or the first mismatching ordinal.
- **Pass:** exactly 13 rows, all matching. **Fail:** a missing row, an extra row or a different prefix. Do **not** try to repair the journal; report it.
- **Fill in:** §5 row "Migration applies `0001`–`0013`". Change its status to `passed` only for what the query showed, and keep the label "owner-reported" for the dates.

## §3 Candidate `launch:check`

**Effect: read-only** (anonymous GETs and deliberately invalid POSTs; nothing is created).

- **Needs:** your decision to send anonymous probes to production. **Cost:** none. It never sends credentials, valid scans, valid emails or signed payments (`scripts/launch-check.mjs`).
- **Preconditions:** a local checkout of `main` at `080ddf6` with `corepack pnpm install` done; the `NEXT_PUBLIC_SITE_URL` origin and the `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` state from §1.
- **Steps:**
  1. In a terminal in the checkout, run one command. Use `--claim-flag on` only if §1 found `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` exactly `true`; otherwise `off`. Replace `<canonical>` with the §1 `NEXT_PUBLIC_SITE_URL` origin:

     ```sh
     corepack pnpm launch:check --origin https://smeassistant.vercel.app --canonical-origin <canonical> --claim-flag off
     ```

  2. Save the printed result list (it contains no secrets).
- **Evidence:** the time; each probe's name and `passed` / `failed` / `blocked`; the exit code.
- **Pass:** exit 0 and every probe `passed`. **Fail:** any `failed`. A `429` is `blocked` (rate limited), not a pass; wait and rerun.
- **Fill in:** §5 row "Candidate `launch:check`".

## §4 R10 hosted mobile observation (375 px)

**Effect: read-only** (public pages only; signed-in pages are covered by later sections' screenshots).

- **Needs:** none. **Cost:** none.
- **Steps:**
  1. In Chrome, open DevTools → device toolbar → set the width to **375** and the height to **812**.
  2. Visit `/zh-HK`, `/zh-HK/scan`, `/zh-HK/pricing`, `/zh-HK/sample-report`, `/zh-HK/owner/sign-in`, then `/en/owner/sign-in` and `/zh-TW/owner/sign-in`.
  3. On each page check: no sideways scrolling; the sign-in link is visible in the header; buttons are large enough to tap; text is not cut off.
  4. On `/zh-HK/owner/sign-in`, use only the keyboard (Tab, Enter) to reach and activate the main button.
  5. Repeat step 2 at a desktop width (1440) for comparison.
- **Evidence:** time; per page `ok` or the problem seen; **one redacted screenshot per page at 375 px**, plus one at 1440 px for the sign-in page.
- **Pass:** every page passes step 3 and step 4 works. **Fail:** sideways scrolling, a hidden sign-in, or a control that cannot be reached by keyboard.
- **Fill in:** §5 row "R10 hosted mobile observation", and describe the observation in evidence §6.

## §5 R6 negative claim (a non-manager is refused)

**Effect: free, writes production data** (an account and claim records).

- **Needs:** DEC-03 (a named Google test account that does **not** manage the business). **Cost:** none.
- **Preconditions:** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is exactly `true` (§1); an unlocked report of a business that this Google account does not manage, which is not yet attached to a workspace.
- **Steps:**
  1. In a private browser window, open the unlocked report and press the sign-in-to-claim button.
  2. Sign in with the test account (email link or Google).
  3. On onboarding step 2, choose **Verify ownership with Google** and complete Google's consent with the same test account.
  4. Read the message you land on.
- **Evidence:** the job ID; the time; the visible message (paraphrased, no personal data); one redacted screenshot of the refusal at 375 px.

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, workspace_id, status FROM public.audit_jobs WHERE id = '<job id>';
  ROLLBACK;
  ```

- **Pass:** a clear refusal that explains why, no workspace is created, and `workspace_id` stays empty. **Fail:** the account gets a workspace or owner role, or the page shows a raw error or a blank screen.
- **Fill in:** §5 row "R6 negative manager/claim case".

## §6 R4 hosted magic link (delivery, redemption, expiry, replay, logout)

**Effect: free, sends real email and writes production data** (a session and account rows).

- **Needs:** DEC-05 (named recipient mailbox and number of test emails). **Cost:** none (Neon Auth sends the email).
- **Preconditions:** a recipient that is eligible: it unlocked a report by email (or was recorded as the sign-in email at unlock), or it has a pending workspace invitation.
- **Steps:**
  1. Open `https://smeassistant.vercel.app/en/owner/sign-in` in a private window and request an email link for the recipient.
  2. Note the time the email arrives. Open the link in the same browser.
  3. Confirm you land on the workspace (or onboarding) for that account.
  4. **Replay:** open the same link again in a new private window. It must not sign you in.
  5. **Expiry:** request a new link, wait past its stated lifetime, then open it. It must not sign you in.
  6. **Logout:** sign out from the workspace menu, then press the browser's Back button and reload. You must not see workspace data.
- **Evidence:** request and arrival times (UTC); the landing path without query parameters; for steps 4–6, the visible result. Never record the link itself.
- **Pass:** steps 2–3 succeed and steps 4–6 all refuse. **Fail:** no email arrives within 10 minutes, a replayed or expired link signs in, or Back after sign-out shows data.
- **Fill in:** §5 row "R4 hosted magic link".

## §7 R5 completed Google sign-in

**Effect: free, writes production data** (a session and account rows).

- **Needs:** DEC-03 (named Google test account). **Cost:** none.
- **Preconditions:** the test account is eligible to sign in (as in §6).
- **Steps:**
  1. Private window → `/en/owner/sign-in` → **Continue with Google**.
  2. Complete Google's consent.
  3. Note where you land. Repeat once in `zh-HK` (`/zh-HK/owner/sign-in`, **使用 Google 繼續**).
  4. If it fails, note the page, the time and any reference code shown on screen. Then open Vercel → project `smeassistant` → Logs, filter to that time, and record only the request ID of the failing request.
- **Evidence:** time; landing path; on failure, the stage (before Google, on Google, on return) and the request ID or correlation reference.
- **Pass:** both locales land signed in on the workspace or onboarding page. **Fail:** any error page, a loop back to sign-in, or a 5xx.
- **Fill in:** §5 row "R5 completed Google sign-in".

## §8 R6 positive Google claim (HK and TW)

**Effect: free, writes production data** (creates a workspace, an owner membership and an `oauth_connections` row, and attaches the job).

- **Needs:** DEC-03: a test Google account that **manages** each business's Google Business Profile, and one HK and one TW business named in the record. §13 needs a workspace in each market. **Cost:** none if existing completed reports are used; otherwise run §18 first.
- **Preconditions:** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` exactly `true` (§1); an unlocked report for each business, not yet attached to a workspace.
- **Steps (HK, then TW):**
  1. Private window → open the unlocked report → sign-in-to-claim button → sign in (§6 or §7).
  2. Onboarding step 2 → **Verify ownership with Google** → complete consent with the managing account.
  3. Finish onboarding steps 3 and 4 (integrations, brand basics).
  4. Confirm the workspace home opens and shows that business.
  5. Optional, separate owner data change: mark the workspace internal (see "Production is the acceptance target").
- **Evidence:** job ID, workspace ID, time; one redacted screenshot of the workspace home at 375 px. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT j.id AS job_id, j.workspace_id, w.slug, w.is_internal, m.role, m.accepted_at
    FROM public.audit_jobs j
    JOIN public.workspaces w ON w.id = j.workspace_id
    JOIN public.workspace_members m ON m.workspace_id = w.id AND m.role = 'owner'
   WHERE j.id = '<job id>';
  ROLLBACK;
  ```

- **Pass:** one row per market, role `owner`, `accepted_at` set, and onboarding completes. **Fail:** no row, a second owner, or onboarding stops on an error.
- **Fill in:** §5 row "R6 positive Google claim".

## §9 Hosted Blob storage (assets and evidence)

**Effect: free, writes production data and stores a file** in the private Blob store.

- **Needs:** the owner's decision to store a test file in production storage. **Cost:** negligible Vercel Blob storage.
- **Preconditions:** a test workspace from §8; a small image you own (not a customer photo), under 5 MB, JPEG, PNG or WebP.
- **Steps:**
  1. Workspace → **Assets** → upload the image. Confirm its rights.
  2. Confirm the thumbnail displays.
  3. Open the image in a new tab and note the time. Wait at least two minutes, then reload that tab: the signed address must have expired (assets are signed for 60 seconds; `docs/integration/neon-private-storage.md`).
  4. Open the same asset from the Assets page again: it must display (a fresh signed address).
  5. If §1 found `EVIDENCE_SNAPSHOT_*_ALLOWED` exactly `true`, open the evidence gallery of a full report from §8 or §18 and confirm images display; otherwise record evidence storage as `not run` (snapshots disabled). §18 runs later and costs provider money, so this step can be deferred until §18 has run.
- **Evidence:** asset ID, time; the step 3 result. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, kind, rights_status, created_at FROM public.assets
   WHERE workspace_id = '<workspace id>' ORDER BY created_at DESC LIMIT 5;
  ROLLBACK;
  ```

- **Pass:** upload, display, expiry and re-issue behave as in steps 2–4. **Fail:** an upload error, an image that never displays, or an address that still works after expiry.
- **Fill in:** §5 row "Hosted Blob storage".

## §10 Flag `CONTEXTUAL_ASSISTANT_ENABLED` (contextual assistant)

**Effect: changes production configuration** (no model call, no money).

> **Exposure:** turning this flag on shows the "Needs you now" questions to **every real workspace user**, not just the test workspace. **Rollback:** unset the flag and redeploy.

- **Needs:** your flag decision and DEC-01 (redeploy). No migration is needed (`PHASE-4-REPORT.md` P4.3). **Cost:** none.
- **Preconditions:** a test workspace (from §8) with at least one action that needs inputs or a draft waiting for approval.
- **Steps:**
  1. Vercel → set `CONTEXTUAL_ASSISTANT_ENABLED` to exactly `true` for Production → redeploy → note the deployment ID.
  2. Sign in as the owner → open the workspace → open the assistant sheet.
  3. Confirm a **Needs you now** list appears (at most three questions).
  4. Ask "What detail do you need?" or "Where do I continue?" and press **Continue here**. Confirm it opens the right action or version.
  5. Confirm the sheet has no approve, export or publish button.
  6. If you have a viewer member, repeat steps 2–3 as the viewer: viewers see questions but no **Continue here** for drafts.
  7. **Rollback test:** unset the flag → redeploy → confirm **Needs you now** disappears.
- **Evidence:** both deployment IDs; workspace ID; the action and version IDs that **Continue here** opened; time; one redacted screenshot of the sheet at 375 px.
- **Pass:** steps 3–5 behave as described and step 7 removes the list. **Fail:** a mutation control in the sheet, a link to another workspace, or a 5xx.
- **Fill in:** §5 row "Phase 4 flag: `CONTEXTUAL_ASSISTANT_ENABLED`". Note in the cell the state you leave the flag in.

## §11 Phase 2 assisted no-GBP assignment

**Effect: changes production configuration and writes production data** (access requests, decisions, a workspace).

> **Exposure:** turning `ASSISTED_ASSIGNMENT_ENABLED` on lets **every allowlisted operator** approve real ownership requests from **any real requester**, not just the test case. **Rollback:** unset `ASSISTED_ASSIGNMENT_ENABLED` (and `OPERATOR_EMAILS`) and redeploy.

- **Needs:** **DEC-06**: a named accountable operator, reviewer access rules, accepted verification methods and a rejection policy. The code asserts no policy of its own (`BUSINESS-AND-HOSTED-DECISIONS.md`, "DEC-06"). Also DEC-01. **Cost:** none.
- **Preconditions:** DEC-06 recorded; one test business **without** a Google Business Profile scanned by manual entry; two test accounts (requester, non-operator).
- **Steps:**
  1. Vercel → set `OPERATOR_EMAILS` to the operator's sign-in email and `ASSISTED_ASSIGNMENT_ENABLED` to exactly `true` → redeploy → note the deployment ID.
  2. As the requester: unlock the manual-entry report → sign in → onboarding step 2 → submit the assistance request.
  3. As the non-operator: open `/en/ops/access-requests`. It must refuse.
  4. As the operator: open `/en/ops/access-requests` → open the request → record what you checked → **Approve**.
  5. As the requester: reload onboarding. Confirm the workspace exists and opens.
  6. Submit a second request from another test account and **Reject** it. Confirm that account gets no workspace.
  7. Decide whether to unset the two variables afterwards; redeploy if you do.
- **Evidence:** deployment ID(s); request IDs; workspace ID; decision times. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, event, entity_id, created_at FROM public.audit_events
   WHERE entity_type = 'workspace_access_request' ORDER BY created_at DESC LIMIT 10;
  ROLLBACK;
  ```

- **Pass:** steps 3–6 all behave as described. **Fail:** a non-operator sees the queue, an approval yields no workspace, or a rejection creates one.
- **Fill in:** §5 row "Phase 2 assisted no-GBP assignment".

## §12 Phase 2 application mail, invitation and recovery

**Effect: changes production configuration, writes production data (a membership row) and sends real email.**

> **Exposure:** opening application mail sends notices to **real workspace members** for real events, limited only by `MAIL_RECIPIENT_ALLOWLIST` if you set it. **Rollback:** set `MAIL_PAUSED=true` (keeps queued rows) or unset `APPLICATION_MAIL_APPROVED`, then redeploy.

- **Needs:** **DEC-05** (recipients, count), **DEC-07** (mail channel, sender, templates) and DEC-01. **Cost:** the Resend sends you authorize.
- **Preconditions:** DEC-05 and DEC-07 recorded. What exists today: invitation **sign-in links** go through Neon Auth and work now; application mail (rescan-complete notices) is closed until approved; **invitation delivery by application mail and report recovery are built behind default-off flags** (`INVITATION_MAIL_ENABLED`, `REPORT_RECOVERY_ENABLED`; `PHASE-2-BACKLOG.md` items 29–30). They stay `not run` until the owner opens mail (DEC-07) and sets the flags; see "Invitations and report recovery (not run)" below.
- **Dependency:** the mail-producing event in step 3 is a completed workspace rescan, which first happens in §19 (paid, provider spend). Do steps 1–2 now; do steps 3–5 after §19, or record them `not run`.
- **Steps:**
  1. **Invitation:** as an owner, Settings → Team → invite a test recipient as viewer. As the recipient, request a sign-in link at `/en/owner/sign-in` and open it. Confirm you join the workspace as viewer.
  2. **Open application mail:** in Vercel set `APPLICATION_MAIL_APPROVED` to exactly `2026-10-mail-v2`, a new `MAIL_UNSUBSCRIBE_SECRET` of at least 32 random bytes (generate it in a password manager and type it straight into Vercel), and `MAIL_RECIPIENT_ALLOWLIST` to the DEC-05 test recipients → redeploy (`PHASE-3-REPORT.md` P3.5c, "Owner actions").
  3. After the §19 rescan completes, check the outbox:

     ```sql
     BEGIN TRANSACTION READ ONLY;
     SET LOCAL ROLE smeassistant_migrator;
     SELECT id, kind, state, hold_reason, attempts, created_at, sent_at
       FROM public.mail_outbox ORDER BY created_at DESC LIMIT 10;
     ROLLBACK;
     ```

  4. Confirm the email arrived and its unsubscribe link opens the `/unsubscribe` page.
  5. To stop sending without losing rows, set `MAIL_PAUSED=true` and redeploy.
- **Evidence:** deployment ID; member ID of the invitee; `mail_outbox` IDs, `state` and `sent_at`; arrival time. `sent` means accepted by the provider, not delivered; record arrival separately.
- **Pass:** the invitee joins with the invited role; at least one `sent` row that also arrived. **Fail:** the invitee gets the wrong role, rows stay `held` after approval, or mail reaches a recipient outside the allowlist. Recovery: `not run`, not built.
- **Fill in:** §5 row "Phase 2 application mail/invitation/recovery".

## §13 R7 approved first export (HK, then TW)

**Effect: spends model money and writes production data** (runs, versions, deliveries, usage).

- **Needs:** **DEC-04** (model spend ceiling, test workspaces). **Cost:** one model call per draft; the actual cost is stored in `action_runs.cost_usd`.
- **Preconditions:** the HK and TW test workspaces from §8; `AI_DRAFTS_PAUSED` absent (§1).
- **Steps (HK, then TW):**
  1. Note the usage figure shown on the workspace (Settings → Billing, or the sidebar "Approved deliveries").
  2. Actions → open a **review reply** action → **Generate a draft**. Wait for version 1.
  3. Edit the text → **Save** → version 2 appears.
  4. **Approve** version 2.
  5. **Export** (download) → note usage: it rises by 1.
  6. **Export** the same version again (or Copy) → usage does **not** rise.
  7. Edit the approved text and save: a new draft appears and needs approval again.
- **Evidence:** workspace ID, action ID, run ID, version IDs, delivery IDs, usage before/after; one redacted screenshot of the approval panel at 375 px and at desktop width. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT v.id AS version_id, v.version_no, v.approval_state, v.delivery_state,
         d.id AS delivery_id, d.mode, d.counted, d.created_at
    FROM public.output_versions v
    LEFT JOIN public.deliveries d ON d.version_id = v.id
   WHERE v.action_id = '<action id>' ORDER BY v.version_no, d.created_at;
  SELECT period, approved_deliveries, allowance FROM public.workspace_usage
   WHERE workspace_id = '<workspace id>';
  SELECT id, state, cost_usd, created_at FROM public.action_runs
   WHERE action_id = '<action id>' ORDER BY created_at;
  ROLLBACK;
  ```

- **Pass:** exactly one `counted = true` delivery for the approved version, the repeat is `counted = false`, usage rose by exactly 1, and the step 7 edit is a new draft. **Fail:** a second counted delivery, an approved version whose text changed, or no draft (a template fallback is a separate degradation case, not a pass).
- **Fill in:** §5 rows "R7 HK approved first export" and "R7 TW approved first export".

## §14 Phase 2 FAQ and website-basics workflows

**Effect: spends model money and writes production data.**

- **Needs:** **DEC-04**. **Cost:** one model call per draft.
- **Preconditions:** a test workspace with a website URL and open **visibility content (FAQ)** and **website basics** actions.
- **Steps:**
  1. Open the FAQ action. Answer the three fact questions it asks → **Generate a draft**.
  2. Confirm the draft has FAQ text and a JSON-LD block, and that no guardrail warning says the JSON-LD is invalid or mismatched.
  3. Approve and export. Confirm the export includes implementation instructions and says it has not been applied to the site.
  4. Repeat steps 1–3 for website basics (title, meta description, H1 grounded in the site's current checks).
  5. Try the FAQ action once **without** answering the facts: it must ask for them and make no draft.
- **Evidence:** action, run, version and delivery IDs; time; the guardrail warnings shown (codes only).
- **Pass:** both drafts generated, approved and exported once; step 5 makes no draft and no charge. **Fail:** a draft invents facts you did not give, the JSON-LD is flagged invalid, or step 5 produces a draft.
- **Fill in:** §5 row "Phase 2 FAQ/website-basics workflows".

## §15 Flag `OFFER_PROMOTIONS_ENABLED` (offers)

**Effect: changes production configuration, spends model money and writes production data.**

> **Exposure:** turning this flag on gives **every real workspace** the Offers page and lets owners and managers generate promotion drafts (model spend, within the AI budget). **Rollback:** unset the flag and redeploy; existing offer drafts stay approvable and exportable.

- **Needs:** **DEC-04** (two model calls); DEC-14 is on its safe default (two drafts count as two deliveries when exported); DEC-01. **Cost:** two model calls.
- **Preconditions:** §2 shows journal row 11; an HK test workspace.
- **Steps:**
  1. Vercel → `OFFER_PROMOTIONS_ENABLED` = exactly `true` → redeploy → note the deployment ID.
  2. Workspace → **Offers** → create an offer (title, details, HKD price, valid dates) → **Confirm**.
  3. **Create promotion drafts**. Read the notice before anything runs: two drafts, counted on first export.
  4. Generate both drafts. Approve and export **one** (usage +1).
  5. Edit the offer's price. Try to approve the other draft: it must be refused as out of date.
  6. **Rollback test:** unset the flag → redeploy → the Offers page answers 404, and the exported draft is still listed.
- **Evidence:** deployment IDs; offer ID and revision; action, version and delivery IDs; usage before/after; one redacted screenshot of the Offers page at 375 px. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, status, revision, confirmed_at, valid_until FROM public.offers
   WHERE workspace_id = '<workspace id>' ORDER BY created_at DESC LIMIT 5;
  ROLLBACK;
  ```

- **Pass:** steps 3–6 as described. **Fail:** a draft contradicts the offer's price or dates, the stale draft can be approved, or rollback deletes anything.
- **Fill in:** §5 row "Phase 4 flag: `OFFER_PROMOTIONS_ENABLED`".

## §16 Flag `WORK_PACKS_ENABLED` (work packs)

**Effect: changes production configuration, spends model money and writes production data.**

> **Exposure:** turning this flag on replaces the Home card for **every real workspace** with the starter pack, and starting a pack drafts up to three items with the model. **Rollback:** unset the flag and redeploy; packs and their actions stay.

- **Needs:** **DEC-04** (up to three model calls); DEC-14 safe default; DEC-01. **Cost:** up to three model calls.
- **Preconditions:** §2 shows journal row 12 on production; a test workspace with one location selected.
- **Steps:**
  1. Vercel → `WORK_PACKS_ENABLED` = exactly `true` → redeploy → note the deployment ID.
  2. Home → read the pack notice (up to 3 drafts; nothing counted until export) → **Start the pack**.
  3. Watch the items draft one by one. An item that needs facts shows "needs your facts".
  4. **Review next** → approve and export one draft on its action page (usage +1).
  5. Press **Start the pack** again (or reload Home): it must return the same pack, not a new one.
  6. **Rollback test:** unset the flag → redeploy → Home shows the earlier card; the actions remain.
- **Evidence:** deployment IDs; pack ID; item action IDs; version and delivery IDs; usage before/after; one redacted screenshot of the pack card at 375 px. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT p.id AS pack_id, p.closed_at, i.position, i.template_key, i.action_id
    FROM public.work_packs p JOIN public.work_pack_items i ON i.pack_id = p.id
   WHERE p.workspace_id = '<workspace id>' ORDER BY p.created_at DESC, i.position;
  ROLLBACK;
  ```

- **Pass:** one pack with three items, step 5 returns the same pack ID, one counted delivery. **Fail:** a second open pack, an item drafted twice in a single person's run, or an approve control on the pack card. Known residual, not a fail on its own (Ruling P6): if two people press **Continue** while the other's loop has not reached an item, that item can be drafted twice; record it as a limitation if seen.
- **Fill in:** §5 row "Phase 4 flag: `WORK_PACKS_ENABLED`".

## §17 Flag `PREVIEW_DRAFT_ENABLED` (preview draft)

**Effect: changes production configuration and spends model money**, triggered by the public.

> **Exposure:** turning this flag on lets **any visitor with an unlocked report** (not only test users) generate an AI reply draft, which spends model money up to the configured caps: by default 50 previews per rolling 24 hours and US$2 per rolling 24 hours (`PREVIEW_DRAFT_DAILY_LIMIT`, `PREVIEW_DRAFT_USD_DAILY`). **Rollback:** unset the flag and redeploy.

- **Needs:** DEC-12 (decided 2026-10-04), DEC-01, and **first a DEC-04 real-model evaluation**: how often the model returns `facts_needed` for a pasted review, and whether the AI gateway reports token usage (otherwise each preview is charged a conservative estimate).
  - The **owner's step** is to authorize DEC-04 for this evaluation and record its budget.
  - The evaluation itself is run by the controller or an engineer. `corepack pnpm eval:workflows` refuses unless `EVAL_LIVE=1`, an LLM key (`OPENCODE_API_KEY`, `LLM_API_KEY` or `OPENROUTER_KEY`) and `--budget-usd` are all present (`scripts/eval-workflows.ts`). The key is one issued specifically for this evaluation, held in the engineer's own secret store and injected into the shell only for the run, then revoked or rotated afterwards; it is never pasted into a chat or a document.
- **Cost:** the evaluation's DEC-04 budget, then at most the caps above per day.
- **Preconditions:** the DEC-04 evaluation recorded as passed; §2 shows journal row 13; a test report you can unlock in a private window.
- **Steps:**
  1. Vercel → `PREVIEW_DRAFT_ENABLED` = exactly `true` (leave the two limit variables unset to use the defaults) → redeploy → note the deployment ID.
  2. Private window, signed out → unlock the test report → find **Try one AI reply draft (not saved)** → open it.
  3. Paste one invented test review (not a real customer's) → submit.
  4. Confirm the draft shows the badge 「未認領草稿 · 未儲存」 (or its English/zh-TW equivalent), a Copy button and a claim link, and no save, approve or export control.
  5. Submit again: it must refuse as already used.
  6. Open the same `/start` page in another private window that has **not** unlocked the report: it must answer 404.
  7. Run metrics query 1 from [`PREVIEW-METRICS.md`](PREVIEW-METRICS.md) (read-only).
  8. **Rollback test:** unset the flag → redeploy → the card is gone and `/start` answers 404.
- **Evidence:** deployment IDs; job ID; `preview_events` row IDs and outcomes; time; one redacted screenshot of the draft at 375 px. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, outcome, reason, cost_usd, created_at FROM public.preview_events
   WHERE job_id = '<job id>' ORDER BY created_at;
  ROLLBACK;
  ```

- **Pass:** one `generated` row and one `refused` (`already_used`) row; no new action, version or delivery; steps 4, 6 and 8 as described. **Fail:** a stored draft, an approve or export control, access without the viewer grant, or a cost above the cap.
- **Fill in:** §5 row "Phase 4 flag: `PREVIEW_DRAFT_ENABLED`" (and the preview half of "Conditional preview/connector acceptance").

## §18 R3 usable live scans (HK, then TW)

**Effect: spends provider money and writes production data.**

- **Needs:** **DEC-04**: named HK and TW businesses, provider limits and a money ceiling with a stop condition. **Cost:** live provider calls (SerpApi, Google Places, RapidAPI Instagram) for each scan. No per-scan price is recorded in this repository, so set the ceiling before starting. The code's own budget defaults (200 scan attempts per 24 h) are placeholders, not your ceiling.
- **Preconditions:** DEC-04 recorded; `SCANS_PAUSED` absent (§1); `SCAN_SOURCES` noted in §1.
- **Steps (HK, then TW):**
  1. Open `/zh-HK/scan` (TW: `/zh-TW/scan`). Search the named business and pick its listing.
  2. Fill industry, district and goal; tick consent; start. Note the start time and the scan reference shown (`SCAN-` plus six characters).
  3. Stay on the scanning page until it says the report is ready (a scan can take 5–13 minutes), or until the page stops waiting.
  4. Open the report. Note the overall score (or "score withheld"), coverage and which sources were measured.
- **Evidence:** job ID, start and finish times, terminal status, coverage, per-module states; one redacted screenshot of the scanning page and of the report at 375 px. Query (null-safe when `module_results` is empty):

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, region, status, processing_stage, score_coverage, attempt_count,
         created_at, completed_at,
         CASE WHEN jsonb_typeof(module_results) = 'object'
              THEN (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(module_results) AS k)
         END AS modules
    FROM public.audit_jobs WHERE id = '<job id>';
  ROLLBACK;
  ```

  Read each module's state on the report page rather than copying `module_results` (it may contain business data).
- **Pass:** status `done` or `partial`, a report that opens, coverage and module states that match the report, elapsed time recorded. **Fail:** `failed`, a scan stuck past 30 minutes, or a module shown as measured that the report says is unavailable.
- **Fill in:** §5 rows "R3 HK usable live scan" and "R3 TW usable live scan".

## §19 R11 successful comparable pair

**Effect: spends provider money and writes production data.**

- **Needs:** **DEC-04** for a second scan of the same place. **Cost:** one more live scan.
- **Preconditions:** a claimed test workspace whose first scan (§18) is `done` or `partial`; you are its owner. **Rescan is paid-tier only**: on a lite workspace it answers 403 `tier_required` (`app/api/workspaces/[workspaceId]/rescan/route.ts`). Billing is closed, so a paid test workspace may need §21 first; if none is possible, record R11 as `blocked` with that reason.
- **Steps:**
  1. Workspace → the rescan control for that location (labelled "Rescan now" in the design; rate-limited to 3 per day per workspace).
  2. Wait for completion as in §18.
  3. Open the new report while signed in as the owner. Confirm the comparison section shows a change since the earlier scan, or an honest reason why the two are not comparable.
  4. In a signed-out private window, open the same report link: the earlier scan's evidence must not be shown.
- **Evidence:** both job IDs; the `scan_diffs` row; time; one redacted screenshot of the comparison at 375 px and at desktop width. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, base_job_id, head_job_id, comparable, incomparable_reason,
         composite_withheld_reason, composite_delta, created_at
    FROM public.scan_diffs WHERE head_job_id = '<second job id>';
  ROLLBACK;
  ```

- **Pass:** one `scan_diffs` row with `comparable = true`, the member view shows the comparison, and the signed-out view hides the earlier evidence. If `comparable = false`, record the reason: that is an honest result but **not** a pass for R11. **Fail:** no row, a comparison drawn across a reason, or earlier evidence visible signed out.
- **Fill in:** §5 row "R11 successful comparable pair".

## §20 Phase 3 scheduled and resumed work

**Effect: depends on your DEC-10 decision.** Keeping the scheduler off needs a code change or nothing; activating it changes production configuration and starts **unsupervised provider spend**.

**Update, 2026-10-05: Path A is done.** PR #33 removed the cron entry. Read-only runtime logs show the last `/api/cron/dispatch` call at 16:35:26 UTC on 2026-10-04, 20 s before the `f1d59fa` deploy, and none from then until at least 20:11 UTC ([`RELEASE-EVIDENCE-029d86a.md`](RELEASE-EVIDENCE-029d86a.md) §6). The Vercel → Cron Jobs listing (step 2) has not been checked. The §5 row "Phase 3 actual scheduled/resumed work" stays `not run`, with "scheduler off by DEC-10". Path B is unchanged if DEC-10 is ever decided.

**Before Path A (controller, read-only Vercel runtime logs, 2026-10-04).** `vercel.json` at `080ddf6` registers `/api/cron/dispatch` every 5 minutes. Vercel invoked it 288 times in the 24 hours before about 09:28 UTC on 2026-10-04, on the production deployments serving in that window, and **all 288 returned 401**. (The per-deployment counts in [`RELEASE-EVIDENCE-029d86a.md`](RELEASE-EVIDENCE-029d86a.md) §6 cover a later 24-hour window, ending about 20:11 UTC on 2026-10-04.) `CRON_SECRET` is present, but the route accepts only `Authorization: Bearer <CRON_SECRET>` with a secret of at least 16 characters, compared exactly (`lib/security/cron-auth.ts`), so the most likely cause is the stored value; the alternatives are that it is shorter than 16 characters, does not match exactly (for example, whitespace), or is not available at runtime to the deployments serving those calls (for example, added or changed after that build, or set in a different scope; see the R2 row's project-level-versus-build limitation). The value was not read. **So, in the observed 24 h before about 09:28 UTC on 2026-10-04, no schedule reminder, re-claim of abandoned scans, auto-close, reconcile or website verification ran through the cron in production.** It fails closed, and it is one fix away from running.

**Step 0 — the DEC-10 decision (owner).** Record scheduler identity, frequency, provider budget, pause and retry policy in `BUSINESS-AND-HOSTED-DECISIONS.md`. DEC-10's recorded default is no hosted cron activation. Then follow one path.

### Path A — keep the scheduler off (recommended until DEC-10 is decided)

**Effect: code change (by an engineer), no spend.**

1. Ask an engineer to remove the `crons` entry from `vercel.json` in a reviewed pull request, and update `tests/cron-registration.test.ts` to match. This is preferred to relying on an invalid secret, which a later correct paste would silently activate.
2. After the change deploys, confirm in Vercel → Cron Jobs that no job is listed, and in Logs that `/api/cron/dispatch` receives no further invocations.
3. Alternative, not recommended: leave the secret as it is. Record that the scheduler is off only because of a 401.
- **Pass:** no invocations after the deploy. **Fill in:** §5 row "Phase 3 actual scheduled/resumed work": `not run`, with "scheduler off by DEC-10" and the deployment ID.

### Path B — activate it

**Effect: changes production configuration and starts provider spend** on the cron's schedule.

> **Exposure:** a working cron acts for **every real workspace**: it re-claims abandoned scans (provider spend), sends reminders and runs website verification. **Rollback:** delete or invalidate `CRON_SECRET` and redeploy, or remove the cron entry (Path A); `SCANS_PAUSED=true` and redeploy stops scan spend (`INCIDENT-RUNBOOK.md`).

1. Generate a new random secret of at least 32 characters in a password manager. Never paste it into a chat, document or terminal.
2. Vercel → edit `CRON_SECRET` for Production → type the new value as **Sensitive** → redeploy → note the deployment ID.
3. Vercel → Logs, filter to `/api/cron/dispatch`: the next invocation (within 5 minutes) must return **200**. Watch for at least 30 minutes.
4. Run the read-only incident queries `scan_backlog`, `schedule_states` and `dead_lettered_scans` from [`rollout/incident-queries.sql`](rollout/incident-queries.sql), each inside the read-only template.
5. If a scan was interrupted and later finished, record its `attempt_count` (the §18 query): a value above 1 that reached `done` or `partial` is resumed work.
- **Evidence:** deployment ID; time window; count of 200 responses; any non-200 codes; job IDs with `attempt_count > 1`.
- **Pass:** steady 200 responses and no job stuck in a non-terminal state past its 3 attempts. **Fail:** 401 or 405 responses, missing invocations, or a stuck job not dead-lettered.
- **Fill in:** §5 row "Phase 3 actual scheduled/resumed work".

## §21 R8 authorized Stripe test transitions

**Effect: changes billing configuration** (Stripe test mode; no money).

> **Exposure:** opening billing shows **Subscribe** to **every real workspace**; with test-mode keys on production, a real customer's checkout would use test mode. **Rollback:** unset `COMMERCIAL_CONTRACT_APPROVED` and redeploy (billing answers "closed").

- **Needs:** **DEC-08** (commercial matrix), **DEC-09** (Stripe test-mode target, permitted events, no live charges) and DEC-01. **Cost:** none in test mode.
- **Preconditions:** DEC-09 names the target and states whether test-mode keys on the production deployment are acceptable. Billing opens only with `COMMERCIAL_CONTRACT_APPROVED` = exactly `2026-09-baseline` plus a full Stripe configuration (`PHASE-3-REPORT.md` P3.3).
- **Steps:**
  1. Set the approved variables on the DEC-09 target → redeploy → note the deployment ID.
  2. As a test owner: Settings → Billing → **Subscribe** → pay with a Stripe test card on Stripe's own page.
  3. Confirm the workspace shows the paid tier after the webhook arrives.
  4. In the Stripe dashboard (test mode), resend the same event once: the tier must not change twice.
  5. Open **Manage billing** (the Stripe portal) and cancel in test mode; confirm the tier returns when Stripe sends the event.
- **Evidence:** deployment ID; Stripe test event IDs; workspace ID; tier events. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, tier, source, stripe_event_id, created_at FROM public.workspace_tier_events
   WHERE workspace_id = '<workspace id>' ORDER BY created_at;
  ROLLBACK;
  ```

- **Pass:** one tier event per distinct Stripe event, the resent event is ignored, and the tier matches Stripe. **Fail:** a duplicate tier event, a tier that disagrees with Stripe, or any live-mode charge.
- **Fill in:** §5 row "R8 authorized Stripe test transitions".

## §22 Flag `GBP_REPLY_PUBLISH_ENABLED` (P4.6 Google review-reply publishing)

**Effect: changes non-production configuration, applies a migration, and publishes and deletes a public reply on a Fimmick-owned Google Business Profile listing** (no model money, no billing change).

> **Not part of `080ddf6`.** P4.6 is built on branch `p46-gbp-reply-publish` (`docs/implementation/owner-platform-v1/PHASE-4-REPORT.md`, "P4.6"). This section applies to the first candidate deployment that contains it, and it runs on a **non-production** deployment only: this is the **separate release approval** that DEC-13 requires. Turning the flag on in production is a further, explicit owner decision after this section passes. **Exposure:** with the flag on, every owner and in-scope manager of every workspace on that deployment who has an active Google connection sees **Publish to Google** on approved review-reply actions, and a publish posts a public reply. **Rollback:** unset the flag and redeploy; replies already published stay on Google (delete them on the action page while the flag is on, or in Google directly).

- **Needs:** DEC-13 and DEC-14 (decided 2026-10-04); **DEC-11** for applying `0014`; the release approval for this non-production run, recorded in `BUSINESS-AND-HOSTED-DECISIONS.md` ("Acceptance authorization record") with the deployment, the Fimmick-owned listing (by its Google location ID only) and the person who may approve the test reply. **Cost:** no model money (the reply is an already approved version); Google Business Profile API calls only, within the project's quota.
- **Preconditions (owner actions, in order):**
  1. **Google Business Profile API access** has been requested for the GCP project behind `GOOGLE_OAUTH_CLIENT_ID` and **approved by Google** (quota stays at 0 until then; a call before approval answers `provider_forbidden`). No reconnect is needed: the scope is already `business.manage`.
  2. **`0014` applied** with [`rollout/apply-0014.sql`](rollout/apply-0014.sql) in the Neon SQL Editor as `neondb_owner`, first on the Neon **test branch** of production, then on production (the runbook is in `PHASE-4-REPORT.md`, "Runbook — `apply-0014.sql`"). Its one success notice is `apply-0014: applied 0014_publish_reply.sql and recorded journal row 14`. A second run refuses with the journal message.
  3. A non-production deployment of the P4.6 candidate whose database has `0014`, with `GBP_REPLY_PUBLISH_ENABLED` unset at first.
  4. A test workspace on that deployment that owns the Fimmick-owned listing through a verified Google connection, and two **invented** test reviews on that listing (written by a Fimmick account, never a real customer's), plus a review-response action for that location with an approved reply version. For step 7, a second review-response action for the same location whose approved reply version contains Chinese (CJK) text, at least one emoji and several consecutive blank lines (for example `多謝光臨！😊`, two empty lines, then a closing line).
- **Steps:**
  1. Run §2 on the target database: exactly **14** rows, rows 1–13 as in §2, and row 14 `0014_publish_reply.sql` with checksum prefix `e2c181b78e1e`.
  2. With the flag unset: open the approved version's action page. The delivery card shows export and copy only, with no **Publish to Google**.
  3. Vercel (non-production deployment) → `GBP_REPLY_PUBLISH_ENABLED` = exactly `true` → redeploy → note the deployment ID.
  4. As the owner, open the action page → **Publish to Google**. Confirm the dialog lists the listing's unreplied reviews (stars, reviewer, date, excerpt) with one preselected, shows the full approved text with "Version N · approved", and keeps **Publish** disabled until a review is selected **and** the confirmation box is ticked. Change the selected review: the tick must clear.
  5. Select the test review, tick the box, **Publish**. The card shows **Published on Google** with a verified time. In Google (Business Profile manager, or Maps signed in as the listing owner) the reply text equals the approved version exactly.
  6. **Read-back and reconcile:** run the query below; the delivery is `published`, `counted` is true (or false if the version had already been exported), `verified_at` is set, and `provider_receipt` holds only `review_name` and `reply_update_time`. Press **Check on Google** if a "Couldn't confirm" state ever appears and record what it settled to. A delivery is read back only once it is at least 60 s old (the publish request may still be running); a press before that answers "too soon" and changes nothing.
  7. **Google's text normalisation:** publish the second action's approved version (CJK text, an emoji, several blank lines) to the second test review. The card must show **Published on Google**, never **Failed** "already replied" or a lasting **Couldn't confirm**; if **Couldn't confirm** appears, wait 60 s and press **Check on Google**: it must settle to **Published on Google**. Record the reply exactly as Google displays it (blank lines, emoji). **Fail** if Google holds our text but the delivery settles `failed` with `already_replied` (or stays `publishing`): Google normalised the text differently from `sameReply`, and every live reply with such text would be misreported. Delete that reply afterwards (owner, **Delete reply**). This publish counts one approved delivery for the second version (two in total so far; a lite workspace allows 3).
  8. **Export after publish:** back on the first action, export the version published in step 5. Usage does not change (the version already counted), and the card still shows **Published on Google** beside the export.
  9. **Authority:** as a manager outside the location's scope, and as a viewer, open the same action: no **Publish to Google** and no **Delete reply**. As an in-scope manager: **Publish to Google** is offered, **Delete reply** is not.
  10. **Delete:** as the owner, **Delete reply** → confirm. The card shows **Deleted from Google**; in Google the reply is gone; usage is unchanged (no refund).
  11. **Rollback test:** unset the flag → redeploy → **Publish to Google** and **Delete reply** are gone; the card may still show the last delivery's state (here **Deleted from Google**) as history, and the query shows the delivery rows unchanged.
- **Evidence:** deployment IDs; workspace, action, version and delivery IDs; the Google location ID (not the business name); usage before and after steps 5, 7, 8 and 10; times; for step 7, the reply as Google displays it, redacted to its shape (line breaks and emoji kept, words replaced). One redacted screenshot of the dialog and one of the published card at 375 px, with the review text and reviewer name redacted. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT d.id, d.mode, d.channel, d.state, d.counted, d.failure_reason, d.verified_at,
         d.provider_receipt ? 'review_name' AS has_receipt, d.created_at,
         v.version_no, v.delivery_state, v.first_exported_at, v.first_published_at
    FROM public.deliveries d JOIN public.output_versions v ON v.id = d.version_id
   WHERE d.version_id = '<version id>' ORDER BY d.created_at;
  SELECT event, entity_id, payload->>'counted' AS counted, payload->>'reason' AS reason, created_at
    FROM public.audit_events
   WHERE event LIKE 'delivery.%' AND payload->>'version_id' = '<version id>' ORDER BY created_at;
  ROLLBACK;
  ```

- **Pass:** exactly one counted delivery for the version across publish and export; the reply on Google equals the approved text; a `delivery.publish_started`, a `delivery.published` and a `delivery.publish_cancelled` audit row; no review text, reviewer name or reply text in any delivery column; steps 2, 4, 7, 9 and 11 as described. **Fail:** a reply posted without the confirmation tick, a second counted delivery, an overwritten existing reply, a publish or delete offered to a role that may not use it, a delivery left `publishing` after **Check on Google** with Google reachable, or any text stored on a delivery.
- **Fill in:** a new §5 row "Phase 4 flag: `GBP_REPLY_PUBLISH_ENABLED` (non-production)" in the release-evidence file of the candidate that contains P4.6, and the connector half of "Conditional preview/connector acceptance".

## Invitations and report recovery (not run)

Nothing is sent unless the owner enables application mail (`APPLICATION_MAIL_APPROVED=2026-10-mail-v2` plus the DEC-07 values) and sets `INVITATION_MAIL_ENABLED=true` and/or `REPORT_RECOVERY_ENABLED=true` (exactly `true`). Flags are unset in production and nothing here has been hosted-verified.

1. **Invite:** as owner, Settings -> Team -> invite a test recipient; the Team page shows a delivery status (accepted by the mail provider, never "delivered").
2. **Resend:** use Resend on a pending invitation; a fourth resend in a day is refused (3/day per member).
3. **Recover:** open a locked report (`/r/<slug>`) and use the recovery entry with the address recorded at unlock; the response is the same for unknown addresses. The mailed link is single-use.
4. **Redeem:** open the link; the report opens. Open the same link again: it reports expired.
