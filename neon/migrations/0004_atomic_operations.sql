-- Final legacy atomic contracts, translated for the inherited server runtime role.
-- SECURITY INVOKER deliberately retains caller identity and RLS for nested fence triggers.
-- No owner privilege elevation; runtime DML policies and explicit EXECUTE grants apply.
-- SHA-256 uses core PostgreSQL bytea hashing instead of the Supabase extensions schema.

CREATE OR REPLACE FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
begin
  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state in ('rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  if v.approval_state = 'approved' then
    return jsonb_build_object('kind', 'already-approved', 'version_id', v.id, 'version_no', v.version_no);
  end if;

  update public.output_versions
  set approval_state = 'superseded'
  where action_id = v.action_id
    and id <> v.id
    and approval_state = 'approved';

  update public.output_versions
  set approval_state = 'approved',
      approved_by = p_actor,
      approved_at = now(),
      reviewer_comment = p_comment,
      delivery_state = 'export_ready'
  where id = v.id;

  update public.actions
  set action_state = 'in_progress'
  where id = v.action_id
    and action_state not in ('completed', 'dismissed', 'cancelled', 'expired');

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'version.approved', 'output_version', v.id,
          jsonb_build_object('version_no', v.version_no, 'action_id', v.action_id, 'comment', p_comment));

  return jsonb_build_object('kind', 'approved', 'version_id', v.id, 'version_no', v.version_no);
end;
$function$;

REVOKE ALL ON FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.claim_audit_job(p_job_id uuid)
 RETURNS SETOF audit_jobs
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.claim_audit_job(p_job_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_audit_job(p_job_id uuid) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.claim_workspace_completion(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j public.audit_jobs%rowtype; c public.workspace_scan_completions%rowtype; token uuid;
begin
  select * into j from public.audit_jobs where id = p_job_id;
  if not found or j.workspace_id is null or j.status not in ('done','partial','failed') then
    return jsonb_build_object('status','skipped');
  end if;
  -- Serialize claims across this workspace, including jobs without a ledger row.
  perform 1 from public.workspaces where id = j.workspace_id for update;
  select * into c from public.workspace_scan_completions where job_id = p_job_id for update;
  if c.state = 'completed' then return jsonb_build_object('status','completed'); end if;
  if c.next_attempt_at > now() or exists (
    select 1 from public.workspace_scan_completions
    where workspace_id = j.workspace_id and state = 'running' and lease_until > now()
  ) then return jsonb_build_object('status','busy'); end if;
  token := gen_random_uuid();
  insert into public.workspace_scan_completions(job_id,workspace_id,state,attempts,lease_token,lease_until)
  values(j.id,j.workspace_id,'running',1,token,now() + interval '5 minutes')
  on conflict(job_id) do update set state='running', attempts=public.workspace_scan_completions.attempts+1,
    lease_token=token, lease_until=now()+interval '5 minutes', updated_at=now();
  return jsonb_build_object('status','claimed','token',token);
end; $function$;

REVOKE ALL ON FUNCTION public.claim_workspace_completion(p_job_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_workspace_completion(p_job_id uuid) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.complete_report_unlock(p_job_id uuid, p_whatsapp text, p_email text, p_recovery_email text, p_preferred_contact_channel text, p_contact_identifier text, p_business_objective text, p_report_delivery_consent boolean, p_scan_discussion_consent boolean, p_marketing_consent boolean, p_policy_version text, p_locale text, p_token_hash text, p_idempotency_key text, p_purpose text, p_expires_at timestamp with time zone, p_anonymous_session_id text, p_event_properties jsonb)
 RETURNS TABLE(lead_id uuid, grant_id uuid, event_created boolean)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  existing_lead_id uuid;
  existing_grant_id uuid;
  created_lead_id uuid;
  created_grant_id uuid;
  created_event_count integer := 0;
begin
  if btrim(coalesce(p_idempotency_key, '')) = '' then
    raise exception 'idempotency_key_required' using errcode = '22023';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token_hash_must_be_sha256_hex' using errcode = '22023';
  end if;
  if p_event_properties is null
     or jsonb_typeof(p_event_properties) <> 'object'
     or not (p_event_properties ?& array['market', 'channel', 'objective'])
     or exists (
       select 1
       from jsonb_object_keys(p_event_properties) as property_key
       where property_key not in ('market', 'channel', 'objective')
     )
     or p_event_properties->>'market' not in ('HK', 'TW')
     or jsonb_typeof(p_event_properties->'channel') <> 'string'
     or btrim(p_event_properties->>'channel') = ''
     or jsonb_typeof(p_event_properties->'objective') <> 'string'
     or btrim(p_event_properties->>'objective') = '' then
    raise exception 'analytics_event_properties_invalid' using errcode = '22023';
  end if;

  -- Serialize retries for one job/key pair so a concurrent request cannot
  -- create a second lead before the unique grant boundary is checked.
  perform pg_advisory_xact_lock(
    hashtextextended(p_job_id::text || ':' || p_idempotency_key, 0::bigint)
  );

  select access_grant.lead_id, access_grant.id
  into existing_lead_id, existing_grant_id
  from public.report_access_grants access_grant
  where access_grant.job_id = p_job_id
    and access_grant.idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return query select existing_lead_id, existing_grant_id, false;
    return;
  end if;

  insert into public.leads (
    job_id,
    whatsapp,
    email,
    consent_bd_contact,
    preferred_contact_channel,
    contact_identifier,
    business_objective
  ) values (
    p_job_id,
    nullif(btrim(p_whatsapp), ''),
    nullif(lower(btrim(p_email)), ''),
    p_scan_discussion_consent,
    nullif(btrim(p_preferred_contact_channel), ''),
    nullif(btrim(p_contact_identifier), ''),
    nullif(btrim(p_business_objective), '')
  )
  returning id into created_lead_id;

  insert into public.consent_records (job_id, lead_id, consent_type, granted, policy_version, locale)
  values
    (p_job_id, created_lead_id, 'report_delivery', p_report_delivery_consent, p_policy_version, p_locale),
    (p_job_id, created_lead_id, 'scan_discussion', p_scan_discussion_consent, p_policy_version, p_locale),
    (p_job_id, created_lead_id, 'marketing', p_marketing_consent, p_policy_version, p_locale);

  insert into public.report_access_grants (
    job_id,
    lead_id,
    token_hash,
    idempotency_key,
    purpose,
    email_normalized,
    expires_at
  ) values (
    p_job_id,
    created_lead_id,
    p_token_hash,
    p_idempotency_key,
    p_purpose,
    nullif(lower(btrim(p_recovery_email)), ''),
    p_expires_at
  )
  returning id into created_grant_id;

  insert into public.scan_events (
    job_id,
    anonymous_session_id,
    event_name,
    properties,
    dedupe_key
  ) values (
    p_job_id,
    p_anonymous_session_id,
    'report_unlocked',
    p_event_properties,
    encode(sha256(convert_to(p_job_id::text || ':' || p_idempotency_key, 'UTF8')), 'hex')
  )
  on conflict (job_id, anonymous_session_id, event_name, dedupe_key) do nothing;
  get diagnostics created_event_count = row_count;

  return query select created_lead_id, created_grant_id, created_event_count = 1;
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_report_unlock(p_job_id uuid, p_whatsapp text, p_email text, p_recovery_email text, p_preferred_contact_channel text, p_contact_identifier text, p_business_objective text, p_report_delivery_consent boolean, p_scan_discussion_consent boolean, p_marketing_consent boolean, p_policy_version text, p_locale text, p_token_hash text, p_idempotency_key text, p_purpose text, p_expires_at timestamp with time zone, p_anonymous_session_id text, p_event_properties jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_report_unlock(p_job_id uuid, p_whatsapp text, p_email text, p_recovery_email text, p_preferred_contact_channel text, p_contact_identifier text, p_business_objective text, p_report_delivery_consent boolean, p_scan_discussion_consent boolean, p_marketing_consent boolean, p_policy_version text, p_locale text, p_token_hash text, p_idempotency_key text, p_purpose text, p_expires_at timestamp with time zone, p_anonymous_session_id text, p_event_properties jsonb) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, retry_after_seconds integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  current_bucket public.rate_limit_buckets%rowtype;
  now_at timestamptz := clock_timestamp();
  window_ends_at timestamptz;
begin
  if btrim(coalesce(p_bucket_key, '')) = '' then
    raise exception 'bucket_key_required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'limit_must_be_positive' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'window_must_be_positive' using errcode = '22023';
  end if;

  -- Bound cleanup work while ensuring expired attacker-created keys do not
  -- remain as permanent storage.
  with expired as (
    select bucket_key
    from public.rate_limit_buckets
    where expires_at <= now_at
      and bucket_key <> p_bucket_key
    order by expires_at
    limit 100
    for update skip locked
  )
  delete from public.rate_limit_buckets as bucket
  using expired
  where bucket.bucket_key = expired.bucket_key;

  -- Serialize the missing-row and existing-row cases alike. The key is a
  -- digest, so using it as an advisory lock does not reveal raw identity.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket_key, 0::bigint));
  select *
  into current_bucket
  from public.rate_limit_buckets
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.rate_limit_buckets (bucket_key, window_started_at, request_count, updated_at, expires_at)
    values (p_bucket_key, now_at, 1, now_at, now_at + (p_window_seconds * interval '1 second'));
    return query select true, 0;
    return;
  end if;

  window_ends_at := current_bucket.window_started_at + (p_window_seconds * interval '1 second');
  if window_ends_at <= now_at then
    update public.rate_limit_buckets
    set
      window_started_at = now_at,
      request_count = 1,
      updated_at = now_at,
      expires_at = now_at + (p_window_seconds * interval '1 second')
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  if current_bucket.request_count < p_limit then
    update public.rate_limit_buckets
    set
      request_count = current_bucket.request_count + 1,
      updated_at = now_at,
      expires_at = window_ends_at
    where bucket_key = p_bucket_key;
    return query select true, 0;
    return;
  end if;

  return query select false, greatest(1, ceil(extract(epoch from (window_ends_at - now_at)))::integer);
end;
$function$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(p_bucket_key text, p_limit integer, p_window_seconds integer) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.create_output_version(p_action_id uuid, p_actor uuid, p_author_type text, p_action_run_id uuid, p_body text, p_alt text, p_meta jsonb, p_base_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  a public.actions%rowtype;
  latest_id uuid;
  next_no int;
  new_id uuid;
begin
  -- Lock the action row so two concurrent drafts cannot both compute max+1.
  select * into a from public.actions where id = p_action_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;

  select id into latest_id
  from public.output_versions
  where action_id = p_action_id
  order by version_no desc
  limit 1;

  -- Optimistic concurrency: a caller that names the version it edited must
  -- still be looking at the latest one. A null base appends unconditionally
  -- (the first draft, or an agent run that never read a version).
  if p_base_version_id is not null and p_base_version_id is distinct from latest_id then
    raise exception using errcode = 'P0001', message = 'version_conflict';
  end if;

  select coalesce(max(version_no), 0) + 1 into next_no
  from public.output_versions
  where action_id = p_action_id;

  -- Earlier drafts that were never approved are replaced by this one; an
  -- approved version stays approved until approve_output_version says otherwise.
  update public.output_versions
  set approval_state = 'superseded'
  where action_id = p_action_id
    and approval_state in ('draft', 'changes_requested');

  insert into public.output_versions (
    workspace_id, action_id, version_no, body, alt_text, meta,
    author_type, author_user_id, action_run_id
  )
  values (
    a.workspace_id, p_action_id, next_no, p_body, p_alt, coalesce(p_meta, '{}'::jsonb),
    p_author_type, case when p_author_type = 'user' then p_actor else null end, p_action_run_id
  )
  returning id into new_id;

  insert into public.audit_events (workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (a.workspace_id, a.location_id, 'user', p_actor, 'version.created', 'output_version', new_id,
          jsonb_build_object('version_no', next_no, 'action_id', p_action_id, 'author_type', p_author_type,
                             'base_version_id', p_base_version_id, 'action_run_id', p_action_run_id));

  return jsonb_build_object('kind', 'created', 'version_id', new_id, 'version_no', next_no);
end;
$function$;

REVOKE ALL ON FUNCTION public.create_output_version(p_action_id uuid, p_actor uuid, p_author_type text, p_action_run_id uuid, p_body text, p_alt text, p_meta jsonb, p_base_version_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_output_version(p_action_id uuid, p_actor uuid, p_author_type text, p_action_run_id uuid, p_body text, p_alt text, p_meta jsonb, p_base_version_id uuid) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.decide_output_version(p_version_id uuid, p_actor uuid, p_decision text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
begin
  if p_decision not in ('changes_requested', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;

  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state in ('rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  if v.approval_state = p_decision then
    return jsonb_build_object('kind', 'already-decided', 'version_id', v.id, 'version_no', v.version_no, 'decision', p_decision);
  end if;

  update public.output_versions
  set approval_state = p_decision,
      reviewer_comment = p_comment,
      approved_by = null,
      approved_at = null,
      delivery_state = case when delivery_state = 'export_ready' then 'not_requested' else delivery_state end
  where id = v.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor,
          case when p_decision = 'rejected' then 'version.rejected' else 'version.changes_requested' end,
          'output_version', v.id,
          jsonb_build_object('version_no', v.version_no, 'action_id', v.action_id, 'comment', p_comment));

  return jsonb_build_object('kind', 'decided', 'version_id', v.id, 'version_no', v.version_no, 'decision', p_decision);
end;
$function$;

REVOKE ALL ON FUNCTION public.decide_output_version(p_version_id uuid, p_actor uuid, p_decision text, p_comment text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_output_version(p_version_id uuid, p_actor uuid, p_decision text, p_comment text) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
  existing public.deliveries%rowtype;
  ws_timezone text;
  ws_tier text;
  usage_period text;
  usage_row public.workspace_usage%rowtype;
  first_export boolean;
  delivery_id uuid;
begin
  if p_mode not in ('export', 'copy') then
    raise exception using errcode = 'P0001', message = 'invalid_mode';
  end if;

  -- Same key, same answer: the route can retry without a second count.
  select * into existing from public.deliveries where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('kind', 'existing', 'delivery_id', existing.id, 'version_id', existing.version_id,
                              'counted', false, 'state', existing.state);
  end if;

  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'not_approved';
  end if;

  first_export := v.first_exported_at is null;

  if first_export then
    select timezone, tier into ws_timezone, ws_tier from public.workspaces where id = v.workspace_id;
    usage_period := to_char(now() at time zone coalesce(ws_timezone, 'Asia/Hong_Kong'), 'YYYY-MM');

    -- Lazily create the period row with the tier's allowance (lite 3, paid
    -- unlimited) so the first export of a month never fails for lack of one.
    insert into public.workspace_usage (workspace_id, period, approved_deliveries, allowance)
    values (v.workspace_id, usage_period, 0, case when ws_tier = 'paid' then null else 3 end)
    on conflict (workspace_id, period) do nothing;

    select * into usage_row from public.workspace_usage
    where workspace_id = v.workspace_id and period = usage_period
    for update;

    if usage_row.allowance is not null and usage_row.approved_deliveries >= usage_row.allowance then
      raise exception using errcode = 'P0001', message = 'allowance_exceeded';
    end if;

    update public.workspace_usage
    set approved_deliveries = approved_deliveries + 1
    where workspace_id = v.workspace_id and period = usage_period;

    update public.output_versions
    set first_exported_at = now(), delivery_state = 'exported'
    where id = v.id;
  end if;

  insert into public.deliveries (workspace_id, version_id, mode, state, counted, idempotency_key, payload, created_by)
  values (v.workspace_id, v.id, p_mode, 'exported', first_export, p_idempotency_key,
          jsonb_build_object('version_no', v.version_no), p_actor)
  returning id into delivery_id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor,
          case when p_mode = 'copy' then 'delivery.copied' else 'delivery.exported' end,
          'delivery', delivery_id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                             'counted', first_export, 'idempotency_key', p_idempotency_key));

  return jsonb_build_object('kind', 'exported', 'delivery_id', delivery_id, 'version_id', v.id,
                            'counted', first_export, 'state', 'exported');
end;
$function$;

REVOKE ALL ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.fence_workspace_completion_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare job_text text; token_text text; job uuid; token uuid; target_workspace uuid;
  j public.audit_jobs%rowtype; c public.workspace_scan_completions%rowtype;
begin
  job_text := nullif(current_setting('app.completion_job',true),'');
  token_text := nullif(current_setting('app.completion_token',true),'');
  if job_text is null and token_text is null then return new; end if;
  if not pg_has_role(current_user, 'sme_app_runtime', 'USAGE') then raise exception 'completion_role_denied'; end if;
  if job_text is null or token_text is null then raise exception 'completion_context_missing'; end if;
  job := job_text::uuid;
  token := token_text::uuid;
  target_workspace := new.workspace_id;
  -- Same lock order as claim: workspace first, then completion record.
  perform 1 from public.workspaces where id = target_workspace for update;
  select * into c from public.workspace_scan_completions where job_id=job for update;
  if not found or c.workspace_id is distinct from target_workspace or c.state <> 'running'
     or c.lease_token is distinct from token or c.lease_until is null or c.lease_until <= clock_timestamp() then
    raise exception 'completion_lease_lost';
  end if;
  select * into j from public.audit_jobs where id=job;
  if j.workspace_id is distinct from target_workspace or j.status not in ('done','partial','failed') then
    raise exception 'completion_job_changed';
  end if;
  if tg_table_name = 'scan_snapshots' then
    if new.job_id is distinct from job or new.location_id is distinct from j.location_id then
      raise exception 'completion_snapshot_scope';
    end if;
  elsif tg_table_name = 'actions' then
    if new.location_id is distinct from j.location_id then
      if not (tg_op = 'UPDATE' and new.location_id is null
        and (to_jsonb(new) - 'measurement_state' - 'updated_at') = (to_jsonb(old) - 'measurement_state' - 'updated_at'))
        then raise exception 'completion_action_scope'; end if;
    end if;
    if exists (
      select 1 from public.scan_snapshots s join public.scan_snapshots head on head.job_id=job
      where s.workspace_id=j.workspace_id and s.location_id is not distinct from j.location_id
      and (s.observed_at,s.created_at,s.id) > (head.observed_at,head.created_at,head.id)
    ) then raise exception 'completion_newer_snapshot'; end if;
  elsif tg_table_name = 'action_measurements' then
    if not exists(select 1 from public.scan_snapshots s where s.id=new.after_snapshot_id
      and s.job_id=job and s.workspace_id=target_workspace and s.location_id is not distinct from j.location_id)
      then raise exception 'completion_measurement_scope'; end if;
  end if;
  return new;
end; $function$;

REVOKE ALL ON FUNCTION public.fence_workspace_completion_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fence_workspace_completion_write() TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.finish_workspace_completion(p_job_id uuid, p_token uuid, p_succeeded boolean, p_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.workspaces where id=(select workspace_id from public.workspace_scan_completions where job_id=p_job_id) for update;
  update public.workspace_scan_completions set state=case when p_succeeded then 'completed' else 'retry' end,
    completed_at=case when p_succeeded then now() else null end,
    last_error=case when p_succeeded then null else 'workspace_post_process_failed' end,
    next_attempt_at=now()+interval '5 minutes',lease_until=null,lease_token=null,updated_at=now()
  where job_id=p_job_id and lease_token=p_token and state='running' and lease_until > clock_timestamp();
  return found;
end; $function$;

REVOKE ALL ON FUNCTION public.finish_workspace_completion(p_job_id uuid, p_token uuid, p_succeeded boolean, p_error text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_workspace_completion(p_job_id uuid, p_token uuid, p_succeeded boolean, p_error text) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.pending_workspace_completions(p_limit integer DEFAULT 5)
 RETURNS TABLE(job_id uuid)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select j.id from public.audit_jobs j left join public.workspace_scan_completions c on c.job_id=j.id
  where j.workspace_id is not null and j.status in ('done','partial','failed')
    and (c.job_id is null or (c.state <> 'completed' and c.next_attempt_at <= now()
      and (c.lease_until is null or c.lease_until <= now())))
  order by j.created_at,j.id limit greatest(1,least(coalesce(p_limit,5),5));
$function$;

REVOKE ALL ON FUNCTION public.pending_workspace_completions(p_limit integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_workspace_completions(p_limit integer) TO sme_app_runtime;

CREATE TRIGGER completion_fence_measurements BEFORE INSERT OR UPDATE ON public.action_measurements FOR EACH ROW EXECUTE FUNCTION public.fence_workspace_completion_write();
CREATE TRIGGER completion_fence_actions BEFORE INSERT OR UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION public.fence_workspace_completion_write();
CREATE TRIGGER completion_fence_audits BEFORE INSERT OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.fence_workspace_completion_write();
CREATE TRIGGER completion_fence_snapshots BEFORE INSERT OR UPDATE ON public.scan_snapshots FOR EACH ROW EXECUTE FUNCTION public.fence_workspace_completion_write();
CREATE TRIGGER completion_fence_notifications BEFORE INSERT OR UPDATE ON public.workspace_notifications FOR EACH ROW EXECUTE FUNCTION public.fence_workspace_completion_write();
