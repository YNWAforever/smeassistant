import { vi } from "vitest";

/**
 * Test-only chainable Supabase stand-in shared by the Phase 4 route tests.
 * Every `from(table)` chain records one Query and resolves through `respond`
 * at its terminal (maybeSingle/single/returns/await), so a test can assert
 * on what was written and choose what is read per table and operation.
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
  const from = (table: string) => {
    const q: Query = { table, op: "select", payload: null, filters: {} };
    let recorded = false;
    const resolve = () => {
      if (!recorded) {
        calls.push(q);
        recorded = true;
      }
      const result = respond(q);
      return Promise.resolve(result && typeof result === "object" && "error" in (result as object) ? result : { data: result ?? null, error: null });
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      order: self,
      limit: self,
      is: self,
      in: self,
      not: self,
      eq: (column: string, value: unknown) => {
        q.filters[column] = value;
        return chain;
      },
      insert: (payload: unknown) => {
        q.op = "insert";
        q.payload = payload;
        return chain;
      },
      update: (payload: unknown) => {
        q.op = "update";
        q.payload = payload;
        return chain;
      },
      maybeSingle: resolve,
      single: resolve,
      returns: resolve,
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => resolve().then(onOk, onErr),
    });
    return chain;
  };
  return { from, rpc, calls };
}

export const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
export const ACTION_ID = "33333333-3333-4333-8333-333333333333";
export const VERSION_ID = "44444444-4444-4444-8444-444444444444";

export function auth(role: "owner" | "manager" | "viewer", locationScope: string[] | null = null) {
  return {
    ok: true as const,
    user: { id: "user-1", email: "o@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "o@example.com", role, locationScope },
  };
}

/** Mirrors lib/auth.ts::decideMembership for the role/scope cases the routes must refuse. */
export function authorizeLike(role: "owner" | "manager" | "viewer", locationScope: string[] | null = null) {
  return async (_ref: unknown, opts?: { minRole?: string; locationId?: string }) => {
    const rank = { owner: 3, manager: 2, viewer: 1 } as const;
    const min = (opts?.minRole ?? "viewer") as keyof typeof rank;
    if (rank[role] < rank[min]) return { ok: false as const, status: 403 as const, code: "forbidden" as const };
    if (opts?.locationId && role === "manager" && locationScope && !locationScope.includes(opts.locationId)) return { ok: false as const, status: 403 as const, code: "forbidden" as const };
    return auth(role, locationScope);
  };
}
