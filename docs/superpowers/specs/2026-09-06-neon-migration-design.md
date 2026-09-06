# Neon migration design

Date: 2026-09-06
Status: Approved design sections consolidated; written specification awaiting user review.
Baseline: origin/main 9f89cbca02e233d49a616d251ed4a5b07ddde402.
Scope: C:/Users/laich/Documents/smeassistant. The legacy Documents/smescanner checkout is not an implementation target.

## Decisions and authority

The user selected Neon Postgres with Neon managed Auth, retaining Vercel for the website and application API. The target starts with an empty database. Existing accounts, merchants, reports and other Supabase data are not imported. Preserve all current product functionality, including email magic links, Google sign-in, scanning, reports, workspaces, invitations and assistant drafts.

This document authorizes no implementation or infrastructure mutation. Implementation follows written-spec review and a separate implementation plan. Provisioning, schema application, deployments, real email, paid providers, payment operations and domain changes retain their applicable explicit authorization gates. The earlier single Grove search authorization was consumed and does not authorize migration acceptance calls.

Keep the old Supabase resources and legacy application untouched. An empty target is not permission to delete source data or disable legacy staff access.

## Problem and outcome

Production scan creation currently depends on the Supabase service-role client. On 2026-09-06, existing runtime logs showed scan-start HTTP 500 with `Supabase service role client is not configured`. The new application must have no operational dependency on Supabase credentials, Auth, PostgREST or Supabase-hosted data.

This is a backend replacement that preserves observable behavior, not a restart of historical Phases 0-7. SerpApi quota, LLM credentials and other provider availability remain independent concerns; switching databases does not repair them.

## Architecture

- Vercel continues serving the existing Next.js UI, API and application authorization.
- Neon Postgres stores business data and the managed authentication data owned by Neon Auth. Application migrations must not alter provider-managed Auth tables.
- Neon managed Auth provides identity, email magic-link login, Google login and sessions. Business membership and authorization remain application-owned.
- A server-only data access layer replaces Supabase SDK queries and RPC transport with Drizzle and parameterized SQL. Complex SQL functions can remain PostgreSQL functions when their semantics are required.
- Browser code never receives database credentials and never directly queries application tables. Managed Auth integration is restricted to authentication operations.
- Use pooled application connections and a separate direct migration connection. Application credentials must not be schema-owner or migration credentials. Select the pinned driver against current Vercel runtime support during implementation planning; interactive transactions must stay on one connection.

### Functional preservation map

| Area | Required result |
| --- | --- |
| Public funnel | HK/TW business lookup, selected-place and manual-entry paths, locale/market continuity and validation remain available. |
| Scanning | Job creation, queue/lease ownership, retries, completion, recovery and idempotency preserve current semantics. |
| Reports | Read access, access tokens, evidence rendering, unlock and recovery behavior remain intact. |
| Workspace | Membership, accepted invitations, merchant claim, locations and rescans retain their authority boundaries. |
| Assistant | Evidence retrieval, draft/edit/approve/export, facts-needed handling and repeat usage remain intact. |
| Billing | Entitlement changes and webhook signature/idempotency behavior remain intact; no legacy customer is silently associated with a new account. |
| Integrations | Google business authorization, existing evidence providers, LLM calls, email, analytics and retention behavior remain supported. |
| Operations | Cleanup, erasure, scheduling, completion forwarding and staff/legacy isolation remain explicit release checks. |

Inventory storage, realtime and edge-function dependencies before replacing them. Do not add another storage service or Neon beta service solely because it is available. Any discovered required Supabase-specific service needs an explicit replacement in the implementation plan before the no-Supabase exit check can pass.

## Database design

Create a fresh, versioned Neon-compatible schema from the current business model. Preserve identifiers, foreign-key semantics, uniqueness, indexes, checks and transaction guarantees where they define product behavior. No old data or Auth schema is copied.

Separate a stable application user identifier from the external Auth subject. Maintain a unique mapping of provider and subject to the application user. Do not assume Neon subjects use the same type or format as old Supabase UUIDs. Memberships, ownership and audit records reference the application identity. Replace references to `auth.users` deliberately.

Inventory the existing SQL migrations and functions for Supabase-specific roles, grants, extensions, RLS assumptions and `auth.*` helpers. Translate each dependency rather than replaying Supabase bootstrap scripts unchanged. Preserve database-side atomic operations, including job leases, fencing, completion and entitlement updates. Multi-step state changes require one transaction; repeated requests cannot duplicate jobs, grants or artifacts.

Organize data access by existing domain boundaries: jobs/reports, workspaces/membership, assistant artifacts, integrations/billing and operational records. Keep route validation and authorization distinct from database transport. Do not implement a generic imitation of the entire Supabase query API.

The initial setup creates schema only. No synthetic business/account seed data enters production. Controlled fixtures belong only in isolated test environments. First-workspace onboarding must remain available through the approved application flow without granting elevated roles merely on sign-up.

## Authentication and authorization

Replace the Supabase browser/server clients, session middleware, login submission, callback handling and logout with supported Neon managed Auth integration. Retain email links and Google sign-in. Pin the Auth SDK and document the actual managed provider capabilities and configuration used.

Use an application-owned identity adapter so domain code consumes a verified user/session contract rather than provider-specific cookies. Validate sessions server-side for protected routes. Missing configuration or verification failure must not open owner routes. Logout invalidates the session according to the provider contract.

Invitations and merchant claims are separate from authentication. Validate invitation token, expiry, intended recipient and accepted membership before granting access. Never assign ownership from an untrusted email field or Google login alone. Account linking must use verified provider identity and tested provider rules; matching unverified email is insufficient.

Google sign-in and Google business authorization/claim have separate purposes. Preserve their scopes, consent and callbacks independently; a successful login is not evidence of business ownership. Validate allowed redirect origins and safe return paths. Reject external or malformed return targets.

Preserve accepted viewers and out-of-scope managers' permitted read-only evidence access. Draft authority uses server-resolved action and location, including omitted or spoofed client context. Unaccepted, revoked and cross-workspace memberships cannot gain access. Incomplete required facts continue to block usable draft artifacts.

## Configuration and failure behavior

Prepare an environment map with names, purpose, source and target scope; never record values. It includes pooled application and direct migration database URLs, Neon Auth endpoint and SDK-required session/origin settings, the managed email configuration, and the separately scoped Google registrations. Derive exact Auth variable names from the pinned integration rather than inventing them.

Keep existing provider, billing and security settings where their behavior is unchanged. Remove obsolete Supabase settings from the new application's templates and deployment requirements only after all consumers are replaced.

Readiness checks validate presence, basic format, correct target identity and a read-only database/schema probe. Name-list presence alone is not proof of a usable sensitive value. Validate build-time public settings separately from server runtime settings. Do not decrypt or expose secrets for diagnostics.

Missing required configuration prevents promotion and fails protected operations closed. Return a safe service-unavailable response with a correlation ID; server logs contain a sanitized category identifying configuration, connection, schema or provider failure. Do not leak credentials or SQL payloads. Keep quota exhaustion distinct from missing credentials and from database failures.

## Jobs and external execution

The successor's job store is Neon. Inventory every job producer, consumer, scheduler and completion receiver before cutover. Each job has one authoritative database and execution owner. Do not allow a legacy runner to write successor jobs into Supabase or silently drop completion updates.

Preserve fencing tokens, idempotency, retry bounds and durable workspace post-processing. A completed engine run is not sufficient proof of workspace completion. If a retained runner is needed, plan its Neon-compatible adapter or authenticated forwarding path and verify caller/receiver parity before release.

Keep the legacy scheduler and domain untouched. Do not introduce a competing scheduler. The implementation plan must select and prove the successor execution path for all required modes before promotion; a path still dependent on Supabase cannot satisfy this migration.

## Testing and acceptance

Historical Supabase fixture passes remain historical evidence, not proof of Neon compatibility. Do not turn skipped E2E cases into passes.

1. Unit and domain tests: use fixture-only stores and provider stubs to verify authorization, validation, idempotency and failure mapping.
2. PostgreSQL integrations: use a fresh isolated PostgreSQL database and actual SQL for migrations, transactions, constraints, fencing, concurrency, erasure and schema replay. Remove PostgREST as an application test dependency.
3. Local authentication contracts: use a controlled identity adapter and local mail capture for deterministic callback, invitation, redirect and permission tests. These are not proof of Neon hosted Auth behavior.
4. Neon managed integration: separately verify schema/driver compatibility and real session/cookie/callback/logout behavior in an isolated Neon/Auth environment under applicable authorization. Record email and Google acceptance separately from local stubs.
5. Browser acceptance: preserve HK/TW successful and manual funnels, scan/report/unlock, workspace onboarding, invites, read-only access, draft/edit/approve/export and repeat usage. Providers remain fixtures for the normal gate.
6. Repository gate: typecheck, lint, unit/package tests, production build and secret boundary, plus the replacement migration/integration gate, public E2E and required authenticated acceptance suite.

Security regressions cover omitted/spoofed context, cross-workspace access, viewer evidence, out-of-scope manager evidence versus draft denial, revoked/unaccepted membership, invitation replay, invalid sessions, unsafe redirects and missing configuration. Independent review covers authorization and meaningful test coverage before integration.

Record status as passed, failed, blocked or not run with exact commit, environment and deployment. A hosted Auth or live-provider case not executed remains not run. No secret, private payload or test contact information is published in evidence documents.

## Delivery sequence

Each slice receives its own concrete implementation tasks, regression evidence and review before integration:

1. Inventory all Supabase consumers and SQL dependencies; define the new schema, identity contract and full dependency exit checklist.
2. Implement Neon schema and domain data access with isolated database tests.
3. Replace Auth/session/callback paths while preserving application authorization and onboarding.
4. Port the full merchant journey, integrations and job completion/execution dependencies to the new boundary.
5. Replace fixture infrastructure and run the complete repository and security gates; perform independent review.
6. Prepare and verify isolated hosted staging, then prepare the exact production configuration and cutover record for authorization.

Do not deploy intermediate slices that combine incompatible Auth and data models. Local intermediate adapters may support incremental testing, but the release candidate must have one coherent Neon identity/data path.

## Cutover and recovery

Build and validate a separate empty target environment. Use one stable staging origin for cookies, email links, OAuth and checkout returns. Select project, region, branch, origin, mail sender and authorized test identities as release configuration, with capability checks before provisioning; these are not assumed from unrelated projects.

Before production promotion, record the exact code, migration state, deployment, runtime, provider modes, callback registrations, scheduler ownership and recovery target. Verify configuration and schema before enabling writes. Keep old Supabase data intact and isolate legacy traffic. A merchant-domain move is outside this design's automatic scope.

Before the first Neon write, a traffic rollback to the prior deployment can be prepared. After Neon accepts data, recovery must preserve that data: use a verified Neon-compatible previous release, a forward fix, or a controlled maintenance period. Never route new Neon users silently to an old Supabase database. Backup/restore rehearsals must establish recovery steps and actual recovery evidence before release.

No existing production billing state or pending webhook is blindly rebound to newly created users. Reconcile any external subscription and webhook routing dependencies before enabling billing on the new empty application.

## Completion criteria

- No active application, Auth, job or test path requires Supabase SDKs, credentials, endpoints or PostgREST.
- All retained features have mapped replacements and executed fixture acceptance; hosted-only cases are independently recorded.
- Neon schema and identity mapping preserve transaction and authorization invariants.
- Source, tests, environment template, launch checks and deployment runbook describe the same final architecture.
- Exact-release verification and applicable external-operation authorizations are recorded before production promotion.
- Source Supabase and legacy systems remain preserved until a separate retirement decision.

## References

- Current repository: docs/integration/DEPLOY.md and docs/integration/LAUNCH-REPORT.md. Their Supabase-specific deployment steps will be replaced during implementation; historical evidence stays clearly labeled.
- Neon managed Auth configuration: https://github.com/neondatabase/website/blob/main/content/docs/auth/guides/manage-auth-api.md
- Neon connection selection: https://neon.com/docs/connect/choose-connection
- Neon Drizzle guidance: https://neon.com/docs/guides/drizzle

## Specification self-review

Checked against the approved scope: empty target, all features, email links and Google sign-in, managed Neon Auth, Vercel hosting, preserved authorization and source resources. No implementation or cloud mutation was performed. Hosted acceptance is explicitly distinct from fixtures. Remaining environment selections are release inputs with verification gates; they are not evidence of configured resources. The next step is user review of this document, followed by the detailed implementation plan.
