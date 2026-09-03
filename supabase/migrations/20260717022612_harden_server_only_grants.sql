-- Defense in depth for projects created before or after Supabase's 2026
-- explicit Data API grant defaults. This follow-up is intentionally idempotent
-- so environments that already ran the trust foundation migration receive the
-- same server-only boundary without rewriting migration history.

begin;

alter table public.audit_jobs enable row level security;
alter table public.audit_findings enable row level security;
alter table public.leads enable row level security;
alter table public.report_access_grants enable row level security;
alter table public.consent_records enable row level security;
alter table public.staff_report_events enable row level security;
alter table public.scan_events enable row level security;
alter table public.rate_limit_buckets enable row level security;

revoke all on table public.audit_jobs, public.audit_findings, public.leads,
  public.report_access_grants, public.consent_records, public.staff_report_events,
  public.scan_events, public.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.audit_jobs,
  public.audit_findings, public.leads, public.report_access_grants,
  public.consent_records, public.staff_report_events, public.scan_events,
  public.rate_limit_buckets to service_role;

do $$
begin
  if to_regclass('public.scan_events_id_seq') is not null then
    revoke all on sequence public.scan_events_id_seq from public, anon, authenticated;
    grant usage, select, update on sequence public.scan_events_id_seq to service_role;
  end if;
end
$$;

-- Rebuild the existing unlock RPC so extension calls remain resolvable under
-- its empty search path; ALTER FUNCTION alone would retain the old body.
create or replace function public.complete_report_unlock(
  p_job_id uuid,
  p_whatsapp text,
  p_email text,
  p_recovery_email text,
  p_preferred_contact_channel text,
  p_contact_identifier text,
  p_business_objective text,
  p_report_delivery_consent boolean,
  p_scan_discussion_consent boolean,
  p_marketing_consent boolean,
  p_policy_version text,
  p_locale text,
  p_token_hash text,
  p_idempotency_key text,
  p_purpose text,
  p_expires_at timestamptz,
  p_anonymous_session_id text,
  p_event_properties jsonb
)
returns table (lead_id uuid, grant_id uuid, event_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
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
    encode(extensions.digest(p_job_id::text || ':' || p_idempotency_key, 'sha256'), 'hex')
  )
  on conflict (job_id, anonymous_session_id, event_name, dedupe_key) do nothing;
  get diagnostics created_event_count = row_count;

  return query select created_lead_id, created_grant_id, created_event_count = 1;
end;
$$;

alter function public.claim_audit_job(uuid) set search_path = '';
alter function public.complete_report_unlock(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text,
  text, text, text, text, timestamptz, text, jsonb
) set search_path = '';

revoke execute on function public.claim_audit_job(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_audit_job(uuid) to service_role;
revoke execute on function public.complete_report_unlock(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text,
  text, text, text, text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_report_unlock(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text,
  text, text, text, text, timestamptz, text, jsonb
) to service_role;

commit;
