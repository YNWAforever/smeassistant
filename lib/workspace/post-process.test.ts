import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ build: vi.fn(), derive: vi.fn(), job: null as Record<string, unknown> | null }));
vi.mock("@/lib/workspace/snapshots", () => ({ buildSnapshot: mocks.build }));
vi.mock("@/lib/workspace/actions", () => ({ deriveActionsForSnapshot: mocks.derive }));

import { postProcessWorkspaceScan } from "./post-process";

const db = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.job, error: null }) }) }) }),
} as unknown as SupabaseClient;

beforeEach(() => {
  mocks.build.mockReset();
  mocks.derive.mockReset();
  mocks.job = { id: "job", workspace_id: "ws", status: "done" };
});

describe("postProcessWorkspaceScan", () => {
  it("skips public jobs and non-terminal jobs", async () => {
    mocks.job = { id: "job", workspace_id: null, status: "done" };
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: false, snapshotId: null, error: null });
    mocks.job = { id: "job", workspace_id: "ws", status: "collecting" };
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: false, snapshotId: null, error: null });
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("builds the snapshot then derives actions for workspace jobs", async () => {
    mocks.build.mockResolvedValue({ id: "snap" });
    mocks.derive.mockResolvedValue({});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: "snap", error: null });
    expect(mocks.derive).toHaveBeenCalledWith(db, "snap");
  });

  it("never throws: a post-processing failure is reported, not raised", async () => {
    mocks.build.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await postProcessWorkspaceScan(db, "job")).toEqual({ ran: true, snapshotId: null, error: "boom" });
    spy.mockRestore();
  });
});
