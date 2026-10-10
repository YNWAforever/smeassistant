# Invitation Mail and Report Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 backlog items 29 (invitation email + 14-day expiry) and 30 (single-use report recovery link) behind default-off flags, sending only through the existing mail transport and ledger.

**Architecture:** A shared gate (`sendGated`) applies mail availability and the recipient allowlist before the existing transport. Invitations send inline from the invite and a new resend route; expiry is one SQL fragment added to three membership queries, enforced only while the flag is on. Recovery adds a request route, a no-op-on-load page, and a single-use redeem route that mints a fresh 30-day viewer grant for the same job.

**Tech Stack:** Next.js 16 route handlers, TypeScript strict, `pg` via `getPool()` / `withTransaction`, Vitest (unit, jsdom components, Docker-Postgres integration).

**Spec:** `docs/superpowers/specs/2026-10-05-invitation-and-recovery-mail-design.md` (decisions D1–D4). Base for this plan: `main` at `63ad882`.

## Global Constraints

- No migration. `report_access_grants.purpose` has no CHECK; `audit_events` has no event CHECK.
- Flags are on only when the value is exactly `"true"`: `INVITATION_MAIL_ENABLED`, `REPORT_RECOVERY_ENABLED`.
- `MAIL_TEMPLATES_VERSION = "2026-10-mail-v2"`; the old `2026-09-event-mail-v1` must read as `mail_unapproved`.
- Invitation TTL `14` days from `invited_at`, enforced only while `INVITATION_MAIL_ENABLED` is on. Resend sets `invited_at = now()`.
- Recovery link: 60 minutes, single use; redeem mints a 30-day `viewer_report` grant for the same job; earlier grants untouched.
- Rate limits: recover 1 per 10 min per `email+slug` and 20 per hour per IP; resend 3 per member per day; redeem per IP. All fail-closed.
- Logs carry `{ category }` and ids only — never an email, token, mail body or provider response.
- Copy in en, zh-HK (香港書面中文), zh-TW (台灣用語); new strings live with their component or in `lib/mail/templates.ts`.
- Tests never call a real provider; the transport is always a fake.
- With both flags off, every existing page and response is byte-for-byte as on `main`.

## Review Focus

- **Email case and whitespace** — `" Owner@Example.com "` on recover must match a grant stored as `owner@example.com`; the allowlist check must be case-insensitive. Tests in Task 7 (repository) and Task 1 (`sendGated`).
- **Redeem never trusts the client's slug** — `reportUrl` is built from the job's `share_slug` read in the redeem transaction, so a token for job A cannot become a cookie shown on job B. Test in Task 8.
- **Resend racing acceptance** — a member who accepts between page load and click: `UPDATE … WHERE accepted_at IS NULL` returns no row → 404, nothing sent. Test in Task 5.
- **Flag on, mail closed** — invite still returns 201 with `invitation.status = "not_configured"`; the team page says "email isn't set up yet"; recovery stays hidden because `recoveryAvailable` also requires open mail. Tests in Tasks 5, 6, 9.
- **Bad locale input** — invite/resend fall back to `zh-HK`; recover answers 400 for an unknown locale before touching limits or the database. Tests in Tasks 5 and 8.

---

### Task 1: Mail gate, flags and template version

**Files:**
- Modify: `lib/mail/availability.ts` (`MAIL_TEMPLATES_VERSION`)
- Create: `lib/mail/feature-flags.ts`, `lib/mail/send-gated.ts`
- Test: `lib/mail/availability.test.ts`, `lib/mail/feature-flags.test.ts`, `lib/mail/send-gated.test.ts`

**Interfaces:**
- Produces: `invitationMailEnabled(env?: Record<string,string|undefined>): boolean`, `reportRecoveryEnabled(env?): boolean`, `recoveryAvailable(env?): boolean` (= `reportRecoveryEnabled && mailAvailability(env).open`).
- Produces: `sendGated({ transport, env, message }: { transport: MailTransport; env: Record<string,string|undefined>; message: MailMessage }): Promise<MailSendResult>`.

- [ ] **Step 1: Write failing tests**
  - `availability.test.ts`: `it("treats the previous template version as unapproved")` — `mailAvailability({ ...openEnv, APPLICATION_MAIL_APPROVED: "2026-09-event-mail-v1" })` → `{ open:false, reason:"mail_unapproved" }`; and `expect(MAIL_TEMPLATES_VERSION).toBe("2026-10-mail-v2")`.
  - `feature-flags.test.ts`: each flag is true only for `"true"`; false for `undefined`, `""`, `"TRUE"`, `"1"`, `" true"`. `recoveryAvailable` is false when the flag is on but `APPLICATION_MAIL_APPROVED` is unset.
  - `send-gated.test.ts` with a `vi.fn()` transport:
    - mail closed → `{ status:"not_configured", error:"mail_closed" }`, transport not called;
    - `MAIL_RECIPIENT_ALLOWLIST="a@x.test"`, `to:"B@x.test"` → `{ status:"not_configured", error:"not_allowlisted" }`, transport not called;
    - `to:" A@X.test "` with that allowlist → transport called once;
    - transport throws → `{ status:"failed", error:"transport_threw" }`, and no `console.error` argument contains the address.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail/availability.test.ts lib/mail/feature-flags.test.ts lib/mail/send-gated.test.ts` — expect FAIL (missing modules / old version).
- [ ] **Step 3: Implement.** Bump the constant. `sendGated` uses `mailAvailability(env)` and `parseRecipientAllowlist(env.MAIL_RECIPIENT_ALLOWLIST)` (compare the trimmed, lower-cased `to`), then `transport.send(message)` in a try/catch that logs `{ category: "mail_transport_threw" }`.
- [ ] **Step 4: Run** the same command — PASS; then `corepack pnpm exec vitest run lib/mail` — PASS.
- [ ] **Step 5: Commit** `feat(mail): template v2, feature flags and a shared send gate`.

### Task 2: Invitation and recovery templates

**Files:**
- Modify: `lib/mail/templates.ts`
- Test: `lib/mail/templates.test.ts`

**Interfaces:**
- Produces: `renderInvitationMail(locale: Locale, input: { workspaceName: string; role: "manager" | "viewer"; signInUrl: string }): RenderedMail` and `renderRecoveryMail(locale: Locale, input: { businessName: string; recoverUrl: string }): RenderedMail`, reusing `fillTemplate` (URL values rendered as anchors in `html`, all values escaped).

- [ ] **Step 1: Failing tests** for `en`, `zh-HK`, `zh-TW`:
  - invitation subject/text contain the workspace name and the sign-in URL; `html` escapes `<b>` in a workspace name; with the URL removed, the text has no `/[A-Za-z0-9_-]{32,}/` run;
  - recovery text contains the business name and the recover URL, and states single use and 60 minutes (en: `once` and `60 minutes`; zh-HK/zh-TW: `一次` and `60 分鐘`).
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail/templates.test.ts` — FAIL.
- [ ] **Step 3: Implement** with this exact copy (markers `{workspace}`, `{role}`, `{signInUrl}`, `{business}`, `{recoverUrl}`):
  - Invitation en — subject `You're invited to {workspace}`; body `You've been invited to join {workspace} as {role}. Sign in with this email address to accept: {signInUrl}`; footer `If you weren't expecting this, you can ignore this email.`
  - Invitation zh-HK — `你獲邀加入 {workspace}` / `你獲邀以{role}身份加入 {workspace}。請用此電郵地址登入以接受邀請：{signInUrl}` / `如你沒有預期收到此邀請，可略過此電郵。`
  - Invitation zh-TW — `你受邀加入 {workspace}` / `你受邀以{role}身分加入 {workspace}。請用這個電子郵件地址登入以接受邀請：{signInUrl}` / `如果你沒有預期收到這封邀請，可以忽略此信。`
  - Role words: en `manager` / `viewer`; zh-HK and zh-TW `經理` / `檢視者`.
  - Recovery en — `Your link to the {business} report` / `Open your report again: {recoverUrl} — this link works once and expires in 60 minutes.` / `If you didn't ask for this, ignore this email; nothing changes.`
  - Recovery zh-HK — `{business} 報告的連結` / `重新開啟你的報告：{recoverUrl}。連結只可使用一次，60 分鐘內有效。` / `如你沒有提出此要求，請略過此電郵，一切不會改變。`
  - Recovery zh-TW — `{business} 報告的連結` / `重新開啟你的報告：{recoverUrl}。連結只能使用一次，60 分鐘內有效。` / `如果你沒有提出這個要求，請忽略此信，一切不會改變。`
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(mail): invitation and recovery templates`.

### Task 3: `sendInvitation`

**Files:**
- Create: `lib/mail/invitation.ts`
- Test: `lib/mail/invitation.test.ts`

**Interfaces:**
- Consumes: `sendGated` (Task 1), `renderInvitationMail` (Task 2), `findMailAttempt` / `recordMailAttempt` (`lib/mail/ledger.ts`).
- Produces: `invitationDedupeKey(memberId: string, invitedAt: string): string` → `` `invite:${memberId}:${Date.parse(invitedAt)}` ``; `sendInvitation(input: { db: Pick<Pool,"query">; transport: MailTransport; env: Record<string,string|undefined>; member: { id: string; email: string; role: "manager"|"viewer"; invitedAt: string }; workspaceId: string; workspaceName: string; locale: Locale; origin: string }): Promise<{ status: MailSendStatus }>`.

- [ ] **Step 1: Failing tests** with a fake `db.query` and fake transport:
  - an existing attempt (`status:"accepted_by_provider"`) → returns it, transport not called, no insert;
  - first send: transport called once with `to: member.email`, `dedupeKey === invitationDedupeKey(...)`, text containing `${origin}/${locale}/owner/sign-in?method=email`; ledger insert with `entityType:"workspace_member"`, `entityId: member.id`, `workspaceId`;
  - transport throws → `{ status:"failed" }`;
  - ledger insert rejects → still returns the send status; logs only `{ category: "mail_ledger_failed" }`.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail/invitation.test.ts` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(mail): sendInvitation with ledger dedupe`.

### Task 4: Invitation expiry and membership queries

**Files:**
- Create: `lib/workspace/invitation-expiry.ts`
- Modify: `lib/repositories/membership.ts` (`bindPending`, `hasPendingInvitation`, `hasSignInMembership`; two new methods)
- Test: `lib/workspace/invitation-expiry.test.ts`, `test/integration/neon-invitation-expiry.integration.test.ts`

**Interfaces:**
- Produces: `INVITATION_TTL_DAYS = 14`; `pendingInvitationLiveSql(alias: string, enforce: boolean): string` (`"TRUE"`, or `` `${alias}.invited_at > now() - interval '14 days'` ``; throws unless `alias` matches `/^[a-z_]+$/`).
- Produces on `membershipRepository`:
  - `invitationContext(memberId: string): Promise<{ email: string; role: "manager"|"viewer"; invitedAt: string; workspaceName: string } | null>` (pending members only);
  - `refreshInvitation(workspaceId: string, memberId: string): Promise<same | null>` — `UPDATE workspace_members SET invited_at = now() WHERE id=$2 AND workspace_id=$1 AND accepted_at IS NULL RETURNING …`, joined to `workspaces.business_name`.
- The three existing queries add `AND ${pendingInvitationLiveSql("<alias>", invitationMailEnabled())}` to their pending branch only.

- [ ] **Step 1: Failing tests.** Unit: the fragment for enforce false/true; alias rejection. Integration (`INVITATION_MAIL_ENABLED` set per test): a 15-day-old invite — flag on: `hasPendingInvitation` false, `hasSignInMembership` false, `bindPending` binds nothing; flag off: all three behave as today; a 13-day-old invite binds with the flag on; an accepted member is unaffected either way; `refreshInvitation` on an accepted member returns `null`. Ledger across a resend: `recordMailAttempt` twice with `invitationDedupeKey(id, invitedAt)` records once; after `refreshInvitation` the new `invitedAt` gives a different key that records again.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/workspace/invitation-expiry.test.ts` and `corepack pnpm test:integration -- neon-invitation-expiry` — FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** both — PASS; then `corepack pnpm exec vitest run lib/repositories app/api/workspace-invites` — PASS. **Step 5: Commit** `feat(workspace): 14-day invitation expiry behind the invitation flag`.

### Task 5: Invite sends, resend route, audit event

**Files:**
- Modify: `app/api/workspaces/[workspaceId]/members/route.ts` (POST, after the `member.invited` audit)
- Create: `app/api/workspaces/[workspaceId]/members/[memberId]/resend/route.ts`
- Modify: `lib/security/rate-limit.ts` (scope `invitation_resend: { limit: 3, windowSeconds: 24 * 60 * 60 }`, in `RateLimitScope` and `CompositeIdentifierScope`)
- Modify: `lib/workspace/audit.ts` (`AUDIT_EVENTS` + `"member.invitation_resent"`), `lib/workspace/audit-labels.ts` (en `Invitation resent`, zh `已重新發送邀請`)
- Test: `app/api/workspaces/[workspaceId]/members/route.test.ts`, `app/api/workspaces/[workspaceId]/members/[memberId]/resend/route.test.ts`

**Interfaces:**
- Consumes: `invitationMailEnabled`, `sendInvitation`, `createMailTransport()`, `membershipRepository.invitationContext` / `refreshInvitation`, `authorizeWorkspaceRequest({ id }, { minRole: "owner" })`, `enforceCompositeIdentifierRateLimit({ req, scope: "invitation_resend", identifier: memberId, failClosed: true })`.
- Produces: invite → `201 { memberId, invitation?: { status } }`; resend → `200 { invitation: { status }, invitedAt }` | `404 { error: "not_enabled" }` | `404 { error: "not_found" }` | 401 | 403 | 429 | 503.
- Locale: `body.locale` when it is `en | zh-HK | zh-TW`, else `"zh-HK"`. Origin: `process.env.APP_ORIGIN`.

- [ ] **Step 1: Failing tests.**
  - Invite: flag off → body exactly `{ memberId }`, `sendInvitation` not called; flag on → `invitation.status` echoes the mocked send; `sendInvitation` throwing → still 201 with `invitation: { status: "failed" }`; unknown locale → called with `"zh-HK"`.
  - Resend: flag off → 404 `not_enabled` before auth is called; manager → 403; `refreshInvitation` → `null` gives 404 `not_found` and no send; limiter denies → 429 and no `refreshInvitation`; success → 200 with `invitedAt` from the refresh and an audit insert `member.invitation_resent` with payload `{ locale }`; a `console.error` spy over all cases never sees the member email.
  - `lib/workspace/audit.test.ts` still passes (every event labelled).
- [ ] **Step 2: Run** both route suites and `lib/workspace/audit.test.ts` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(team): email invitations and an owner resend route`.

### Task 6: Team page statuses and Resend button

**Files:**
- Modify: `lib/workspace/team.ts` (`TeamMember` gains `invitation?: { status: MailSendStatus; error: string | null } | null` and `expired?: boolean`; `getTeam` fills them only when `invitationMailEnabled()`)
- Modify: `components/workspace/team-view.tsx` (status line on pending rows; new prop `invitationMail: boolean`), `app/[locale]/owner/[workspaceSlug]/settings/team/team-client.tsx` (`ResendInvitationButton` posting to the Task 5 route, then `router.refresh()`), `app/[locale]/owner/[workspaceSlug]/settings/team/page.tsx` (passes `invitationMail`)
- Test: `components/workspace/team-view.test.tsx` (new), `lib/workspace/team.test.ts`

**Interfaces:**
- Consumes: `findMailAttempt(db, invitationDedupeKey(member.id, member.invitedAt))`, `INVITATION_TTL_DAYS`.
- Status copy (en / zh-HK / zh-TW):
  - `accepted_by_provider` → "Invitation emailed" / 「已發出邀請電郵」/「已寄出邀請信」
  - `not_configured` + `mail_closed` → "Email not sent: email isn't set up yet" / 「未發出電郵：電郵功能尚未設定」/「未寄出：電子郵件功能尚未設定」
  - `not_configured` + `not_allowlisted` → "Email not sent: recipient isn't on the test list" / 「未發出電郵：收件人不在測試名單」/「未寄出：收件人不在測試名單」
  - `failed` → "Email failed" / 「電郵發送失敗」/「寄送失敗」
  - expired → "Expired" / 「已過期」/「已過期」
  - button → "Resend invitation" / 「重新發送邀請」/「重新寄送邀請」

- [ ] **Step 1: Failing tests.** With `invitationMail={false}`, `container.innerHTML` equals the render of the same model with no `invitation`/`expired` fields, and there is no Resend button. With it on: each status renders its exact string in en and zh-HK; Resend shows for the owner only and never for an accepted member. `getTeam` marks a 15-day-old pending invite `expired: true` and reads the attempt by the current `invited_at` key.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `corepack pnpm exec vitest run components/workspace lib/workspace/team.test.ts "app/[locale]/owner/[workspaceSlug]/settings/team"` — PASS. **Step 5: Commit** `feat(team): show invitation delivery status and resend`.

### Task 7: Recovery repository and viewer-grant hardening

**Files:**
- Create: `lib/repositories/report-recovery.ts`
- Modify: `lib/repositories/reports.ts` (`findViewerGrant` adds `AND purpose <> 'report_recovery'`)
- Test: `test/integration/neon-report-recovery.integration.test.ts`

**Interfaces:**
- Produces `reportRecoveryRepository`:
  - `findRecipientGrant(slug: string, email: string): Promise<{ jobId: string; workspaceId: string | null; businessName: string } | null>` — job by `share_slug`, plus an existing grant with `purpose='viewer_report'`, `revoked_at IS NULL`, `lower(email_normalized) = lower(trim($2))` (expired allowed).
  - `insertRecoveryGrant(jobId: string, tokenHash: string): Promise<{ grantId: string }>` — `purpose='report_recovery'`, `idempotency_key = createIdempotencyKey()`, `expires_at = now() + interval '60 minutes'`, `email_normalized = NULL`, `lead_id = NULL`.
  - `redeemRecoveryGrant(tokenHash: string, viewer: { tokenHash: string; idempotencyKey: string }): Promise<{ grantId: string; jobId: string; slug: string } | null>` — in `withTransaction`: the spec's `UPDATE … RETURNING id, job_id`; then insert a `viewer_report` grant (30 days, `email_normalized` NULL) and read `audit_jobs.share_slug`; returns the new grant id.

- [ ] **Step 1: Failing integration tests** (seed a job and a `viewer_report` grant for `owner@example.com`):
  - `findRecipientGrant(slug, " Owner@Example.com ")` matches; revoked grant or other email → null; an expired viewer grant still matches;
  - the recovery row has `email_normalized IS NULL`, and `claimsRepository.isLeadRecipient(slug, "owner@example.com")` is the same before and after;
  - `redeemRecoveryGrant` once → a grant that `reportsRepository().findViewerGrant(jobId, newGrantId)` returns; second call → null; expired recovery row → null; two concurrent calls → exactly one non-null;
  - `findViewerGrant(jobId, recoveryGrantId)` → null.
- [ ] **Step 2: Run** `corepack pnpm test:integration -- neon-report-recovery` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; then `corepack pnpm test:integration -- neon-report` — PASS. **Step 5: Commit** `feat(report-access): recovery grant repository; recovery rows never act as viewer cookies`.

### Task 8: Recover and redeem routes

**Files:**
- Create: `app/api/report-access/recover/route.ts`, `app/api/report-access/redeem/route.ts`
- Modify: `lib/security/rate-limit.ts` (`report_recovery` becomes `{ limit: 1, windowSeconds: 600 }` — no other caller uses it on `main`; add `report_recovery_ip: { limit: 20, windowSeconds: 3600 }` and `report_redeem: { limit: 30, windowSeconds: 3600 }`)
- Modify: `lib/workspace/audit.ts` + `lib/workspace/audit-labels.ts` (`report.recovery_requested` "Report link requested" / 「已要求報告連結」; `report.recovery_redeemed` "Report link used" / 「已使用報告連結」)
- Test: `app/api/report-access/recover/route.test.ts`, `app/api/report-access/redeem/route.test.ts`

**Interfaces:**
- Consumes: `recoveryAvailable`, `reportRecoveryRepository` (Task 7), `createViewerToken()`, `createIdempotencyKey()`, `sendGated`, `renderRecoveryMail`, `recordMailAttempt` (key `recovery:<grantId>`, `entityType: "report_access_grant"`), `setViewerGrantCookie`, `parseReportSlug`, `recordClaimAuditEvent`.
- Recover: body `{ slug, email, locale }`; 400 for a bad slug, an email without `@` or longer than 254, or a locale outside `en|zh-HK|zh-TW`; then `enforceRateLimit({ req, scope: "report_recovery_ip", failClosed: true })` and `enforceCompositeIdentifierRateLimit({ req, scope: "report_recovery", identifier: `${email}|${slug}`, failClosed: true })`; then always `200 { ok: true }`. Link: `` `${APP_ORIGIN}/${locale}/r/${slug}/recover?t=${rawToken}` ``. Audit `report.recovery_requested` with `{ matched, locale }`, `workspace_id` from the match or null.
- Redeem: body `{ token, locale }`; per-IP `report_redeem`; `410 { error: "link_expired" }` for any non-redeemable token; else `200 { reportUrl: `/${locale}/r/${slug}` }` with `setViewerGrantCookie(response, grantId, rawViewerToken)`; audit `report.recovery_redeemed` with `{ job_id }`.
- Both routes answer `404 { error: "not_enabled" }` first when `!recoveryAvailable()`.

- [ ] **Step 1: Failing tests** (repository, transport and limiters mocked):
  - both routes 404 when the flag is off, and when the flag is on but mail is closed;
  - recover: match and non-match give identical status and body; on a match one recovery row is inserted and `sendGated` called once with a link containing `/r/<slug>/recover?t=`; a provider failure still gives `200 {ok:true}`; 429 when either limiter denies; 400 for `locale:"fr"` with no limiter call; the audit payload is `{ matched, locale }`;
  - redeem: unknown / used / expired → 410 `link_expired` and no `Set-Cookie`; success → `Set-Cookie: sme_report_grant=…` and `reportUrl` built from the repository's `slug`, not the request; a `console.error` spy across both suites never contains the email or the token.
- [ ] **Step 2: Run** both suites — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, plus `lib/workspace/audit.test.ts`. **Step 5: Commit** `feat(report-access): recover and redeem routes`.

### Task 9: Recovery page and entry points

**Files:**
- Create: `app/[locale]/r/[slug]/recover/page.tsx` (server: `notFound()` unless `recoveryAvailable()`; metadata `robots: { index: false, follow: false }`), `components/report/recover-redeem.tsx` (client: "Open my report" posts `{ token, locale }` with the token from `useSearchParams().get("t")`, then `router.replace(reportUrl)`; on 410 shows the expired message), `components/report/recovery-form.tsx` (client: email field and submit to `/api/report-access/recover`)
- Modify: `lib/funnel/report-props.ts` (`recoveryAvailable?: boolean`), `app/[locale]/r/[slug]/page.tsx` (sets it from `recoveryAvailable()` for the public view only), `components/report-view.tsx` (renders `RecoveryForm` inside the locked `unlock-banner` section when `recoveryAvailable`), `components/unlock-page.tsx` + `app/[locale]/unlock/[slug]/page.tsx` (same prop and form)
- Test: `components/report/recovery-form.test.tsx`, `components/report/recover-redeem.test.tsx`, `components/report-view.test.tsx`, `components/unlock-page.test.tsx`

**Interfaces:**
- Produces: `RecoveryForm({ locale, slug }: { locale: PrototypeLocale; slug: string })`, `RecoverRedeem({ locale }: { locale: PrototypeLocale })`.
- Copy (en / zh-HK / zh-TW):
  - heading "Already unlocked this report? Email me a new link" / 「已解鎖這份報告？以電郵傳送新連結」/「已解鎖這份報告？用電子郵件寄送新連結」
  - after submit (always) "If that address unlocked this report, a link is on its way. It works once, for 60 minutes." / 「如該地址曾解鎖此報告，連結已在途中。連結只可使用一次，60 分鐘內有效。」/「如果該地址曾解鎖這份報告，連結已寄出。連結只能使用一次，60 分鐘內有效。」
  - button "Open my report" / 「開啟我的報告」/「開啟我的報告」
  - expired "This link has expired or was already used." / 「此連結已過期或已使用。」/「這個連結已過期或已使用。」

- [ ] **Step 1: Failing tests.** The form is absent from the locked report and the unlock page when `recoveryAvailable` is false or undefined (existing markup unchanged); present when true; after submit it shows the fixed message whether the fetch returned 200 or rejected. `RecoverRedeem` makes no request on mount (the `fetch` mock is not called until the button is clicked), posts the token on click, and shows the expired message on 410.
- [ ] **Step 2: Run** the four suites — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS. **Step 5: Commit** `feat(report): recovery entry points and redeem page`.

### Task 10: Docs, env and full gates

**Files:**
- Modify: `.env.example` (`INVITATION_MAIL_ENABLED=false`; `REPORT_RECOVERY_ENABLED=false` with an accurate comment; template version `2026-10-mail-v2`), `docs/implementation/owner-platform-v1/PHASE-2-BACKLOG.md` (items 29–30: built, default off, with commits), `docs/implementation/owner-platform-v1/PHASE-2-TEST-RESULTS.md` (this slice's gates), `docs/integration/DEPLOY.md` (new section: turn on = DEC-07 values + `APPLICATION_MAIL_APPROVED=2026-10-mail-v2`, then the two flags; rollback = unset the flags), `docs/implementation/owner-platform-v1/HOSTED-ACCEPTANCE-CHECKLIST.md` (template version in mail steps; new invitations/recovery section), `docs/implementation/owner-platform-v1/BUSINESS-AND-HOSTED-DECISIONS.md` (DEC-07: what turning it on now enables), `docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md`.

- [ ] **Step 1: Run the gates sequentially:** `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm test:integration`, `corepack pnpm build`, `corepack pnpm test:secret-boundary`. Expected: all pass. The Windows full-suite timeouts in `scan-claim-single-path` / `scan-events-single-writer` are pre-existing; rerun those files alone and record both results.
- [ ] **Step 2: Update the docs above** with the commit SHAs and gate results.
- [ ] **Step 3: Commit** `docs: invitation mail and report recovery built, default off`.
