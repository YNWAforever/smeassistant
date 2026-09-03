-- Scan claim lease: let a job stranded by a killed process be reclaimed.
--
-- The original claim_audit_job claimed only from status = 'queued'. Combined with
-- a scan whose own timeouts sum to roughly 600 seconds on one SerpApi key, that
-- made a mid-scan function kill unrecoverable: the row stayed in 'collecting'
-- forever, a retried POST returned already_claimed and did no work, and the
-- scanning page polled indefinitely because only done/partial/failed stop the
-- poll. attempt_count and last_attempt_at were already written on every claim and
-- read by nothing; this migration makes them load-bearing.
--
-- The signature and return type are unchanged, so `create or replace` is
-- sufficient and no drop/regrant is needed. That matters: DROP FUNCTION followed
-- by CREATE resets EXECUTE to PUBLIC, and no test in this repo inspects grants in
-- a migration file it does not hardcode. The revoke/grant pair is restated below
-- anyway, matching house style in 20260714 and 20260717022612.
--
-- `set search_path = ''` must sit between `security definer` and `as $$`, and
-- every identifier must stay schema-qualified. Omitting it silently unpins the
-- search path on a definer function; migration-hardening-sweep.test.ts catches it
-- in file text, but only for SQL that lives in this directory.

begin;

create or replace function public.claim_audit_job(p_job_id uuid)
returns setof public.audit_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.audit_jobs
  set status = 'collecting',
      processing_stage = 'collecting',
      attempt_count = attempt_count + 1,
      last_attempt_at = now()
  where id = p_job_id
    and (
      -- The normal path, unchanged.
      status = 'queued'
      or (
        -- The lease. A non-terminal row whose last attempt is older than the
        -- lease window was abandoned by a process that will never come back.
        --
        -- 15 minutes is deliberately longer than the ~10-minute worst-case scan
        -- computed from the code's own timeouts, so a slow-but-alive scan is
        -- never reclaimed underneath itself. Terminal statuses (done, partial,
        -- failed) are excluded: a finished scan must never be re-run.
        status in ('collecting', 'scoring', 'persisting')
        and attempt_count < 3
        and last_attempt_at is not null
        and last_attempt_at < now() - interval '15 minutes'
      )
    )
  returning *;
end;
$$;

-- Restated rather than assumed. create or replace preserves privileges, but the
-- pair is cheap and makes the file self-describing for a hand-applied migration.
revoke execute on function public.claim_audit_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_audit_job(uuid) to service_role;

-- Supports a future reaper sweeping for stranded rows by age. The claim itself is
-- by primary key and does not need this.
create index if not exists audit_jobs_stale_claim_idx
  on public.audit_jobs (last_attempt_at)
  where status in ('collecting', 'scoring', 'persisting');

commit;
