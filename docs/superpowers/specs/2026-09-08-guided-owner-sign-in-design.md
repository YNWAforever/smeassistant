# Guided owner sign-in and callback recovery

Date: 2026-09-08
Status: Written spec approved by the user on 2026-09-08. Implementation plan prepared; not implemented.
Baseline: main at 30046da86f1c54d40fdbd6d3fff00b6decd26734 (PR #11).

## Outcome

Make owner sign-in a short, understandable journey that returns people to their original report or workspace. Diagnose and fix the reported failure after choosing a Google account; a visual refresh alone is not resolution. The user selected a guided flow and approved the start, processing, email, recovery, and no-access states.

## Evidence and limits

The deployed Google initiation endpoint returned 200 and navigated to Google's account-entry page. The user reports failure after selecting their Google account. Production logged two `Owner auth callback failed` events at 14:46:00 and 14:46:15 UTC on 2026-09-08. These establish a callback failure, not its root cause. Existing logs collapse the session exchange, identity resolution, and business lookup stages into `auth_unavailable`.

The current error landing preserves claim but drops returnTo. The full sign-in form is rendered again with generic service-unavailable text. PR #11 fixed a separate pending-invitation-only mail predicate; retain that fix and its regressions.

## User journey

One focused card occupies the main content area. Remove the large promotional/security explanation from the primary sign-in flow; retain a short privacy note and the normal public navigation. Support en, zh-HK, and zh-TW using existing locale conventions.

### Start

Title: 登入工作台 / Sign in to your workspace.
Primary action: 使用 Google 登入 / Continue with Google.
Below an or separator, show a labeled email input and 寄出登入連結 / Email me a sign-in link.
Explain generic eligibility briefly: existing workspace members and pending invitees. When a validated claim is present, explain that the email must be the one used to unlock that report. Generic entry offers guidance to return to the report for report-only recipients. Do not expose internal job IDs or authorization details.

### Email request

Show sending feedback specific to email. On the existing uniform success response, show 查看電郵 / Check your email and the entered email address. State that eligible recipients should receive a link; do not claim that delivery is confirmed or that an account exists.

Offer change email and resend. A 60-second UI resend cooldown reduces accidental repetition; the server's existing rate limit remains authoritative. Honor a longer Retry-After response. Never resend automatically or on page refresh. Reuse the same validated destination and claim. Changing email clears only the email-specific state.

### Google and completion

Google initiation shows 正在前往 Google… / Opening Google… and disables duplicate submissions. Selecting an account returns through the existing managed-auth callback and server-side verifier exchange.

After that exchange, a dedicated completion screen shows 正在完成登入… / Finishing sign-in… while the application verifies the fresh session, resolves the mapped user, binds eligible invitations, and selects the authorized destination. The intermediate screen must represent actual pending work, not a cosmetic delay. Completion should remain fast when the work succeeds immediately.

Successful completion navigates once to the validated original workspace destination, or through the existing report-claim/onboarding flow, or to workspace selection. A single available workspace uses existing landing behavior; this slice does not invent new workspace-selection rules.

### Recovery

Render a dedicated recovery state, not a generic alert above an unchanged form. Title: 未能完成登入 / We could not finish signing you in. Give a short next step without exposing provider messages, tokens, SQL, or stack traces.

For Google-origin failures offer 重新使用 Google 登入 / Try Google again as primary and 改用電郵 / Use email instead as secondary. For email-origin failures offer request a fresh link and change method. Unknown legacy links offer both methods without claiming the failed method is known.

Preserve locale, validated returnTo and claim across recovery and method changes. Remove stale error state when a new attempt begins. Do not reuse OAuth verifiers or consumed magic links, automatically restart OAuth, or repeatedly attempt failed completion. Expired or already-used email links receive specific safe wording and a fresh-link action. Google cancellation receives neutral wording rather than claiming an outage.

### No workspace access

Only after a fresh verified identity and successful authorization lookup may the app show that no workspace access is available. Keep this distinct from a technical lookup failure. Offer return to the report when a validated claim exists, otherwise the existing free-scan entry, and an explicit sign-out/change-account action. A provider error or database outage must never be classified as no membership.

## Technical boundaries

1. Sign-in presentation owns visual states, form validation, method selection, cooldown, focus, and live status. It never decides membership or draft authority.
2. A small validated flow-context helper carries locale, same-origin returnTo, safe claim, and an optional allowlisted method hint. Context is untrusted input and is revalidated at every server boundary. The method hint affects wording only.
3. The managed callback remains responsible for single-use verifier exchange and cookies. Tokens and verifiers are never copied into application storage, recovery URLs, client logs, or the completion screen.
4. The completion screen invokes one same-origin POST to finish application-level resolution. The endpoint rejects cross-origin requests, requires a fresh managed session, and delegates mapping, invitation binding, claim handling, and authorization to existing services. Return only a safe state and a validated relative destination; no identity/provider payload is serialized. Repeated completion must remain idempotent and must not rebind accepted memberships or duplicate claim effects.
5. Stage-specific diagnostics distinguish verifier exchange, fresh-session lookup, application identity mapping, invitation binding, workspace lookup, and claim resolution. Use an opaque correlation ID and fixed allowlisted stage/error categories. Never log emails, cookies, provider subjects, verifiers, callback query strings, raw exceptions, or database parameters.

Preserve a verified managed session across a temporary business-service error when it is safe to do so; keep workspace access denied until successful authorization. Clear invalid or revoked credentials using existing cookie rules. Do not broaden access to bypass callback failures.

## Investigation before implementation

Trace the failing boundary against the pinned Neon SDK and current server configuration. Reproduce the diagnosed failure with fixtures before fixing it. If existing production evidence is insufficient, prepare minimal redacted diagnostics for review; do not guess a provider/configuration fix or claim fixture success proves the actual Google round trip works.

The implementation plan must explicitly separate a proven callback correction from presentation changes and identify any live confirmation still required. No preselected root cause is assumed by this spec.

## Verification

- Fixture regression for the identified callback defect before its fix.
- Unit/route tests for callback context preservation, invalid contexts, method hints, safe errors, completion idempotency, and cross-origin rejection.
- Preserve accepted-member mail eligibility, anti-enumeration responses, rate limits, identity mapping, revoked-session handling, role/location boundaries, and existing claim safety.
- Browser tests using owned identity/mail/database fixtures: Google-style exchange and completion, returning-member email sign-in, consumed/expired links, technical recovery, change method, no-access state, and destination preservation.
- Verify actual rendered stages and accessible loading/recovery behavior, including keyboard focus, status announcements, duplicate-click prevention, and no horizontal overflow at 375 and 1440 pixels in all three locales.
- Run relevant repository gates and an independent authorization/test review. Report failures, skips, environment blockers, and unverified live behavior separately.
- Hosted release confirmation must verify the exact deployment and the user-completed Google flow. Actual email receipt is separate from a provider accepting a request.

## Scope and release authority

No new provider, passwords, social-account linking, database schema, workspace entitlement, draft authority, or automatic email delivery is introduced. Preserve unrelated work and the prior linked checkout.

This spec authorizes no implementation or deployment by itself. The user's current approval covers the described design. Follow the written-spec review and implementation-plan steps next. Paid providers, real emails, shared database migrations, deployments, and domain changes require applicable explicit authorization; approval of the earlier PR #11 release does not authorize a new release.