-- P3.5c mail outbox (docs/superpowers/specs/2026-09-27-mail-outbox-design.md).
--
-- Transactional outbox for event mail (rescan-complete, regression-alert),
-- written inside the same completion transaction that writes the in-app
-- workspace_notifications row (lib/workspace/post-process.ts), delivered by a
-- new step of the existing cron tick (lib/mail/deliver.ts).
--
-- ON DELETE CASCADE on workspace_id, user_id and job_id: a row is about a
-- specific member's mail for a specific job in a specific workspace. If any
-- of the three is gone the mail is meaningless and must not be sent or kept.
--
-- payload is NOT NULL (plan departure 1, global-constraints.md): the send-time
-- template needs businessName, regressedCount and workspacePath as observed at
-- enqueue time. Recomputing them from the job/diff at send time -- which may
-- run long after the completion, against rows that can since have changed or
-- been deleted -- could drift from what the completion actually saw.
--
-- hold_reason is non-null iff state='held': every other state (queued,
-- sending, sent, retry, dead, expired) carries no hold reason, and a held row
-- always explains why it is held.
CREATE TABLE IF NOT EXISTS public.mail_outbox (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES public.audit_jobs(id) ON DELETE CASCADE,
  kind                text NOT NULL,
  to_address          text,
  locale              text NOT NULL,
  state               text NOT NULL DEFAULT 'queued',
  hold_reason         text,
  payload             jsonb NOT NULL,
  attempts            integer NOT NULL DEFAULT 0,
  lease_token         uuid,
  lease_until         timestamptz,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  CONSTRAINT mail_outbox_kind_check CHECK (kind IN ('rescan_complete', 'regression_alert')),
  CONSTRAINT mail_outbox_locale_check CHECK (locale IN ('en', 'zh-HK', 'zh-TW')),
  CONSTRAINT mail_outbox_state_check CHECK (state IN ('queued', 'sending', 'sent', 'retry', 'held', 'dead', 'expired')),
  CONSTRAINT mail_outbox_hold_reason_check CHECK (hold_reason IS NULL OR hold_reason IN ('mail_unapproved', 'kind_disabled', 'opted_out', 'no_address', 'not_allowlisted', 'not_member')),
  CONSTRAINT mail_outbox_hold_reason_state_check CHECK ((state = 'held') = (hold_reason IS NOT NULL))
);

-- Claiming: "give me up to 10 due rows" filters state then orders by
-- next_attempt_at. Ops reads: "this workspace's outbox, newest first".
CREATE INDEX IF NOT EXISTS mail_outbox_due_idx ON public.mail_outbox (state, next_attempt_at);
CREATE INDEX IF NOT EXISTS mail_outbox_workspace_idx ON public.mail_outbox (workspace_id, created_at DESC);

ALTER TABLE public.mail_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mail_outbox FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mail_outbox TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.mail_outbox;
CREATE POLICY server_application ON public.mail_outbox FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

-- Per-member mail preferences: opt-in, default off (spec §"Decisions"). Not
-- backfilled beyond the default -- there is no honest non-default value for
-- an existing member who has never chosen. mail_locale is null until a
-- member saves a preference from a page locale; the sender falls back to the
-- market default when null.
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS mail_rescan_complete boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS mail_regression_alert boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS mail_locale text;

ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_mail_locale_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_mail_locale_check
  CHECK (mail_locale IS NULL OR mail_locale IN ('en', 'zh-HK', 'zh-TW'));
