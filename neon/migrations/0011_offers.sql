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
