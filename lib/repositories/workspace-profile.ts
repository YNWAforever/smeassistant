import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
/** Owner-authorized workspace profile writes; workspace remains the source of truth. */
export function workspaceProfileRepository(client?: Pick<Pool, "query">) {
 const db = () => client ?? getPool();
 return {
  async setInstagramHandle(workspaceId: string, handle: string): Promise<void> {
   await db().query("UPDATE workspaces SET instagram_handle=$2 WHERE id=$1",[workspaceId,handle]);
  },
  async syncPrimaryInstagramHandle(workspaceId: string, handle: string): Promise<void> {
   await db().query("UPDATE locations SET ig_handle=$2 WHERE workspace_id=$1 AND is_primary=true",[workspaceId,handle]);
  },
 };
}
