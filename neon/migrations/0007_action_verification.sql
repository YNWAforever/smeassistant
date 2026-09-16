-- Website verifier (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
-- P3.2 built the four-event model but shipped "provider verifies applied" as a
-- seam with no caller. The sweep that fills it runs inside the existing cron
-- tick and must not refetch a customer's website every five minutes, so it
-- records when it last looked.
--
-- Nullable and deliberately NOT backfilled: null means "never attempted",
-- which is true of every existing row.
--
-- This is scheduling state on a domain table, which is a boundary smudge --
-- `actions` is otherwise about what the owner should do. Accepted because a
-- separate table for one nullable timestamp would be worse, and the column
-- doubles as operator visibility into what the sweep is doing. If `actions`
-- accumulates further sweep state, that is the signal to move it out.
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS verification_checked_at timestamptz;
