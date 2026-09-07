import type {
  FinishActionRunInput,
  QueueActionRunInput,
  RunAttribution,
} from "@/lib/repositories/artifacts";
import { vi } from "vitest";

/**
 * Explicit repository fakes for the coupled mutation route tests. There is
 * no chainable database transport. Query records and the RPC-shaped command
 * recorder retain the existing assertions while actual SQL behavior is
 * verified separately against the owned PostgreSQL fixture.
 */
export interface Query {
  table: string;
  op: "select" | "insert" | "update";
  payload: unknown;
  filters: Record<string, unknown>;
}

export type Responder = (q: Query) => unknown;

export function makeDb(respond: Responder) {
  const calls: Query[] = [];
  const rpc = vi.fn();
  const read = async (table: string, filters: Record<string, unknown> = {}) => {
    const q: Query = { table, op: "select", payload: null, filters };
    calls.push(q);
    const value = respond(q) as Record<string, unknown> | null;
    if (value && "error" in value) {
      if (value.error) throw new Error("fixture_read_failed");
      return value.data as Record<string, unknown> | null;
    }
    return value;
  };
  const write = async (
    table: string,
    op: "insert" | "update",
    payload: unknown,
    filters: Record<string, unknown> = {},
  ) => {
    const q: Query = { table, op, payload, filters };
    calls.push(q);
    return respond(q) as Record<string, unknown> | null;
  };
  const workflow = async (fn: string, args: Record<string, unknown>) => {
    const result = await rpc(fn, args);
    if (result?.error) throw new Error(result.error.message);
    return Array.isArray(result?.data) ? result.data[0] : result?.data;
  };
  const actionScope = async (id: string) => {
    const row = await read("actions", { id });
    return row
      ? {
          actionId: row.id,
          workspaceId: row.workspace_id,
          locationId: row.location_id,
        }
      : null;
  };
  return {
    calls,
    rpc,
    actionScope,
    versionScope: async (id: string) => {
      const row = await read("output_versions", { id });
      const rel = row?.actions as { location_id: string } | undefined;
      return row
        ? {
            versionId: row.id,
            actionId: row.action_id,
            workspaceId: row.workspace_id,
            locationId: rel?.location_id ?? null,
          }
        : null;
    },
    assistantActions: async (workspaceId: string, opts: { ids?: string[] }) => {
      const row = await read("actions", {
        id: opts.ids?.[0],
        workspace_id: workspaceId,
      });
      return row ? [{ ...row, source_snapshot_id: null }] : [];
    },
    assistantBrand: async () => null,
    queue: async (i: QueueActionRunInput) => {
      if (i.providedInputs)
        await write("actions", "update", { provided_inputs: i.providedInputs });
      await write("action_runs", "insert", i);
      return "run-1";
    },
    start: async (i: RunAttribution) => {
      await write("audit_events", "insert", {
        event: "run.started",
        entity_id: i.runId,
      });
    },
    finish: async (i: FinishActionRunInput) => {
      let version;
      if (i.output && !i.output.facts_needed.length && !i.error)
        version = await workflow("create_output_version", {
          p_author_type: "agent",
          p_action_run_id: i.runId,
        });
      await write("audit_events", "insert", {
        event: i.error ? "run.failed" : "run.succeeded",
      });
      return i.error
        ? { runId: i.runId, state: "failed", error: i.error }
        : version
          ? {
              runId: i.runId,
              state: "succeeded",
              versionId: version.version_id,
              versionNo: version.version_no,
            }
          : {
              runId: i.runId,
              state: "succeeded",
              factsNeeded: i.factsNeeded ?? i.output?.facts_needed,
            };
    },
    assistantLatestSnapshot: async () => null,
    assistantSnapshot: async () => null,
    assistantWorkspace: async (id: string) => read("workspaces", { id }),
    assistantLocations: async (workspaceId: string) => {
      const row = await read("locations", { workspace_id: workspaceId });
      return row ? [row] : [];
    },
    createOutputVersion: async (i: Record<string, unknown>) =>
      workflow("create_output_version", {
        p_action_id: i.actionId,
        p_actor: i.actor,
        p_author_type: i.authorType,
        p_action_run_id: i.actionRunId,
        p_body: i.body,
        p_alt: i.alt,
        p_meta: i.meta,
        p_base_version_id: i.baseVersionId,
      }),
    approveOutputVersion: async (
      id: string,
      actor: string,
      comment: string | null,
    ) =>
      workflow("approve_output_version", {
        p_version_id: id,
        p_actor: actor,
        p_comment: comment,
      }),
    decideOutputVersion: async (
      id: string,
      actor: string,
      decision: string,
      comment: string | null,
    ) =>
      workflow("decide_output_version", {
        p_version_id: id,
        p_actor: actor,
        p_decision: decision,
        p_comment: comment,
      }),
    exportOutputVersion: async (
      id: string,
      actor: string,
      mode: string,
      key: string,
    ) =>
      workflow("export_output_version", {
        p_version_id: id,
        p_actor: actor,
        p_mode: mode,
        p_idempotency_key: key,
      }),
    usage: async (workspaceId: string, period: string) =>
      read("workspace_usage", { workspace_id: workspaceId, period }),
    patch: async (
      id: string,
      workspaceId: string,
      patch: Record<string, unknown>,
    ) => write("actions", "update", patch, { id, workspace_id: workspaceId }),
    createObjective: async (row: Record<string, unknown>) => {
      const result = await write("actions", "insert", row);
      if (result?.error) {
        const existing = await read("actions", {
          workspace_id: row.workspace_id,
          dedupe_key: row.dedupe_key,
        });
        return { id: existing?.id, created: false };
      }
      return { id: result?.id, created: true };
    },
    acceptedMemberIds: async () => [],
    insert: async () => 0,
    hasSince: async () => true,
    workspaceSlug: async () => null,
    audit: async (row: Record<string, unknown>) =>
      write("audit_events", "insert", row),
  };
}

export const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
export const ACTION_ID = "33333333-3333-4333-8333-333333333333";
export const VERSION_ID = "44444444-4444-4444-8444-444444444444";

export function auth(
  role: "owner" | "manager" | "viewer",
  locationScope: string[] | null = null,
) {
  return {
    ok: true as const,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: {
      workspaceId: WORKSPACE_ID,
      workspaceSlug: "demo",
      userId: "user-1",
      email: "o@example.com",
      role,
      locationScope,
    },
  };
}

/** Mirrors lib/auth.ts::decideMembership for the role/scope cases the routes must refuse. */
export function authorizeLike(
  role: "owner" | "manager" | "viewer",
  locationScope: string[] | null = null,
) {
  return async (
    _ref: unknown,
    opts?: { minRole?: string; locationId?: string },
  ) => {
    const rank = { owner: 3, manager: 2, viewer: 1 } as const;
    const min = (opts?.minRole ?? "viewer") as keyof typeof rank;
    if (rank[role] < rank[min])
      return {
        ok: false as const,
        status: 403 as const,
        code: "forbidden" as const,
      };
    if (
      opts?.locationId &&
      role === "manager" &&
      locationScope &&
      !locationScope.includes(opts.locationId)
    )
      return {
        ok: false as const,
        status: 403 as const,
        code: "forbidden" as const,
      };
    return auth(role, locationScope);
  };
}
