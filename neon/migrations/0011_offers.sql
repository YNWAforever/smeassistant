-- P4.1 confirmed offers (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md, 1.1, 1.2, 1.4).
--
-- An offer is an owner-confirmed fact record (title, details, terms, price,
-- validity) that promotion copy is written from. Offer facts live here and stay
-- separate from generated variants; a changed offer never mutates an immutable
-- prior output (the approve/export guard is a later migration step).
--
-- "Expired" is derived, never stored: valid_until < the workspace-local date.
-- The application archives offers and never deletes them, so there is no
-- ON DELETE CASCADE from actions to offers (actions.offer_id is NO ACTION):
-- deleting a workspace still cascades through both tables, but deleting an
-- offer a live action still points to fails.
--
-- confirmed_by is deliberately NOT part of offers_confirmed_check: deleting a
-- user must never break a confirmed offer. The offer.confirmed audit event
-- keeps the actor.
CREATE TABLE IF NOT EXISTS public.offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id      uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  title            text NOT NULL,
  details          text NOT NULL,
  terms            text NOT NULL DEFAULT '',
  price_amount     numeric(12,2),
  currency         text,
  valid_from       date NOT NULL,
  valid_until      date NOT NULL,
  claims           text[] NOT NULL DEFAULT '{}',
  prohibited_terms text[] NOT NULL DEFAULT '{}',
  asset_id         uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft',
  revision         integer NOT NULL DEFAULT 1,
  confirmed_at     timestamptz,
  confirmed_by     uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT offers_details_check CHECK (char_length(details) BETWEEN 1 AND 1000),
  CONSTRAINT offers_terms_check CHECK (char_length(terms) <= 1000),
  CONSTRAINT offers_price_check CHECK (price_amount IS NULL OR price_amount >= 0),
  CONSTRAINT offers_price_currency_check CHECK ((price_amount IS NULL) = (currency IS NULL)),
  CONSTRAINT offers_currency_check CHECK (currency IS NULL OR currency IN ('HKD', 'TWD')),
  CONSTRAINT offers_dates_check CHECK (valid_until >= valid_from),
  CONSTRAINT offers_status_check CHECK (status IN ('draft', 'confirmed', 'archived')),
  CONSTRAINT offers_confirmed_check CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS offers_workspace_idx ON public.offers (workspace_id, status, valid_until);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.offers TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.offers;
CREATE POLICY server_application ON public.offers FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

-- Nullable, so every existing action stays unbound. Default NO ACTION on
-- purpose (see the header comment).
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS offer_id uuid CONSTRAINT actions_offer_id_fkey REFERENCES public.offers(id);
CREATE INDEX IF NOT EXISTS actions_offer_idx ON public.actions (offer_id);

-- True when valid_until is before the workspace-local date. An unknown
-- workspace is treated as expired (fail closed).
CREATE OR REPLACE FUNCTION public.offer_is_expired(p_valid_until date, p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (select p_valid_until < (now() at time zone w.timezone)::date
       from public.workspaces w
      where w.id = p_workspace_id),
    true);
$function$;

REVOKE ALL ON FUNCTION public.offer_is_expired(p_valid_until date, p_workspace_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_is_expired(p_valid_until date, p_workspace_id uuid) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.confirm_offer(p_offer_id uuid, p_actor uuid, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.offers%rowtype;
  ws_currency text;
begin
  select * into o from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'offer_not_found';
  end if;
  if o.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'offer_archived';
  end if;
  if o.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'offer_revision_changed';
  end if;
  -- btrim() alone strips only spaces; tabs and newlines are blank too.
  if btrim(o.title, E' \t\r\n') = '' or btrim(o.details, E' \t\r\n') = '' then
    raise exception using errcode = 'P0001', message = 'offer_incomplete';
  end if;

  -- hk workspaces price in HKD and tw workspaces in TWD; a workspace with no
  -- market matches no currency. A price-less offer has no currency to check.
  select case w.market when 'hk' then 'HKD' when 'tw' then 'TWD' end
    into ws_currency from public.workspaces w where w.id = o.workspace_id;
  if o.currency is not null and o.currency is distinct from ws_currency then
    raise exception using errcode = 'P0001', message = 'offer_currency_market';
  end if;

  if public.offer_is_expired(o.valid_until, o.workspace_id) then
    raise exception using errcode = 'P0001', message = 'offer_expired';
  end if;

  if o.status = 'confirmed' then
    return jsonb_build_object('kind', 'already-confirmed', 'offer_id', o.id, 'revision', o.revision);
  end if;

  update public.offers
  set status = 'confirmed',
      confirmed_by = p_actor,
      confirmed_at = now(),
      updated_at = now()
  where id = o.id;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (o.workspace_id, 'user', p_actor, 'offer.confirmed', 'offer', o.id,
          jsonb_build_object('revision', o.revision));

  return jsonb_build_object('kind', 'confirmed', 'offer_id', o.id, 'revision', o.revision);
end;
$function$;

REVOKE ALL ON FUNCTION public.confirm_offer(p_offer_id uuid, p_actor uuid, p_expected_revision integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_offer(p_offer_id uuid, p_actor uuid, p_expected_revision integer) TO sme_app_runtime;

CREATE OR REPLACE FUNCTION public.archive_offer(p_offer_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  o public.offers%rowtype;
  cancelled integer;
begin
  select * into o from public.offers where id = p_offer_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'offer_not_found';
  end if;
  if o.status = 'archived' then
    return jsonb_build_object('kind', 'already-archived', 'offer_id', o.id, 'cancelled_actions', 0);
  end if;

  -- offers_confirmed_check: confirmed_at is non-null exactly while confirmed.
  update public.offers
  set status = 'archived',
      confirmed_at = null,
      confirmed_by = null,
      updated_at = now()
  where id = o.id;

  update public.actions
  set action_state = 'cancelled',
      updated_at = now()
  where offer_id = o.id
    and action_state not in ('completed', 'dismissed', 'cancelled', 'expired');
  get diagnostics cancelled = row_count;

  insert into public.audit_events (workspace_id, actor_type, actor_id, event, entity_type, entity_id, payload)
  values (o.workspace_id, 'user', p_actor, 'offer.archived', 'offer', o.id,
          jsonb_build_object('cancelled_actions', cancelled));

  return jsonb_build_object('kind', 'archived', 'offer_id', o.id, 'cancelled_actions', cancelled);
end;
$function$;

REVOKE ALL ON FUNCTION public.archive_offer(p_offer_id uuid, p_actor uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_offer(p_offer_id uuid, p_actor uuid) TO sme_app_runtime;

-- P4.1 (design 1.3, 1.4): a version of an offer action may be approved or
-- exported only while the offer is confirmed, unexpired and at the revision the
-- version recorded in meta.offer_revision. A version without an integer
-- offer_revision is stale (fail closed). An action with no offer_id returns
-- immediately, so every non-offer approval and export behaves exactly as in 0004.
-- FOR SHARE here against FOR UPDATE in an offer edit serializes the two: the
-- caller either finishes against the old revision before the edit commits, or
-- sees the new revision and refuses.
CREATE OR REPLACE FUNCTION public.offer_current_for_version(v public.output_versions)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  bound_offer uuid;
  o public.offers%rowtype;
  recorded jsonb;
  stale boolean;
begin
  select a.offer_id into bound_offer from public.actions a where a.id = v.action_id;
  if bound_offer is null then
    return;
  end if;

  select * into o from public.offers where id = bound_offer for share;
  if not found or o.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'offer_inactive';
  end if;

  -- CASE fixes the evaluation order so only a JSON number is ever cast. A
  -- string ("1"), a fraction (1.5), null or a missing key never matches.
  recorded := v.meta -> 'offer_revision';
  stale := case when jsonb_typeof(recorded) = 'number' then recorded::numeric <> o.revision else true end;
  if stale then
    raise exception using errcode = 'P0001', message = 'offer_changed';
  end if;

  if public.offer_is_expired(o.valid_until, o.workspace_id) then
    raise exception using errcode = 'P0001', message = 'offer_expired';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.offer_current_for_version(v public.output_versions) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_current_for_version(v public.output_versions) TO sme_app_runtime;

-- approve_output_version and export_output_version from 0004, each with exactly
-- one added statement (a perform of offer_current_for_version), directly
-- after the version row is locked and found. In export it sits after the
-- idempotency-key early return, so a retried export still answers 'existing'.
-- Nothing else changes: allowance, period, counting, audit rows and return
-- shapes are byte-for-byte 0004 (pinned by lib/workspace/offer-sql.test.ts).

CREATE OR REPLACE FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v public.output_versions%rowtype;
begin
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
$function$;

REVOKE ALL ON FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_output_version(p_version_id uuid, p_actor uuid, p_comment text) TO sme_app_runtime;

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
$function$;

REVOKE ALL ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_output_version(p_version_id uuid, p_actor uuid, p_mode text, p_idempotency_key text) TO sme_app_runtime;
