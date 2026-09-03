-- Data lifecycle: make erasure possible at all.
--
-- LEGAL_POLICY_VERSION 2026-07-28 publishes four operational promises in all
-- three locales -- tell you what we hold, delete it, withdraw a consent, remove a
-- report on request. None of them work today, because `delete from audit_jobs`
-- raises a foreign-key violation for any job carrying a lead or a single
-- analytics event. That is every unlocked job.
--
-- Idempotent, as every migration here must be: these are applied by hand through
-- the Supabase dashboard with no CLI step and no ordering guarantee beyond the
-- operator's care. See docs/superpowers/specs/2026-08-06-data-lifecycle-design.md.

begin;

-- 0. Drop every existing foreign key on the columns this migration is about to
--    redefine, whatever those constraints happen to be named.
--
--    `drop constraint if exists <guessed_name>` does NOT error when the guess is
--    wrong -- it silently does nothing, and the `add constraint` below then
--    creates a SECOND foreign key on the same column while the actionless
--    original survives and goes on blocking deletes. The migration reports
--    success and the thing this whole phase exists to fix stays broken. The
--    text-based contract test in migration-hardening-sweep.test.ts would not
--    catch it either, because the SQL text would look correct.
--
--    The names below ARE the Postgres defaults for the inline references in 0001
--    and 20260714, so in a clean database this loop and the named drops that
--    follow do the same work. This exists for the database that is not clean.
do $$
declare
  target record;
  existing text;
begin
  for target in
    select * from (values
      ('leads', 'job_id'),
      ('scan_events', 'job_id'),
      ('audit_jobs', 'parent_job_id'),
      ('audit_jobs', 'workspace_id'),
      ('staff_report_events', 'job_id')
    ) as t(child_table, child_column)
  loop
    for existing in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where con.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = target.child_table
        and con.conkey = array[(
          select att.attnum
          from pg_attribute att
          where att.attrelid = rel.oid and att.attname = target.child_column
        )]
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        target.child_table,
        existing
      );
    end loop;
  end loop;
end
$$;

-- 1. The three blockers. Each is re-added because Postgres has no
--    "alter constraint ... on delete", and the names below are the defaults it
--    assigned to the inline references in 0001 and 20260714.
alter table public.leads drop constraint if exists leads_job_id_fkey;
alter table public.leads add constraint leads_job_id_fkey
  foreign key (job_id) references public.audit_jobs(id) on delete cascade;

alter table public.scan_events drop constraint if exists scan_events_job_id_fkey;
alter table public.scan_events add constraint scan_events_job_id_fkey
  foreign key (job_id) references public.audit_jobs(id) on delete cascade;

-- A re-scan points at its parent. This one is not in docs/v0.2-plan.md section
-- 4.3 item 8, which names only leads and scan_events: parent_job_id is a self
-- reference, so a job that was ever re-scanned blocks deleting its own parent.
-- Cascade, because erasing a merchant's first scan should take the follow-ups
-- derived from it rather than strand them pointing at nothing.
alter table public.audit_jobs drop constraint if exists audit_jobs_parent_job_id_fkey;
alter table public.audit_jobs add constraint audit_jobs_parent_job_id_fkey
  foreign key (parent_job_id) references public.audit_jobs(id) on delete cascade;

-- 2. audit_jobs.workspace_id has been a bare uuid since 0001 ("forward-compat:
--    every table has nullable workspace_id so v0.2 can backfill"), and was never
--    constrained when workspaces actually arrived in 20260801000000. Since
--    workspaces.owner_user_id cascades from auth.users, deleting an auth user
--    destroys the workspace and leaves this column pointing at nothing.
--
--    set null, not cascade: the scan is not the account's to destroy, and an
--    unowned scan is a state the system already models (every scan starts that
--    way, and authorize-workspace.ts treats a null owner as "none").
--
--    The update first is required, not defensive: any row already orphaned by a
--    prior auth-user deletion would fail the constraint being added.
update public.audit_jobs
set workspace_id = null
where workspace_id is not null
  and workspace_id not in (select id from public.workspaces);

alter table public.audit_jobs drop constraint if exists audit_jobs_workspace_id_fkey;
alter table public.audit_jobs add constraint audit_jobs_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete set null;

-- 3. The audit trail must outlive the thing it audits.
--
--    staff_report_events cascaded from audit_jobs, which meant a staff member who
--    disclosed a merchant's contact could erase the record of it by erasing the
--    job. lead-access-log.ts refuses to disclose a contact when it cannot log the
--    disclosure; a log the logged party can delete is not one either.
--
--    The uuid left in metadata.erased_job_id points at nothing after erasure and
--    is not personal data, so the trail stays coherent without retaining subject
--    material.
alter table public.staff_report_events alter column job_id drop not null;
alter table public.staff_report_events drop constraint if exists staff_report_events_job_id_fkey;
alter table public.staff_report_events add constraint staff_report_events_job_id_fkey
  foreign key (job_id) references public.audit_jobs(id) on delete set null;

-- 4. Proof that a request was handled, holding counts and never content.
--
--    consent_records cascades away with the job, and that is correct: the person
--    asked for their data to be gone and their consent record is their data. What
--    accountability needs is evidence the request was handled, not retention of
--    the material. A log that stores what it erased has not erased it.
create table if not exists public.erasure_events (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately no foreign key: the referent is gone by design.
  erased_job_id uuid not null,
  staff_user_id uuid not null,
  staff_email_normalized text not null,
  -- 'subject_request' | 'takedown' | 'staff_initiated'
  reason text not null,
  -- Counts only, e.g. {"leads": 2, "findings": 31, "evidence_objects": 9}.
  removed_counts jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists erasure_events_created_at_idx
  on public.erasure_events (created_at desc);

alter table public.erasure_events enable row level security;
revoke all on table public.erasure_events from public, anon, authenticated;
-- All four DML verbs, matching every other table. The hardening sweep asserts
-- this exact shape, and narrowing it here to make the log append-only would carve
-- a special case into a tripwire to buy a property a grant cannot really enforce:
-- the service role is the application. If append-only is wanted it belongs in a
-- trigger or an RLS policy, not a weaker grant. staff_report_events, the audit
-- table this one sits beside, is granted the same way.
grant select, insert, update, delete on table public.erasure_events to service_role;

commit;
