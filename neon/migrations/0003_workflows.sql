-- Task 3 ordinary table invariants. Atomic workflows/fencing are Task 4.
CREATE OR REPLACE FUNCTION public.delete_orphaned_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.workspace_members where workspace_id = old.workspace_id) then
    delete from public.workspaces where id = old.workspace_id;
  end if;
  return old;
end;
$function$
;
REVOKE ALL ON FUNCTION public.delete_orphaned_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_orphaned_workspace() TO sme_app_runtime;
CREATE OR REPLACE FUNCTION public.touch_actions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION public.touch_actions_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_actions_updated_at() TO sme_app_runtime;
CREATE TRIGGER actions_touch_updated_at BEFORE UPDATE ON public.actions FOR EACH ROW EXECUTE FUNCTION touch_actions_updated_at();
CREATE TRIGGER workspace_members_cleanup_orphan AFTER DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION delete_orphaned_workspace();

-- Server-only access: application authorization remains the ownership boundary.
-- No browser/end-user role inherits this group. RLS requires membership explicitly.
GRANT USAGE ON SCHEMA public TO sme_app_runtime;
ALTER TABLE public."app_users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."app_users" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_users" TO sme_app_runtime;
CREATE POLICY server_application ON public."app_users" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."auth_identities" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."auth_identities" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."auth_identities" TO sme_app_runtime;
CREATE POLICY server_application ON public."auth_identities" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."action_measurements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."action_measurements" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."action_measurements" TO sme_app_runtime;
CREATE POLICY server_application ON public."action_measurements" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."action_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."action_runs" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."action_runs" TO sme_app_runtime;
CREATE POLICY server_application ON public."action_runs" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."actions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."actions" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."actions" TO sme_app_runtime;
CREATE POLICY server_application ON public."actions" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."aeo_surface_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."aeo_surface_snapshots" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."aeo_surface_snapshots" TO sme_app_runtime;
CREATE POLICY server_application ON public."aeo_surface_snapshots" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."agent_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."agent_runs" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."agent_runs" TO sme_app_runtime;
CREATE POLICY server_application ON public."agent_runs" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."assets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."assets" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."assets" TO sme_app_runtime;
CREATE POLICY server_application ON public."assets" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."audit_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."audit_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."audit_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."audit_findings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."audit_findings" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_findings" TO sme_app_runtime;
CREATE POLICY server_application ON public."audit_findings" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."audit_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."audit_jobs" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."audit_jobs" TO sme_app_runtime;
CREATE POLICY server_application ON public."audit_jobs" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."brand_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."brand_profiles" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."brand_profiles" TO sme_app_runtime;
CREATE POLICY server_application ON public."brand_profiles" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."consent_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."consent_records" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."consent_records" TO sme_app_runtime;
CREATE POLICY server_application ON public."consent_records" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."deliveries" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."deliveries" TO sme_app_runtime;
CREATE POLICY server_application ON public."deliveries" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."erasure_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."erasure_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."erasure_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."erasure_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."leads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."leads" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."leads" TO sme_app_runtime;
CREATE POLICY server_application ON public."leads" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."locations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."locations" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."locations" TO sme_app_runtime;
CREATE POLICY server_application ON public."locations" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."notification_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notification_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."notification_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."notification_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."oauth_connections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."oauth_connections" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."oauth_connections" TO sme_app_runtime;
CREATE POLICY server_application ON public."oauth_connections" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."output_versions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."output_versions" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."output_versions" TO sme_app_runtime;
CREATE POLICY server_application ON public."output_versions" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."rate_limit_buckets" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."rate_limit_buckets" TO sme_app_runtime;
CREATE POLICY server_application ON public."rate_limit_buckets" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."report_access_grants" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."report_access_grants" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."report_access_grants" TO sme_app_runtime;
CREATE POLICY server_application ON public."report_access_grants" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."report_evidence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."report_evidence" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."report_evidence" TO sme_app_runtime;
CREATE POLICY server_application ON public."report_evidence" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."scan_diffs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."scan_diffs" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."scan_diffs" TO sme_app_runtime;
CREATE POLICY server_application ON public."scan_diffs" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."scan_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."scan_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."scan_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."scan_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."scan_schedules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."scan_schedules" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."scan_schedules" TO sme_app_runtime;
CREATE POLICY server_application ON public."scan_schedules" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."scan_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."scan_snapshots" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."scan_snapshots" TO sme_app_runtime;
CREATE POLICY server_application ON public."scan_snapshots" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."staff_report_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."staff_report_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."staff_report_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."staff_report_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_access_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_access_requests" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_access_requests" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_access_requests" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_claim_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_claim_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_claim_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_claim_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_members" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_members" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_members" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_notifications" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_notifications" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_notifications" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_scan_completions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_scan_completions" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_scan_completions" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_scan_completions" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_tier_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_tier_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_tier_events" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_tier_events" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspace_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspace_usage" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspace_usage" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspace_usage" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
ALTER TABLE public."workspaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."workspaces" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."workspaces" TO sme_app_runtime;
CREATE POLICY server_application ON public."workspaces" FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sme_app_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
