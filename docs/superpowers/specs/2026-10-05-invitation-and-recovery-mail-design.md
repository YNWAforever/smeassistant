# Invitation mail and report recovery — design

**Date:** 2026-10-05 · **Base:** `main` at `3558697` · **Scope:** Phase 2 backlog items 29 (invitation delivery and expiry) and 30 (report recovery), the last unbuilt master-plan scope. Both are blocked on DEC-07 (the application-email channel) for *sending*, so they are built behind default-off flags. Nothing is sent until the owner records DEC-07.

## Decisions (user, 2026-10-05)

| # | Question | Decision |
|---|---|---|
| D1 | Invitation expiry | **14 days from `invited_at`**, derived (no migration). It is enforced **only while `INVITATION_MAIL_ENABLED` is on**, so pending invites in production keep binding as today until the feature is turned on. Resend refreshes `invited_at`. |
| D2 | Recovery link | **60 minutes, single use.** Redeeming mints a **fresh 30-day viewer grant** for that one job. Earlier grants stay valid. Limits: one request per email per job every 10 minutes, plus a per-IP cap. |
| D3 | Switches | **One template approval plus one flag per feature.** `MAIL_TEMPLATES_VERSION` moves to `2026-10-mail-v2`, so `APPLICATION_MAIL_APPROVED` covers exactly the templates that can be sent. The feature flags are `INVITATION_MAIL_ENABLED` and `REPORT_RECOVERY_ENABLED`. |
| D4 | Delivery mechanism | **Inline send through the existing transport and attempt ledger** (Approach 1). The outbox is not used: it is scan-specific (`job_id NOT NULL`) and is only drained by the cron tick, which DEC-10 removed. |

## Purpose and success

- Owners who invite a member today have to notify them out of band. With the feature on and mail open, the invitee receives an email and the owner sees what actually happened to it.
- A visitor who unlocked a report and lost the cookie can get back in through a link sent to the address recorded at unlock. That access is never wider than one job's viewer access.
- **Success with mail closed:** every surface states honestly that nothing was sent, and nothing is offered that cannot be delivered.
- **Success with mail open:** one invitation per invite or resend, one recovery mail per allowed request, no duplicate sends on retry, and no response that reveals whether an address exists.

## Existing pieces reused

- `lib/mail/transport.ts`: `createMailTransport()` returns `not_configured | accepted_by_provider | failed` (with the Resend driver's 10 s timeout).
- `lib/mail/ledger.ts`: `recordMailAttempt` / `findMailAttempt`, exactly once per dedupe key on `audit_events.idempotency_key`.
- `lib/mail/availability.ts`: `mailAvailability()` and `MAIL_RECIPIENT_ALLOWLIST`.
- `workspace_members.invited_at`; the invitee sign-in route `POST /api/workspace-invites/magic-link`; `membershipRepository.bindPending`, `hasPendingInvitation` and `hasSignInMembership`.
- `report_access_grants` (`purpose`, `email_normalized`, `expires_at`, `redeemed_at`, `revoked_at`; no CHECK on `purpose`); `lib/report-access/token.ts`; `setViewerGrantCookie`.
- The rate limiters in `lib/security/rate-limit.ts`.

**There is no migration.**

## 1. Shared mail pieces

- `lib/mail/availability.ts`: `MAIL_TEMPLATES_VERSION = "2026-10-mail-v2"`. The old value `2026-09-event-mail-v1` now reads as `mail_unapproved` (with the existing mismatch warning). Application mail is unapproved on production today, so nothing that currently sends stops.
- `lib/mail/templates.ts`: two new pure renderers, `renderInvitationMail(locale, { workspaceName, role, signInUrl })` and `renderRecoveryMail(locale, { businessName, recoverUrl })`. They are trilingual (en, zh-HK 香港書面中文, zh-TW 台灣用語) and use the existing link-marker filling.
  - The invitation contains **no token** and no recipient address in any URL.
  - The recovery mail says the link works once and expires in 60 minutes.
- Flags in `lib/mail/feature-flags.ts`: `invitationMailEnabled(env)` and `reportRecoveryEnabled(env)`. Each is true only when the value is exactly `"true"`.

## 2. Invitations (item 29)

### Sending

`lib/mail/invitation.ts::sendInvitation({ db, transport, member, workspaceName, locale, origin })`:

1. Dedupe key: `invite:<memberId>:<invited_at as epoch ms>`. When `findMailAttempt` finds an attempt, it returns that attempt's status without sending.
2. Otherwise it applies the same gates that `deliver.ts` applies for scan mail, because `createMailTransport()` checks neither:
   - when `mailAvailability(env).open` is false, the outcome is `{status:"not_configured", error:"mail_closed"}` and the transport is not called;
   - when `MAIL_RECIPIENT_ALLOWLIST` is set and does not contain the recipient, the outcome is `{status:"not_configured", error:"not_allowlisted"}` and the transport is not called;
   - otherwise it renders the mail and calls `transport.send`. A throw is caught and becomes `{status:"failed", error: category}`.

   This gate step is a shared helper, `lib/mail/send-gated.ts::sendGated({ transport, env, to, message })`, and recovery uses it too.
3. It calls `recordMailAttempt` with `entityType: "workspace_member"` and `entityId: memberId`. A failed ledger write is logged with `{category}` only and does not change the outcome.
4. It returns `{ status }`.

### Routes

- `POST /api/workspaces/[workspaceId]/members` (existing): after the invite and its audit, **if `invitationMailEnabled`**, it calls `sendInvitation` with the request's `locale` (falling back to `zh-HK`). The response is `201 { memberId, invitation?: { status } }`, and `invitation` is absent when the flag is off. The invite succeeds regardless of the mail outcome.
- `POST /api/workspaces/[workspaceId]/members/[memberId]/resend` (new):
  - 404 `not_enabled` when the flag is off;
  - owner only (`authorizeWorkspaceRequest`, `minRole: "owner"`);
  - 404 when the member is not in this workspace or is not pending (`accepted_at IS NULL`);
  - rate-limited to 3 per member per day (composite identifier, fail-closed).
  - It sets `invited_at = now()` with `WHERE accepted_at IS NULL`, then calls `sendInvitation`.
  - It writes the audit event `member.invitation_resent` with `{ locale }`.
  - It returns `200 { invitation: { status }, invitedAt }`.

### Expiry

- `lib/workspace/invitation-expiry.ts` exports `INVITATION_TTL_DAYS = 14` and `pendingInvitationLiveSql(alias, enforce)`, a single SQL fragment: `TRUE` when not enforced, else `<alias>.invited_at > now() - interval '14 days'`.
- `bindPending`, `hasPendingInvitation` and the pending branch of `hasSignInMembership` include the fragment, with `enforce = invitationMailEnabled()`.
- An expired invitee neither binds nor receives a sign-in link, and the magic-link route keeps its unchanged `{ok:true}` response.
- Accepted members are unaffected.

### Team page

- `components/workspace/team-view.tsx`: for each pending member, a status derived on the server from `findMailAttempt` for the current `invited_at` key.
- The statuses are: "Invitation emailed" (`accepted_by_provider`), "Email not sent: email isn't set up yet" (`not_configured` / `mail_closed`), "Email not sent: recipient isn't on the test list" (`not_configured` / `not_allowlisted`), "Email failed" (`failed`), or no mail line when there is no attempt. When the flag is on, they also include "Expired" (`invited_at` older than 14 days).
- **Resend invitation** is shown to owners only, and only when the flag is on.
- All of this is in three locales. With the flag off, the page renders exactly as on `main`.

## 3. Report recovery (item 30)

### Gate

`recoveryAvailable(env) = reportRecoveryEnabled(env) && mailAvailability(env).open`. When it is false, both routes answer 404 `not_enabled` and no entry point renders.

### Request

`POST /api/report-access/recover` with `{ slug, email, locale }`:

- **Validation:** slug shape, email shape (≤ 254), and locale.
- **Rate limits:**
  - composite identifier `email + slug`: 1 per 10 minutes;
  - per IP: 20 per hour.
  - Both are fail-closed.
- **Response:** always `200 {ok:true}` after validation and limits, whatever happened. A provider failure gives the same response.
- **Matching** (`reportRecoveryRepository.findRecipientGrant`): the job by `share_slug`, plus an existing grant with `purpose = 'viewer_report'`, `revoked_at IS NULL` and `lower(email_normalized) = email`. An expired viewer grant still counts as proof of the address.
- **On a match**, in one statement: insert a recovery row with `purpose = 'report_recovery'`, the token hash from `createViewerToken()`, `idempotency_key` random, `expires_at = now() + 60 min` and **`email_normalized = NULL`** (so `claimsRepository.isLeadRecipient` is not widened).
- **Mail:** sent through `sendGated`, so the allowlist applies. The link is `<APP_ORIGIN>/<locale>/r/<slug>/recover?t=<rawToken>`. The ledger key is `recovery:<grantId>`.
- **Audit:** `report.recovery_requested` with `{ matched, locale }`. It never contains the email.

### Redeem

- **Page** `/[locale]/r/[slug]/recover`:
  - It renders an **"Open my report"** button and **does nothing on load**, because mail scanners prefetch GET links.
  - It is `noindex`, and the token stays client-side until the POST.
  - It answers `notFound()` when recovery is not available.
- **Route** `POST /api/report-access/redeem` with `{ token }`, in one transaction:
  1. `UPDATE report_access_grants SET redeemed_at = now() WHERE token_hash = $1 AND purpose = 'report_recovery' AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING id, job_id`.
  2. With no row, it answers `410 { error: "link_expired" }`, the same for unknown, used and expired tokens.
  3. Otherwise it inserts a new `viewer_report` grant for that `job_id` (30 days, new token, `email_normalized` NULL).
  4. It sets `sme_report_grant` with `setViewerGrantCookie` and answers `200 { reportUrl: "/<locale>/r/<slug>" }`.
  5. Audit: `report.recovery_redeemed` with `{ job_id }`.
  - It is rate-limited per IP.
- Earlier grants are untouched (D2). It never creates a membership, and never grants a different job.

### Hardening

`reportsRepository.findViewerGrant` adds `AND purpose <> 'report_recovery'`, so a recovery row can never act as a viewer cookie, even if its id became known.

### Entry points

- An "Already unlocked this report? Email me a new link" form (email field and submit) appears only when `recoveryAvailable()`.
- It shows on the report's public (locked) view and on the unlock page.
- After submit it always shows the same message: "If that address unlocked this report, a link is on its way. It works once, for 60 minutes."
- It is trilingual.

## 4. Errors and privacy

- **Logs** carry `{ category }` and ids only. They never contain an email, a token, a mail body or a provider response body. Log-spy tests on every new route enforce this.
- **Transport** throws and timeouts are recorded as `failed` with a closed category.
- **Concurrency:**
  - two redeems of one token: exactly one gets `200`;
  - two resends: each refreshes `invited_at`, and the ledger keys differ, so at most one send each. The daily limit bounds this.
- **Anti-enumeration:**
  - `recover` gives an identical status and body for match and non-match;
  - the invitee magic-link route is unchanged.

## 5. Testing

No real mail, model or paid provider is used; the transport is always a fake.

**Unit tests:**
- the expiry fragment (enforced or not, at the 14-day boundary);
- the flags (`"true"` only);
- the version bump (the old value is now closed);
- both templates in three locales (the invitation has no token-like string; the recovery mail names 60 minutes);
- `sendGated` (mail closed → `not_configured`/`mail_closed`, not on the allowlist → `not_configured`/`not_allowlisted`, neither calls the transport);
- `sendInvitation` (dedupe hit sends nothing; throw becomes failed; ledger failure is swallowed);
- the four routes:
  - flag off → 404;
  - auth and role;
  - pending-only resend;
  - rate limits;
  - mail closed vs accepted vs failed;
  - identical recover response for match and non-match;
  - `410` paths;
  - log spies.

**Integration tests (Docker Postgres):**
- `bindPending`, `hasPendingInvitation` and `hasSignInMembership`: with the flag on, a 15-day-old invite does not bind; with it off, it does;
- the ledger dedupe across a resend;
- recover → redeem → the new cookie grant authorizes the report through `findViewerGrant`;
- a recovery row is never returned by `findViewerGrant`;
- a parallel redeem has exactly one winner;
- an expired recovery row gets `410`;
- the recovery row has `email_normalized` NULL.

**Component tests:**
- the team page is unchanged with the flag off and shows the statuses and Resend with it on;
- the recovery form is hidden when unavailable and shows the fixed message after submit.

## 6. Rollout

- **No migration.** Deploying changes nothing in production until the owner acts.
- **Turning it on:**
  1. **DEC-07:** set `APPLICATION_MAIL_APPROVED=2026-10-mail-v2`, configure `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `APP_ORIGIN` and `MAIL_UNSUBSCRIBE_SECRET` (≥ 32 bytes); optionally set `MAIL_RECIPIENT_ALLOWLIST` for a first test.
  2. Set `INVITATION_MAIL_ENABLED=true` and/or `REPORT_RECOVERY_ENABLED=true`, then redeploy.
- **Rollback:** unset the flags. Expiry stops being enforced, recovery disappears, and all rows are kept.
- **Docs:**
  - `PHASE-2-BACKLOG.md` items 29–30: built, default off;
  - `PHASE-2-TEST-RESULTS.md`: this slice's gates;
  - `IMPLEMENTATION-TRACEABILITY.md`;
  - `docs/integration/DEPLOY.md`: a new section;
  - `.env.example`: the two flags and the new template version, with `REPORT_RECOVERY_ENABLED` no longer described as "read by nothing";
  - `HOSTED-ACCEPTANCE-CHECKLIST.md`: the template version in the mail steps and a new section for invitations and recovery;
  - `BUSINESS-AND-HOSTED-DECISIONS.md` DEC-07: what turning it on now enables.

## Not in scope

- WhatsApp or LINE delivery.
- A scheduler or outbox drain.
- Invitation links carrying tokens.
- Revoking other grants on recovery.
- Changing scan-mail kinds or their delivery.
- Mailing an unlock confirmation.
- Ownership transfer.
