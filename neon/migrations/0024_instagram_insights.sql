-- Instagram insights persistence (Phase 20 P20.3, PLAN-20 §4.4).
--
-- Platform-reported observations for one connected Instagram professional
-- account, pulled on demand. One row is one metric over one window (account
-- scope) or one media item (media scope). A metric Meta did not return is
-- stored as a row with value NULL and an explicit `unavailable_reason`, so the
-- UI can render "Unavailable" with the reason instead of a zero (guardrails 1
-- and 2). History is append-only by application policy: each pull writes a new
-- observation set; readers take the latest row per (scope, media_ref, metric).
--
-- Deletion graph: a deleted workspace deletes its insights (workspace data).
-- No other reference, so no other cascade is needed.
CREATE TABLE IF NOT EXISTS public.instagram_insights (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_ref        text NOT NULL,
  scope              text NOT NULL CHECK (scope IN ('account','media')),
  media_ref          text,
  metric             text NOT NULL,
  period_start       timestamptz,
  period_end         timestamptz,
  value              numeric,
  fact_type          text NOT NULL DEFAULT 'Observed' CHECK (fact_type = 'Observed'),
  unavailable_reason text,
  observed_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'account' AND media_ref IS NULL) OR (scope = 'media' AND media_ref IS NOT NULL)),
  CHECK ((period_start IS NULL) = (period_end IS NULL)),
  CHECK (period_start IS NULL OR period_end >= period_start),
  CHECK (value IS NOT NULL OR unavailable_reason IS NOT NULL)
);

-- The only read: newest observation per (scope, media_ref, metric) for a workspace.
CREATE INDEX IF NOT EXISTS instagram_insights_latest_idx
  ON public.instagram_insights (workspace_id, observed_at DESC, id DESC);

ALTER TABLE public.instagram_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.instagram_insights FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.instagram_insights TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.instagram_insights;
CREATE POLICY server_application ON public.instagram_insights FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
