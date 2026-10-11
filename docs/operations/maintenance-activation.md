# T-02 / F-01 / UC-11 — conditional maintenance activation

DEC-10 remains effective: cron is intentionally absent. T-01 stays complete. Auth/deadline/lease fixtures and this proposal do not mean maintenance is operationally enabled.

Candidate cadence: the existing design's single `/api/cron/dispatch` GET every five minutes, shared 55 seconds work plus five seconds settlement. Notify due schedules never auto-rescans; owners retain consent. Tick bounds remain reclaim 20, auto-close 20, completion 5, website locations 5, mail 10 just-in-time claims. At_capacity is retained for next-tick recovery. No duplicate scheduler is permitted.

Before any config change, name an operations owner, release owner and authorized alert destination; each is currently unassigned. Read-only team metadata reports billing_plan=pro and billing_status=active (T02-platform-plan-metadata.json); current [Vercel cron usage rules](https://vercel.com/docs/cron-jobs/usage-and-pricing) permit minute cadence on Pro/Enterprise, so the proposed five-minute cadence fits that documented plan rule. Function/provider operating allowance and alert costs are still unapproved/unmeasured. No upgrade, scheduler purchase or activation is authorized.

Reviewable monitoring design (not an installed monitoring API): an approved external observer records deployment SHA, tick start/end/elapsed, HTTP status, each returned step's counts, errors/deferredSteps, and safe aggregate backlog/oldest due age. Use a read-only metadata/backlog endpoint or existing operations queries only after its access contract is approved. Current dispatch response supplies counts/deferred indicators; there is no newly claimed durable heartbeat table or alert channel.

Proposed thresholds for owner review: missing two expected ticks (10 minutes plus measured scheduling tolerance) warns; three (15 minutes plus tolerance) pages the named destination. Consecutive deferred/error steps over three ticks or increasing oldest-due age over 15 minutes require investigation. Monitor its own receipt timestamp and stale-data state; empty/unavailable metrics cannot mean healthy/zero backlog. These thresholds are proposals, not measured production SLOs.

Activation checklist, after explicit DEC-10 change and operational authorization:

1. Independently pass exact-SHA release gate and T-19 journal/runtime readiness; confirm no other scheduler invokes the same work. Save previous configuration, deployment and pending ledgers.
2. Use dedicated synthetic non-production workspace/jobs; disable real mail, paid scan/LLM and publishing. An unauthenticated request must be refused before any DB/provider work.
3. Run three legitimate ticks five minutes apart. Capture each step's heartbeat/counts/deferred, received provider count, stored lease/completion/dedupe evidence and retry identity. No uncontrolled business mutation is permitted.
4. Withhold two/three test ticks, confirm actual warning/page reaches the approved destination and detects a stale observer. Restore ticks and prove recovery without duplicate sends or charges.
5. Only after that proof separately approve production enablement. Record first production tick and backlog observations; do not translate fixture results into hosted passes.

Disable/rollback: remove the scheduler entry or restore the saved cron-free config under deployment authorization; do not erase pending outbox/completion ledgers. Preserve uncertain provider receipts and leases, inspect idempotency/reconcile before restart. Active mail/scans pause switches retain their existing values unless specifically authorized. T-02 is intentionally not enabled; blocker includes owner/destination, operating budget, T-19, failure drill and explicit enablement.

## 2026-10-12 current evidence — T-20261011-07 / UC-20261011-38

Read-only Vercel project metadata, retained at `../audits/2026-10-12-remediation/evidence/T07-platform-scheduler-metadata.json`, reports production deployment `dpl_4H8u4jXti2KHdT2HAVGCEYm1SMmz` and `crons.definitions=[]`. A CRON_SECRET metadata entry exists. Neither proves a successful tick. There is no evidence in this session of an external executor; its absence is not inferred from an empty Vercel list. The later successful owner login remains valid historical evidence and does not establish daily maintenance.

Keep DEC-10's manual mode. The owner explicitly requests scans/actions and receives the existing budget/consent refusals; notify schedules request owner action rather than silently rescan. No scheduler, alert destination or mail provider is activated by this remediation. Existing dispatch authorization, bounded per-step budget, lease fencing, idempotency and mail held/deadline tests are retained in the local gate.

If operations chooses ON, the reviewable target remains **one** authenticated executor every five minutes, UTC scheduler with business due times in the workspace timezone (HK `Asia/Hong_Kong`, TW `Asia/Taipei`), 55 seconds work plus five seconds settlement, existing claim limits and pause switches. Name the operating owner, recipient, provider/scan/mail allowance, and read-only last-success receipt source before activation. Apply the stale-observer and missing-tick drill above; zero or absent receipts must show unknown/stale, never healthy. Record a real success and defer/retry on the matching deployment before describing maintenance as automated.

T07 is locally prepared, operationally blocked pending that decision, exact executor/configuration authorization and staging fixture. T05/T15's manual daily-workflow fixture checks can proceed independently. Rollback pauses only the chosen executor and retains all held mail, leases, dedupe receipts and audit history.
