-- Fence every completion side-effect transaction, including a resumed expired worker.
-- No-header interactive service-role writes retain their existing authorization contract.
begin;
create or replace function public.fence_workspace_completion_write()
returns trigger language plpgsql set search_path = '' as $$
declare headers jsonb; job uuid; token uuid; target_workspace uuid;
  j public.audit_jobs%rowtype; c public.workspace_scan_completions%rowtype;
begin
  headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  if not (headers ? 'x-workspace-completion-job' or headers ? 'x-workspace-completion-token') then return new; end if;
  if current_user <> 'service_role' then raise exception 'completion_role_denied'; end if;
  if not (headers ? 'x-workspace-completion-job' and headers ? 'x-workspace-completion-token') then
    raise exception 'completion_context_missing';
  end if;
  job := (headers->>'x-workspace-completion-job')::uuid;
  token := (headers->>'x-workspace-completion-token')::uuid;
  target_workspace := new.workspace_id;
  -- Same lock order as claim: workspace first, then completion record.
  perform 1 from public.workspaces where id = target_workspace for update;
  select * into c from public.workspace_scan_completions where job_id=job for update;
  if not found or c.workspace_id is distinct from target_workspace or c.state <> 'running'
     or c.lease_token is distinct from token or c.lease_until is null or c.lease_until <= clock_timestamp() then
    raise exception 'completion_lease_lost';
  end if;
  select * into j from public.audit_jobs where id=job;
  if j.workspace_id is distinct from target_workspace or j.status not in ('done','partial','failed') then
    raise exception 'completion_job_changed';
  end if;
  if tg_table_name = 'scan_snapshots' then
    if new.job_id is distinct from job or new.location_id is distinct from j.location_id then
      raise exception 'completion_snapshot_scope';
    end if;
  elsif tg_table_name = 'actions' then
    if new.location_id is distinct from j.location_id then
      if not (tg_op = 'UPDATE' and new.location_id is null
        and (to_jsonb(new) - 'measurement_state' - 'updated_at') = (to_jsonb(old) - 'measurement_state' - 'updated_at'))
        then raise exception 'completion_action_scope'; end if;
    end if;
    if exists (
      select 1 from public.scan_snapshots s join public.scan_snapshots head on head.job_id=job
      where s.workspace_id=j.workspace_id and s.location_id is not distinct from j.location_id
      and (s.observed_at,s.created_at,s.id) > (head.observed_at,head.created_at,head.id)
    ) then raise exception 'completion_newer_snapshot'; end if;
  elsif tg_table_name = 'action_measurements' then
    if not exists(select 1 from public.scan_snapshots s where s.id=new.after_snapshot_id
      and s.job_id=job and s.workspace_id=target_workspace and s.location_id is not distinct from j.location_id)
      then raise exception 'completion_measurement_scope'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.fence_workspace_completion_write() from public, anon, authenticated;
grant execute on function public.fence_workspace_completion_write() to service_role;

drop trigger if exists completion_fence_snapshots on public.scan_snapshots;
create trigger completion_fence_snapshots before insert or update on public.scan_snapshots
  for each row execute function public.fence_workspace_completion_write();
drop trigger if exists completion_fence_actions on public.actions;
create trigger completion_fence_actions before insert or update on public.actions
  for each row execute function public.fence_workspace_completion_write();
drop trigger if exists completion_fence_measurements on public.action_measurements;
create trigger completion_fence_measurements before insert or update on public.action_measurements
  for each row execute function public.fence_workspace_completion_write();
drop trigger if exists completion_fence_audits on public.audit_events;
create trigger completion_fence_audits before insert or update on public.audit_events
  for each row execute function public.fence_workspace_completion_write();
drop trigger if exists completion_fence_notifications on public.workspace_notifications;
create trigger completion_fence_notifications before insert or update on public.workspace_notifications
  for each row execute function public.fence_workspace_completion_write();
commit;
