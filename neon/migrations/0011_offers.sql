-- P4.1 confirmed offers (docs/superpowers/specs/2026-10-01-offer-promotion-copy-design.md §1).
--
-- An offer is owner-confirmed fact, kept apart from the drafts written from
-- it: generated copy lives in output_versions, and each version records the
-- offer revision it was written from in its meta (no SQL change for that).
--
-- ON DELETE CASCADE on location_id: a location's offer must never silently
-- widen to every location, which ON DELETE SET NULL would do (null means
-- workspace-wide).
-- ON DELETE SET NULL on actions.offer_id: removing an offer (only possible
-- through a workspace or location deletion) must never delete versions or
-- delivery history. An offer action whose offer_id became null is blocked by
-- the pre-model gate and can never be drafted again.
--
-- confirmed status requires a deliberate end-date choice: an ends_on date or
-- open_ended = true. Silence about the end date is never a gap the model may
-- fill.
CREATE TABLE IF NOT EXISTS public.offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id        uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  title              text NOT NULL,
  details            text NOT NULL,
  terms              text,
  price_amount       numeric(12,2),
  currency           text,
  starts_on          date NOT NULL,
  ends_on            date,
  open_ended         boolean NOT NULL DEFAULT false,
  approved_claims    text[] NOT NULL DEFAULT '{}',
  prohibited_wording text[] NOT NULL DEFAULT '{}',
  asset_ids          uuid[] NOT NULL DEFAULT '{}',
  source             text NOT NULL DEFAULT 'owner_form',
  status             text NOT NULL DEFAULT 'draft',
  revision           integer NOT NULL DEFAULT 1,
  confirmed_by       uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  confirmed_at       timestamptz,
  created_by         uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  archived_at        timestamptz,
  CONSTRAINT offers_status_check CHECK (status IN ('draft', 'confirmed', 'archived')),
  CONSTRAINT offers_source_check CHECK (source IN ('owner_form')),
  CONSTRAINT offers_currency_check CHECK (currency IS NULL OR currency IN ('HKD', 'TWD')),
  CONSTRAINT offers_price_currency_check CHECK ((price_amount IS NULL) = (currency IS NULL)),
  CONSTRAINT offers_price_nonnegative_check CHECK (price_amount IS NULL OR price_amount >= 0),
  CONSTRAINT offers_dates_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT offers_open_ended_check CHECK (NOT (open_ended AND ends_on IS NOT NULL)),
  CONSTRAINT offers_confirmed_check CHECK (status <> 'confirmed' OR (confirmed_at IS NOT NULL AND (ends_on IS NOT NULL OR open_ended))),
  CONSTRAINT offers_archived_check CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT offers_revision_check CHECK (revision >= 1)
);

-- The offers page lists one workspace's offers by status, newest first.
CREATE INDEX IF NOT EXISTS offers_workspace_idx ON public.offers (workspace_id, status, starts_on DESC);

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS actions_offer_idx ON public.actions (offer_id) WHERE offer_id IS NOT NULL;

-- RLS, grants and the server-only policy exactly as 0009/0010 do. The policy
-- is dropped first so the file is re-runnable (CREATE POLICY has no IF NOT
-- EXISTS).
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.offers TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.offers;
CREATE POLICY server_application ON public.offers FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
