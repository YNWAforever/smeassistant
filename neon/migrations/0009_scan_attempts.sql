-- P3.5a spend budgets (docs/superpowers/specs/2026-09-25-spend-budgets-design.md).
--
-- One row per scan claim, written by the claim statement itself
-- (lib/budgets/scan.ts BUDGETED_CLAIM_SQL), so a claim cannot happen without
-- its row and a row cannot exist without its claim. audit_jobs keeps only the
-- latest attempt time, so past attempts in a window could not be rebuilt
-- from existing rows.
--
-- ON DELETE CASCADE on the job: attempts are the job's own cost history.
-- ON DELETE SET NULL on the workspace: the global count must keep attempts
-- from deleted workspaces.
CREATE TABLE IF NOT EXISTS public.scan_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- The global and per-workspace rolling-window counts.
CREATE INDEX IF NOT EXISTS scan_attempts_attempted_idx ON public.scan_attempts (attempted_at);
CREATE INDEX IF NOT EXISTS scan_attempts_workspace_idx ON public.scan_attempts (workspace_id, attempted_at);

-- The AI spend sum over recorded action_runs.cost_usd; action_runs had no index.
CREATE INDEX IF NOT EXISTS action_runs_created_idx ON public.action_runs (created_at);
CREATE INDEX IF NOT EXISTS action_runs_workspace_created_idx ON public.action_runs (workspace_id, created_at);

-- RLS, grants and the server-only policy exactly as 0006 does for
-- action_applications. The policy is dropped first so the file is re-runnable
-- (CREATE POLICY has no IF NOT EXISTS).
ALTER TABLE public.scan_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scan_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_attempts TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.scan_attempts;
CREATE POLICY server_application ON public.scan_attempts FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
