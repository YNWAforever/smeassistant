-- Notification layer v1 (X5): one consolidated email per completed
-- scheduled re-scan, three independently-togglable sections. Defaults to
-- true (opt-out, not opt-in) -- a workspace that scheduled paid monitoring
-- is presumed to want to hear about it.
--
-- notification_events.job_id is `on delete set null`, not cascade -- same
-- reasoning as staff_report_events.job_id: erasing the report should not
-- erase the record that a notification was sent about it. resend_message_id
-- is null on a failed send, so "we tried and it failed" stays distinguishable
-- from "we never tried" -- no content or address is ever stored here.

begin;

alter table public.workspaces add column if not exists notify_rescan_complete boolean not null default true;
alter table public.workspaces add column if not exists notify_regression_alert boolean not null default true;
alter table public.workspaces add column if not exists notify_monthly_digest boolean not null default true;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.audit_jobs(id) on delete set null,
  sections_included text[] not null,
  resend_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_workspace_idx
  on public.notification_events (workspace_id, created_at desc);

-- run-queued's maxDuration (300s) against a five-minute cadence means two
-- cron invocations can genuinely overlap; the loser resolves to
-- "already_claimed" from claim_audit_job but still calls the notification
-- trigger. This is the guard against sending the same email twice: the
-- trigger inserts a claim row (resend_message_id null) before composing or
-- sending anything, and a second concurrent attempt's insert hits this
-- constraint and backs off.
create unique index if not exists notification_events_job_id_key
  on public.notification_events (job_id) where job_id is not null;

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.notification_events enable row level security;
revoke all on table public.notification_events from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_events to service_role;

commit;
