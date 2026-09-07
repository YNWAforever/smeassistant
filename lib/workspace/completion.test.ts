import { describe, expect, it, vi } from "vitest";
import { completeWorkspaceScan, reconcileWorkspaceScans } from "./completion";
const job = "11111111-1111-4111-8111-111111111111",
  token = "22222222-2222-4222-8222-222222222222";
function fixture(status = "claimed") {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("claim_workspace")
      ? [{ claim: { status, token } }]
      : sql.includes("FOR UPDATE")
        ? [{ valid: true }]
        : sql.includes("finish_workspace")
          ? [{ finished: true }]
          : [],
  }));
  const release = vi.fn();
  const client = { query, release };
  const db = { query, connect: vi.fn(async () => client) } as never;
  const process = vi.fn(async () => ({
    ran: true,
    snapshotId: "snapshot",
    error: null as string | null,
  }));
  return { query, db, client, release, process };
}
describe("persisted workspace completion", () => {
  it.each(["completed", "busy", "skipped"])(
    "does not process %s",
    async (status) => {
      const f = fixture(status);
      expect(await completeWorkspaceScan(f.db, job, f.process)).toEqual({
        status,
      });
      expect(f.process).not.toHaveBeenCalled();
    },
  );
  it("finishes successful effects on the same transaction client", async () => {
    const f = fixture();
    expect(await completeWorkspaceScan(f.db, job, f.process)).toEqual({
      status: "completed",
    });
    expect(f.process).toHaveBeenCalledWith(f.client, job);
    expect(f.query).toHaveBeenCalledWith("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("rolls back partial effects before recording bounded retry", async () => {
    const f = fixture();
    f.process.mockResolvedValue({
      ran: true,
      snapshotId: "snapshot",
      error: "private payload",
    });
    expect(await completeWorkspaceScan(f.db, job, f.process)).toEqual({
      status: "retry",
    });
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(JSON.stringify(f.query.mock.calls)).not.toContain("private payload");
  });
  it("terminal scan alone is not completion success", async () => {
    const f = fixture();
    f.process.mockResolvedValue({
      ran: false,
      snapshotId: "snapshot",
      error: null,
    });
    expect(await completeWorkspaceScan(f.db, job, f.process)).toEqual({
      status: "retry",
    });
  });
  it("denied finish rolls back", async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes("finish_workspace")
        ? ({ rows: [{ finished: false }] } as never)
        : original(sql),
    );
    expect(await completeWorkspaceScan(f.db, job, f.process)).toEqual({
      status: "retry",
    });
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("bounds recovery at five persisted job identities", async () => {
    const query = vi.fn(async () => ({
      rows: Array.from({ length: 7 }, (_, i) => ({ job_id: String(i) })),
    }));
    const complete = vi.fn(async () => ({ status: "completed" as const }));
    expect(
      await reconcileWorkspaceScans({ query } as never, complete),
    ).toHaveLength(5);
    expect(complete).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenCalledWith(
      "SELECT * FROM pending_workspace_completions($1)",
      [5],
    );
  });
});

it("bounds claim errors and never processes unclaimed work", async () => {
  const f = fixture();
  f.query.mockRejectedValueOnce(new Error("private connection payload"));
  await expect(completeWorkspaceScan(f.db, job, f.process)).rejects.toThrow(
    "completion_claim_failed",
  );
  expect(f.process).not.toHaveBeenCalled();
});
