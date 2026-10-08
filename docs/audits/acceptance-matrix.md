# T-15 / T-20 / UC-08,09,19,20,23,24 — fixture and hosted acceptance ledger

All on-flags below are confined to owned loopback fixtures. Production values were not changed. Production flag absence in Vercel environment metadata is recorded as absence/default behavior, not an independently exercised hosted feature. No paid provider, customer workspace, real mail or external publish is part of these commands.

## Merchant/identity journey

| Contract | Permanent fixture evidence |
|---|---|
| Legal 3cuOKFmHdiYf00BOs27E_NO1 survives claim and onboarding; no self-service membership | claim-and-market.spec.ts new T-03 case; slug/parser/API unit; no-self-service gate |
| Existing identity / accepted invite, replay, cancellation, mapping/binding/upstream failure | guided-sign-in, returning-sign-in, claim-and-market, neon-owner-sign-in-completion |
| Session expiry, revoked membership, unverified identity, same-origin returnTo | permissions, returning-sign-in; owner complete/Auth/returnTo unit and identity integration |
| no_access → own request selector without membership grant; strangers cannot read another request | guided-sign-in; own-request repository/service unit and DB integration |
| Ownership verified outside self-service; interrupted setup resumes saved step/brand values | claim-and-market new T-15 case; onboarding page tests |
| HK/TW draft generation, exact immutable edit/approval, download and repeated export quota | merchant-loop; artifact/runtime/workflow integration; 88-case offline agent corpus |
| Provider invalid/missing/unavailable output creates no fake version/usage | merchant-loop failure cases; pipeline tests and offline recovery fixtures |
| Owner asserts exact approved version as applied; duplicate submit returns same row and one audit event | merchant-loop enhanced applied loop; neon-action-applications |
| Same-condition comparable rescan, measured/Unknown values, one notification/measurement and no revenue causation | neon-report-comparison, neon-rescan, neon-completion, neon-value-report, workspace measurements unit; report-scan-comparison browser privacy |
| Owner/scoped manager/viewer/nonmember, direct API denial, foreign location privacy | permissions, action-list-remediation, preview-draft; artifact/authorization/DB scope cases |

These tests form a composed local journey: synthetic rescan evidence is tested through actual completion/read-model functions and owned DB, while browser mutations inspect request/result/stored row/audit and retry behavior. A live collector rescan and hosted identity journey have not been run. Browser fixture mail-link redemption does not prove hosted Google or SMTP registration. The repository's supported sign-in methods are unchanged.

Full command: `pnpm e2e:acceptance`, preceded by the existing lint/type/unit/security/migration/integration/build/E2E gates. Final full acceptance 49/49 passed, exit 0, 10.1m, fixture SHA 6941ed7; general E2E 31/31 exit 0. Application source 76404c4 is unchanged by that fixture-only correction. Per-gate totals, exact commands/source bindings, historical failed/incomplete attempts and zero final skipped are in remediation-evidence/verification-summary.json and final-gates.jsonl. Fixture IDs/version IDs are generated and inspected by each test; traces/diagnostics are synthetic. First 47/2 acceptance failure, both traces/contexts and intermediate startup/command failures are retained separately from the final green log.

## Feature matrix

| Feature / flag | Off boundary | Fixture on / failure recovery |
|---|---|---|
| P4.2 WORK_PACKS_ENABLED | neon-work-packs-flag-off; packs route unit | work-pack browser; neon-work-packs three-item cap, workspace/location scope, allowance/dedupe and retry |
| P4.3 CONTEXTUAL_ASSISTANT_ENABLED | neon-assistant-flag-off; suggestions/run route unit | contextual-assistant browser; neon-assistant-live/signals scoped readable context, missing inputs, rate/quota, provider failure; no automatic mutation |
| P4.5 PREVIEW_DRAFT_ENABLED | neon-preview-flag-off | preview-draft browser; neon-preview-events grants/unlock/rate/quota; preview access never creates membership |
| P4.6 GBP_REPLY_PUBLISH_ENABLED | neon-publish-flag-off; targets/publish/delete unit; T-19 missing-0014 measurement counterexample | neon-publish-reply and publishing service/route/provider tests: exact target/version confirmation, role/location, quota, CAS/receipt/dedupe and unknown-result reconcile rather than blind resend |
| T-13 ACTION_BULK_ASSIGN_ENABLED | exact default off and flag-off route unit | isolated action-list-remediation plus real DB preview/apply/partial conflict and failed-only recovery; assignments/due dates only |

P4.6 provider on-cases use controlled provider responses, not a Google API publication. A successful build or flag-off 404 is not feature-on operational acceptance. 0014 is required by flag-off measurement regardless of publishing.

Hosted prerequisites remain missing: a dedicated authorized workspace, verified owner/scoped manager/viewer/nonmember identities, exact production/preview deployment SHA and independent DB readiness; approved provider dataset/budget for scan/LLM; explicit exact version/target authorization for any publish; live SMTP/invite/claim actions each within their own scope. Do not substitute real customer data. Set each hosted_status blocked until request/result/DB/audit/visible state agree at that SHA.

Hosted result template: task/UC/flag actual value; deployment/SHA/target; synthetic workspace/location/actor/role; request and expected result; actual HTTP/result; stored version/approval/event/usage; retry result; provider received count/receipt/reconcile; privacy check; evidence path; pass/fail/blocked and missing input; rollback target.

Rollback: revert the acceptance-only commit to remove new tests; product rollback uses the relevant remediation commit. Keep production feature values unchanged; preserve uncertain delivery ledgers during any future authorized disablement.
