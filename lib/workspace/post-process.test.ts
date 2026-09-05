import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  derive: vi.fn(),
  diff: vi.fn(),
  measure: vi.fn(),
  notify: vi.fn(),
  job: null as Record<string, unknown> | null,
  lookupError: null as { message: string } | null,
}));
vi.mock("@/lib/workspace/snapshots", () => ({ buildSnapshot: mocks.build, loadDiffForHeadJob: mocks.diff }));
vi.mock("@/lib/workspace/actions", () => ({ deriveActionsForSnapshot: mocks.derive }));
vi.mock("@/lib/workspace/measurements", () => ({ recordMeasurements: mocks.measure }));
vi.mock("@/lib/workspace/notify", () => ({ notifyWorkspace: mocks.notify }));

import { postProcessWorkspaceScan } from "./post-process";

const db = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === "audit_jobs" ? mocks.job : table === "workspaces" ? { slug: "kam-man-house" } : table === "locations" ? { slug: "yik-yam" } : null,
          error: table === "audit_jobs" ? mocks.lookupError : null,
        }),
      }),
    }),
  }),
} as unknown as SupabaseClient;

beforeEach(() => {
  mocks.lookupError = null;
  mocks.build.mockReset();
  mocks.derive.mockReset();
  mocks.diff.mockReset().mockResolvedValue(null);
  mocks.measure.mockReset().mockResolvedValue({ comparable: true, recorded: 1, skipped: 0 });
  mocks.notify.mockReset().mockResolvedValue({ inserted: 1, error: null });
  mocks.job = { id: "job", workspace_id: "ws", location_id: "loc-1", status: "done", business_name: "Kam Man House" };
});

describe("postProcessWorkspaceScan", () => {
  it("skips public jobs and non-terminal jobs", async () => {
    mocks.job = { id: "job", workspace_id: null, status: "done" };
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: false, snapshotId: null, error: null });
    mocks.job = { id: "job", workspace_id: "ws", status: "collecting" };
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: false, snapshotId: null, error: null });
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("builds the snapshot, derives actions, then notifies scan.completed for workspace jobs", async () => {
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.derive.mockResolvedValue({});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: null });
    expect(mocks.derive).toHaveBeenCalledWith(db, "snap");
    expect(mocks.measure).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: "ws", kind: "scan.completed", href: "/owner/kam-man-house?location=yik-yam", title: expect.objectContaining({ en: "Scan completed for Kam Man House" }) }),
    );
  });

  it("records measurements only when the diff is comparable", async () => {
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.derive.mockResolvedValue({});
    mocks.diff.mockResolvedValue({ id: "diff-1", comparable: false });
    await postProcessWorkspaceScan(db, "job");
    expect(mocks.measure).not.toHaveBeenCalled();

    mocks.diff.mockResolvedValue({ id: "diff-1", comparable: true });
    await postProcessWorkspaceScan(db, "job");
    expect(mocks.measure).toHaveBeenCalledWith(db, { headSnapshot: { id: "snap" }, diff: { id: "diff-1", comparable: true } });
  });

  it("a measurement failure stays visible for retry and does not announce completion", async () => {
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.derive.mockResolvedValue({});
    mocks.diff.mockResolvedValue({ id: "diff-1", comparable: true });
    mocks.measure.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: "boom" });
    expect(mocks.notify).not.toHaveBeenCalled();
    mocks.measure.mockResolvedValue({ comparable: true, recorded: 1, skipped: 0 });
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: null });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("a failed workspace scan gets the scan.failed notice only", async () => {
    mocks.job = { id: "job", workspace_id: "ws", location_id: null, status: "failed", business_name: null };
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: null, error: null });
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(db, expect.objectContaining({ kind: "scan.failed", href: "/owner/kam-man-house", title: expect.objectContaining({ en: "Scan failed" }) }));
  });

  it("never throws: a post-processing failure is reported, not raised", async () => {
    mocks.build.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: null, error: "boom" });
    expect(mocks.notify).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});


describe("post-process recoverable failures", () => {
  it.each(["done", "partial", "failed"])("reports returned notification failures for %s jobs", async (status) => {
    mocks.job!.status = status;
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.notify.mockResolvedValueOnce({ inserted: 0, error: "notification insert failed" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({
      ran: true, snapshotId: status === "failed" ? null : "snap", error: "notification insert failed",
    });
    expect((await postProcessWorkspaceScan(db, "job")).error).toBeNull();
    expect(mocks.job!.status).toBe(status);
    spy.mockRestore();
  });

  it("preserves the persisted snapshot ID when action derivation fails and retries without changing the job", async () => {
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.derive.mockRejectedValueOnce(new Error("action update failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: "action update failed" });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: null });
    expect(mocks.job!.status).toBe("done");
    spy.mockRestore();
  });
});


it("reports lookup failures instead of treating them as an unclaimed job", async () => {
  mocks.lookupError = { message: "database unavailable" };
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: null, error: "post-process job lookup failed" });
  expect(mocks.build).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
  spy.mockRestore();
});


it("does not announce a comparable scan whose measurement base is not ready", async () => {
  mocks.build.mockResolvedValue({ id: "snap" });
  mocks.diff.mockResolvedValue({ comparable: true });
  mocks.measure.mockResolvedValue({ comparable: false, recorded: 0, skipped: 0 });
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: "measurement base snapshot not ready" });
  expect(mocks.notify).not.toHaveBeenCalled();
  spy.mockRestore();
});
