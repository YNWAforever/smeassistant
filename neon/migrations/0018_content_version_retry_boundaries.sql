-- Serialize saves and approvals on their action before touching version rows.
-- Preserve the existing RPC signatures, invoker rights and immutable history.
CREATE OR REPLACE FUNCTION public.create_output_version(p_action_id uuid, p_actor uuid, p_author_type text, p_action_run_id uuid, p_body text, p_alt text, p_meta jsonb, p_base_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  a public.actions%rowtype;
  r public.action_runs%rowtype;
  previous public.output_versions%rowtype;
  latest_id uuid;
  next_no int;
  new_id uuid;
  assistant_draft boolean := false;
  request_key text;
begin
  select * into a from public.actions where id = p_action_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;

  if p_action_run_id is not null then
    select * into r from public.action_runs
    where id = p_action_run_id and action_id = a.id and workspace_id = a.workspace_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'artifact_scope_mismatch';
    end if;
    assistant_draft := coalesce(r.input->>'source' = 'assistant', false);
    if assistant_draft then
      if r.state <> 'succeeded' or p_author_type <> 'agent'
         or p_base_version_id::text is distinct from r.input #>> '{context,versionId}' then
        raise exception using errcode = 'P0001', message = 'version_conflict';
      end if;
      -- The run is the request identity. Return its recorded version before
      -- checking the current head, so a lost response never creates a new row.
      select * into previous from public.output_versions
      where action_id = a.id and workspace_id = a.workspace_id
        and action_run_id = r.id and author_type = 'agent'
      order by version_no limit 1;
      if found then
        return jsonb_build_object('kind', 'created', 'version_id', previous.id, 'version_no', previous.version_no);
      end if;
    end if;
  end if;

  if p_author_type = 'user' then
    -- Existing callers have no retry token. Canonical JSON binds the exact
    -- edit to its actor and original base without retaining prose in the audit.
    request_key := 'version-save:' || encode(sha256(convert_to(jsonb_build_object(
      'action', a.id, 'actor', p_actor, 'run', p_action_run_id, 'base', p_base_version_id,
      'body', p_body, 'alt', p_alt, 'meta', coalesce(p_meta, '{}'::jsonb)
    )::text, 'UTF8')), 'hex');
    select v.* into previous from public.audit_events e
    join public.output_versions v on v.id = e.entity_id
      and v.workspace_id = e.workspace_id and v.action_id = a.id
    where e.idempotency_key = request_key and e.workspace_id = a.workspace_id
      and e.event = 'version.created' and e.entity_type = 'output_version';
    if found then
      return jsonb_build_object('kind', 'created', 'version_id', previous.id, 'version_no', previous.version_no);
    end if;
  end if;

  select id into latest_id from public.output_versions
  where action_id = a.id order by version_no desc limit 1;
  -- Null explicitly expects empty history for manual and assistant saves.
  -- Ordinary agent runs may still append without having read a version.
  if (p_base_version_id is not null and p_base_version_id is distinct from latest_id)
     or ((p_author_type = 'user' or assistant_draft) and p_base_version_id is null and latest_id is not null) then
    raise exception using errcode = 'P0001', message = 'version_conflict';
  end if;

  select coalesce(max(version_no), 0) + 1 into next_no
  from public.output_versions where action_id = a.id;
  update public.output_versions set approval_state = 'superseded'
  where action_id = a.id and approval_state in ('draft', 'changes_requested');
  -- Approval on older immutable content remains historical; the new row starts
  -- as draft and never inherits approved_by, approved_at or delivery readiness.
  insert into public.output_versions (
    workspace_id, action_id, version_no, body, alt_text, meta,
    author_type, author_user_id, action_run_id
  ) values (
    a.workspace_id, a.id, next_no, p_body, p_alt, coalesce(p_meta, '{}'::jsonb),
    p_author_type, case when p_author_type = 'user' then p_actor else null end, p_action_run_id
  ) returning id into new_id;

  insert into public.audit_events (
    workspace_id, location_id, actor_type, actor_id, event, entity_type, entity_id, payload, idempotency_key
  ) values (
    a.workspace_id, a.location_id, 'user', p_actor, 'version.created', 'output_version', new_id,
    jsonb_build_object('version_no', next_no, 'action_id', a.id, 'author_type', p_author_type,
      'base_version_id', p_base_version_id, 'action_run_id', p_action_run_id), request_key
  );
  return jsonb_build_object('kind', 'created', 'version_id', new_id, 'version_no', next_no);
end;
$function$;

REVOKE ALL ON FUNCTION public.create_output_version(uuid, uuid, text, uuid, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_output_version(uuid, uuid, text, uuid, text, text, jsonb, uuid) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
begin
  -- KEY SHARE conflicts with create's explicit FOR UPDATE, while allowing an
  -- offer archive's non-key action update to finish before the offer guard.
  -- Both paths acquire the action lock before locking any version rows.
  perform 1 from public.actions
  where id = (select action_id from public.output_versions where id = p_version_id)
  for key share;
  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  perform public.offer_current_for_version(v);
  if v.approval_state in ('rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  if v.approval_state = 'approved' then
    return jsonb_build_object('kind', 'already-approved', 'version_id', v.id, 'version_no', v.version_no);
  end if;
  if exists (select 1 from public.output_versions where action_id = v.action_id and version_no > v.version_no) then
    raise exception using errcode = 'P0001', message = 'version_closed';
  end if;
  update public.output_versions set approval_state = 'superseded'
  where action_id = v.action_id and id <> v.id and approval_state = 'approved';
  update public.output_versions
  set approval_state = 'approved', approved_by = p_actor, approved_at = now(),
      reviewer_comment = p_comment, delivery_state = 'export_ready'
  where id = v.id;
  update public.actions set action_state = 'in_progress'
  where id = v.action_id and action_state not in ('completed', 'dismissed', 'cancelled', 'expired');
  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'version.approved', 'output_version', v.id,
    jsonb_build_object('version_no', v.version_no, 'action_id', v.action_id, 'comment', p_comment));
  return jsonb_build_object('kind', 'approved', 'version_id', v.id, 'version_no', v.version_no);
end;
$function$;

REVOKE ALL ON FUNCTION public.approve_output_version(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_output_version(uuid, uuid, text) TO sme_app_runtime;
