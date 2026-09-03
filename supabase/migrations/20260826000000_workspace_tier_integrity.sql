-- Workspace tier integrity: paid-feature authorization must never depend on an
-- arbitrary text value. The application recognizes exactly `lite` and `paid`;
-- enforce the same vocabulary at rest for both the current state and its audit
-- trail.
--
-- Deliberately fail before adding either constraint if a hand-written staff
-- grant or historical script introduced another value. Guessing whether an
-- unknown tier should be paid would turn a data-cleanup problem into an access-
-- control decision. Operators must review and repair those rows explicitly,
-- then re-run this idempotent migration.

begin;

do $$
begin
  if exists (
    select 1
    from public.workspaces
    where tier not in ('lite', 'paid')
  ) then
    raise exception
      'workspace tier integrity migration blocked: public.workspaces contains an undeclared tier'
      using errcode = '23514',
            hint = 'Review every non-lite/non-paid row and correct it explicitly before retrying.';
  end if;

  if exists (
    select 1
    from public.workspace_tier_events
    where tier not in ('lite', 'paid')
  ) then
    raise exception
      'workspace tier integrity migration blocked: public.workspace_tier_events contains an undeclared tier'
      using errcode = '23514',
            hint = 'Review the audit trail and correct invalid tier values under the approved data-change procedure before retrying.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_tier_check'
  ) then
    alter table public.workspaces
      add constraint workspaces_tier_check
      check (tier in ('lite', 'paid'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_tier_events'::regclass
      and conname = 'workspace_tier_events_tier_check'
  ) then
    alter table public.workspace_tier_events
      add constraint workspace_tier_events_tier_check
      check (tier in ('lite', 'paid'));
  end if;
end
$$;

commit;
