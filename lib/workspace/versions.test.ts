import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveVersion, createVersion, decideVersion, exportVersion, loadActionScope, loadVersionScope, VersionError } from "./versions";

function db(rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  return { rpc } as unknown as SupabaseClient;
}

describe("version RPC wrappers", () => {
  it("createVersion names every argument and returns the new version", async () => {
    const rpc = vi.fn(async () => ({ data: { kind: "created", version_id: "v-2", version_no: 2 }, error: null }));
    const result = await createVersion(db(rpc), { actionId: "act-1", actorId: "user-1", authorType: "user", body: "edited", baseVersionId: "v-1" });
    expect(result).toEqual({ versionId: "v-2", versionNo: 2 });
    expect(rpc).toHaveBeenCalledWith("create_output_version", {
      p_action_id: "act-1",
      p_actor: "user-1",
      p_author_type: "user",
      p_action_run_id: null,
      p_body: "edited",
      p_alt: null,
      p_meta: {},
      p_base_version_id: "v-1",
    });
  });

  it("maps the raised message to a typed VersionError", async () => {
    const conflict = db(async () => ({ data: null, error: { message: "version_conflict", code: "P0001" } }));
    await expect(createVersion(conflict, { actionId: "a", actorId: "u", authorType: "user", body: "x", baseVersionId: "stale" })).rejects.toMatchObject({ code: "version_conflict" });

    const allowance = db(async () => ({ data: null, error: { message: "allowance_exceeded" } }));
    await expect(exportVersion(allowance, { versionId: "v", actorId: "u", mode: "export", idempotencyKey: "k" })).rejects.toBeInstanceOf(VersionError);

    const closed = db(async () => ({ data: null, error: { message: "P0001: version_closed" } }));
    await expect(approveVersion(closed, { versionId: "v", actorId: "u" })).rejects.toMatchObject({ code: "version_closed" });
  });

  it("rethrows unknown RPC failures as plain errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(approveVersion(db(async () => ({ data: null, error: { message: "connection reset" } })), { versionId: "v", actorId: "u" })).rejects.toThrow("approve_output_version failed");
    consoleError.mockRestore();
  });

  it("approve and decide pass through idempotent kinds", async () => {
    const approve = db(async () => ({ data: { kind: "already-approved", version_id: "v-1", version_no: 1 }, error: null }));
    expect(await approveVersion(approve, { versionId: "v-1", actorId: "u", comment: "ok" })).toEqual({ kind: "already-approved", versionId: "v-1", versionNo: 1 });

    const rpc = vi.fn(async () => ({ data: [{ kind: "decided", version_id: "v-1", version_no: 1, decision: "rejected" }], error: null }));
    expect(await decideVersion(db(rpc), { versionId: "v-1", actorId: "u", decision: "rejected" })).toEqual({ kind: "decided", versionId: "v-1", versionNo: 1, decision: "rejected" });
    expect(rpc).toHaveBeenCalledWith("decide_output_version", { p_version_id: "v-1", p_actor: "u", p_decision: "rejected", p_comment: null });
  });

  it("exportVersion reports whether the delivery counted", async () => {
    const first = db(async () => ({ data: { kind: "exported", delivery_id: "d-1", version_id: "v-1", counted: true }, error: null }));
    expect(await exportVersion(first, { versionId: "v-1", actorId: "u", mode: "copy", idempotencyKey: "k1" })).toEqual({ kind: "exported", deliveryId: "d-1", versionId: "v-1", counted: true });
    const again = db(async () => ({ data: { kind: "existing", delivery_id: "d-1", version_id: "v-1", counted: false }, error: null }));
    expect((await exportVersion(again, { versionId: "v-1", actorId: "u", mode: "copy", idempotencyKey: "k1" })).counted).toBe(false);
  });
});

describe("scope lookups", () => {
  function table(row: unknown) {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
    return { from: () => chain } as unknown as SupabaseClient;
  }

  it("loads the workspace and location an action / version belongs to", async () => {
    expect(await loadActionScope(table({ id: "a", workspace_id: "ws", location_id: "loc" }), "a")).toEqual({ actionId: "a", workspaceId: "ws", locationId: "loc" });
    expect(await loadActionScope(table(null), "a")).toBeNull();
    expect(await loadVersionScope(table({ id: "v", action_id: "a", workspace_id: "ws", actions: [{ location_id: null }] }), "v")).toEqual({ versionId: "v", actionId: "a", workspaceId: "ws", locationId: null });
  });
});
