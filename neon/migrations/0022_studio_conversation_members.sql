-- Shared Conversation Studio conversations (v1.1 P1.3).
--
-- One additive membership table: a conversation stays owned by its creator, and
-- this table grants other workspace members access. Roles are deliberately
-- narrow: `editor` may continue the conversation, `viewer` may read it.
-- Workspace scoping is still enforced in the application layer for every read;
-- the table carries workspace_id so a shared-conversation query can filter the
-- tenant without trusting a join alone.
--
-- Deletion graph:
--   conversation deleted -> memberships cascade
--   workspace deleted    -> memberships cascade
--   member removed from  -> memberships cascade (app_users delete)
--   adder removed       -> added_by set null (the share still happened)
CREATE TABLE IF NOT EXISTS public.studio_conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.studio_conversations(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
  added_by        uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- "Shared with me" read: one member's shared conversations in a workspace, newest first.
CREATE INDEX IF NOT EXISTS studio_conversation_members_user_idx
  ON public.studio_conversation_members (workspace_id, user_id, created_at DESC);

ALTER TABLE public.studio_conversation_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_conversation_members FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_conversation_members TO sme_app_runtime;
DROP POLICY IF EXISTS server_application ON public.studio_conversation_members;
CREATE POLICY server_application ON public.studio_conversation_members FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
