-- P3.4 (docs/superpowers/specs/2026-09-24-reliable-events-value-metric-design.md).
-- The weekly value report must exclude staff and test workspaces. is_demo
-- already marks the fixed, sanitised public sample; internal means real data
-- that is not a customer. They are separate so a staff workspace is never
-- marked demo and published on the demo page.
--
-- NOT NULL DEFAULT false: there is no meaningful unknown, and every existing
-- row is correctly false except staff-assigned workspaces, which are marked by
-- hand (see the phase report's runbook entry). No index: the report reads a
-- handful of workspace rows once a week.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
