# T-21 / UC-25 — isolated restore preparation and handoff

Preparation complete; restore not executed. No production branch/database, alias, credential or backup setting was changed. Backup coverage, available recovery points, restore privileges and actual cost remain unverified. Candidate-provider retention metadata is recorded below; its production-source binding is still unconfirmed. RTO/RPO are unmeasured, not zero.

Continuation at 2026-10-07 12:12 UTC obtained candidate-provider metadata: project morning-hill-92255530 / branch br-wandering-field-azdc91yj / database neondb, with history_retention_seconds=21600 (6 hours), and a complete snapshot-list response containing 0 snapshots. The candidate's binding to the Vercel production DATABASE_URL is still unconfirmed. The API did not return an oldest available recovery timestamp; no point was selected. [Evidence](../audits/remediation-evidence/T19-T21-continuation-target-metadata.json) is a current setting observation, not proof of backup absence, a usable recovery point, restore privilege, Auth/object backup coverage or successful recovery. No retention setting was changed.

Required approval package: source project/branch/database and selected recovery timestamp/snapshot; evidence of retention and retention expiry; a newly provisioned isolated target project/branch/database; exact role/owner and cost cap; restore/start/cleanup authorization; named on-call and secret-management owners. Target must differ from production by explicit IDs, host and database, have no production alias, and use fixture providers with mail/scans/publishing disabled. Identify target before every DB operation. Do not rely on its name alone.

Execution procedure, only after those inputs and explicit restore authorization:

1. Record source recovery point availability and a safe synthetic workspace's pre-incident row/relationship/version/approval/scope manifest. Confirm provider snapshots do not imply independent object/credential backup. Inventory required Auth configuration and external artifact recovery separately.
2. Start a timestamped isolated restore. Record provider operation id, source recovery time, start time, first successful read time and first successful authorized login time. No production endpoint may be reassigned.
3. In a READ ONLY target transaction verify exact migration journal/checksums including 0014, schema/privileges, key row counts/relationships, immutable version and approval binding, outbox/completion ledger states, expected location/role scope. Match manifest hashes without exporting customer content.
4. Use dedicated synthetic owner, scoped manager, viewer and nonmember. Confirm login, correct read scope, denied mutations and request privacy. Recovered credentials/session state must not grant unintended membership. Provider network transport remains fixture-only.
5. Compute RTO = authorized login-ready timestamp minus restore start; report read-ready separately. RPO = incident/cutoff time minus actual recovered data point. Record missing relationships/files, scope discrepancies and provider receipts; never use advertised service values as drill measurements.
6. Reconcile unknown deliveries with persisted provider identity before any restart; do not blindly send/publish again. Hand over failure categories, runbook links, replay/compensation responsibility and escalation destination. Cleanup only the explicitly approved isolated target; do not delete or overwrite production.

Result template:

| Field | Actual evidence |
|---|---|
| Source project / branch / DB / recovery point | candidate morning-hill-92255530 / br-wandering-field-azdc91yj / neondb; production binding unconfirmed; point not selected |
| Retention / mechanism / privilege / cost source | candidate configured history: 6 hours; snapshot list: 0; actual point/coverage/privilege/cost unverified |
| New isolated target IDs / no-production-alias proof | not provisioned |
| Approved actors / cost cap / restore & cleanup authorization | missing |
| Start / read-ready / login-ready / recovered point | not measured |
| Journal/checksums / rows / relationships / files / scopes | not tested on restore |
| RTO / RPO | not measured |
| On-call / failure / compensation / alerts / key-management owner | unassigned |
| Outcome / discrepancy / evidence SHA / cleanup | blocked |

Rollback is abandonment of the isolated target only under its explicit cleanup authority. Keep production unchanged. Existing local disposable DB tests prove application invariants, not backup restore success.
