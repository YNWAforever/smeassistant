import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();
vi.mock("../db/client", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("../db/transaction", () => ({ withTransaction: vi.fn() }));
vi.mock("./claims", () => ({ claimsRepository: { createWorkspaceWithOwner: vi.fn(), attachJob: vi.fn() } }));

import { accessRequestRepository } from "./access-requests";

beforeEach(() => vi.resetAllMocks());

const ROW = {
  id: "req-1",
  job_id: "job-1",
  user_id: "u-1",
  requested_at: "2026-09-10T02:00:00Z",
  resolved_at: null,
  resolved_by_staff_user_id: null,
  requester_email: "owner@example.test",
  business_name: "Kam Man House",
  industry: null,
  district: null,
  region: "hk",
  place_id: null,
  share_slug: "abc123",
  job_workspace_id: null,
};

describe("listPending", () => {
  it("reads only unresolved requests, newest first", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await accessRequestRepository().listPending(25);
    const [sql, params] = poolQuery.mock.calls[0];
    // The partial index is ON (requested_at DESC) WHERE resolved_at IS NULL;
    // both halves must appear or it is not the index being used.
    expect(sql).toContain("r.resolved_at IS NULL");
    expect(sql).toContain("ORDER BY r.requested_at DESC");
    expect(params).toEqual([25]);
  });

  it("returns the job evidence an operator needs to verify independently", async () => {
    poolQuery.mockResolvedValue({ rows: [ROW], rowCount: 1 });
    const [row] = await accessRequestRepository().listPending(25);
    expect(row.business_name).toBe("Kam Man House");
    // place_id null is the manual-entry case this whole path exists for.
    expect(row.place_id).toBeNull();
    expect(row.job_workspace_id).toBeNull();
  });
});

describe("get", () => {
  it("returns null for an unknown request", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await accessRequestRepository().get("req-missing")).toBeNull();
  });

  it("carries the decision events alongside the row", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [ROW], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ event: "access_request.submitted", payload: { intent: "I run this shop" }, actor_id: "u-1", created_at: "2026-09-10T02:00:00Z" }],
        rowCount: 1,
      });
    const result = await accessRequestRepository().get("req-1");
    expect(result?.request.id).toBe("req-1");
    expect(result?.events[0].event).toBe("access_request.submitted");
    const [eventsSql] = poolQuery.mock.calls[1];
    expect(eventsSql).toContain("entity_type='workspace_access_request'");
  });
});

describe("openRequestFor", () => {
  it("finds the one open request the unique partial index allows", async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: "req-1" }], rowCount: 1 });
    expect(await accessRequestRepository().openRequestFor("job-1", "u-1")).toEqual({ id: "req-1" });
    const [sql] = poolQuery.mock.calls[0];
    expect(sql).toContain("resolved_at IS NULL");
  });

  it("returns null when there is none", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await accessRequestRepository().openRequestFor("job-1", "u-1")).toBeNull();
  });
});

describe("latestForUser", () => {
  it("scopes to the caller, so another person's request is never visible", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await accessRequestRepository().latestForUser("u-1");
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("r.user_id = $1");
    expect(params).toEqual(["u-1"]);
  });
});
