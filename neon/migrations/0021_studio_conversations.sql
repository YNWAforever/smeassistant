-- Conversation Studio persistence (docs/superpowers/specs/2026-11-08-conversation-studio-design.md §5).
--
-- Two additive workspace tables behind the CONVERSATION_STUDIO_ENABLED flag.
-- A conversation belongs to one workspace, one optional location and exactly one
-- member (created_by): the Studio is persistent and private per member. Rows are
-- never shared between members; every read filters both workspace_id and
-- created_by, and a foreign conversation id is "not found", never "forbidden".
--
-- Deletion graph:
--   workspace deleted        -> conversations cascade (they are workspace data)
--   creator member deleted   -> conversations cascade (their private threads)
--   location deleted         -> location_id set null (history outlives a shop)
--   conversation deleted     -> its messages cascade (the rows are its turns)
--   message author deleted   -> author_id set null (the turn text still happened)
--
-- studio_messages.workspace_id is denormalised so every message read can filter
-- the tenant directly, without trusting a join alone. It is written by the
-- repository from the conversation's own row and both foreign keys keep it
-- consistent. Messages are append-only by application policy: the repository is
-- the only writer, there is no update/delete route, and the DELETE grant below
-- exists only because the role model grants table DML as a unit.
CREATE TABLE IF NOT EXISTS public.studio_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  location_id     uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  created_by      uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT '' CHECK (char_length(title) <= 80),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.studio_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.studio_conversations(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  seq            integer NOT NULL CHECK (seq > 0),
  role           text NOT NULL CHECK (role IN ('user','assistant')),
  author_id      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  content        text NOT NULL DEFAULT '',
  parts          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parts) = 'array'),
  intent         text,
  model          text,
  prompt_version text,
  input_tokens   integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens  integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  cost_usd       numeric(12,6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, seq)
);

-- The rail read: one member's conversations, most recent first.
CREATE INDEX IF NOT EXISTS studio_conversations_owner_recent_idx
  ON public.studio_conversations (workspace_id, created_by, last_message_at DESC, id DESC);

-- The history read: one conversation's turns in order.
CREATE INDEX IF NOT EXISTS studio_messages_conversation_seq_idx
  ON public.studio_messages (conversation_id, seq);

-- RLS, grants and the server-only policy exactly as 0009 does for scan_attempts.
-- The two tables carry one policy each; verifyCatalog counts them from
-- legacy.tables.length + 6. The policy is dropped first so the file is
-- re-runnable (CREATE POLICY has no IF NOT EXISTS).
ALTER TABLE public.studio_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_conversations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_conversations TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.studio_conversations;
CREATE POLICY server_application ON public.studio_conversations FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

ALTER TABLE public.studio_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_messages TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.studio_messages;
CREATE POLICY server_application ON public.studio_messages FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
