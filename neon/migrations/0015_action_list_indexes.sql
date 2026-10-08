-- T-12: measured 1000-action fixture showed one workspace-wide action_runs
-- bitmap scan per action (about 1 ms each). Latest metadata must use the exact
-- tenant/action equality prefix and deterministic ordering, without body/meta.
-- New migration after verified 0014; only disposable DB execution is authorized.
CREATE INDEX IF NOT EXISTS action_runs_latest_metadata_idx
  ON public.action_runs (workspace_id, action_id, created_at DESC, id DESC)
  INCLUDE (state);

CREATE INDEX IF NOT EXISTS output_versions_latest_metadata_idx
  ON public.output_versions (workspace_id, action_id, version_no DESC, id DESC)
  INCLUDE (approval_state, delivery_state, first_exported_at);

CREATE INDEX IF NOT EXISTS actions_list_keyset_idx
  ON public.actions (workspace_id, (COALESCE(priority_score, 0)) DESC, updated_at DESC, id DESC)
  INCLUDE (location_id, action_state, template_key);
