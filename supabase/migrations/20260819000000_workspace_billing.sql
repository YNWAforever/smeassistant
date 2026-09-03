-- Billing foundation (X4): a workspace becomes "paid" via a Stripe
-- subscription or a staff-granted comp (Fimmick's existing AR/retainer
-- customers, who never touch Stripe). Both paths write here before
-- updating workspaces.tier, so there is always a record of *why* a
-- workspace is paid, not just that it is.
--
-- staff_user_id is null for stripe_webhook rows (no staff actor);
-- stripe_event_id is null for staff_grant rows (nothing to deduplicate
-- against). The unique index on stripe_event_id is Stripe's own
-- idempotency guarantee: webhook events are retried at-least-once on
-- delivery failure and must never be double-applied.

begin;

alter table public.workspaces add column if not exists stripe_customer_id text;

create table if not exists public.workspace_tier_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tier text not null,
  source text not null check (source in ('stripe_webhook', 'staff_grant')),
  staff_user_id uuid references auth.users(id),
  stripe_event_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists workspace_tier_events_stripe_event_id_key
  on public.workspace_tier_events (stripe_event_id) where stripe_event_id is not null;

create index if not exists workspace_tier_events_workspace_idx
  on public.workspace_tier_events (workspace_id, created_at desc);

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.workspace_tier_events enable row level security;
revoke all on table public.workspace_tier_events from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_tier_events to service_role;

commit;
