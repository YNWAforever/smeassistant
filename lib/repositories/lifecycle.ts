import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
/**
 * Database-only erasure capabilities for an already-authorized lifecycle owner.
 * A single DELETE includes FK actions and cleanup triggers atomically. Preserve
 * original RESTRICT/NO ACTION failures; do not silently detach protected actors.
 * Blob deletion and identity-provider deletion require separate orchestration.
 */
export function lifecycleRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async deleteAppUser(appUserId: string): Promise<boolean> {
      return (
        (
          await db().query("DELETE FROM app_users WHERE id=$1 RETURNING id", [
            appUserId,
          ])
        ).rows.length > 0
      );
    },
    async deleteWorkspace(workspaceId: string): Promise<boolean> {
      return (
        (
          await db().query("DELETE FROM workspaces WHERE id=$1 RETURNING id", [
            workspaceId,
          ])
        ).rows.length > 0
      );
    },
    async deleteReportData(jobId: string): Promise<boolean> {
      return (
        (
          await db().query("DELETE FROM audit_jobs WHERE id=$1 RETURNING id", [
            jobId,
          ])
        ).rows.length > 0
      );
    },
  };
}
