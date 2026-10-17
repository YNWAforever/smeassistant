import type { Pool } from "pg";

/**
 * Remove action runs created by one integration case without touching rows
 * owned by any other workspace. AI budget reads are global by design, so an
 * intentionally unresolved run left behind here can block the next case.
 */
export async function clearActionRunFixtures(
  pool: Pool,
  workspaceIds: readonly string[],
): Promise<void> {
  const uniqueWorkspaceIds = [...new Set(workspaceIds)];
  if (uniqueWorkspaceIds.length === 0) return;
  await pool.query(
    "DELETE FROM action_runs WHERE workspace_id = ANY($1::uuid[])",
    [uniqueWorkspaceIds],
  );
}
