# Phase N — Release Evidence

**Template only. No results have been executed or pre-filled.** Copy per phase/candidate; do not reuse another commit's passing status.

## 1. Candidate and scope

| Field | Value |
|---|---|
| Phase / owner outcome | |
| Candidate commit / branch | |
| Working-tree state and relevant uncommitted changes | |
| Base commit and audit delta | |
| Runtime / package manager / lockfile | |
| Test database fixture identity | |
| Hosted environment / immutable origin | |
| Deployment ID / deployment source commit | |
| Production alias, when relevant | |
| Authorization record and budget | |
| New/changed feature flags; actual state | |
| Implemented scope | |
| Explicitly deferred/conditional scope | |

## 2. Current implementation findings

| Source ID / requirement | Present / already fixed / changed / not verified at baseline | Files changed | Regression evidence | Remaining limitation |
|---|---|---|---|---|
| | | | | |

Link to `IMPLEMENTATION-TRACEABILITY.md`. Do not mark a resolved historical finding newly repaired without evidence.

## 3. Offline gate results

Use **passed / failed / blocked / not run** only. Passed means the named command executed successfully on this candidate. Record exact exits, counts and skips. A setup failure is not a passing zero-test run.

| Actual command | Status | Exit / counts / skips | Runtime / candidate | Log/artifact | Notes |
|---|---|---|---|---|---|
| `corepack pnpm typecheck` | not run | | | | |
| `corepack pnpm lint` | not run | | | | |
| `corepack pnpm test` | not run | | | | |
| `corepack pnpm test:no-supabase` | not run | | | | |
| `corepack pnpm test:secret-boundary` | not run | | | | |
| `corepack pnpm db:verify` | not run | | | | |
| `corepack pnpm test:integration` | not run | | | | Record actual enablement flags and owned fixture. |
| `corepack pnpm e2e` | not run | | | | |
| `corepack pnpm e2e:acceptance` | not run | | | | |
| Other required gate discovered in current CI: ___ | not run | | | | Do not invent a command to match a count. |

**Inventory reconciliation:** explain the sources' “ten gates” wording and list the actual required commands. Identify whether any build is embedded versus separately executed.

## 4. New regression evidence

| Family | Exact test(s) | Status | Failure / skip / blocker | Evidence |
|---|---|---|---|---|
| SSRF and safe website collection | | not run | | |
| Last-owner/concurrent membership safety | | not run | | |
| Paid-route fail-closed and input limits | | not run | | |
| Auth/claim/WhatsApp-LINE eligibility/context | | not run | | |
| Consent/coverage/partial and stalled scan | | not run | | |
| Saved-draft truth and compatible agent | | not run | | |
| Immutable-version approval and delivery idempotency | | not run | | |
| Assisted operations/invitation/notification | | not run | | |
| Durable lifecycle/scheduling | | not run | | |
| Billing/allowance/seats | | not run | | |
| Authorized comparison and metric definitions | | not run | | |
| Mobile/desktop/accessibility behavior | | not run | | |
| Phase 4 offers/packs/assistant/conditional scope | | not run | | |

Record out-of-scope requirements as **not run — outside this phase**, not as a new passing result.

## 5. Hosted acceptance

| Scenario | Authorized scope/reference | Status | Candidate deployment | Safe entity/receipt IDs | Evidence and limitation |
|---|---|---|---|---|---|
| R2 environment inventory | | not run | | | Names/presence only. |
| R3 HK usable live scan | | not run | | | Terminal/per-module states, coverage and elapsed time. |
| R3 TW usable live scan | | not run | | | Terminal/per-module states, coverage and elapsed time. |
| R4 hosted magic link | | not run | | | Delivery/redemption plus expiry/replay/logout. |
| R5 completed Google sign-in | | not run | | | Failure stage/root cause and safe correlation reference. |
| R6 positive Google claim | | not run | | | Job attached, membership and onboarding verified. |
| R6 negative manager/claim case | | not run | | | Denied access with useful visible message. |
| R7 HK approved first export | | not run | | | Run/version/delivery IDs and usage delta. |
| R7 TW approved first export | | not run | | | Repeat export counted false; exact version bound. |
| Phase 2 FAQ/website-basics workflows | | not run | | | Actual generation, facts, approval/export. |
| Phase 2 assisted no-GBP assignment | | not run | | | Authorized operator decision and negative permission cases. |
| Phase 2 application mail/invitation/recovery | | not run | | | Real evidence of claimed delivery state only. |
| Phase 3 actual scheduled/resumed work | | not run | | | Single lease, budget and recovery evidence. |
| R8 authorized Stripe test transitions | | not run | | | Signed/duplicate events and mid-period upgrade. |
| R11 successful comparable pair | | not run | | | Browser proof; both scans independently authorized. |
| Candidate `launch:check` | | not run | | | Actual origin and matching flag expectations. |
| Conditional preview/connector acceptance | | not run | | | Separate scope/authorization required. |

A local mock, fixture email, redirect to a provider, a successful button render or an HTTP 201 alone cannot fill a hosted success cell.

## 6. Read-only manual observations

Record these separately from automated suite results. Include origin, deployment, date, viewport/action, observation, limitations and redacted screenshots where available.

## 7. Data, security and operating review

```text
Migrations added (next valid numbers):
Prior migrations unchanged:
Runtime-role grants and privileged function review:
Concurrency/idempotency evidence:
Tenant/location and report-grant boundary review:
Approval/export authority preserved:
Provider spend/budget controls:
Secret-boundary and logging review:
Private media / ownership evidence handling:
Existing-data compatibility / backfill scope:
Known operational failures and recovery:
```

## 8. Rollout and data-preserving rollback

```text
Authorized rollout target:
Features enabled/disabled:
Pre-deploy gates:
Migration order and backward compatibility:
Post-deploy observations:
Disable/rollback trigger:
Safe rollback or forward-fix procedure:
Data that must be preserved:
Authority required to execute rollout/rollback:
```

Do not recommend restoring vulnerable fetches, fail-open spending or destructive deletion as a routine rollback.

## 9. Decision

| Question | Evidence-based answer |
|---|---|
| Implementation scope complete? | |
| All required local gates actually passed? | |
| Hosted verification complete for the advertised scope? | |
| Commercial/operating choices approved? | |
| Remaining blockers / not-run scenarios | |
| Safe independent next work | |
| Release decision / authorizer | |

Keep **implemented**, **locally verified** and **hosted verified** separate. An unexecuted test remains not run; a release is not ready merely because documentation was updated.
