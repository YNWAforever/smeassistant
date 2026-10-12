-- T21 follow-up: capture known legacy/claim writes without rewriting 0016.
-- AFTER avoids orphan revisions from INSERT ... ON CONFLICT attempts.
CREATE FUNCTION public.capture_brand_profile_revision() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_revision uuid; v_capture boolean;
BEGIN
 v_capture := NEW.current_revision_id IS NULL;
 IF TG_OP='UPDATE' THEN
  v_capture := v_capture OR (NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
   AND ROW(NEW.voice,NEW.approved_claims,NEW.prohibited_terms,NEW.languages,NEW.facts)
    IS DISTINCT FROM ROW(OLD.voice,OLD.approved_claims,OLD.prohibited_terms,OLD.languages,OLD.facts));
 END IF;
 IF v_capture THEN
  INSERT INTO public.brand_revisions(workspace_id,profile,created_at,source)
   VALUES(NEW.workspace_id,jsonb_build_object('voice',NEW.voice,'approved_claims',NEW.approved_claims,
    'prohibited_terms',NEW.prohibited_terms,'languages',NEW.languages,'facts',NEW.facts),NEW.updated_at,'baseline')
   RETURNING id INTO v_revision;
  -- The nested UPDATE changes only the revision pointer; it cannot recapture.
  UPDATE public.brand_profiles SET current_revision_id=v_revision WHERE workspace_id=NEW.workspace_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_brand_profile_revision() FROM PUBLIC;
CREATE TRIGGER brand_profile_revision_capture AFTER INSERT OR UPDATE ON public.brand_profiles
 FOR EACH ROW EXECUTE FUNCTION public.capture_brand_profile_revision();
-- Profiles created between 0016 and this migration get only their known content.
UPDATE public.brand_profiles SET current_revision_id=current_revision_id WHERE current_revision_id IS NULL;

CREATE FUNCTION public.brand_snapshot_for_generation(p_workspace uuid,p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_profile jsonb;
BEGIN
 PERFORM id FROM public.workspaces WHERE id=p_workspace FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace
  AND user_id=p_actor AND role IN ('owner','manager') AND accepted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'brand_snapshot_forbidden'; END IF;
 -- Only existing defaults, empty facts and an unknown historical actor are used.
 -- Test existence under the workspace lock so repeated reads append nothing.
 IF NOT EXISTS(SELECT 1 FROM public.brand_profiles WHERE workspace_id=p_workspace) THEN
  INSERT INTO public.brand_profiles(workspace_id) VALUES(p_workspace);
 END IF;
 SELECT r.profile || jsonb_build_object('current_revision_id',r.id) INTO v_profile
  FROM public.brand_profiles p JOIN public.brand_revisions r ON r.workspace_id=p.workspace_id AND r.id=p.current_revision_id
  WHERE p.workspace_id=p_workspace;
 IF v_profile IS NULL THEN RAISE EXCEPTION 'brand_snapshot_missing'; END IF;
 RETURN v_profile;
END $$;
REVOKE ALL ON FUNCTION public.brand_snapshot_for_generation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_snapshot_for_generation(uuid,uuid) TO sme_app_runtime;
