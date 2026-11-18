-- P20.2b Instagram feed-image publishing (docs/implementation/owner-platform-v1/
-- PHASE-20-INSTAGRAM-GRAPH-PLAN.md §4.2, §5).
--
-- A publish is a delivery with mode 'publish'; 0014 started the Google Business
-- Profile review-reply channel ('google_business'). This migration adds the
-- Instagram channel's begin function only. It is additive: no table, column,
-- constraint, index or FK changes, and 0014's `begin_publish_output_version`
-- and `finish_publish_output_version` stay byte-identical. Finishing/aborting
-- reuses `finish_publish_output_version`, which is channel-agnostic.
--
-- The delivery:
--   channel     = 'instagram'
--   target_ref  = the Instagram professional account id Meta publishes from
--   payload     = { version_no, image_url, caption } — the caption snapshot is
--                 what reconcile matches against the account's recent media,
--                 so it must not be changed after begin.
-- provider_receipt (written by finish) holds only { media_id, permalink,
-- published_at }; failure_reason holds only a reason code. No caption, image
-- URL, token or provider body is logged by this migration's callers.
--
-- The same invariants as 0014 hold: one active publish per version and per
-- target (function checks under the version lock; the two partial unique
-- indexes are the backstop), the allowance is checked before Meta is called and
-- only finish counts, and an offer-backed version must still be current
-- (`offer_current_for_version`, same guard as the GBP path).
--
-- SECURITY INVOKER, like 0014; EXECUTE goes only to the runtime role.
CREATE OR REPLACE FUNCTION public.begin_publish_instagram(
  p_version_id uuid,
  p_actor uuid,
  p_target_ref text,
  p_idempotency_key text,
  p_image_url text,
  p_caption text
)
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

  if p_target_ref is null or btrim(p_target_ref) = '' then
    raise exception using errcode = 'P0001', message = 'target_missing';
  end if;
  if p_image_url is null or btrim(p_image_url) = '' then
    raise exception using errcode = 'P0001', message = 'invalid_image_url';
  end if;
  if p_caption is null or btrim(p_caption) = '' then
    raise exception using errcode = 'P0001', message = 'empty_caption';
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
  values (v.workspace_id, v.id, 'publish', 'instagram', 'publishing', false, p_idempotency_key,
          jsonb_build_object('version_no', v.version_no, 'image_url', p_image_url, 'caption', p_caption),
          p_actor, p_target_ref)
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

REVOKE ALL ON FUNCTION public.begin_publish_instagram(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text, p_image_url text, p_caption text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_publish_instagram(p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text, p_image_url text, p_caption text) TO sme_app_runtime;
