-- v0.1 schema
-- Forward-compat: every table has nullable workspace_id so v0.2 can backfill
-- without schema migrations.

create table audit_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  business_name text not null,
  ig_handle text,
  website_url text,
  industry text,
  district text,
  user_role text,
  status text default 'queued',
  raw_payload jsonb,
  overall_score numeric,
  module_scores jsonb,
  share_slug text unique,
  unlocked boolean default false,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table audit_findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references audit_jobs(id) on delete cascade,
  workspace_id uuid,
  finding_key text not null,
  module text not null,
  severity text not null,
  score_impact numeric,
  owner_message_zh text,
  evidence jsonb,
  v02_agent_hint text,
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references audit_jobs(id),
  workspace_id uuid,
  whatsapp text,
  email text,
  consent_bd_contact boolean,
  lead_score int,
  routed_to text,
  routed_at timestamptz,
  created_at timestamptz default now()
);

create table scan_events (
  id bigserial primary key,
  job_id uuid references audit_jobs(id),
  event_name text,
  payload jsonb,
  created_at timestamptz default now()
);

create index on audit_jobs (share_slug);
create index on audit_findings (job_id, finding_key);
create index on scan_events (job_id, event_name);
