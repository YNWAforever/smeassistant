-- P4.6 Google Business Profile review-reply publishing (docs/superpowers/specs/2026-10-04-gbp-reply-publish-design.md §1).
--
-- A publish is a delivery with mode 'publish' and channel 'google_business'.
-- It starts 'publishing' (begin), then becomes 'published' or 'failed'
-- (finish); an owner may later mark a published reply 'cancelled' (cancel).
-- target_ref names the review (accounts/{a}/locations/{l}/reviews/{r}).
-- provider_receipt holds only non-secret identifiers ({ review_name,
-- reply_update_time }) and failure_reason only a reason code. Review text,
-- reviewer names and reply text are never stored on a delivery; the reply text
-- is output_versions.body.
--
-- DEC-14: a version counts at most once, at its first export or its first
-- verified publish, whichever comes first. output_versions.first_published_at
-- records the first verified publish; "never counted" is
-- first_exported_at IS NULL AND first_published_at IS NULL. Only SQL counts.
--
-- At most one active publish (publishing or published) per version and per
-- target: the functions check it under the version lock, and the two partial
-- unique indexes are the backstop for races.
--
-- No table or foreign key is added, so the delete graph is unchanged. All
-- functions are SECURITY INVOKER, like 0004, 0011 and 0013 (neon/README.md).
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS target_ref text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS provider_receipt jsonb;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.output_versions ADD COLUMN IF NOT EXISTS first_published_at timestamptz;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliveries_publish_target_check' AND conrelid = 'public.deliveries'::regclass
  ) THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_publish_target_check CHECK (mode <> 'publish' OR target_ref IS NOT NULL);
  END IF;
END
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_publish_version_key
  ON public.deliveries (version_id) WHERE mode = 'publish' AND state IN ('publishing', 'published');
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_active_publish_target_key
  ON public.deliveries (target_ref) WHERE mode = 'publish' AND state IN ('publishing', 'published');

-- Starts a publish (§1.2). Returns { kind: 'begun' | 'existing', delivery_id, state }.
-- The allowance is checked here, before Google is called, but nothing is
-- counted: finish counts. already_publishing carries the active delivery's id
-- in the error detail.
CREATE OR REPLACE FUNCTION public.begin_publish_output_version(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
  existing public.deliveries%rowtype;
  active_id uuid;
  ws_timezone text;
  ws_tier text;
  usage_period text;
  usage_row public.workspace_usage%rowtype;
  delivery_id uuid;
begin
  -- Same key, same answer: the route can retry without a second delivery.
  select * into existing from public.deliveries where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('kind', 'existing', 'delivery_id', existing.id, 'state', existing.state);
  end if;

  select * into v from public.output_versions where id = p_version_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'version_not_found';
  end if;
  perform public.offer_current_for_version(v);
  if v.approval_state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'not_approved';
  end if;

  select id into active_id from public.deliveries
  where version_id = v.id and mode = 'publish' and state in ('publishing', 'published');
  if found then
    raise exception using errcode = 'P0001', message = 'already_publishing', detail = active_id::text;
  end if;
  if exists (
    select 1 from public.deliveries
    where target_ref = p_target_ref and mode = 'publish' and state in ('publishing', 'published')
  ) then
    raise exception using errcode = 'P0001', message = 'target_busy';
  end if;

  if v.first_exported_at is null and v.first_published_at is null then
    select timezone, tier into ws_timezone, ws_tier from public.workspaces where id = v.workspace_id;
    usage_period := to_char(now() at time zone coalesce(ws_timezone, 'Asia/Hong_Kong'), 'YYYY-MM');

    -- The same lazy period row as export_output_version (lite 3, paid unlimited).
    insert into public.workspace_usage (workspace_id, period, approved_deliveries, allowance)
    values (v.workspace_id, usage_period, 0, case when ws_tier = 'paid' then null else 3 end)
    on conflict (workspace_id, period) do nothing;

    select * into usage_row from public.workspace_usage
    where workspace_id = v.workspace_id and period = usage_period
    for update;

    if usage_row.allowance is not null and usage_row.approved_deliveries >= usage_row.allowance then
      raise exception using errcode = 'P0001', message = 'allowance_exceeded';
    end if;
  end if;

  insert into public.deliveries (workspace_id, version_id, mode, channel, state, counted, idempotency_key, payload, created_by, target_ref)
  values (v.workspace_id, v.id, 'publish', 'google_business', 'publishing', false, p_idempotency_key,
          jsonb_build_object('version_no', v.version_no), p_actor, p_target_ref)
  returning id into delivery_id;

  update public.output_versions
  set delivery_state = 'publishing'
  where id = v.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'delivery.publish_started', 'delivery', delivery_id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                             'idempotency_key', p_idempotency_key));

  return jsonb_build_object('kind', 'begun', 'delivery_id', delivery_id, 'state', 'publishing');
end;
$function$;

REVOKE ALL ON FUNCTION public.begin_publish_output_version(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_publish_output_version(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text) TO sme_app_runtime;

-- Ends a publish (§1.3). Returns { kind: 'finished' | 'existing', state, counted }.
-- A second finisher (reconcile racing publish) gets 'existing' and changes
-- nothing. A verified publish of a never-counted version counts one delivery
-- unconditionally: the allowance was checked at begin and the reply is
-- already public (ruling P2).
CREATE OR REPLACE FUNCTION public.finish_publish_output_version(p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d public.deliveries%rowtype;
  v public.output_versions%rowtype;
  counts boolean;
  ws_timezone text;
  ws_tier text;
  usage_period text;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if found and d.mode = 'publish' and d.state in ('published', 'failed') then
    return jsonb_build_object('kind', 'existing', 'state', d.state, 'counted', d.counted);
  end if;
  if not found or d.mode <> 'publish' or d.state <> 'publishing' then
    raise exception using errcode = 'P0001', message = 'delivery_not_publishing';
  end if;
  if p_outcome is null or p_outcome not in ('published', 'failed') then
    raise exception using errcode = 'P0001', message = 'invalid_outcome';
  end if;

  select * into v from public.output_versions where id = d.version_id for update;

  if p_outcome = 'published' then
    counts := v.first_exported_at is null and v.first_published_at is null;

    if counts then
      select timezone, tier into ws_timezone, ws_tier from public.workspaces where id = v.workspace_id;
      usage_period := to_char(now() at time zone coalesce(ws_timezone, 'Asia/Hong_Kong'), 'YYYY-MM');

      -- The period may have turned since begin, so the row is created lazily again.
      insert into public.workspace_usage (workspace_id, period, approved_deliveries, allowance)
      values (v.workspace_id, usage_period, 0, case when ws_tier = 'paid' then null else 3 end)
      on conflict (workspace_id, period) do nothing;

      update public.workspace_usage
      set approved_deliveries = approved_deliveries + 1
      where workspace_id = v.workspace_id and period = usage_period;
    end if;

    update public.deliveries
    set state = 'published',
        counted = counts,
        verified_at = now(),
        provider_receipt = p_receipt
    where id = d.id;

    update public.output_versions
    set first_published_at = coalesce(first_published_at, now()),
        delivery_state = 'published'
    where id = v.id;

    insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
    values (v.workspace_id, 'user', p_actor, 'delivery.published', 'delivery', d.id,
            jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                               'counted', counts));

    return jsonb_build_object('kind', 'finished', 'state', 'published', 'counted', counts);
  end if;

  update public.deliveries
  set state = 'failed',
      failure_reason = p_reason
  where id = d.id;

  update public.output_versions
  set delivery_state = case when first_exported_at is not null then 'exported' else 'export_ready' end
  where id = v.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'delivery.publish_failed', 'delivery', d.id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                             'reason', p_reason));

  return jsonb_build_object('kind', 'finished', 'state', 'failed', 'counted', false);
end;
$function$;

REVOKE ALL ON FUNCTION public.finish_publish_output_version(p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_publish_output_version(p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text) TO sme_app_runtime;

-- Marks a published reply cancelled (§1.4). The owner-only check is the
-- route's. No usage refund: counted and first_published_at stay, so a later
-- re-publish or export of the same version never counts again.
CREATE OR REPLACE FUNCTION public.cancel_published_reply(p_delivery_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d public.deliveries%rowtype;
  v public.output_versions%rowtype;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if not found or d.mode <> 'publish' or d.state <> 'published' then
    raise exception using errcode = 'P0001', message = 'delivery_not_published';
  end if;

  select * into v from public.output_versions where id = d.version_id for update;

  update public.deliveries
  set state = 'cancelled'
  where id = d.id;

  update public.output_versions
  set delivery_state = case when first_exported_at is not null then 'exported' else 'cancelled' end
  where id = v.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor, 'delivery.publish_cancelled', 'delivery', d.id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id));

  return jsonb_build_object('kind', 'cancelled', 'delivery_id', d.id, 'state', 'cancelled');
end;
$function$;

REVOKE ALL ON FUNCTION public.cancel_published_reply(p_delivery_id uuid, p_actor uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_published_reply(p_delivery_id uuid, p_actor uuid) TO sme_app_runtime;

-- export_output_version from 0011 with exactly these changes (§1.5); nothing
-- else changes: the idempotency return, mode check, offer guard, period, lazy
-- row, audit event name and return shape are byte-for-byte 0011 (pinned by
-- lib/workspace/publish-sql.test.ts).
--   (a) A new local, counts := first_export and v.first_published_at is null.
--       The allowance and usage-increment block runs on counts instead of
--       first_export, and deliveries.counted and the audit counted field use
--       counts.
--   (b) The first_exported_at update still runs on first_export, in its own
--       block, and its delivery_state becomes 'published' when the version is
--       already published, else 'exported', so exporting a published version
--       never downgrades the "verified on Google" state.
--   (c) The return value's counted uses counts.

CREATE OR REPLACE FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
  existing public.deliveries%rowtype;
  ws_timezone text;
  ws_tier text;
  usage_period text;
  usage_row public.workspace_usage%rowtype;
  first_export boolean;
  counts boolean;
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
  perform public.offer_current_for_version(v);
  if v.approval_state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'not_approved';
  end if;

  first_export := v.first_exported_at is null;
  counts := first_export and v.first_published_at is null;

  if counts then
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
  end if;

  if first_export then
    update public.output_versions
    set first_exported_at = now(),
        delivery_state = case when v.delivery_state = 'published' then 'published' else 'exported' end
    where id = v.id;
  end if;

  insert into public.deliveries (workspace_id, version_id, mode, state, counted, idempotency_key, payload, created_by)
  values (v.workspace_id, v.id, p_mode, 'exported', counts, p_idempotency_key,
          jsonb_build_object('version_no', v.version_no), p_actor)
  returning id into delivery_id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (v.workspace_id, 'user', p_actor,
          case when p_mode = 'copy' then 'delivery.copied' else 'delivery.exported' end,
          'delivery', delivery_id,
          jsonb_build_object('version_no', v.version_no, 'version_id', v.id, 'action_id', v.action_id,
                             'counted', counts, 'idempotency_key', p_idempotency_key));

  return jsonb_build_object('kind', 'exported', 'delivery_id', delivery_id, 'version_id', v.id,
                            'counted', counts, 'state', 'exported');
end;
$function$;

REVOKE ALL ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) TO sme_app_runtime;
