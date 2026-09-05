-- Additive completion ledger. Apply only after reviewed idempotent helper migration.
begin;
create table if not exists public.workspace_scan_completions (
  job_id uuid primary key references public.audit_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state text not null check (state in ('running','retry','completed')),
  attempts integer not null default 0,
  lease_token uuid, lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text, completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.workspace_scan_completions enable row level security;
revoke all on table public.workspace_scan_completions from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_scan_completions to service_role;

create or replace function public.claim_workspace_completion(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.audit_jobs%rowtype; c public.workspace_scan_completions%rowtype; token uuid;
begin
  select * into j from public.audit_jobs where id = p_job_id;
  if not found or j.workspace_id is null or j.status not in ('done','partial','failed') then
    return jsonb_build_object('status','skipped');
  end if;
  -- Serialize claims across this workspace, including jobs without a ledger row.
  perform 1 from public.workspaces where id = j.workspace_id for update;
  select * into c from public.workspace_scan_completions where job_id = p_job_id for update;
  if c.state = 'completed' then return jsonb_build_object('status','completed'); end if;
  if c.next_attempt_at > now() or exists (
    select 1 from public.workspace_scan_completions
    where workspace_id = j.workspace_id and state = 'running' and lease_until > now()
  ) then return jsonb_build_object('status','busy'); end if;
  token := gen_random_uuid();
  insert into public.workspace_scan_completions(job_id,workspace_id,state,attempts,lease_token,lease_until)
  values(j.id,j.workspace_id,'running',1,token,now() + interval '5 minutes')
  on conflict(job_id) do update set state='running', attempts=public.workspace_scan_completions.attempts+1,
    lease_token=token, lease_until=now()+interval '5 minutes', updated_at=now();
  return jsonb_build_object('status','claimed','token',token);
end; $$;
revoke all on function public.claim_workspace_completion(uuid) from public, anon, authenticated;
grant execute on function public.claim_workspace_completion(uuid) to service_role;

create or replace function public.finish_workspace_completion(p_job_id uuid,p_token uuid,p_succeeded boolean,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id=(select workspace_id from public.workspace_scan_completions where job_id=p_job_id) for update;
  update public.workspace_scan_completions set state=case when p_succeeded then 'completed' else 'retry' end,
    completed_at=case when p_succeeded then now() else null end,
    last_error=case when p_succeeded then null else 'workspace_post_process_failed' end,
    next_attempt_at=now()+interval '5 minutes',lease_until=null,lease_token=null,updated_at=now()
  where job_id=p_job_id and lease_token=p_token and state='running' and lease_until > clock_timestamp();
  return found;
end; $$;
revoke all on function public.finish_workspace_completion(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_workspace_completion(uuid,uuid,boolean,text) to service_role;

create or replace function public.pending_workspace_completions(p_limit integer default 5)
returns table(job_id uuid) language sql security definer set search_path = '' as $$
  select j.id from public.audit_jobs j left join public.workspace_scan_completions c on c.job_id=j.id
  where j.workspace_id is not null and j.status in ('done','partial','failed')
    and (c.job_id is null or (c.state <> 'completed' and c.next_attempt_at <= now()
      and (c.lease_until is null or c.lease_until <= now())))
  order by j.created_at,j.id limit greatest(1,least(coalesce(p_limit,5),5));
$$;
revoke all on function public.pending_workspace_completions(integer) from public, anon, authenticated;
grant execute on function public.pending_workspace_completions(integer) to service_role;
commit;
