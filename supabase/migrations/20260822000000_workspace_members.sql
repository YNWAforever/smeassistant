-- Team roles inside a workspace (L2): workspace_members becomes the single
-- source of truth for who can access a workspace and at what level,
-- including the owner -- which stops being the special workspaces.owner_user_id
-- column and becomes role='owner' like any other row.
--
-- Three unique indexes carry the whole invariant set:
--   - exactly one owner row per workspace
--   - at most one row per (workspace, user) once user_id is set (acceptance is
--     implicit in binding/acceptance, not enforced by this index alone)
--   - one pending invite per (workspace, email) -- staff assignment and
--     owner/manager invites are the same "pending row, bound on next verified
--     sign-in" mechanism, so this also prevents a duplicate staff assignment.
--
-- Same RLS posture as every other table in this codebase: enabled, zero
-- policies, service_role only. Authorization is entirely application-layer
-- via lib/workspace/authorize-workspace.ts, never RLS.

begin;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists workspace_members_one_owner_idx
  on public.workspace_members (workspace_id) where role = 'owner';

create unique index if not exists workspace_members_user_workspace_idx
  on public.workspace_members (workspace_id, user_id) where user_id is not null;

create unique index if not exists workspace_members_pending_email_idx
  on public.workspace_members (workspace_id, lower(email)) where accepted_at is null;

create index if not exists workspace_members_email_idx on public.workspace_members (lower(email));

alter table public.workspace_members enable row level security;
revoke all on table public.workspace_members from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_members to service_role;

-- Restores the invariant workspaces.owner_user_id's own comment named explicitly
-- ("a token outliving its owner is the one outcome that must not be possible"):
-- ownership no longer lives in a single column with its own FK cascade, so that
-- guarantee has to be re-derived from workspace_members instead. Fires on every
-- membership deletion (an account deletion cascading into workspace_members, or
-- an explicit removal via the invite/remove routes) and destroys the workspace
-- only once NO members remain -- not on any single member's departure, since a
-- workspace with surviving managers/viewers must not be destroyed just because
-- one member (even the owner) left or had their account deleted.
create or replace function public.delete_orphaned_workspace() returns trigger as $$
begin
  if not exists (select 1 from public.workspace_members where workspace_id = old.workspace_id) then
    delete from public.workspaces where id = old.workspace_id;
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists workspace_members_cleanup_orphan on public.workspace_members;
create trigger workspace_members_cleanup_orphan
  after delete on public.workspace_members
  for each row
  execute function public.delete_orphaned_workspace();

-- Backfill: every existing bound owner and every existing pending staff
-- assignment becomes a workspace_members row before the source columns are
-- dropped. Wrapped in a conditional to make this migration idempotent: on
-- re-apply, the source columns are already dropped, so we skip the backfill.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'owner_user_id'
  ) then
    insert into public.workspace_members (workspace_id, user_id, email, role, invited_by, invited_at, accepted_at)
    select
      w.id,
      w.owner_user_id,
      coalesce(u.email, w.owner_email),
      'owner',
      w.assigned_by_staff_user_id,
      coalesce(w.assigned_at, w.created_at),
      case when w.owner_user_id is not null then w.created_at else null end
    from public.workspaces w
    left join auth.users u on u.id = w.owner_user_id
    where w.owner_user_id is not null or w.owner_email is not null
    on conflict (workspace_id) where role = 'owner' do nothing;
  end if;
end $$;

alter table public.workspaces drop constraint if exists workspaces_owner_identity_check;
drop index if exists public.workspaces_owner_user_id_key;
drop index if exists public.workspaces_owner_email_key;
alter table public.workspaces drop column if exists owner_user_id;
alter table public.workspaces drop column if exists owner_email;
alter table public.workspaces drop column if exists assigned_by_staff_user_id;
alter table public.workspaces drop column if exists assigned_at;

commit;
