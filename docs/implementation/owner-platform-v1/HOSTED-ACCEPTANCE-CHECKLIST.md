# Hosted acceptance checklist for main `080ddf6`

An owner runbook for the hosted rows of [`RELEASE-EVIDENCE-080ddf6.md`](RELEASE-EVIDENCE-080ddf6.md) §5. Each section is one scenario on **`https://smeassistant.vercel.app`**, deployment `dpl_E2HNGePLBHpdDVNzejLTZVrBepqN` (commit `080ddf6`).

Sections run from free and read-only (§1–§8), through free checks that need a configuration change (§9–§10), to checks that spend model money (§11–§15) and then provider money (§16–§18), with billing last (§19).

**Nothing in this file is an authorization.** Before a section that names a DEC, write the decision into `BUSINESS-AND-HOSTED-DECISIONS.md` ("Acceptance authorization record"), including the budget. A blank record means stop.

## Rules for every section

1. **Never paste a secret** (API key, token, password, connection string, cookie, magic link) into a chat, a document, a ticket or a terminal. Never copy a value out of Vercel. To change a variable, type the new value straight into the Vercel dashboard.
2. **Record IDs and timestamps only.** Good: a job ID, workspace ID, action ID, version ID, delivery ID, Vercel request ID, a UTC time. Never record email addresses, phone numbers, names of real customers, review text, report share links (`/r/...` URLs), or screenshots that show them. Redact before saving a screenshot.
3. **SQL is read-only** and runs only in the **Neon SQL Editor** on the production project. Paste each block whole. Every block starts with `BEGIN TRANSACTION READ ONLY;` and ends with `ROLLBACK;`, so it cannot change anything. Tables are owned by the role `smeassistant_migrator`, so the blocks switch to it with `SET LOCAL ROLE`; that lasts only inside the read-only transaction. If the editor answers `permission denied to set role`, stop and record the section as **blocked**. Do not change grants just to run a check.
4. **Environment changes take effect on the next deployment.** After you change a variable in Vercel, redeploy (Deployments → the current production deployment → ⋯ → Redeploy) and note the new deployment ID. That new ID, not `dpl_E2HN…`, goes in the evidence cell.
5. **Statuses:** write `passed`, `failed`, `blocked` or `not run` only. A button that renders, a redirect to Google, an HTTP 201 or a "we sent you an email" message on its own is **not** a pass.
6. **Where to write results:** in `RELEASE-EVIDENCE-080ddf6.md` §5, find the row named in each section's "Fill in". Put the status in **Status**, the IDs in **Safe entity/receipt IDs**, and one line of what you saw (plus any limitation) in **Evidence and limitation**. If you used a new deployment, replace **Candidate deployment**.

### Read-only SQL template

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL ROLE smeassistant_migrator;
-- the section's SELECT goes here
ROLLBACK;
```

---

## §1 R2 environment inventory (names and presence)

- **Needs:** DEC-03 (read-only inventory). **Cost:** none.
- **Preconditions:** Vercel access to project `smeassistant`.
- **Steps:**
  1. Open Vercel → project `smeassistant` → Settings → Environment Variables. Filter to **Production**.
  2. Compare the names with the "Present for production" list in `RELEASE-EVIDENCE-080ddf6.md` §1 and `.env.example`. Note any name that was added or removed since 2026-10-04.
  3. Confirm these names are **absent**: `OWNER_SELF_SERVICE_CLAIM`, `OFFER_PROMOTIONS_ENABLED`, `WORK_PACKS_ENABLED`, `CONTEXTUAL_ASSISTANT_ENABLED`, `PREVIEW_DRAFT_ENABLED`.
  4. For the **non-secret switches only**, open each and note whether its value is exactly `true`, exactly `false`, or something else: `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, `REPORT_RECOVERY_ENABLED`, `EVIDENCE_SNAPSHOT_INSTAGRAM_ALLOWED`, `EVIDENCE_SNAPSHOT_GOOGLE_MAPS_ALLOWED`. For `SCAN_SOURCES`, note `live` or `fixture` (production treats `fixture` as `live`; `docs/integration/DEPLOY.md` §3). Do not open any other variable's value.
  5. Note which variables Vercel marks with a security warning.
  6. **Owner configuration fix (recommended, separate from the check):** `BLOB_READ_WRITE_TOKEN` and `NEON_AUTH_BASE_URL` are stored as readable "encrypted" values and flagged `readable-secret`. Re-save each as **Sensitive**: edit the variable, tick Sensitive, and paste the value from its source (the Vercel Blob store settings, the Neon Auth settings), not from a copy of the current value. Then redeploy (rule 4) and note the new deployment ID.
- **Evidence:** the date and time of the check; added/removed names; the four switch states and `SCAN_SOURCES` mode; the warning list; the new deployment ID if step 6 was done.
- **Pass:** the names match (or every difference is explained), the five names in step 3 are absent, and every switch state is known. **Fail:** `OWNER_SELF_SERVICE_CLAIM` is present, a switch holds an unexpected value, or a required name is missing.
- **Fill in:** §5 row "R2 environment inventory" (Evidence column: add the switch states). If step 6 was done, add one line under §7 "Secret-boundary and logging review".

## §2 Migration journal (verifies the owner-reported applies)

- **Needs:** none beyond Neon console access (read-only). **Cost:** none.
- **Preconditions:** you can open the production project in the Neon console.
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

- **Needs:** your decision to send anonymous probes to production. **Cost:** none. It sends GETs and deliberately invalid POSTs, never credentials, valid scans, valid emails or signed payments (`scripts/launch-check.mjs`).
- **Preconditions:** a local checkout of `main` at `080ddf6` with `corepack pnpm install` done; you know the value you set for `NEXT_PUBLIC_SITE_URL` (it is a public address, not a secret) and the `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` state from §1.
- **Steps:**
  1. In a terminal in the checkout, run one command. Use `--claim-flag on` only if §1 found `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` exactly `true`; otherwise use `off`. Replace `<canonical>` with your `NEXT_PUBLIC_SITE_URL` value:

     ```sh
     corepack pnpm launch:check --origin https://smeassistant.vercel.app --canonical-origin <canonical> --claim-flag off
     ```

  2. Save the printed result list (it contains no secrets).
- **Evidence:** the time; each probe's name and `passed` / `failed` / `blocked`; the exit code.
- **Pass:** exit 0 and every probe `passed`. **Fail:** any `failed`. A `429` is `blocked` (rate limited), not a pass; wait and rerun.
- **Fill in:** §5 row "Candidate `launch:check`".

## §4 R6 negative claim (a non-manager is refused)

- **Needs:** DEC-03 (a named Google test account that does **not** manage the business). **Cost:** none.
- **Preconditions:** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is exactly `true` (§1); an unlocked report of a business that this Google account does not manage, which is not yet attached to a workspace.
- **Steps:**
  1. In a private browser window, open the unlocked report and press the sign-in-to-claim button.
  2. Sign in with the test account (email link or Google).
  3. On onboarding step 2, choose **Verify ownership with Google** and complete Google's consent with the same test account.
  4. Read the message you land on.
- **Evidence:** the job ID (from the scan reference or the read-only query below); the time; the visible message (paraphrase, no personal data).

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, workspace_id, status FROM public.audit_jobs WHERE id = '<job id>';
  ROLLBACK;
  ```

- **Pass:** a clear refusal that explains why, no workspace is created, and `workspace_id` stays empty. **Fail:** the account gets a workspace or owner role, or the page shows a raw error or a blank screen.
- **Fill in:** §5 row "R6 negative manager/claim case".

## §5 R4 hosted magic link (delivery, redemption, expiry, replay, logout)

- **Needs:** DEC-05 (named recipient mailbox and number of test emails). **Cost:** none (Neon Auth sends the email).
- **Preconditions:** a recipient that is eligible: it unlocked a report by email (or was recorded as the sign-in email at unlock), or it has a pending workspace invitation.
- **Steps:**
  1. Open `https://smeassistant.vercel.app/en/owner/sign-in` in a private window and request an email link for the recipient.
  2. Note the time the email arrives. Open the link in the same browser.
  3. Confirm you land on the workspace (or onboarding) for that account.
  4. **Replay:** open the same link again in a new private window. It must not sign you in.
  5. **Expiry:** request a new link, wait past its stated lifetime, then open it. It must not sign you in.
  6. **Logout:** sign out from the workspace menu, then press the browser's Back button and reload. You must not see workspace data.
- **Evidence:** request and arrival times (UTC); the landing page path without query parameters; for steps 4–6, the visible result. Never record the link itself.
- **Pass:** steps 2–3 succeed and steps 4–6 all refuse. **Fail:** no email arrives within 10 minutes, a replayed or expired link signs in, or Back after sign-out shows data.
- **Fill in:** §5 row "R4 hosted magic link".

## §6 R5 completed Google sign-in

- **Needs:** DEC-03 (named Google test account). **Cost:** none.
- **Preconditions:** the test account is eligible to sign in (as in §5).
- **Steps:**
  1. Private window → `/en/owner/sign-in` → **Continue with Google**.
  2. Complete Google's consent.
  3. Note where you land. Repeat once in `zh-HK` (`/zh-HK/owner/sign-in`, **使用 Google 繼續**).
  4. If it fails, note the page and any reference code shown on screen, then ask Vercel support logs (Logs, filter by the time) for the request ID only.
- **Evidence:** time; landing path; on failure, the stage (before Google, on Google, on return) and the request ID or correlation reference.
- **Pass:** both locales land signed in on the workspace or onboarding page. **Fail:** any error page, a loop back to sign-in, or a 5xx.
- **Fill in:** §5 row "R5 completed Google sign-in".

## §7 R6 positive Google claim

- **Needs:** DEC-03 (a test Google account that **manages** the business's Google Business Profile, and that business named in the record). **Cost:** none if an existing completed report of that business is used; otherwise run §16 first.
- **Preconditions:** `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` exactly `true` (§1); an unlocked report for that business, not yet attached to a workspace.
- **Steps:**
  1. Private window → open the unlocked report → sign-in-to-claim button → sign in (§5 or §6).
  2. Onboarding step 2 → **Verify ownership with Google** → complete consent with the managing account.
  3. Finish onboarding steps 3 and 4 (integrations, brand basics).
  4. Confirm the workspace home opens and shows that business.
- **Evidence:** job ID, workspace ID, time. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT j.id AS job_id, j.workspace_id, w.slug, m.role, m.accepted_at
    FROM public.audit_jobs j
    JOIN public.workspaces w ON w.id = j.workspace_id
    JOIN public.workspace_members m ON m.workspace_id = w.id AND m.role = 'owner'
   WHERE j.id = '<job id>';
  ROLLBACK;
  ```

- **Pass:** one row, role `owner`, `accepted_at` set, and onboarding completes. **Fail:** no row, a second owner, or onboarding stops on an error.
- **Fill in:** §5 row "R6 positive Google claim".

## §8 Flag `CONTEXTUAL_ASSISTANT_ENABLED` (contextual assistant)

- **Needs:** your flag decision only; no model is called and no migration is needed (`PHASE-4-REPORT.md` P4.3). **Cost:** none.
- **Preconditions:** a test workspace (from §7) with at least one action that needs inputs or a draft waiting for approval.
- **Steps:**
  1. Vercel → set `CONTEXTUAL_ASSISTANT_ENABLED` to exactly `true` for Production → redeploy → note the deployment ID.
  2. Sign in as the owner → open the workspace → open the assistant sheet.
  3. Confirm a **Needs you now** list appears (at most three questions).
  4. Ask "What detail do you need?" or "Where do I continue?" and press **Continue here**. Confirm it opens the right action or version.
  5. Confirm the sheet has no approve, export or publish button.
  6. Repeat step 2–3 as a viewer member if you have one: viewers see questions but no **Continue here** for drafts.
  7. **Rollback test:** unset the flag → redeploy → confirm **Needs you now** disappears.
- **Evidence:** both deployment IDs; workspace ID; the action and version IDs that **Continue here** opened; time.
- **Pass:** steps 3–5 behave as described and step 7 removes the list. **Fail:** a mutation control in the sheet, a link to another workspace, or a 5xx.
- **Fill in:** §5 row "Phase 4 flag: `CONTEXTUAL_ASSISTANT_ENABLED`". Leave the flag in the state you decide; note it in the cell.

## §9 Phase 2 assisted no-GBP assignment

- **Needs:** **DEC-06**: a named accountable operator, reviewer access rules, accepted verification methods and a rejection policy. The code asserts no policy of its own (`BUSINESS-AND-HOSTED-DECISIONS.md`, "DEC-06"). **Cost:** none.
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

  If this returns nothing, record the request IDs from the operator page instead.
- **Pass:** steps 3–6 all behave as described. **Fail:** a non-operator sees the queue, an approval yields no workspace, or a rejection creates one.
- **Fill in:** §5 row "Phase 2 assisted no-GBP assignment".

## §10 Phase 2 application mail, invitation and recovery

- **Needs:** **DEC-05** (recipients, count) and **DEC-07** (mail channel, sender, templates). **Cost:** the Resend sends you authorize.
- **Preconditions:** DEC-05 and DEC-07 recorded. Note what exists: invitation **sign-in links** go through Neon Auth and work today; application mail (rescan-complete notices) is closed until approved; **invitation delivery by application mail and report recovery are not built** (`PHASE-2-BACKLOG.md` items 29–30), so they stay `not run`.
- **Steps:**
  1. **Invitation:** as an owner, Settings → Team → invite a test recipient as viewer. As the recipient, request a sign-in link at `/en/owner/sign-in` and open it. Confirm you join the workspace as viewer.
  2. **Application mail:** in Vercel set `APPLICATION_MAIL_APPROVED` to exactly `2026-09-event-mail-v1`, a new `MAIL_UNSUBSCRIBE_SECRET` of at least 32 random bytes (generate it in a password manager and type it straight into Vercel), and `MAIL_RECIPIENT_ALLOWLIST` to the DEC-05 test recipients → redeploy (`PHASE-3-REPORT.md` P3.5c, "Owner actions").
  3. Trigger one mail-producing event authorized under DEC-05 (for example a completed rescan in §17), then check the outbox:

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

## §11 R7 approved first export (HK, then TW)

- **Needs:** **DEC-04** (model spend ceiling, test workspaces). **Cost:** one model call per draft; the actual cost is stored in `action_runs.cost_usd`.
- **Preconditions:** an HK and a TW test workspace (from §7); `AI_DRAFTS_PAUSED` absent (§1).
- **Steps (repeat for HK and TW):**
  1. Note the usage figure shown on the workspace (Settings → Billing, or the sidebar "Approved deliveries").
  2. Actions → open a **review reply** action → **Generate a draft**. Wait for version 1.
  3. Edit the text → **Save** → version 2 appears.
  4. **Approve** version 2.
  5. **Export** (download) → note usage: it rises by 1.
  6. **Export** the same version again (or Copy) → usage does **not** rise.
  7. Edit the approved text and save: a new draft appears and needs approval again.
- **Evidence:** workspace ID, action ID, run ID, version IDs, delivery IDs, usage before/after. Query:

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

## §12 Phase 2 FAQ and website-basics workflows

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

## §13 Flag `OFFER_PROMOTIONS_ENABLED` (offers)

- **Needs:** **DEC-04** (two model calls); DEC-14 is on its safe default (two drafts count as two deliveries when exported). **Cost:** two model calls.
- **Preconditions:** §2 shows journal row 11; an HK test workspace.
- **Steps:**
  1. Vercel → `OFFER_PROMOTIONS_ENABLED` = exactly `true` → redeploy → note the deployment ID.
  2. Workspace → **Offers** → create an offer (title, details, HKD price, valid dates) → **Confirm**.
  3. **Create promotion drafts**. Read the notice before anything runs: two drafts, counted on first export.
  4. Generate both drafts. Approve and export **one** (usage +1).
  5. Edit the offer's price. Try to approve the other draft: it must be refused as out of date.
  6. **Rollback test:** unset the flag → redeploy → the Offers page answers 404, and the exported draft is still listed.
- **Evidence:** deployment IDs; offer ID and revision; action, version and delivery IDs; usage before/after. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, status, revision, confirmed_at, valid_until FROM public.offers
   WHERE workspace_id = '<workspace id>' ORDER BY created_at DESC LIMIT 5;
  ROLLBACK;
  ```

- **Pass:** steps 3–6 as described. **Fail:** a draft contradicts the offer's price or dates, the stale draft can be approved, or rollback deletes anything.
- **Fill in:** §5 row "Phase 4 flag: `OFFER_PROMOTIONS_ENABLED`".

## §14 Flag `WORK_PACKS_ENABLED` (work packs)

- **Needs:** **DEC-04** (up to three model calls); DEC-14 safe default. **Cost:** up to three model calls.
- **Preconditions:** §2 shows journal row 12 on production; a test workspace with one location selected.
- **Steps:**
  1. Vercel → `WORK_PACKS_ENABLED` = exactly `true` → redeploy → note the deployment ID.
  2. Home → read the pack notice (up to 3 drafts; nothing counted until export) → **Start the pack**.
  3. Watch the items draft one by one. An item that needs facts shows "needs your facts".
  4. **Review next** → approve and export one draft on its action page (usage +1).
  5. Press **Start the pack** again (or reload Home): it must return the same pack, not a new one.
  6. **Rollback test:** unset the flag → redeploy → Home shows the earlier card; the actions remain.
- **Evidence:** deployment IDs; pack ID; item action IDs; version and delivery IDs; usage before/after. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT p.id AS pack_id, p.closed_at, i.position, i.template_key, i.action_id
    FROM public.work_packs p JOIN public.work_pack_items i ON i.pack_id = p.id
   WHERE p.workspace_id = '<workspace id>' ORDER BY p.created_at DESC, i.position;
  ROLLBACK;
  ```

- **Pass:** one pack with three items, step 5 returns the same pack ID, one counted delivery. **Fail:** a second open pack, an item drafted twice, or an approve control on the pack card.
- **Fill in:** §5 row "Phase 4 flag: `WORK_PACKS_ENABLED`".

## §15 Flag `PREVIEW_DRAFT_ENABLED` (preview draft)

- **Needs:** DEC-12 (decided 2026-10-04) **and first a DEC-04 real-model check**: an authorized evaluation of how often the model returns `facts_needed` for a pasted review, and confirmation that the AI gateway reports token usage (otherwise each preview is charged a conservative estimate). Run it with `corepack pnpm eval:workflows` under its own DEC-04 budget; it refuses without explicit enablement. **Cost:** capped by `PREVIEW_DRAFT_USD_DAILY` (default US$2 per rolling 24 h) and 50 previews per day.
- **Preconditions:** the DEC-04 check recorded as passed; §2 shows journal row 13; a test report you can unlock in a private window.
- **Steps:**
  1. Vercel → `PREVIEW_DRAFT_ENABLED` = exactly `true` (leave the two limit variables unset to use the defaults) → redeploy → note the deployment ID.
  2. Private window, signed out → unlock the test report → find **Try one AI reply draft (not saved)** → open it.
  3. Paste one invented test review (not a real customer's) → submit.
  4. Confirm the draft shows the badge 「未認領草稿 · 未儲存」 (or its English/zh-TW equivalent), a Copy button and a claim link, and no save, approve or export control.
  5. Submit again: it must refuse as already used.
  6. Open `/en/start/<slug>` in another private window that has **not** unlocked the report: it must answer 404.
  7. Run metrics query 1 from [`PREVIEW-METRICS.md`](PREVIEW-METRICS.md) (read-only).
  8. **Rollback test:** unset the flag → redeploy → the card is gone and `/start` answers 404.
- **Evidence:** deployment IDs; job ID; `preview_events` row IDs and outcomes; time. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, outcome, reason, cost_usd, created_at FROM public.preview_events
   WHERE job_id = '<job id>' ORDER BY created_at;
  ROLLBACK;
  ```

- **Pass:** one `generated` row and one `refused` (`already_used`) row; no new action, version or delivery; steps 4, 6 and 8 as described. **Fail:** a stored draft, an approve or export control, access without the viewer grant, or a cost above the cap.
- **Fill in:** §5 row "Phase 4 flag: `PREVIEW_DRAFT_ENABLED`" (and the "Conditional preview/connector acceptance" row's preview half).

## §16 R3 usable live scans (HK, then TW)

- **Needs:** **DEC-04**: named HK and TW businesses, provider limits and a money ceiling with a stop condition. **Cost:** live provider calls (SerpApi, Google Places, RapidAPI Instagram) for each scan; no per-scan price is recorded in this repository, so set the ceiling before starting. The code's own budget defaults (200 scan attempts per 24 h) are placeholders, not your ceiling.
- **Preconditions:** DEC-04 recorded; `SCANS_PAUSED` absent (§1); `SCAN_SOURCES` noted in §1.
- **Steps (repeat for HK and TW):**
  1. Open `/zh-HK/scan` (TW: `/zh-TW/scan`). Search the named business and pick its listing.
  2. Fill industry, district and goal; tick consent; start. Note the start time and the scan reference shown (`SCAN-` plus six characters).
  3. Stay on the scanning page until it says the report is ready (a scan can take 5–13 minutes), or until the page stops waiting.
  4. Open the report. Note the overall score (or "score withheld"), coverage and which sources were measured.
- **Evidence:** job ID, start and finish times, terminal status, coverage, per-module states. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, region, status, processing_stage, score_coverage, attempt_count,
         created_at, completed_at,
         jsonb_object_keys(module_results) AS module
    FROM public.audit_jobs WHERE id = '<job id>';
  ROLLBACK;
  ```

  Read each module's state on the report page rather than copying `module_results` (it may contain business data).
- **Pass:** status `done` or `partial`, a report that opens, coverage and module states that match the report, elapsed time recorded. **Fail:** `failed`, a scan stuck past 30 minutes, or a module shown as measured that the report says is unavailable.
- **Fill in:** §5 rows "R3 HK usable live scan" and "R3 TW usable live scan".

## §17 R11 successful comparable pair

- **Needs:** **DEC-04** for a second scan of the same place. **Cost:** one more live scan.
- **Preconditions:** a claimed test workspace whose first scan (§16) is `done` or `partial`; you are its owner. **Rescan is paid-tier only**: on a lite workspace it answers 403 `tier_required` (`app/api/workspaces/[workspaceId]/rescan/route.ts`). Billing is closed, so a paid test workspace may need §19 first; if none is possible, record R11 as `blocked` with that reason.
- **Steps:**
  1. Workspace → the rescan control for that location (labelled "Rescan now" in the design) (the rescan route is rate-limited to 3 per day per workspace).
  2. Wait for completion as in §16.
  3. Open the new report while signed in as the owner. Confirm the comparison section shows a change since the earlier scan, or an honest reason why the two are not comparable.
  4. In a signed-out private window, open the same report link: the earlier scan's evidence must not be shown.
- **Evidence:** both job IDs; the `scan_diffs` row; time. Query:

  ```sql
  BEGIN TRANSACTION READ ONLY;
  SET LOCAL ROLE smeassistant_migrator;
  SELECT id, base_job_id, head_job_id, comparable, incomparable_reason,
         composite_withheld_reason, composite_delta, created_at
    FROM public.scan_diffs WHERE head_job_id = '<second job id>';
  ROLLBACK;
  ```

- **Pass:** one `scan_diffs` row with `comparable = true`, the member view shows the comparison, and the signed-out view hides the earlier evidence. If `comparable = false`, record the reason; that is an honest result but **not** a pass for R11. **Fail:** no row, a comparison drawn across a reason, or earlier evidence visible signed out.
- **Fill in:** §5 row "R11 successful comparable pair".

## §18 Phase 3 scheduled and resumed work

- **Needs:** **DEC-10** (scheduler identity, frequency, budget, pause policy). **Cost:** any scans the scheduler resumes or starts. Monthly schedules exist only for paid workspaces, and billing is closed until §19, so a scheduled rescan may not be possible yet; the cron tick itself still runs.
- **Preconditions:** DEC-10 recorded; `CRON_SECRET` present (it is, per §1; do not view it).
- **Steps:**
  1. Vercel → project → Cron Jobs (or Logs filtered to `/api/cron/dispatch`). Confirm invocations every 5 minutes return **200** over at least 30 minutes.
  2. Run the read-only incident queries `scan_backlog`, `schedule_states` and `dead_lettered_scans` from [`rollout/incident-queries.sql`](rollout/incident-queries.sql), each wrapped in the read-only template.
  3. If a scan from §16 or §17 was interrupted and later finished, record its `attempt_count` (from the §16 query): a value above 1 that reached `done` or `partial` is resumed work.
- **Evidence:** time window; count of 200 responses; any non-200 status codes; job IDs with `attempt_count > 1`.
- **Pass:** steady 200 responses and no job stuck in a non-terminal state past its 3 attempts. **Fail:** 401 or 405 responses, missing invocations, or a stuck job not dead-lettered.
- **Fill in:** §5 row "Phase 3 actual scheduled/resumed work".

## §19 R8 authorized Stripe test transitions

- **Needs:** **DEC-08** (commercial matrix) and **DEC-09** (Stripe test-mode target, permitted events, no live charges). **Cost:** none in test mode.
- **Preconditions:** DEC-09 names the target. Billing opens only with `COMMERCIAL_CONTRACT_APPROVED` = exactly `2026-09-baseline` plus a full Stripe configuration (`PHASE-3-REPORT.md` P3.3). Putting **test-mode** keys on the production deployment affects every visitor's checkout, so DEC-09 must say whether that is acceptable or name another target.
- **Steps:**
  1. Set the approved variables on the DEC-09 target → redeploy → note the deployment ID.
  2. As a test owner: Settings → Billing → **Subscribe** → pay with a Stripe test card in Stripe's own page.
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
