-- A merchant who signed in with a verified email but owns no workspace has asked
-- Fimmick for access to the report they arrived from. Staff resolve these by
-- assigning a workspace through POST /api/staff/workspaces.
--
-- No email column on purpose. The row names the account (user_id); the verified
-- address is read from auth.users when staff assign. Copying it here would put a
-- third copy of merchant PII beside leads and auth.users, and would blur an
-- account identifier with the consent-gated BD contact that leads.email is.

begin;

create table if not exists public.workspace_access_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audit_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_staff_user_id uuid references auth.users(id) on delete set null
);

-- One OPEN request per merchant per report. Partial rather than a plain unique:
-- a resolved request must not block a later, legitimate re-request.
create unique index if not exists workspace_access_requests_open_idx
  on public.workspace_access_requests (job_id, user_id) where resolved_at is null;

create index if not exists workspace_access_requests_pending_idx
  on public.workspace_access_requests (requested_at desc) where resolved_at is null;

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.workspace_access_requests enable row level security;
revoke all on table public.workspace_access_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_access_requests to service_role;

commit;
