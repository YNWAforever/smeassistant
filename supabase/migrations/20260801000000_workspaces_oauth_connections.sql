-- Workspaces and OAuth connections: the durable home an OAuth token needs.
--
-- 0001 already put a nullable workspace_id on every table "so v0.2 can backfill".
-- This is the table that column has been pointing at with nothing on the other
-- end. Claim-at-unlock backfills audit_jobs.workspace_id once an owner exists.
--
-- Authorization is application-layer, not RLS. Both tables are closed to
-- public/anon/authenticated and opened only to service_role, matching every other
-- table here and keeping migration-hardening-sweep.test.ts green. RLS is enabled
-- with zero policies as a second line: if a grant is ever added by mistake, the
-- deny-all default still holds rather than the mistake being immediately fatal.
--
-- Note this contradicts docs/v0.2-plan.md section 6, which specified RLS by
-- auth.uid(). That clause and the hardening sweep cannot both hold; the design
-- doc records why the sweep wins.

begin;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade: deleting the auth user removes the workspace and, through
  -- the cascade below, its stored tokens. A token outliving its owner is the one
  -- outcome that must not be possible.
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text,
  industry text,
  district text,
  market text check (market in ('hk', 'tw')),
  tier text not null default 'lite',
  created_at timestamptz not null default now()
);

-- One workspace per owner, for now. Agency mode (plan Module 7) needs many
-- members per workspace; when it lands, dropping this index has to be a
-- deliberate line in that migration rather than something nobody notices.
create unique index if not exists workspaces_owner_user_id_key
  on public.workspaces (owner_user_id);

create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- instagram and ga4 are accepted but unimplemented. Migrations here are applied
  -- by hand through the dashboard with no CLI step, so avoiding a later one-line
  -- migration is worth more than the narrowness; the TypeScript union is the
  -- guard that actually runs.
  provider text not null check (provider in ('instagram', 'google_gbp', 'ga4')),
  account_ref text,
  -- Ciphertext from lib/security/token-crypto.ts, format v1.<iv>.<ct>.<tag>.
  -- Never a bare token.
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique index: one *active* connection per provider per workspace, while
-- revoked and errored rows accumulate freely. A plain unique constraint would
-- force deleting the audit trail to reconnect.
create unique index if not exists oauth_connections_active_provider_key
  on public.oauth_connections (workspace_id, provider)
  where status = 'active';

create index if not exists oauth_connections_workspace_idx
  on public.oauth_connections (workspace_id);

alter table public.workspaces enable row level security;
alter table public.oauth_connections enable row level security;

revoke all on table public.workspaces, public.oauth_connections
  from public, anon, authenticated;

grant select, insert, update, delete on table public.workspaces, public.oauth_connections
  to service_role;

commit;
