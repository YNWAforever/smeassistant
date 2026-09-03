-- Staff-mediated workspace assignment.
--
-- Self-service claiming is gated off (OWNER_SELF_SERVICE_CLAIM) because both
-- available entitlement signals are writable by anyone holding a share slug.
-- That left the stack inert: the claim callback was the only place a workspace
-- was ever inserted, so no workspace could exist, so no OAuth connection could
-- exist. Staff become the ownership authority instead, verifying out-of-band.
--
-- owner_user_id becomes nullable so BD can assign a workspace to an email
-- before that merchant has ever signed in. The two identities are reconciled by
-- a single conditional update on first verified sign-in (lib/workspace/bind-workspace.ts).

begin;

alter table public.workspaces alter column owner_user_id drop not null;
alter table public.workspaces add column if not exists owner_email text;
alter table public.workspaces add column if not exists assigned_by_staff_user_id uuid;
alter table public.workspaces add column if not exists assigned_at timestamptz;

-- At least one identity, always. Blocks a workspace belonging to nobody.
alter table public.workspaces drop constraint if exists workspaces_owner_identity_check;
alter table public.workspaces add constraint workspaces_owner_identity_check
  check (owner_user_id is not null or owner_email is not null);

-- Case-insensitive. Partial, so rows that have already bound (owner_email
-- nulled) do not occupy the index and the email can be reused later.
create unique index if not exists workspaces_owner_email_key
  on public.workspaces (lower(owner_email)) where owner_email is not null;

commit;
