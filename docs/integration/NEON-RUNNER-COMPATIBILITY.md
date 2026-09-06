# Neon runner compatibility and receiver contract

No hosted Neon project, branch or application origin has been selected. No external execution mode is enabled by this change.

| Requested setting | Job database identity | Producer | Consumer and actual selected path | Scheduler | Completion receiver |
|---|---|---|---|---|---|
| vercel | Application Neon DATABASE_URL; hosted target unchosen | Application scan/start/rescan routes | Vercel runScan with explicit Neon ScanExecutionStore | Retained authorized scheduler only | Local fenced completion; internal POST remains secret/flag gated |
| scheduled | Must be exactly the same Neon project/branch/database as producer | Application queued jobs | Currently Vercel on both paths; external scheduled worker incompatible until reviewed | Existing scheduler only; no new cron | Requires reviewed forwarding parity to this application's Neon receiver |
| cloudflare | Must be exactly the same Neon project/branch/database as producer | Application client and queued jobs | Currently Vercel on both paths; unchanged Supabase worker incompatible | Existing scheduler only | Requires reviewed Neon execution plus completion forwarding parity |

Both runtime resolver and direct dispatch refuse external execution. SCAN_WORKER_URL and SCAN_EXECUTION_RUNTIME cannot bypass this restriction; neither a URL nor a claimed environment label proves database parity. No secrets or credential-bearing URLs are logged. Enabling external modes requires a separately reviewed source change and authorization; this checkout does not edit or deploy external runner source.

## Contract artifact for the external runner owner

1. Instantiate the exported ScanExecutionStore contract using the exact producer Neon database identity. Preserve atomic thirty-minute scan claims with fewer than three attempts, terminal persistence, findings/result transaction, event lifetime and provider boundaries. Never read a same-looking job ID from Supabase.
2. Retain existing POST /run acknowledgement timing. Authentication and validated bare HTTPS receiver origin must be checked before sending secrets; reject credentials, paths, queries and hashes in origins. An acknowledgement proves receipt only, never engine or workspace completion.
3. After durable terminal evidence, forward only {jobId} to POST /api/internal/workspace-scan-completion with the separately configured WORKSPACE_COMPLETION_SECRET. Receiver resolves workspace/location/status itself on Neon. For recovery the retained scheduler forwards {reconcile:true}; server processes at most five persisted jobs, without collectors.
4. Receiver outcomes: completed/skipped=200, busy=202, retry=503; invalid/spoofed payload=400, unauthorized=401, disabled=404, unavailable=503. Engine done/partial/failed alone does not imply workspace completion success. Retry from persisted evidence after expiry/backoff; do not rerun collectors to repair workspace effects.
5. Before changing this checkout's hard block, record producer/consumer database identity, caller and receiver revisions, authentication failures, duplicate delivery, stale lease fencing, retry after partial failure, safe inline fallback and one-scheduler evidence. Obtain separate cutover authorization. Hosted parity is currently BLOCKED.

## Local completion behavior

Claim uses the original database ledger contract. Each effects transaction locks workspace then current ledger, validates live token, sets app.completion_job/token locally, composes snapshot/action/measurement/notification/audit repositories on that same client, and commits effects with successful finish. Any partial failure rolls back; bounded retry acknowledgement uses the original token, which cannot finalize a newer lease. Recovery retains saved website checks; absent checks stay unavailable instead of making a network call. No provider, mail, payment or collector runs inside this transaction.

Historical migrations 0001-0004 remain immutable. Existing 0004 fencing is sufficient under actual two-client tests; no appended migration was necessary.
