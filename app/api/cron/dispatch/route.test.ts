import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyDueSchedules, claimableJobIds, reconcileWorkspaceScans, getPool, waitUntilMock, fetchMock, runWebsiteVerification } = vi.hoisted(() => ({
  notifyDueSchedules: vi.fn(),
  claimableJobIds: vi.fn(),
  reconcileWorkspaceScans: vi.fn(),
  getPool: vi.fn(() => ({})),
  waitUntilMock: vi.fn(),
  fetchMock: vi.fn(),
  runWebsiteVerification: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ getPool }));
vi.mock("@/lib/scan/notify-due-schedules", () => ({ notifyDueSchedules }));
vi.mock("@/lib/repositories/scheduler", () => ({ schedulerRepository: () => ({ claimableJobIds }) }));
vi.mock("@/lib/workspace/completion", () => ({ reconcileWorkspaceScans }));
vi.mock("@vercel/functions", () => ({ waitUntil: waitUntilMock }));
vi.mock("@/lib/verify/website-sweep", () => ({ runWebsiteVerification }));
vi.mock("@/lib/repositories/verification", () => ({ verificationRepository: () => ({}) }));
vi.mock("@/lib/repositories/applications", () => ({ applicationRepository: () => ({}) }));
vi.mock("@/lib/workspace/applications", () => ({ recordApplication: vi.fn() }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: vi.fn() }));

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
  runWebsiteVerification.mockResolvedValue({ locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 });
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

  it("runs all three concerns and summarizes the result, with reconciled broken down by status", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 2, notified: 1 });
    claimableJobIds.mockResolvedValue(["job-1", "job-2"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "completed" }, { status: "completed" }, { status: "retry" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notified: { due: 2, notified: 1 },
      reclaimCandidates: 2,
      reconciled: { completed: 2, retry: 1 },
      verified: { locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 },
    });
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

  it("skips dispatching reclaim requests when APP_ORIGIN is not configured, but still reports the candidate count and logs why", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("APP_ORIGIN", "");
    claimableJobIds.mockResolvedValue(["job-1"]);

    const response = await POST(request());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(waitUntilMock).not.toHaveBeenCalled();
    expect((await response.json()).reclaimCandidates).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "[cron/dispatch] reclaim_abandoned_scans failed",
      expect.objectContaining({ message: expect.stringContaining("APP_ORIGIN not configured") }),
    );
    errorSpy.mockRestore();
  });

  it("does not log an APP_ORIGIN warning when there was nothing to reclaim anyway", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("APP_ORIGIN", "");
    claimableJobIds.mockResolvedValue([]);

    await POST(request());

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still notifies and reconciles when finding claimable jobs throws", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 1, notified: 1 });
    claimableJobIds.mockRejectedValue(new Error("boom"));
    reconcileWorkspaceScans.mockResolvedValue([{ status: "completed" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notified: { due: 1, notified: 1 },
      reclaimCandidates: 0,
      reconciled: { completed: 1 },
      verified: { locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still reconciles and reclaims when notifying due schedules throws", async () => {
    notifyDueSchedules.mockRejectedValue(new Error("boom"));
    claimableJobIds.mockResolvedValue(["job-1"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "retry" }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reclaimCandidates).toBe(1);
    expect(body.reconciled).toEqual({ retry: 1 });
  });

  it("still notifies and reclaims when reconciling throws", async () => {
    notifyDueSchedules.mockResolvedValue({ due: 1, notified: 1 });
    reconcileWorkspaceScans.mockRejectedValue(new Error("boom"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notified: { due: 1, notified: 1 }, reclaimCandidates: 0, reconciled: {}, verified: { locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 } });
  });

  it("reports what the website verifier checked", async () => {
    runWebsiteVerification.mockResolvedValue({ locationsChecked: 3, actionsConsidered: 4, actionsVerified: 1, actionsFailed: 1 });

    const response = await POST(request());

    expect((await response.json()).verified).toEqual({ locationsChecked: 3, actionsConsidered: 4, actionsVerified: 1, actionsFailed: 1 });
  });

  it("still reports the other three concerns when the verifier throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    notifyDueSchedules.mockResolvedValue({ due: 1, notified: 1 });
    claimableJobIds.mockResolvedValue(["job-1"]);
    reconcileWorkspaceScans.mockResolvedValue([{ status: "completed" }]);
    runWebsiteVerification.mockRejectedValue(new Error("boom"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notified: { due: 1, notified: 1 },
      reclaimCandidates: 1,
      reconciled: { completed: 1 },
      verified: { locationsChecked: 0, actionsConsidered: 0, actionsVerified: 0, actionsFailed: 0 },
    });
    expect(errorSpy).toHaveBeenCalledWith("[cron/dispatch] verify_website_actions failed", expect.objectContaining({ message: "boom" }));
    errorSpy.mockRestore();
  });
});
