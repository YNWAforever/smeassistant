-- Stage 3 only: immutable source/draft snapshots and one explicit owner confirmation.
-- No flag, delivery state, model path or hosted configuration changes.
CREATE TABLE public.conversation_search_briefs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 -- Scope snapshot survives location deletion; readers require the original location.
 location_id uuid NOT NULL,
 snapshot_key text NOT NULL CHECK(snapshot_key ~ '^[a-f0-9]{64}$'),
 gap jsonb NOT NULL CHECK(jsonb_typeof(gap)='object' AND octet_length(gap::text)<=131072),
 brief jsonb CHECK(brief IS NULL OR (jsonb_typeof(brief)='object' AND octet_length(brief::text)<=32768)),
 created_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 approved_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
 -- Retain the original task ID even if its task/location is later deleted.
 action_id uuid UNIQUE,
 CHECK((approved_at IS NULL)=(action_id IS NULL)),
 CHECK(approved_at IS NOT NULL OR approved_by IS NULL),
 CONSTRAINT conversation_search_briefs_scope_snapshot_key UNIQUE(workspace_id,location_id,snapshot_key)
);
CREATE INDEX conversation_search_briefs_scope_idx ON public.conversation_search_briefs(workspace_id,location_id,created_at DESC,id DESC);

CREATE FUNCTION public.guard_conversation_search_brief() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=OLD.workspace_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'search_brief_immutable';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.action_id IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM public.locations WHERE id=NEW.location_id AND workspace_id=NEW.workspace_id)
  THEN RAISE EXCEPTION 'search_brief_scope_invalid'; END IF;
  RETURN NEW;
 END IF;
 -- Account erasure may clear only the deleted actor reference.
 IF OLD.approved_by IS NOT NULL AND NEW.approved_by IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=OLD.approved_by)
  AND (to_jsonb(NEW)-'approved_by')=(to_jsonb(OLD)-'approved_by') THEN RETURN NEW; END IF;
 IF OLD.approved_at IS NOT NULL OR NEW.approved_at IS NULL OR NEW.approved_at<OLD.created_at
  OR (to_jsonb(NEW)-ARRAY['approved_at','approved_by','action_id'])<>(to_jsonb(OLD)-ARRAY['approved_at','approved_by','action_id'])
  OR NEW.brief IS NULL OR COALESCE(jsonb_array_length(NEW.gap->'queries'),0)<1
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.approved_by AND role='owner' AND accepted_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.actions WHERE id=NEW.action_id AND workspace_id=NEW.workspace_id AND location_id=NEW.location_id AND source='owner_objective')
  OR NOT EXISTS(SELECT 1 FROM public.locations WHERE id=NEW.location_id AND workspace_id=NEW.workspace_id)
 THEN RAISE EXCEPTION 'search_brief_immutable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_conversation_search_brief() FROM PUBLIC;
CREATE TRIGGER conversation_search_brief_guard BEFORE INSERT OR UPDATE OR DELETE ON public.conversation_search_briefs FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_search_brief();
ALTER TABLE public.conversation_search_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_read_conversation_search_briefs ON public.conversation_search_briefs FOR SELECT TO sme_app_runtime USING(true);
CREATE POLICY server_append_conversation_search_briefs ON public.conversation_search_briefs FOR INSERT TO sme_app_runtime WITH CHECK(true);
CREATE POLICY server_confirm_conversation_search_briefs ON public.conversation_search_briefs FOR UPDATE TO sme_app_runtime USING(true) WITH CHECK(true);
REVOKE ALL ON public.conversation_search_briefs FROM PUBLIC;
REVOKE ALL ON public.conversation_search_briefs FROM sme_app_runtime;
GRANT SELECT,INSERT ON public.conversation_search_briefs TO sme_app_runtime;
GRANT UPDATE(approved_at,approved_by,action_id) ON public.conversation_search_briefs TO sme_app_runtime;
