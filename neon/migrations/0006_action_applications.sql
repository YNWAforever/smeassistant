-- P3.2 applied evidence (docs/superpowers/specs/2026-09-16-applied-evidence-design.md).
-- The Master Plan requires four events kept distinct: approved/exported, owner
-- says applied, provider verifies applied, and later observed metric change.
-- Only the first and last existed; `action_state='completed'` was standing in
-- for the second inside lib/workspace/measurements.ts. This table records the
-- second and third. They share one table because they answer the same question
-- -- "was this applied?" -- with different authority, recorded in `source`.
--
-- Append-only (guardrail 10): a correction is a `retracted_at` stamp, never a
-- DELETE, so the history of what the owner claimed survives the correction.
-- There is deliberately NO unique constraint on (action_id, source):
-- re-applying after a newer approved draft is a legitimate second row, and a
-- verifier may check repeatedly. Duplicate-submit protection is the route's
-- job, not the schema's.

CREATE TABLE IF NOT EXISTS public.action_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action_id         uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, not CASCADE: losing a version must not erase the fact
  -- that the owner applied something.
  output_version_id uuid REFERENCES public.output_versions(id) ON DELETE SET NULL,
  source            text NOT NULL CHECK (source IN ('owner_asserted', 'verified')),
  asserted_by       uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  asserted_at       timestamptz NOT NULL DEFAULT now(),
  evidence          jsonb,
  note              text,
  retracted_at      timestamptz,
  retracted_by      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_applications_action_idx
  ON public.action_applications (action_id, asserted_at DESC)
  WHERE retracted_at IS NULL;

ALTER TABLE public.action_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.action_applications FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_applications TO sme_app_runtime;
CREATE POLICY server_application ON public.action_applications FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

-- Nullable and deliberately NOT backfilled: every existing row predates this
-- and there is no honest value to write. A backfill would invent a claim about
-- what an owner did.
ALTER TABLE public.action_measurements
  ADD COLUMN IF NOT EXISTS attribution_basis text;

ALTER TABLE public.action_measurements
  DROP CONSTRAINT IF EXISTS action_measurements_attribution_basis_check;
ALTER TABLE public.action_measurements
  ADD CONSTRAINT action_measurements_attribution_basis_check
  CHECK (attribution_basis IS NULL OR attribution_basis IN ('exported', 'owner_asserted', 'verified'));
