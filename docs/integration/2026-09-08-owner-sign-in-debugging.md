# Owner sign-in debugging - 2026-09-08

Base: 4245adbb1588356b371227bb24436dfb45ae7554. Working branch: codex/fix-returning-owner-sign-in. Local fix only; not pushed or deployed.

## Live evidence

- Production alias resolves to deployment dpl_HGj5YmmdqQPmSKWatELr13oreDYL at the base commit.
- zh-HK owner sign-in returned HTTP 200, both buttons hydrated and enabled, with no page errors in an isolated browser.
- Clicking Google returned HTTP 200 from /api/auth/sign-in/social and navigated to accounts.google.com/v3/signin/identifier. No account credentials or consent were submitted; completed Google login remains unverified.
- Neon Auth's production configuration has the app origin trusted, shared Google OAuth, and a shared email sender configured. Configuration presence does not prove email delivery.
- Production logs contain a 200 magic-link request at 13:38:43 UTC. Its log contains a PostgreSQL SSL deprecation warning, not a confirmed send failure. No recipient was supplied for tracing; do not assert this request was an accepted member.
- No real mail was requested, and no provider configuration or hosted database was changed.

## Reproduced defect and fix

Generic sign-in delegates to the workspace-invites mail route. Its pending-invitation-only predicate rejects returning accepted members. The uniform anti-enumeration 200 response then produces the check-inbox UI without calling the mail provider.

A regression with no pending invitation and an accepted membership failed because the provider received zero calls (1 failed, 6 passed). The route now uses a separate read-only sign-in eligibility predicate: unbound pending invitations match their recorded email; accepted members match their mapped app user's current email and require an identity mapping. Rate limits, uniform outcomes, and callback/workspace authorization remain unchanged. Report-only recipients still require the report claim entry point. Generic/claim UI guidance now reflects this distinction; its regression also failed before correction.

## Verification

- Focused sign-in route, proxy, and hydration tests: 17 passed.
- Full unit suite: 2,597 passed (root 2,040; safe-media 62; region 23; scoring 183; contracts 20; scan-engine 269), exit 0.
- Full typecheck: exit 0.
- Lint: exit 0, 29 existing warnings, using `corepack pnpm exec eslint . --ignore-pattern '.worktrees/**'`. The initial normal lint was interrupted because the primary checkout contains a preserved nested worktree whose generated files were being linted. No lint configuration was changed.
- Application build with fixture scan sources: exit 0.
- Independent read-only review: no blocking findings. Existing not_authorized copy remains a nonblocking follow-up.
- Initial SQL attempt was blocked at global setup; no tests ran or were skipped. After Docker recovered, the membership suite passed 20/20 and the full SQL suite passed 247/247 in 24 files (99.40 seconds), with no skips. Four new cases cover owner/manager/viewer invitation acceptance and stale email/identity mapping, plus removal and unknown recipient assertions.
- New returning-sign-in browser regression passed 2/2 in 33.8 seconds using the owned mail/database fixtures. It signs out accepted owners and viewers, requires a new message ID, follows the fresh link, and confirms the workspace destination and unchanged acceptance timestamp. Independent review approved this addition. Full public browser suite passed 31/31 (54.7 seconds); full acceptance suite passed 23/23 (2.7 minutes), including the two new regressions. No skips.

Docker Linux engine was initially stopped. Startup attempts exposed `sailor-ingest.sock`: Windows reports the file cannot be accessed, preventing Docker from renaming it and starting its ingest server. With the backend stopped, narrowly scoped rename/removal attempts also failed. No Docker data reset was requested by this task. Further recovery was stopped in the initial turn. On continuation the Linux engine was already running; this task did not perform a factory reset. Fixture verification resumed successfully.

Full runtime email delivery and completed Google authentication remain unverified. The SQL and browser gates are now complete; live deployment still requires authorization. No production fix is claimed.
- The normal retired-transport check also traversed the preserved nested checkout and reported four historical-path false positives. The unchanged scan function passed against a temporary export of all 910 tracked/untracked active-source files (no exclusions within that checkout); the separate nested worktree was preserved.

- Final secret-boundary build passed across 45 public artifacts (exit 0); existing Node DEP0190 warning retained. Final diff check passed, and zero owned PostgreSQL fixture containers remained. No source or environment secrets were published.
