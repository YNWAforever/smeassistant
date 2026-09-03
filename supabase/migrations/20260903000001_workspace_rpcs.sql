-- Workspace RPCs (CLAUDE.md 3.3): the four state transitions on output_versions
-- that must be atomic -- a version approval supersedes siblings and flips the
-- action; an export counts usage exactly once against the period allowance.
-- Doing these as several PostgREST calls from the route would leave a window
-- where two reviewers approve two versions of one action, or where two exports
-- of the same version both count.
--
-- Every function is security definer with an empty search_path and is
-- executable by service_role only; the app calls them after
-- lib/auth.ts::requireMembership has already authorized the caller, so
-- p_actor is trusted here. Each one writes its own audit_events row
-- (CLAUDE.md 3.11 names) so the Activity page never depends on the route
-- remembering to.
--
-- Errors the app maps to responses are raised by name with errcode P0001:
--   version_conflict     create_output_version: p_base_version_id is not the latest
--   allowance_exceeded   export_output_version: period allowance already reached
--   not_approved         export_output_version: version is not approved
--   version_not_found    any: no such version / action
--   version_closed       approve/decide: version is rejected or superseded
--
-- create or replace preserves existing privileges; the revoke/grant pair is
-- restated for each function so a hand-applied migration stays self-describing.

begin;

create or replace function public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.output_versions%rowtype;
begin
  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state in ('rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  if v.approval_state = 'approved' then
    return jsonb_build_object('kind', 'already-approved', 'version_id', v.id, 'version_no', v.version_no);
  end if;

  update public.output_versions
  set approval_state = 'superseded'
  where action_id = v.action_id
    and id <> v.id
    and approval_state = 'approved';

  update public.output_versions
  set approval_state = 'approved',
      approved_by = p_actor,
      approved_at = now(),
      reviewer_comment = p_comment,
      delivery_state = 'export_ready'
  where id = v.id;

  update public.actions
  set action_state = 'in_progress'
  where id = v.action_id
    and action_state not in ('completed', 'dismissed', 'cancelled', 'expired');

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'version.approved', 'output_version', v.id,
          jsonb_build_object('version_no', v.version_no, 'action_id', v.action_id, 'comment', p_comment));

  return jsonb_build_object('kind', 'approved', 'version_id', v.id, 'version_no', v.version_no);
end;
$$;

revoke all on function public.approve_output_version(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_output_version(uuid, uuid, text) to service_role;

create or replace function public.decide_output_version(p_version_id uuid, p_actor uuid, p_decision text, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.output_versions%rowtype;
begin
  if p_decision not in ('changes_requested', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;

  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state in ('rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  if v.approval_state = p_decision then
    return jsonb_build_object('kind', 'already-decided', 'version_id', v.id, 'version_no', v.version_no, 'decision', p_decision);
  end if;

  update public.output_versions
  set approval_state = p_decision,
      reviewer_comment = p_comment,
      approved_by = null,
      approved_at = null,
      delivery_state = case when delivery_state = 'export_ready' then 'not_requested' else delivery_state end
  where id = v.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor,
          case when p_decision = 'rejected' then 'version.rejected' else 'version.changes_requested' end,
          'output_version', v.id,
          jsonb_build_object('version_no', v.version_no, 'action_id', v.action_id, 'comment', p_comment));

  return jsonb_build_object('kind', 'decided', 'version_id', v.id, 'version_no', v.version_no, 'decision', p_decision);
end;
$$;

revoke all on function public.decide_output_version(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_output_version(uuid, uuid, text, text) to service_role;

create or replace function public.create_output_version(
  p_action_id uuid,
  p_actor uuid,
  p_author_type text,
  p_action_run_id uuid,
  p_body text,
  p_alt text,
  p_meta jsonb,
  p_base_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.actions%rowtype;
  latest_id uuid;
  next_no int;
  new_id uuid;
begin
  -- Lock the action row so two concurrent drafts cannot both compute max+1.
  select * into a from public.actions where id = p_action_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;

  select id into latest_id
  from public.output_versions
  where action_id = p_action_id
  order by version_no desc
  limit 1;

  -- Optimistic concurrency: a caller that names the version it edited must
  -- still be looking at the latest one. A null base appends unconditionally
  -- (the first draft, or an agent run that never read a version).
  if p_base_version_id is not null and p_base_version_id is distinct from latest_id then
    raise exception using errcode = 'P0001', message = 'version_conflict';
  end if;

  select coalesce(max(version_no), 0) + 1 into next_no
  from public.output_versions
  where action_id = p_action_id;

  -- Earlier drafts that were never approved are replaced by this one; an
  -- approved version stays approved until approve_output_version says otherwise.
  update public.output_versions
  set approval_state = 'superseded'
  where action_id = p_action_id
    and approval_state in ('draft', 'changes_requested');

  insert into public.output_versions (
    workspace_id, action_id, version_no, body, alt_text, meta,
    author_type, author_user_id, action_run_id
  )
  values (
    a.workspace_id, p_action_id, next_no, p_body, p_alt, coalesce(p_meta, '{}'::jsonb),
    p_author_type, case when p_author_type = 'user' then p_actor else null end, p_action_run_id
  )
  returning id into new_id;

  insert into public.audit_events (workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (a.workspace_id, a.location_id, 'user', p_actor, 'version.created', 'output_version', new_id,
          jsonb_build_object('version_no', next_no, 'action_id', p_action_id, 'author_type', p_author_type,
                             'base_version_id', p_base_version_id, 'action_run_id', p_action_run_id));

  return jsonb_build_object('kind', 'created', 'version_id', new_id, 'version_no', next_no);
end;
$$;

revoke all on function public.create_output_version(uuid, uuid, text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_output_version(uuid, uuid, text, uuid, text, text, jsonb, uuid) to service_role;

create or replace function public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.output_versions%rowtype;
  existing public.deliveries%rowtype;
  ws_timezone text;
  ws_tier text;
  usage_period text;
  usage_row public.workspace_usage%rowtype;
  first_export boolean;
  delivery_id uuid;
begin
  if p_mode not in ('export', 'copy') then
    raise exception using errcode = 'P0001', message = 'invalid_mode';
  end if;

  -- Same key, same answer: the route can retry without a second count.
  select * into existing from public.deliveries where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('kind', 'existing', 'delivery_id', existing.id, 'version_id', existing.version_id,
                              'counted', false, 'state', existing.state);
  end if;

  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  if v.approval_state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'not_approved';
  end if;

  first_export := v.first_exported_at is null;

  if first_export then
    select timezone, tier into ws_timezone, ws_tier from public.workspaces where id = v.workspace_id;
    usage_period := to_char(now() at time zone coalesce(ws_timezone, 'Asia/Hong_Kong'), 'YYYY-MM');

    -- Lazily create the period row with the tier's allowance (lite 3, paid
    -- unlimited) so the first export of a month never fails for lack of one.
    insert into public.workspace_usage (workspace_id, period, approved_deliveries, allowance)
    values (v.workspace_id, usage_period, 0, case when ws_tier = 'paid' then null else 3 end)
    on conflict (workspace_id, period) do nothing;

    select * into usage_row from public.workspace_usage
    where workspace_id = v.workspace_id and period = usage_period
    for update;

    if usage_row.allowance is not null and usage_row.approved_deliveries >= usage_row.allowance then
      raise exception using errcode = 'P0001', message = 'allowance_exceeded';
    end if;

    update public.workspace_usage
    set approved_deliveries = approved_deliveries + 1
    where workspace_id = v.workspace_id and period = usage_period;

    update public.output_versions
    set first_exported_at = now(), delivery_state = 'exported'
    where id = v.id;
  end if;

  insert into public.deliveries (workspace_id, version_id, mode, state, counted, idempotency_key, payload, created_by)
  values (v.workspace_id, v.id, p_mode, 'exported', first_export, p_idempotency_key,
          jsonb_build_object('version_no', v.version_no), p_actor)
  returning id into delivery_id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor,
          case when p_mode = 'copy' then 'delivery.copied' else 'delivery.exported' end,
          'delivery', delivery_id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                             'counted', first_export, 'idempotency_key', p_idempotency_key));

  return jsonb_build_object('kind', 'exported', 'delivery_id', delivery_id, 'version_id', v.id,
                            'counted', first_export, 'state', 'exported');
end;
$$;

revoke all on function public.export_output_version(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.export_output_version(uuid, uuid, text, text) to service_role;

commit;
