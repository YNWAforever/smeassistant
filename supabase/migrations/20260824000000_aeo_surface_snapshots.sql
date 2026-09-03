-- Per-scan, per-surface, per-query AI-visibility citation facts.
--
-- Adapted from the draft in docs/v0.2-plan.md §10, with two corrections made
-- against conventions established after that draft was written:
--   1. job_id cascades (matching scan_diffs) instead of set-null — erasing a
--      job must not leave AI-visibility history (query text, competitor
--      names, excerpts) orphaned behind it.
--   2. surface is scoped to the three surfaces the pipeline currently
--      produces in a clean per-query shape ('maps' is deferred — its
--      citation data is not yet extracted into that shape).
--
-- unique(job_id, surface, query_text) makes a re-processed job idempotent,
-- matching audit_findings' upsert-on-(job_id,finding_key) and scan_diffs'
-- upsert-on-(base_job_id,head_job_id).

begin;

create table if not exists public.aeo_surface_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audit_jobs(id) on delete cascade,
  place_id text not null,
  surface text not null check (surface in ('ai_overview', 'ai_mode', 'organic')),
  query_text text not null,
  locale text not null,
  market text not null,
  cited boolean not null,
  rank int,
  competitors jsonb not null default '[]',
  excerpt text,
  captured_at timestamptz not null default now(),
  unique (job_id, surface, query_text)
);

create index if not exists aeo_surface_snapshots_place_surface_idx
  on public.aeo_surface_snapshots (place_id, surface, captured_at desc);
create index if not exists aeo_surface_snapshots_job_idx
  on public.aeo_surface_snapshots (job_id);

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.aeo_surface_snapshots enable row level security;
revoke all on table public.aeo_surface_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.aeo_surface_snapshots to service_role;

commit;
