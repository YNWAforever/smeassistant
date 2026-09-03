-- Audit trail for a workspace created through the OAuth-verified self-service
-- claim (X6), not through staff assignment. A staff member investigating "how
-- did this get claimed" needs this even though the claim itself is entirely
-- automated -- there is no other record of which Google location matched.
--
-- Deliberately its own table, not a row in staff_report_events: that table's
-- staff_user_id is NOT NULL and the table is conceptually scoped to staff
-- actions. This is an owner-initiated, system-verified event instead, the same
-- shape consent_records and erasure_events already use elsewhere in this
-- schema.
--
-- Authorization is application-layer, matching every other table here: closed
-- to public/anon/authenticated, opened only to service_role, RLS enabled with
-- zero policies as a second line if a grant is ever added by mistake.

begin;

create table if not exists public.workspace_claim_events (
  id uuid primary key default gen_random_uuid(),
  -- set null, not cascade: erasing the job must not erase the record of how the
  -- workspace it explains came to be claimed. audit_jobs.workspace_id is already
  -- `set null` for the same reason -- the scan is not the account's to destroy --
  -- and a takedown is exactly the moment someone would go looking for this trail.
  -- erased_job_id retains the id the FK is about to null, mirroring
  -- staff_report_events' metadata.erased_job_id pattern (stamped by the erase
  -- path before the delete, not by this migration).
  job_id uuid references public.audit_jobs(id) on delete set null,
  erased_job_id text,
  -- set null, not cascade, mirroring job_id above and for the identical reason:
  -- this row exists to answer "how did this workspace get claimed" AFTER the
  -- fact, so the workspace disappearing must not take the record of the claim
  -- with it. workspace_members' delete_orphaned_workspace trigger
  -- (20260822000000_workspace_members.sql) really does delete a workspace
  -- outright once its last member leaves -- not just through staff erasure --
  -- so a cascade here would let an ordinary membership departure destroy this
  -- provenance, not only a deliberate takedown. erased_workspace_id mirrors
  -- erased_job_id's shape but, unlike it, has NO WRITER as of this migration:
  -- the trigger fires synchronously inside an ordinary DELETE FROM
  -- workspace_members (e.g. a sole owner removing themselves via
  -- /api/owner/workspaces/[id]/members), which is a real, reachable path with
  -- nothing currently intervening before it runs. The column is reserved so a
  -- future writer has somewhere to put the id; until one exists, a workspace
  -- deleted this way leaves this row with workspace_id AND erased_workspace_id
  -- both null, which is a real (if currently low-severity) gap, not a mistake.
  workspace_id uuid references public.workspaces(id) on delete set null,
  erased_workspace_id text,
  -- The full `locations/{locationId}` resource name, matching what is written
  -- to oauth_connections.account_ref for the same connection -- not a bare
  -- numeric id, so a staff member cross-referencing the two never has to guess
  -- at a format.
  matched_location_id text not null check (matched_location_id like 'locations/%'),
  -- Deliberately no foreign key, matching staff_report_events.staff_user_id and
  -- erasure_events.staff_user_id: the claiming merchant's auth.users row, their
  -- workspace membership, or the workspace itself can each independently
  -- disappear (account deletion, leaving the workspace, or workspace_members'
  -- orphaned-workspace trigger), and none of those paths should be able to erase
  -- the proof that the claim happened.
  claimed_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_claim_events_job_idx
  on public.workspace_claim_events (job_id, created_at desc);

create index if not exists workspace_claim_events_workspace_idx
  on public.workspace_claim_events (workspace_id, created_at desc);

create index if not exists workspace_claim_events_claimed_by_idx
  on public.workspace_claim_events (claimed_by_user_id);

alter table public.workspace_claim_events enable row level security;

revoke all on table public.workspace_claim_events from public, anon, authenticated;
-- All four DML verbs, matching every other table (see erasure_events for the
-- rationale): narrowing this to make the log append-only would carve a special
-- case into a tripwire to buy a property a grant cannot really enforce, since
-- the service role is the application. If append-only is wanted it belongs in a
-- trigger or an RLS policy, not a weaker grant.
grant select, insert, update, delete on table public.workspace_claim_events to service_role;

commit;
