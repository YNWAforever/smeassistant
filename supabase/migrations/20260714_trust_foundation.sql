-- Trust foundation: durable job state, viewer grants, consent, staff audit,
-- analytics, and server-side rate limiting primitives.

begin;

-- Deploy compatibility: apps/web/app/api/scan/process/route.ts writes
-- `collecting` before this constraint is applied; Task 3 will replace it with
-- claim_audit_job once the atomic processor is deployed.

-- Existing deployments used `running`; map those rows before constraining the
-- durable state machine. Unknown/null legacy values are made terminal/queued so
-- the new constraint can be applied without losing a job silently.
update audit_jobs
set status = case
  when status = 'running' then 'collecting'
  when status is null then 'queued'
  when status not in ('queued', 'collecting', 'scoring', 'persisting', 'done', 'partial', 'failed') then 'failed'
  else status
end;

alter table audit_jobs
  add column if not exists processing_stage text,
  add column if not exists module_results jsonb,
  add column if not exists score_coverage numeric,
  add column if not exists scoring_version text,
  add column if not exists input_snapshot jsonb,
  add column if not exists failure_category text,
  add column if not exists failure_correlation_id uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists business_objective text,
  add column if not exists place_id text,
  add column if not exists place_match_confidence text,
  add column if not exists parent_job_id uuid references audit_jobs(id);

alter table audit_jobs
  alter column status set default 'queued',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_jobs'::regclass
      and conname = 'audit_jobs_status_check'
  ) then
    alter table audit_jobs
      add constraint audit_jobs_status_check
      check (status in ('queued', 'collecting', 'scoring', 'persisting', 'done', 'partial', 'failed'));
  end if;
end
$$;

alter table audit_findings add column if not exists finding_key text;

update audit_findings
set finding_key = coalesce(module, 'unknown') || ':' || id::text
where finding_key is null or btrim(finding_key) = '';

alter table audit_findings alter column finding_key set not null;

-- Keep the earliest stable row for each key before adding the uniqueness
-- boundary. A second migration run finds no rows with row_number() > 1.
with ranked_findings as (
  select id,
    row_number() over (
      partition by job_id, finding_key
      order by created_at asc nulls first, id asc
    ) as row_number
  from audit_findings
)
delete from audit_findings findings
using ranked_findings ranked
where findings.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists audit_findings_job_finding_key_unique_idx
  on audit_findings (job_id, finding_key);

create table if not exists report_access_grants (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references audit_jobs(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  token_hash text not null,
  idempotency_key text not null,
  purpose text not null,
  email_normalized text,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table report_access_grants
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists idempotency_key text;

-- Existing rows from an interrupted/older rollout receive a stable legacy key
-- so this migration remains rerunnable before the not-null boundary is added.
update report_access_grants
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null or btrim(idempotency_key) = '';

alter table report_access_grants
  alter column idempotency_key set not null;

-- A token hash cannot be repaired without the original viewer token. Abort
-- before adding the constraint so operators can restore verified SHA-256 hashes
-- rather than silently granting or revoking access.
do $$
declare
  invalid_token_hashes bigint;
begin
  select count(*) into invalid_token_hashes
  from report_access_grants
  where token_hash is null
     or token_hash !~ '^[0-9a-f]{64}$';

  if invalid_token_hashes > 0 then
    raise exception
      'trust foundation migration blocked: report_access_grants has % invalid token_hash row(s); restore verified SHA-256 hashes before retry',
      invalid_token_hashes
      using errcode = '23514',
            hint = 'Do not guess token hashes. Recover the original grant records or remove them under the approved retention procedure.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access_grants'::regclass
      and conname = 'report_access_grants_token_hash_sha256_check'
  ) then
    alter table report_access_grants
      add constraint report_access_grants_token_hash_sha256_check
      check (token_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access_grants'::regclass
      and conname = 'report_access_grants_idempotency_key_check'
  ) then
    alter table report_access_grants
      add constraint report_access_grants_idempotency_key_check
      check (btrim(idempotency_key) <> '');
  end if;
end
$$;

-- Preserve one deterministic idempotency key for each existing grant. Any
-- duplicate gets a row-identity-based legacy key; a remaining collision aborts
-- before the unique index rather than guessing which grant should win.
with ranked_grants as (
  select id,
    row_number() over (
      partition by job_id, idempotency_key
      order by created_at asc nulls first, id asc
    ) as row_number
  from report_access_grants
)
update report_access_grants access_grant
set idempotency_key = 'legacy:' || access_grant.id::text
from ranked_grants ranked
where access_grant.id = ranked.id
  and ranked.row_number > 1;

do $$
begin
  if exists (
    select 1
    from report_access_grants
    group by job_id, idempotency_key
    having count(*) > 1
  ) then
    raise exception
      'trust foundation migration blocked: duplicate report_access_grants idempotency keys remain after deterministic rewrite'
      using errcode = '23505',
            hint = 'Resolve duplicate grant identities under the approved retention procedure before retrying.';
  end if;
end
$$;

create unique index if not exists report_access_grants_token_hash_unique_idx
  on report_access_grants (token_hash);
create unique index if not exists report_access_grants_job_idempotency_key_unique_idx
  on report_access_grants (job_id, idempotency_key);
create index if not exists report_access_grants_job_id_idx
  on report_access_grants (job_id);

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references audit_jobs(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  consent_type text not null,
  granted boolean not null,
  policy_version text not null,
  locale text not null,
  recorded_at timestamptz not null default now()
);

create index if not exists consent_records_job_id_idx
  on consent_records (job_id);

create table if not exists staff_report_events (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null,
  staff_email_normalized text not null,
  job_id uuid not null references audit_jobs(id) on delete cascade,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_report_events_job_id_created_at_idx
  on staff_report_events (job_id, created_at desc);

alter table scan_events
  add column if not exists anonymous_session_id text,
  add column if not exists properties jsonb,
  add column if not exists dedupe_key text;

update scan_events
set properties = payload
where properties is null and payload is not null;

create index if not exists scan_events_job_id_created_at_idx
  on scan_events (job_id, created_at desc);
create unique index if not exists scan_events_dedupe_identity_unique_idx
  on scan_events (job_id, anonymous_session_id, event_name, dedupe_key);

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table leads
  add column if not exists preferred_contact_channel text,
  add column if not exists contact_identifier text,
  add column if not exists business_objective text;

-- All scanner relations are server-only. No anon/authenticated policy is
-- created; trusted server routes use service_role. Explicit grants are
-- required for projects created under the 2026 Data API defaults and revoke
-- legacy automatic exposure on older projects.
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

drop function if exists public.claim_audit_job(uuid);

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
    and status = 'queued'
  returning *;
end;
$$;
drop function if exists public.complete_report_unlock(
  uuid, text, text, text, text, text, boolean, boolean, boolean, text, text,
  text, text, text, timestamptz, text, jsonb
);
drop function if exists public.complete_report_unlock(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean, text,
  text, text, text, text, timestamptz, text, jsonb
);

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
revoke execute on function public.claim_audit_job(uuid) from public, anon, authenticated;
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
