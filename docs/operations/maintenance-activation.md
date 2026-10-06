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
