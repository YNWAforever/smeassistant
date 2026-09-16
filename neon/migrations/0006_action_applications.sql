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
  -- The future verifier's proof payload (photo, screenshot metadata, provider
  -- callback body, ...). Unused today -- no writer sets it yet -- but the
  -- verifier seam Task 2 defines (lib/workspace/applications.ts) is typed in
  -- terms of this column, so it is carried now rather than added later.
  evidence          jsonb,
  note              text,
  -- No CHECK tying retracted_at to retracted_by (e.g. requiring both null or
  -- both set): retracted_by references app_users ON DELETE SET NULL, and a
  -- deleted user's row is reached by an UPDATE that Postgres re-checks against
  -- every CHECK constraint. Verified empirically against the disposable
  -- Docker Postgres fixture: adding that CHECK and then deleting the
  -- app_users row behind an already-retracted application fails the DELETE
  -- with a 23514 check violation ("violates check constraint"), i.e. it would
  -- make account deletion / erasure fail whenever the retracting user is
  -- later removed. A retraction with a since-deleted actor (retracted_at set,
  -- retracted_by null) must stay representable.
  retracted_at      timestamptz,
  retracted_by      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- `source` leads the second key position (not `workspace_id`): action_id
-- already determines the workspace (an action belongs to exactly one), so a
-- leading workspace_id would be a defensive scope assertion, not a
-- selectivity filter, and would sit ahead of the actually selective column.
-- This composite serves Task 3's "newest non-retracted row of one source for
-- one action" query (filters action_id + source + retracted_at, orders by
-- asserted_at desc) without a recheck over all of the action's rows.
CREATE INDEX IF NOT EXISTS action_applications_action_idx
  ON public.action_applications (action_id, source, asserted_at DESC)
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
