-- Widen the claim lease from 15 to 30 minutes.
--
-- 15 minutes was sized against "the ~10-minute worst-case scan computed from
-- the code's own timeouts" (20260729000000's own comment) -- which held only
-- because every scan ran inline on Vercel under maxDuration = 300, a hard cap
-- well below that estimate. L6 moves execution to a Cloudflare Worker with no
-- wall-clock cap, and the pipeline's own timeouts sum to 600-778s (up to ~13
-- minutes) -- a ~2-minute margin against an ESTIMATE, not a hard ceiling. Past
-- it, /api/cron/run-queued (which doubles as the reaper) reclaims the row and
-- starts a second concurrent scan of the same job inline on Vercel, doubling
-- paid provider spend and racing two writers against one row.
--
-- 30 minutes keeps a comfortable margin above the worst-case estimate without
-- making a genuinely stranded row (the case this lease exists for) invisible
-- for an unreasonable time. attempt_count < 3 still bounds total retries.
--
-- create or replace preserves the function's existing privileges (see
-- 20260729000000's own note on this); the revoke/grant pair is restated anyway
-- to keep the file self-describing for a hand-applied migration.

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
      status = 'queued'
      or (
        status in ('collecting', 'scoring', 'persisting')
        and attempt_count < 3
        and last_attempt_at is not null
        and last_attempt_at < now() - interval '30 minutes'
      )
    )
  returning *;
end;
$$;

revoke execute on function public.claim_audit_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_audit_job(uuid) to service_role;

commit;
