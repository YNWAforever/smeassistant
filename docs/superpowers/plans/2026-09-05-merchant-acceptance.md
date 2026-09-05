# Task 3: isolated merchant acceptance

The acceptance runner owns an ephemeral Docker network, Postgres 16, GoTrue v2.189.0, PostgREST v12.2.3 and a local SMTP inbox. It reserves separate loopback ports, waits for health, lets GoTrue create its real auth schema before applying the repository migration corpus in order, then seeds synthetic HK/TW invitations and actions. Browser sessions use actual invitation magic links and PKCE callback cookies. The anon and service JWT roles are distinct; service credentials are only in the harness/server process.

The actual Next development server runs with an explicit local environment and fixture collectors plus a deterministic HTTP LLM. Existing env files are rejected to prevent Next loading shared credentials. No provider keys, deployment environment, cron or self-service claim bypass is inherited. The default browser suite retains public checks; required acceptance has no prerequisite skips. Live search is a separate explicitly authorized command.

Lifecycle: fail immediately if Docker is absent; create resources with a random run identity; start DB, Auth and inbox; apply only local migrations; start REST gateway; seed; start Next; run tests; stop child process and only owned containers/network on success and failure. Auth links and cookies stay in temporary runtime state, never source control. Failure traces are local test artifacts and must not be published without redaction.

Validation: unit checks for local targets/environment/JWT separation; both Playwright discovery lists; existing seven database tests; normal build and public browser checks; required acceptance. Until Docker and the complete matrix pass, this is implementation under verification, not a passed launch gate. Google consent, shared migrations, paid scans and real mail remain Task 5 external gates.

## Current verification (2026-09-06 local)

Implemented discovery: 27 default public checks and 16 required acceptance cases. Acceptance includes HK/TW manual scan/unlock consent and idempotency, actual invitation magic-link redemption, exact-version draft/edit/approve/download, repeated copy usage, fresh edit approval boundary, lite allowance, viewer/out-of-scope-manager authorization with omitted/spoofed context, revocation, invalid/expired/reused Auth links, and local missing/invalid/unavailable LLM responses.

On 2026-09-06 the complete required acceptance run passed **16/16, no skips, exit 0** (6.6 minutes) on the uncommitted working tree based on `3fae6ef020d72ff528a4a9b50b5b013c2c5b1995`. Docker Linux Engine 29.7.2 was healthy. Earlier setup and runtime failures remain recorded in LAUNCH-REPORT.md; no skipped or unexecuted case is counted as passed.

Runtime execution exposed and fixed Windows polling, Docker published-port behavior, stale ownership seed columns, localhost Auth-cookie consistency, pre-hydration interactions, browser/server manual-entry payload mismatch, and double-localized report unlock URLs. Regression tests exercise actual builder/validator and view-model/adapter boundaries. History and wizard selectors now follow the rendered tabs and four-step form. Independent review found no actionable issues in the fixes.

The harness uses a dedicated ordinary Docker bridge with loopback-bound published ports; this is not an egress-isolated network. Its scrubbed environment selects local Auth/SMTP/LLM and fixture collectors only. Auth OTP expiry is explicitly 3600 seconds, with timestamps aged two hours in the expiry case. `SCAN_FIXTURE=unavailable-ig` deliberately exercises null Instagram scores and reduced coverage in both HK and TW application flows; it does not claim default Taiwan fixture selection or live provider behavior. Job market and locale are retained independently of fixture metadata.

This is real local Auth/PKCE and browser proof against synthetic data using Next development mode. The normal production build/public suite remains a separate gate. Google ownership consent, provider delivery, shared migrations, retained-runner rollout and staging/final deployment acceptance remain external review gates. No self-service claim bypass is enabled.

Auth image configuration reference: https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml (GoTrue v2.189.0 and SMTP/JWT settings inspected 2026-09-05).
