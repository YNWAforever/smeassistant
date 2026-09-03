-- One comparison between two of a merchant's scans.
--
-- Rows are written even when the pair is NOT comparable. An incomparable pair
-- is a fact worth keeping: it is why the merchant sees no trend this month, and
-- without the row the UI cannot tell "we have not compared yet" from "we
-- compared and it was unfair".
--
-- Every delta column is null when comparable is false. The scorer's own rules
-- (packages/scoring/src/diff.ts) decide that; nothing here re-derives them.
--
-- Retention: lives as long as both jobs. Both foreign keys cascade, so erasing
-- either side of a comparison removes the comparison -- correct, because a diff
-- restates content from both scans.

begin;

create table if not exists public.scan_diffs (
  id uuid primary key default gen_random_uuid(),
  base_job_id uuid not null references public.audit_jobs(id) on delete cascade,
  head_job_id uuid not null references public.audit_jobs(id) on delete cascade,
  comparable boolean not null,
  incomparable_reason text,
  composite_withheld_reason text,
  intersection_modules text[] not null default '{}',
  composite_base numeric,
  composite_head numeric,
  composite_delta numeric,
  resolved_findings text[] not null default '{}',
  regressed_findings text[] not null default '{}',
  decayed_findings text[] not null default '{}',
  lost_coverage text[] not null default '{}',
  gained_coverage text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (base_job_id, head_job_id)
);

-- The report and owner dashboard both read "the diff whose head is this job".
create index if not exists scan_diffs_head_idx on public.scan_diffs (head_job_id);

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.scan_diffs enable row level security;
revoke all on table public.scan_diffs from public, anon, authenticated;
grant select, insert, update, delete on table public.scan_diffs to service_role;

commit;
