import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyDueSchedules, claimableJobIds, reconcileWorkspaceScans, getPool, waitUntilMock, fetchMock } = vi.hoisted(() => ({
  notifyDueSchedules: vi.fn(),
  claimableJobIds: vi.fn(),
  reconcileWorkspaceScans: vi.fn(),
  getPool: vi.fn(() => ({})),
  waitUntilMock: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ getPool }));
vi.mock("@/lib/scan/notify-due-schedules", () => ({ notifyDueSchedules }));
vi.mock("@/lib/repositories/scheduler", () => ({ schedulerRepository: () => ({ claimableJobIds }) }));
vi.mock("@/lib/workspace/completion", () => ({ reconcileWorkspaceScans }));
vi.mock("@vercel/functions", () => ({ waitUntil: waitUntilMock }));

import { POST } from "./route";

const SECRET = "a".repeat(32);

function request(token = SECRET) {
  return new Request("http://localhost/api/cron/dispatch", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
  notifyDueSchedules.mockResolvedValue({ due: 0, notified: 0 });
  claimableJobIds.mockResolvedValue([]);
  reconcileWorkspaceScans.mockResolvedValue([]);
});

describe("POST /api/cron/dispatch", () => {
  it("rejects an unauthenticated request before touching anything", async () => {
    const response = await POST(request(""));
    expect(response.status).toBe(401);
    expect(notifyDueSchedules).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret", async () => {
    const response = await POST(request("b".repeat(32)));
    expect(response.status).toBe(401);
  });

  it("runs all three concerns and summarizes the result", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 2, notified: 1 });
    claimableJobIds.mockResolvedValue(["job-1", "job-2"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "completed" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: { due: 2, notified: 1 }, reclaimed: 2, reconciled: 1 });
  });

  it("fires an unawaited, kept-alive scan/process call per claimable job", async () => {
    claimableJobIds.mockResolvedValue(["job-1", "job-2"]);

    await POST(request());

    expect(waitUntilMock).toHaveBeenCalledTimes(2);
    // waitUntil is called with the fetch promise; resolve it to exercise the real fetch call.
    await Promise.all(waitUntilMock.mock.calls.map(([promise]) => promise));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.test/api/scan/process",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobId: "job-1" }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example.test/api/scan/process",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ jobId: "job-2" }) }),
    );
  });

  it("skips dispatching reclaim requests when APP_ORIGIN is not configured, but still reports the count", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    claimableJobIds.mockResolvedValue(["job-1"]);

    const response = await POST(request());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntilMock).not.toHaveBeenCalled();
    expect((await response.json()).reclaimed).toBe(1);
  });

  it("still reconciles and reclaims when notifying due schedules throws", async () => {
    notifyDueSchedules.mockRejectedValue(new Error("boom"));
    claimableJobIds.mockResolvedValue(["job-1"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "retry" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reclaimed).toBe(1);
    expect(body.reconciled).toBe(1);
  });

  it("still notifies and reclaims when reconciling throws", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 1, notified: 1 });
    reconcileWorkspaceScans.mockRejectedValue(new Error("boom"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: { due: 1, notified: 1 }, reclaimed: 0, reconciled: 0 });
  });
});
