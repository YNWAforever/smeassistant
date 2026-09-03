-- Links a scheduled re-scan back to the workspace that owns it.
--
-- scan_schedules had no workspace_id at all: enqueue.ts never set workspace_id
-- on the audit_jobs rows it inserts, so every scheduled job's workspace_id was
-- null -- invisible to isWorkspacePaid at dispatch time (X4 gated schedule
-- *creation* only, never dispatch) and invisible to X5's notification trigger
-- (lib/notifications/trigger.ts returns early on !job?.workspace_id), which
-- meant a scheduled re-scan -- the one case X5 exists for -- could never send
-- a notification.
--
-- Backfilled from last_job_id -> audit_jobs.workspace_id: every schedule
-- created since 20260819000000_workspace_billing.sql's paid-tier gate landed
-- on staff/schedules/route.ts required a workspace-bound job already, so this
-- recovers every row that gate ever allowed. A handful of schedules created
-- before that gate landed may reference a job that was never claimed to a
-- workspace and backfill to null; those are treated as unpaid at dispatch
-- (see the app-layer change alongside this migration), which matches what X4
-- always intended for an unclaimed merchant.
--
-- on delete set null, not cascade: matches audit_jobs.workspace_id -- a
-- schedule outlives the report that first created it, same reasoning as
-- scan_schedules.last_job_id already being `on delete set null`.

begin;

alter table public.scan_schedules
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

update public.scan_schedules ss
set workspace_id = aj.workspace_id
from public.audit_jobs aj
where ss.last_job_id = aj.id
  and ss.workspace_id is null;

create index if not exists scan_schedules_workspace_idx
  on public.scan_schedules (workspace_id);

commit;
