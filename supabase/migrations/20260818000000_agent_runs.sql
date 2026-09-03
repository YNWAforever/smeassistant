-- Draft-only Fix Pack outputs (X3): a staff-generated, staff-approved LLM
-- draft addressing one triggering finding. No write/publish capability --
-- approved rows render on the report page for the owner to copy themselves.
--
-- agent_key is constrained to the two agents this table currently serves,
-- not the full AgentKey union in packages/scoring -- same reasoning as that
-- union's own comment (packages/scoring/src/types.ts:72): a stray write for
-- an unimplemented agent is a bug, and the constraint catches it at the
-- database layer. Adding agent #3 later means a migration that widens the
-- check -- expected friction, not an oversight.
--
-- No 'delivered' status: in-console-only delivery means status = 'approved'
-- visible on the report page IS delivery -- there is no separate event.

begin;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.audit_jobs(id) on delete cascade,
  finding_key text not null,
  agent_key text not null check (agent_key in ('review_reply_agent', 'gbp_post_agent')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  output jsonb not null,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_job_status_idx on public.agent_runs (job_id, status);

-- The 20260717022612 server-only boundary, repeated for the new table.
alter table public.agent_runs enable row level security;
revoke all on table public.agent_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.agent_runs to service_role;

commit;
