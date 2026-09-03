-- Workspace layer (CLAUDE.md 3.3): the tables the Visibility Workspace adds on
-- top of the shared scanner schema. Additive only. Every reused table
-- (workspaces, workspace_members, oauth_connections, scan_schedules,
-- scan_diffs, agent_runs, aeo_surface_snapshots, workspace_tier_events,
-- notification_events) keeps its shape; it only gains columns here.
--
-- Same posture as every other table in this corpus (CLAUDE.md 1.3.7): RLS
-- enabled with zero policies, `revoke all` from public/anon/authenticated,
-- DML granted to service_role only. Authorization is application-layer
-- (lib/auth.ts::requireMembership), never RLS.
--
-- Delete graph: every reference to audit_jobs(id) or workspaces(id) states its
-- on-delete rule on the same line. Merchant content cascades with the
-- workspace; provenance pointers (comparable_to, diff_id, source_snapshot_id,
-- the auth.users actor columns) set null so a row never blocks an erasure.
-- verify-migrations.sh EXPECTED and migration-hardening-sweep.test.ts pin them.
--
-- Re-runnable: every statement is guarded, so an operator unsure whether this
-- already ran can simply paste it again.

begin;

-- additive columns on reused tables
alter table public.workspaces add column if not exists slug text;
alter table public.workspaces add column if not exists timezone text not null default 'Asia/Hong_Kong';
alter table public.workspaces add column if not exists is_demo boolean not null default false;
create unique index if not exists workspaces_slug_key on public.workspaces (slug) where slug is not null;
alter table public.workspace_members add column if not exists location_scope uuid[];

-- Backfill a slug for every workspace that predates this column: kebab-case of
-- business_name (or 'workspace' when that is empty) plus the first eight
-- characters of the id, which keeps two "Cafe" workspaces distinct without a
-- second pass. New workspaces get a slug from lib/workspace/slug.ts instead.
update public.workspaces
set slug = coalesce(
  nullif(trim(both '-' from lower(regexp_replace(coalesce(business_name, 'workspace'), '[^A-Za-z0-9]+', '-', 'g'))), ''),
  'workspace'
) || '-' || left(id::text, 8)
where slug is null;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null, name text not null, address text, district text,
  place_id text, ig_handle text, website_url text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);
alter table public.audit_jobs add column if not exists location_id uuid references public.locations(id) on delete set null;

-- one per finished job that belongs to a workspace: workspace metrics, never a second score
create table if not exists public.scan_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.audit_jobs(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  market text not null, observed_at timestamptz not null,
  scoring_version text, overall_score numeric, coverage numeric not null,
  module_states jsonb not null,
  metrics jsonb not null,
  website_checks jsonb,
  comparable_to uuid references public.scan_snapshots(id) on delete set null,
  diff_id uuid references public.scan_diffs(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  template_key text not null,
  source text not null default 'finding' check (source in ('finding','owner_objective','system')),
  source_finding_keys text[] not null default '{}',
  source_snapshot_id uuid references public.scan_snapshots(id) on delete set null,
  title jsonb not null, summary jsonb not null, evidence jsonb not null,
  priority text not null check (priority in ('urgent','high','medium','low')),
  priority_score numeric not null, priority_factors jsonb not null,
  effort_minutes int not null, required_inputs jsonb not null default '[]', provided_inputs jsonb not null default '{}',
  assignee_user_id uuid references auth.users(id) on delete set null, due_at timestamptz,
  action_state text not null default 'recommended'
    check (action_state in ('recommended','needs_input','ready','in_progress','completed','dismissed','cancelled','expired')),
  measurement_state text not null default 'not_eligible'
    check (measurement_state in ('not_eligible','awaiting_comparable_scan','measured','insufficient_coverage')),
  capability text not null check (capability in ('Live','Beta','Demo','Requires connection','Planned')),
  dedupe_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists actions_open_dedupe_idx on public.actions (dedupe_key)
  where action_state not in ('completed','dismissed','cancelled','expired');

-- updated_at maintenance for actions. Not security definer: a trigger runs as
-- the role performing the update, which is always service_role here.
create or replace function public.touch_actions_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists actions_touch_updated_at on public.actions;
create trigger actions_touch_updated_at
  before update on public.actions
  for each row
  execute function public.touch_actions_updated_at();

create table if not exists public.action_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  agent_key text not null,
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed','cancelled','timed_out')),
  input jsonb, output jsonb, model text, prompt_version text, error text,
  input_tokens int, output_tokens int, cost_usd numeric,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz
);

create table if not exists public.output_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  version_no int not null, body text not null, alt_text text, meta jsonb not null default '{}',
  author_type text not null check (author_type in ('user','agent')),
  author_user_id uuid references auth.users(id) on delete set null,
  action_run_id uuid references public.action_runs(id) on delete set null,
  approval_state text not null default 'draft'
    check (approval_state in ('draft','changes_requested','approved','rejected','superseded')),
  approved_by uuid references auth.users(id) on delete set null, approved_at timestamptz, reviewer_comment text,
  delivery_state text not null default 'not_requested'
    check (delivery_state in ('not_requested','export_ready','exported','scheduled','publishing','published','failed','cancelled')),
  first_exported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (action_id, version_no)
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_id uuid not null references public.output_versions(id) on delete cascade,
  mode text not null check (mode in ('export','copy','publish')), channel text,
  state text not null check (state in ('export_ready','exported','scheduled','publishing','published','failed','cancelled')),
  counted boolean not null default false, idempotency_key text unique not null, payload jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create table if not exists public.workspace_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period text not null,
  approved_deliveries int not null default 0, allowance int,
  primary key (workspace_id, period)
);

create table if not exists public.action_measurements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  before_snapshot_id uuid references public.scan_snapshots(id) on delete set null,
  after_snapshot_id uuid references public.scan_snapshots(id) on delete set null,
  metric_key text not null, before_value numeric, after_value numeric, delta numeric,
  fact_type text not null check (fact_type in ('Observed','Attributed','Unknown')), window_days int,
  created_at timestamptz not null default now()
);

create table if not exists public.brand_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  voice text not null default 'warm', approved_claims text[] not null default '{}',
  prohibited_terms text[] not null default '{}', languages text[] not null default '{zh-HK}',
  facts jsonb not null default '{}', updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  kind text not null check (kind in ('image','document','menu')),
  storage_path text not null, filename text not null, alt_text text,
  rights_status text not null default 'needs_review' check (rights_status in ('approved','needs_review','rejected')),
  rights_confirmed_at timestamptz, uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigserial primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade, location_id uuid,
  actor_type text not null check (actor_type in ('user','agent','system','scanner')), actor_id uuid,
  event text not null, entity_type text, entity_id uuid, payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_workspace_idx on public.audit_events (workspace_id, created_at desc);

-- in-app notifications; upstream's notification_events stays the email log
create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null, title jsonb not null, body jsonb, href text,
  read_at timestamptz, created_at timestamptz not null default now()
);

-- Private storage bucket for owner-uploaded assets (images, menus, PDFs).
-- Same upsert shape as report-evidence: re-running re-asserts private and the
-- limits rather than leaving a hand-edited bucket alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-assets', 'workspace-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Server-only boundary for every table above (CLAUDE.md 1.3.7). One statement
-- per table per verb: migration-hardening-sweep.test.ts parses these shapes.
alter table public.locations enable row level security;
revoke all on table public.locations from public, anon, authenticated;
grant select, insert, update, delete on table public.locations to service_role;

alter table public.scan_snapshots enable row level security;
revoke all on table public.scan_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.scan_snapshots to service_role;

alter table public.actions enable row level security;
revoke all on table public.actions from public, anon, authenticated;
grant select, insert, update, delete on table public.actions to service_role;

alter table public.action_runs enable row level security;
revoke all on table public.action_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.action_runs to service_role;

alter table public.output_versions enable row level security;
revoke all on table public.output_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.output_versions to service_role;

alter table public.deliveries enable row level security;
revoke all on table public.deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.deliveries to service_role;

alter table public.workspace_usage enable row level security;
revoke all on table public.workspace_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_usage to service_role;

alter table public.action_measurements enable row level security;
revoke all on table public.action_measurements from public, anon, authenticated;
grant select, insert, update, delete on table public.action_measurements to service_role;

alter table public.brand_profiles enable row level security;
revoke all on table public.brand_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.brand_profiles to service_role;

alter table public.assets enable row level security;
revoke all on table public.assets from public, anon, authenticated;
grant select, insert, update, delete on table public.assets to service_role;

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from public, anon, authenticated;
grant select, insert, update, delete on table public.audit_events to service_role;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated;
grant usage, select, update on sequence public.audit_events_id_seq to service_role;

alter table public.workspace_notifications enable row level security;
revoke all on table public.workspace_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_notifications to service_role;

commit;
