-- T21 expand-only. Historical content is only the known current baseline.
CREATE TABLE public.brand_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
 actor_id uuid REFERENCES public.app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL CHECK(source IN ('baseline','save')),
 UNIQUE(workspace_id,id)
);
CREATE INDEX brand_revisions_history_idx ON public.brand_revisions(workspace_id,created_at DESC,id DESC);
ALTER TABLE public.brand_profiles ADD COLUMN current_revision_id uuid;
INSERT INTO public.brand_revisions(workspace_id,profile,created_at,source)
 SELECT workspace_id,jsonb_build_object('voice',voice,'approved_claims',approved_claims,'prohibited_terms',prohibited_terms,'languages',languages,'facts',facts),updated_at,'baseline' FROM public.brand_profiles;
UPDATE public.brand_profiles p SET current_revision_id=r.id FROM public.brand_revisions r WHERE r.workspace_id=p.workspace_id;
ALTER TABLE public.brand_profiles ADD CONSTRAINT brand_profiles_current_revision_fkey FOREIGN KEY(workspace_id,current_revision_id) REFERENCES public.brand_revisions(workspace_id,id);
CREATE FUNCTION public.guard_brand_revision_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'brand_revision_immutable'; END $$;
REVOKE ALL ON FUNCTION public.guard_brand_revision_immutable() FROM PUBLIC;
CREATE TRIGGER brand_revision_immutable BEFORE UPDATE OR DELETE ON public.brand_revisions FOR EACH ROW EXECUTE FUNCTION public.guard_brand_revision_immutable();
ALTER TABLE public.brand_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_read_brand_revisions ON public.brand_revisions FOR SELECT TO sme_app_runtime USING(true);
CREATE POLICY server_append_brand_revisions ON public.brand_revisions FOR INSERT TO sme_app_runtime WITH CHECK(true);
REVOKE ALL ON public.brand_revisions FROM PUBLIC;
GRANT SELECT,INSERT ON public.brand_revisions TO sme_app_runtime;

CREATE FUNCTION public.save_brand_revision(p_workspace uuid,p_actor uuid,p_profile jsonb,p_expected uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_current uuid; v_revision uuid; v_profile jsonb;
BEGIN
 -- Workspace lock serializes even the initial profile creation.
 PERFORM id FROM public.workspaces WHERE id=p_workspace FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor AND role='owner' AND accepted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'brand_revision_forbidden'; END IF;
 SELECT current_revision_id INTO v_current FROM public.brand_profiles WHERE workspace_id=p_workspace FOR UPDATE;
 IF v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'brand_revision_conflict'; END IF;
 INSERT INTO public.brand_revisions(workspace_id,actor_id,profile,source) VALUES(p_workspace,p_actor,p_profile,'save') RETURNING id INTO v_revision;
 INSERT INTO public.brand_profiles(workspace_id,voice,approved_claims,prohibited_terms,languages,facts,current_revision_id,updated_at)
 VALUES(p_workspace,p_profile->>'voice',ARRAY(SELECT jsonb_array_elements_text(p_profile->'approved_claims')),ARRAY(SELECT jsonb_array_elements_text(p_profile->'prohibited_terms')),ARRAY(SELECT jsonb_array_elements_text(p_profile->'languages')),p_profile->'facts',v_revision,now())
 ON CONFLICT(workspace_id) DO UPDATE SET voice=excluded.voice,approved_claims=excluded.approved_claims,prohibited_terms=excluded.prohibited_terms,languages=excluded.languages,facts=excluded.facts,current_revision_id=excluded.current_revision_id,updated_at=excluded.updated_at;
 SELECT to_jsonb(p) INTO v_profile FROM public.brand_profiles p WHERE p.workspace_id=p_workspace;
 RETURN jsonb_build_object('profile',v_profile,'revisionId',v_revision);
END $$;
REVOKE ALL ON FUNCTION public.save_brand_revision(uuid,uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_brand_revision(uuid,uuid,jsonb,uuid) TO sme_app_runtime;
