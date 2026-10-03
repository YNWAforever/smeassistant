-- P4.5 unsaved preview draft (docs/superpowers/specs/2026-10-04-preview-draft-design.md, 1.1-1.3).
--
-- A visitor who unlocked a report may get one AI review-reply draft that is
-- never stored. preview_events is the only thing the preview writes: an event
-- ledger with no text column at all (no review, reply, prompt, contact detail
-- or raw IP). ip_hash is the existing HMAC request fingerprint.
--
-- job_id cascades, so erasing a job erases its preview trail. grant_id is SET
-- NULL, so revoking or deleting a grant keeps the cost record.
--
-- Limits live in claim_preview_slot, under one global advisory lock, so
-- concurrent claims are fully serialized (volume is bounded by the daily
-- limit). Only 'claimed' and 'generated' rows count toward the per-grant,
-- per-job and daily limits; 'failed' rows release the slot and 'refused' rows
-- record the refusal. The budget sums cost_usd over every row of the last 24
-- hours, whatever its outcome.
CREATE TABLE IF NOT EXISTS public.preview_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  grant_id    uuid REFERENCES public.report_access_grants(id) ON DELETE SET NULL,
  outcome     text NOT NULL,
  reason      text,
  cost_usd    numeric NOT NULL DEFAULT 0,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT preview_events_outcome_check CHECK (outcome IN ('claimed', 'generated', 'failed', 'refused')),
  CONSTRAINT preview_events_cost_check CHECK (cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS preview_events_grant_idx ON public.preview_events (grant_id);
CREATE INDEX IF NOT EXISTS preview_events_job_idx ON public.preview_events (job_id);
CREATE INDEX IF NOT EXISTS preview_events_created_idx ON public.preview_events (created_at);

ALTER TABLE public.preview_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.preview_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.preview_events TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.preview_events;
CREATE POLICY server_application ON public.preview_events FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

-- Returns { "allowed": true, "event_id": <uuid> } or { "allowed": false, "reason": <r> }.
-- The refusal order is the spec's: already_used, job_limit, daily_limit, budget.
-- Null arguments or non-positive limits raise (22023) rather than allow.
CREATE OR REPLACE FUNCTION public.claim_preview_slot(p_job uuid, p_grant uuid, p_ip_hash text, p_global_daily integer, p_usd_daily numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  refusal text;
  new_event_id uuid;
begin
  if p_job is null or p_grant is null then
    raise exception using errcode = '22023', message = 'preview_claim_target_required';
  end if;
  if p_global_daily is null or p_global_daily < 1 or p_usd_daily is null or p_usd_daily <= 0 then
    raise exception using errcode = '22023', message = 'preview_claim_limits_invalid';
  end if;

  -- One global lock: every claim is serialized, so each check below reads the
  -- committed result of the previous claim.
  perform pg_advisory_xact_lock(hashtextextended('preview_slot', 0));

  -- A crashed request cannot hold a slot.
  update public.preview_events
  set outcome = 'failed',
      reason = 'stale',
      finished_at = now()
  where outcome = 'claimed'
    and created_at < now() - interval '5 minutes';

  if exists (
    select 1 from public.preview_events
    where grant_id = p_grant and outcome in ('claimed', 'generated')
  ) then
    refusal := 'already_used';
  elsif (
    select count(*) from public.preview_events
    where job_id = p_job and outcome in ('claimed', 'generated')
  ) >= 3 then
    refusal := 'job_limit';
  elsif (
    select count(*) from public.preview_events
    where outcome in ('claimed', 'generated') and created_at > now() - interval '24 hours'
  ) >= p_global_daily then
    refusal := 'daily_limit';
  elsif (
    select coalesce(sum(cost_usd), 0) from public.preview_events
    where created_at > now() - interval '24 hours'
  ) >= p_usd_daily then
    refusal := 'budget';
  end if;

  if refusal is not null then
    insert into public.preview_events (job_id, grant_id, outcome, reason, ip_hash)
    values (p_job, p_grant, 'refused', refusal, p_ip_hash);
    return jsonb_build_object('allowed', false, 'reason', refusal);
  end if;

  insert into public.preview_events (job_id, grant_id, outcome, ip_hash)
  values (p_job, p_grant, 'claimed', p_ip_hash)
  returning id into new_event_id;
  return jsonb_build_object('allowed', true, 'event_id', new_event_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_preview_slot(p_job uuid, p_grant uuid, p_ip_hash text, p_global_daily integer, p_usd_daily numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_preview_slot(p_job uuid, p_grant uuid, p_ip_hash text, p_global_daily integer, p_usd_daily numeric) TO sme_app_runtime;

-- Moves a still-claimed row to generated or failed. Any other transition (an
-- unknown event, or a row already generated, failed, stale or refused) is a
-- no-op. An outcome other than generated or failed raises (22023).
CREATE OR REPLACE FUNCTION public.finish_preview_slot(p_event uuid, p_outcome text, p_reason text, p_cost numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_outcome is null or p_outcome not in ('generated', 'failed') then
    raise exception using errcode = '22023', message = 'preview_outcome_invalid';
  end if;

  update public.preview_events
  set outcome = p_outcome,
      reason = p_reason,
      cost_usd = p_cost,
      finished_at = now()
  where id = p_event
    and outcome = 'claimed';
end;
$function$;

REVOKE ALL ON FUNCTION public.finish_preview_slot(p_event uuid, p_outcome text, p_reason text, p_cost numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_preview_slot(p_event uuid, p_outcome text, p_reason text, p_cost numeric) TO sme_app_runtime;
