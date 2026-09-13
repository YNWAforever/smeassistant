# Operated assisted ownership assignment

Date: 2026-09-12
Status: Approved design. Not implemented. No code, migration, deployment or hosted action follows from this document.
Baseline: `claude/development-continuation-b3cbc1` at `27d42f8`, which is `main` at `11033fb` (PR #13) plus the merged predecessor branch and this session's eight backlog items.

## Outcome and scope

Give a merchant whose business cannot be verified through Google — a manual-entry scan, or a listing they do not manage — a real path to a workspace: they ask, a named Fimmick operator verifies independently, and an approval creates the workspace through the same checked services that verified ownership uses. Ownership stays proven, never self-declared (guardrail 15).

This covers Phase 2 backlog items 19–23 as one release. It also removes the blocker on items 27 and 28, which were classed `needs_schema_change` rather than forbidden: once the storage question is settled without DDL, the explicit submission form and the four acceptance tests become buildable. The phase gate is end-to-end and says so — "a request form alone is incomplete", and acceptance is "a named authorized no-GBP/manual case is independently reviewed and assigned".

Out of scope: any email to the requester (there is no mail port; item 26 is separate), the retired Supabase staff console, a second scheduler, and any change to `lib/auth/staff.ts`, which stays a fail-closed stub so the ported report-access layer compiles unchanged.

## Constraints this design is shaped by

**The schema is frozen.** `scripts/neon/catalog.ts` deep-equals tables *and* columns against `test/integration/fixtures/legacy-final-catalog.json`. Its only escape hatches are `additionalFunctions` and `additionalTriggers`, which `0005_owner_removal_guard.sql` used. There is no columns or tables equivalent, so any `ADD COLUMN` fails `db:verify`. The user chose zero DDL: state rides on `audit_events`.

**DEC-06 is pending.** Its recorded safe default is to build protected request, status and queue code but not to enable real approvals or claim an operating service exists. Both halves of that bind this design: the enablement flag, and the owner-facing copy.

**`app_users` has exactly `id`, `email`, `created_at`.** There is no role column, so the operator role lives in configuration.

**Docker is absent locally**, so `test:integration` and `db:verify` cannot run here. Integration cases will be written against that constraint and first executed in CI, as the previous phase's were. No migration means `db:verify` is unaffected either way.

## What the existing schema already gives us

Three facts were verified against `neon/migrations/0002_business.sql` before this design was settled, and two of them changed it.

`workspace_access_requests` is `(id, job_id NOT NULL, user_id NOT NULL, requested_at, resolved_at, resolved_by_staff_user_id)`. It carries a **unique** partial index `workspace_access_requests_open_idx ON (job_id, user_id) WHERE resolved_at IS NULL`, so at most one open request per job and user is already enforced by the database — the submission form inherits duplicate protection rather than implementing it. A second partial index, `workspace_access_requests_pending_idx ON (requested_at DESC) WHERE resolved_at IS NULL`, is the queue's ordering. `resolved_by_staff_user_id` is a foreign key to `app_users(id)`, which is why an allowlisted operator email must resolve to a real `app_users` row.

`audit_events_idempotency_key_idx` is a plain `CREATE UNIQUE INDEX` on `idempotency_key`, not declared `NULLS NOT DISTINCT`. Multiple NULL keys are therefore permitted, so terminal decisions can carry a key while narrative events carry none. The uniqueness is table-wide, so any key must be globally unique.

`audit_events.workspace_id` is already nullable in SQL. Only the typed writers require it.

The table is write-only today: the sole writer is `lib/repositories/claims.ts` through the sign-in completion path, and nothing in the application ever reads or resolves it.

## Architecture

Six units, each following a pattern the repository already uses. Dependencies run one way: routes to workspace logic to repositories. Neither pure module imports a repository.

**`lib/auth/operator.ts`** is new and sits beside `staff.ts` rather than inside it, because item 23 forbids flipping that stub and because the two encode different trust models — the legacy console versus this app. Its pure half, `isAllowedOperatorEmail(email, allowlist?)`, parses `OPERATOR_EMAILS`, normalises, and returns false when the variable is absent or empty. Its server half, `requireOperator()`, resolves the verified session email, checks the allowlist, resolves `app_users.id`, and fails closed exactly as `requireMembership` does.

**`lib/workspace/assisted-assignment.ts`** is new and touches no database, matching the boundary `access-request.ts` documents for itself. It holds the decision vocabulary, validation of the operator's verification entry, terminality, and idempotency-key construction.

**`lib/repositories/access-requests.ts`** is new and holds all SQL: `listPending` over the existing partial index, `get`, and one `resolve` that writes the decision event and closes the row in a single transaction, so a resolved row without its decision event cannot exist.

**`lib/workspace/audit.ts`** widens `AuditEventInput.workspaceId` to `string | null` — a widening every existing caller already satisfies — and gains the new event names.

**Routes.** `POST /api/access-requests` for the owner, authenticated and rate-limited under a new `access_request` bucket in `lib/security/rate-limit.ts`; `PATCH /api/ops/access-requests/[requestId]` for the operator.

**Pages.** `/{locale}/ops/access-requests` and `/{locale}/ops/access-requests/[requestId]`, plus the owner status read rendered on `select-workspace` and onboarding step 2.

The operator pages are locale-prefixed so `proxy.ts` — the file that gates every owner route — needs no exception, but their copy is English. That is a deliberate, recorded exception to CLAUDE.md section 5's trilingual rule: the audience is a handful of Fimmick operators, not merchants. It is written down here rather than taken quietly.

## Data model and state

Nothing is added to `workspace_access_requests`. Its columns answer *is this still open*; `audit_events` answers *what happened and why*. Every event uses `entity_type='workspace_access_request'` and `entity_id=<request id>`, with `workspace_id` null until assignment.

`access_request.submitted` carries the intent, the preferred contact channel and identifier, and the evidence reference. All three are owner-typed text: the intent is why they need access in their own words, and the evidence reference is a pointer an operator can go and check independently — a business-registration number, a tenancy or utility account, a role at the business. It is explicitly **not** a file upload; there is no upload path for it, and adding one would be a new surface with its own retention question. `access_request.reviewed` records an operator opening a request. `access_request.information_requested` carries what is being asked. Those three events are non-terminal and carry no idempotency key.

`access_request.approved` and `access_request.rejected` are terminal, and both carry `idempotency_key = access_request:<request id>:decision` — one key for either outcome, so at most one terminal decision per request can ever exist. Their payload carries the reason and the verification entry, `{method, verified_by}`.

`workspace.assigned` is emitted after the workspace exists, carrying the real workspace id. It is distinct from `workspace.claimed`, which is the OAuth and self-claim path; merging them would make the ledger unable to distinguish an attested claim from an operator assignment.

**Status is derived, never stored.** Pending is `resolved_at IS NULL`. Approved versus rejected comes from the terminal event. A request in `information_requested` deliberately leaves `resolved_at` null, so it stays in the queue and remains non-terminal, which is the honest reading. One query with a lateral join on the latest event gives the queue both facts, while "show me pending" stays the indexed predicate the partial index was built for.

The honest consequence, stated so nobody later reads it as a defect: the row alone cannot distinguish approved from rejected. That is the intended split.

## Idempotency and concurrency

Three independent layers, none of them application-level.

Submission is protected by the existing unique partial index. A re-submit violates it; the route returns the existing request rather than erroring, and always appends a fresh `submitted` event. Always, rather than only on change, so no comparison logic decides what is worth recording — the log is append-only and the operator reads the latest. The rate limit, not a diff, is what bounds it.

The decision is protected by the table-wide unique index on `idempotency_key`. The event insert happens **first** inside the transaction, so a concurrent second approver loses on the index before any workspace is created.

Assignment is protected by `attachJobToWorkspace`'s existing `WHERE workspace_id IS NULL`, which returns false when the owner completed Google verification while the request sat in the queue. The transaction rolls back and the operator is told the job is already claimed.

Order inside the one transaction: claim the key, create the workspace, attach the job, close the row, emit `workspace.assigned`.

**Risk to verify before anything else is built:** `createWorkspaceWithOwner` and `attachJobToWorkspace` may open their own connections rather than accept a transaction client. If so, the single-transaction guarantee requires plumbing one through, and that is the first task in the implementation plan, not a discovery midway.

## Authorization

**The DEC-06 enablement gate.** `ASSISTED_ASSIGNMENT_ENABLED`, enabled only by exactly `"true"`, matching the existing `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` pattern. It is checked as the first statement in the decision route, before authorization and before body parsing, and answers 404 — following the precedent already tested in the claim-start route, where flag-off is 404 and anonymous is 401. A 404 rather than a 403 keeps the route's existence from being a signal.

The queue pages stay reachable for an allowlisted operator with the flag off, because DEC-06's safe default is to build the queue and withhold only real approvals. The decision controls render disabled with a note naming what is actually missing — a named accountable operating role and an approved verification procedure — rather than a generic "coming soon".

**The operator gate.** `requireOperator()` runs on every operator page and on the decision route. It fails closed when there is no session, when the email is not in the allowlist, when the allowlist is absent or empty, and when the email does not resolve to an `app_users.id`. It grants nothing else: an operator is not a member of any workspace and cannot open `/owner/*`.

Order is tested rather than assumed: flag, then operator, then request scope, then decision. Flag off is 404 for everyone including operators; flag on with a non-operator is 403.

**What the reviewer records.** The verification method and who verified it are operator-entered free text, validated non-empty, stored in the terminal event. Deliberately not a picklist: enumerating accepted methods would make this repository assert a verification policy DEC-06 says does not exist yet.

## Flows

The implicit filing at sign-in is unchanged. `shouldRecordAccessRequest` still files a request when a memberless user signs in with a claim slug.

Onboarding step 2 and select-workspace render either the status of the caller's existing request, or a submission form when none exists. That form is the manual-entry owner's only route today, because no claim slug means nothing is ever filed for them.

`POST /api/access-requests` takes the job, the intent, the preferred contact channel and identifier, and an evidence reference. **The binding rule matters more than the form does.** Nothing may let a signed-in user file a request against an arbitrary job, because that puts a stranger's business in front of an operator labelled "this person says it is theirs" — the hijack primitive guardrail 15 exists to prevent. The route therefore reuses the eligibility rule Phase 1 already built for magic links: the caller must be a lead recipient for that job or hold an unrevoked grant in `report_access_grants`. An ineligible job answers 404, so the response never confirms the job exists. Filing is not ownership; it is a request an operator must still verify independently.

The operator opens the queue, opens one request — which logs `access_request.reviewed`, because that is the moment a merchant's details are seen, and logging per queue page view would be noise rather than accountability — reads the job's own evidence alongside the submitted payload, and decides.

The owner status read is scoped `WHERE user_id = <session user>`, so another person's request is never visible.

## Failure handling

Flag off answers 404 before authorization. A non-operator answers 403. An already-resolved request answers 409 carrying the existing outcome. A job attached in the meantime answers 409 `already_claimed` with the transaction rolled back and nothing written. A concurrent duplicate decision loses on the unique key and answers 409. In every refusal the loser sees a visible refusal, never a silent success.

**One deliberate inversion of a house rule, which must be stated in the code.** Everywhere else in this repository the audit write is best-effort: a failed audit insert never undoes the mutation it describes. Here it is the opposite. The decision event *is* the decision, and it carries the uniqueness that makes the decision exactly-once, so if it cannot be written the assignment must not happen. That is why it sits inside the transaction rather than after it. Without the reason on the page it reads as a violation of the pattern.

## Copy constraints

DEC-06 says not to claim an operating service exists. The owner-facing status therefore promises no review, no response time and no "our team is looking at this". It states that the request is recorded, what it names, and how to reach Fimmick through the market contact channels onboarding already resolves server-side — the same server-side resolution, because `getMarketCtas` reads `process.env` through a computed key and returns nothing from a client bundle.

## Testing

The four acceptance criteria from item 28 become real and are the centre of the suite: a non-operator is refused review and assignment; concurrent approvals produce exactly one workspace and a visible refusal for the loser; a rejected request leaves the requester a non-member, asserted by reading memberships afterwards; and a manual-entry business with no `place_id` completes request, decision, workspace and one derived action.

Beyond those: filing against an ineligible job answers 404; the status surface shows only the caller's own request; flag-off is 404 for an operator and a non-operator alike. Pure unit tests cover allowlist parsing across absent, empty, whitespace and mixed-case inputs, terminality, and key construction.

The concurrency and journey cases need Docker and will first run in CI.

## Rollout and rollback

Both variables ship absent, which is off. `OPERATOR_EMAILS` absent means nobody can reach the queue; `ASSISTED_ASSIGNMENT_ENABLED` absent means no decision route exists to call. Rollback is unsetting either variable, and it is data-preserving rather than reversing: no schema changed, and every row this feature adds to `audit_events` is append-only history that stays true regardless.

It does not undo decisions already taken, and should not pretend to. A request resolved while the flag was on keeps its `resolved_at` and `resolved_by_staff_user_id`, and the workspace an approval created keeps existing with its owner — reversing either would strip a real merchant of a real workspace. What unsetting the flag stops is *new* decisions. Undoing a specific bad assignment is a separate, deliberate act, not a side effect of turning a feature off.
