-- Phase 1 (owner-platform-v1) security repair: the DELETE /api/workspaces/[id]/members
-- route only ever reaches an owner-role target when the sole owner removes themselves
-- (workspace_members_one_owner_idx already limits a workspace to at most one owner), and
-- the route's authorization check could never distinguish that from a legitimate removal
-- -- authorizeWorkspaceRequest(minRole:"owner") means the caller is always an owner by the
-- time the route's own "non-owner removing an owner" guard runs, so it was structurally
-- dead code. Removing the sole owner then cascades through workspace_members_cleanup_orphan
-- (0003_workflows.sql) and ON DELETE CASCADE FROM workspaces(id) on nearly every workspace
-- table, destroying the whole workspace and its audit/output/billing history with no
-- recovery path. This closes that at the database boundary, not just in application code.
--
-- pg_trigger_depth() = 1 restricts the block to a direct DELETE FROM workspace_members
-- statement. The value is the CURRENT trigger nesting level, and it is 0 only outside
-- trigger context altogether -- inside this BEFORE DELETE function the outermost case is
-- already 1, so testing for 0 would make the guard permanently dead. A cascade-originated
-- delete (e.g. account erasure deleting app_users, which cascades to workspace_members via
-- ON DELETE CASCADE FROM app_users(id), which in turn lets workspace_members_cleanup_orphan
-- remove the now-memberless workspace -- the exact path neon-schema.integration.test.ts
-- "retains member cleanup ... invariants" already exercises) runs inside the referencing
-- table's own RI trigger, so this function sees depth >= 2 there and does not interfere
-- with it. neon-membership.integration.test.ts is what proves both halves. Ownership
-- transfer is intentionally still unbuilt (route.ts comment); removing the sole owner
-- remains impossible until that ships, not silently permitted through a side door.

CREATE OR REPLACE FUNCTION public.prevent_owner_removal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.role = 'owner' and pg_trigger_depth() = 1 then
    raise exception 'owner_removal_forbidden' using errcode = '23514';
  end if;
  return old;
end;
$function$
;
REVOKE ALL ON FUNCTION public.prevent_owner_removal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_owner_removal() TO sme_app_runtime;
CREATE TRIGGER workspace_members_prevent_owner_removal BEFORE DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.prevent_owner_removal();
