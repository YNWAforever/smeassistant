import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { artifactRepository } from "./artifacts";
/** Called only after persisted action/evidence authorization in the route. */
export function actionMutationRepository(client?: Pick<Pool, "query">) {
  const db = () => client ?? getPool();
  return {
    async patch(
      actionId: string,
      workspaceId: string,
      patch: Record<string, unknown>,
    ) {
      const allowed = new Set([
        "action_state",
        "completed_at",
        "assignee_user_id",
        "due_at",
        "provided_inputs",
        "updated_at",
      ]);
      const entries = Object.entries(patch);
      if (!entries.length || entries.some(([key]) => !allowed.has(key)))
        throw new Error("invalid_action_patch");
      if (
        (await artifactRepository(db()).actionScope(actionId))?.workspaceId !==
        workspaceId
      )
        throw new Error("action_not_found");
      try {
        const result = await db().query(
          `UPDATE actions SET ${entries.map(([key], i) => `${key}=$${i + 3}`).join(",")} WHERE id=$1 AND workspace_id=$2 RETURNING id`,
          [
            actionId,
            workspaceId,
            ...entries.map(([key, value]) =>
              key === "provided_inputs" ? JSON.stringify(value) : value,
            ),
          ],
        );
        if (!result.rows.length) throw new Error("action_not_found");
      } catch {
        throw new Error("action_update_failed");
      }
    },
    async createObjective(
      row: Record<string, unknown>,
    ): Promise<{ id: string; created: boolean }> {
      const keys = [
        "workspace_id",
        "location_id",
        "template_key",
        "source",
        "source_finding_keys",
        "title",
        "summary",
        "evidence",
        "priority",
        "priority_score",
        "priority_factors",
        "effort_minutes",
        "required_inputs",
        "provided_inputs",
        "action_state",
        "measurement_state",
        "capability",
        "dedupe_key",
      ];
      const json = new Set([
        "title",
        "summary",
        "evidence",
        "priority_factors",
        "required_inputs",
        "provided_inputs",
      ]);
      // Keep the immutable actions_open_dedupe_idx predicate exactly equivalent.
      // required_inputs is JSONB; source_finding_keys is a PostgreSQL text array.
      try {
        const created = await db().query<{ id: string }>(
          `INSERT INTO actions(${keys.join(",")}) SELECT ${keys.map((_, i) => `$${i + 1}`).join(",")} WHERE $2::uuid IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=$2 AND workspace_id=$1)
      ON CONFLICT (dedupe_key) WHERE action_state NOT IN ('completed','dismissed','cancelled','expired') DO NOTHING RETURNING id`,
          keys.map((key) =>
            json.has(key) ? JSON.stringify(row[key]) : row[key],
          ),
        );
        if (created.rows[0]) return { id: created.rows[0].id, created: true };
        const existing = (
          await db().query<{ id: string }>(
            "SELECT id FROM actions WHERE workspace_id=$1 AND dedupe_key=$2 AND action_state IN ('recommended','needs_input','ready','in_progress') LIMIT 1",
            [row.workspace_id, row.dedupe_key],
          )
        ).rows[0];
        if (!existing) throw new Error("action_create_failed");
        return { id: existing.id, created: false };
      } catch {
        throw new Error("action_create_failed");
      }
    },
  };
}
