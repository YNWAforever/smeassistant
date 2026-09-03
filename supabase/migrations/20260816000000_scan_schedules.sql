-- One recurring scan per merchant, keyed by the Google place_id that identifies
-- them. Monthly cadence on a per-merchant anniversary day: 200 merchants all
-- firing on the 1st would be 1,400 SerpApi searches inside one window (~28% of
-- the Developer plan's month) competing with that day's organic traffic. Spread
-- across 28 days it is ~7 merchants a day.
--
-- anniversary_day is capped at 28 so no month can skip a merchant. Days 29-31
-- would silently not exist in February, which is a scheduler that quietly stops
-- working for 1 in 10 merchants rather than one that fails loudly.
--
-- input_snapshot carries the v2 envelope /api/scan/start built for the first
-- scan, so a scheduled re-scan reproduces the merchant's confirmed identity
-- (place_id / data_id / data_cid, alternate names, IG handle and its
-- provenance) instead of re-guessing it. It is a snapshot on purpose: a
-- re-scan must measure the same subject as the scan it will be compared with.
--
-- Retention: rows live as long as the merchant relationship. There is no
-- automatic expiry -- a paused schedule is the off switch, and staff delete the
-- row to end it. Erasing one report must not end the relationship, hence
-- last_job_id is `on delete set null` and not `on delete cascade`.

begin;

create table if not exists public.scan_schedules (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,
  input_snapshot jsonb not null,
  cadence text not null default 'monthly' check (cadence in ('monthly', 'paused')),
  anniversary_day smallint not null check (anniversary_day between 1 and 28),
  last_job_id uuid references public.audit_jobs(id) on delete set null,
  next_run_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- The dispatcher's only query: due, active schedules in next_run_at order.
create index if not exists scan_schedules_due_idx
  on public.scan_schedules (next_run_at) where cadence = 'monthly';

-- Phase 3 reads a merchant's scan sequence by place_id; audit_jobs has no such
-- index today (0001 indexes share_slug and status only).
create index if not exists audit_jobs_place_created_idx
  on public.audit_jobs (place_id, created_at desc);

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.scan_schedules enable row level security;
revoke all on table public.scan_schedules from public, anon, authenticated;
grant select, insert, update, delete on table public.scan_schedules to service_role;

commit;
