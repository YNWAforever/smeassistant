import { describe, expect, it, vi } from "vitest";
import { completeWorkspaceScan, reconcileWorkspaceScans } from "./completion";

function fixture(claim: Record<string, unknown> = { status: "claimed", token: "lease" }) {
  const rpc = vi.fn(async (name: string) => ({ data: name === "claim_workspace_completion" ? claim : true, error: null }));
  const process = vi.fn(async () => ({ ran: true, snapshotId: "snapshot", error: null }));
  return { rpc, process, db: { rpc } as never };
}
describe("persisted workspace completion", () => {
  it("does not run side effects for completed, busy, or unclaimed jobs", async () => {
    for (const status of ["completed", "busy", "skipped"]) {
      const f = fixture({ status });
      expect((await completeWorkspaceScan(f.db, "job", f.process, () => f.db)).status).toBe(status);
      expect(f.process).not.toHaveBeenCalled();
    }
  });
  it("acknowledges only the claimed lease after successful post-processing", async () => {
    const f = fixture();
    expect((await completeWorkspaceScan(f.db, "job", f.process, () => f.db)).status).toBe("completed");
    expect(f.rpc).toHaveBeenLastCalledWith("finish_workspace_completion", { p_job_id: "job", p_token: "lease", p_succeeded: true, p_error: null });
  });
  it("persists a safe retry category rather than private error text", async () => {
    const f = fixture();
    f.process.mockResolvedValue({ ran: true, snapshotId: null as never, error: "private provider payload" as never });
    expect((await completeWorkspaceScan(f.db, "job", f.process, () => f.db)).status).toBe("retry");
    expect(f.rpc).toHaveBeenLastCalledWith("finish_workspace_completion", expect.objectContaining({ p_succeeded: false, p_error: "workspace_post_process_failed" }));
  });
  it("does not report success when lease acknowledgement is rejected", async () => {
    const f = fixture();
    f.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_workspace_completion" ? { status: "claimed", token: "lease" } : false, error: null }) as never);
    expect((await completeWorkspaceScan(f.db, "job", f.process, () => f.db)).status).toBe("retry");
  });
  it("does not invoke processing when claim persistence fails", async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } } as never);
    await expect(completeWorkspaceScan(f.db, "job", f.process, () => f.db)).rejects.toThrow("completion_claim_failed");
    expect(f.process).not.toHaveBeenCalled();
  });
  it("bounds reconciliation and processes only server-selected job IDs", async () => {
    const rpc = vi.fn(async () => ({ data: [{ job_id: "first" }, { job_id: "second" }], error: null }));
    const complete = vi.fn(async () => ({ status: "completed" as const }));
    expect(await reconcileWorkspaceScans({ rpc } as never, complete)).toEqual([{ status: "completed" }, { status: "completed" }]);
    expect(rpc).toHaveBeenCalledWith("pending_workspace_completions", { p_limit: 5 });
    expect(complete.mock.calls).toHaveLength(2);
  });
});
