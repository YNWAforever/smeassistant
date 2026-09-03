import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/workspace/entitlement", () => ({
  deliveryAllowanceForTier: (tier: string) => (tier === "paid" ? null : 3),
}));
vi.mock("@/lib/workspace/slug", () => ({
  slugify: (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace",
  uniqueWorkspaceSlug: vi.fn(async (_db: unknown, base: string) => `${base}-2`),
  uniqueLocationSlug: vi.fn(async (_db: unknown, _workspaceId: string, base: string) => base),
}));

import { claimPeriod, completeWorkspaceClaim, isValidTimezone } from "./claim";

/**
 * A minimal query-builder fake: every call is recorded as
 * `{ table, op, payload, filters }` and answered by the test's `respond`
 * function, so a test can both script reads and assert exactly which writes
 * happened (or that none did).
 */
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, string, unknown]>;
}

type Responder = (call: Call) => { data?: unknown; error?: unknown } | undefined;

function fakeDb(respond: Responder) {
  const calls: Call[] = [];
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    const resolve = () => {
      calls.push(call);
      const answer = respond(call) ?? {};
      return { data: answer.data ?? null, error: answer.error ?? null };
    };
    const api = {
      select: () => api,
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return api;
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return api;
      },
      upsert: (payload: unknown, options?: unknown) => {
        call.op = "upsert";
        call.payload = payload;
        call.options = options;
        return api;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push(["eq", column, value]);
        return api;
      },
      not: (column: string, operator: string, value: unknown) => {
        call.filters.push(["not", column, `${operator} ${value}`]);
        return api;
      },
      is: (column: string, value: unknown) => {
        call.filters.push(["is", column, value]);
        return api;
      },
      like: (column: string, value: unknown) => {
        call.filters.push(["like", column, value]);
        return api;
      },
      limit: () => api,
      maybeSingle: async () => resolve(),
      single: async () => resolve(),
      then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return api;
  }
  return { calls, db: { from: builder } as unknown as SupabaseClient };
}

const JOB = {
  id: "job-1",
  workspace_id: "ws-1",
  business_name: "Kam Man House",
  district: "Tin Hau",
  place_id: "ChIJ_kmh",
  ig_handle: null,
  website_url: null,
  input_snapshot: {
    version: 2,
    address: "12 Electric Road",
    instagramHandle: "@kammanhouse.hk",
    websiteUrl: "https://kammanhouse.example.invalid",
  },
  module_results: {},
  region: "hk",
  status: "done",
};

const WORKSPACE = { id: "ws-1", slug: null, tier: "lite", timezone: "Asia/Hong_Kong" };

const INPUT = {
  claimSlug: "abc123",
  workspaceName: "Kam Man House",
  primaryLocation: { name: "Tin Hau", address: null },
  market: "hk" as const,
  userId: "user-1",
  locale: "zh-HK",
};

function writes(calls: Call[]): Call[] {
  return calls.filter((call) => call.op !== "select");
}

/** Scripted reads for the happy path; `state` lets a second call see the first call's rows. */
function happyResponder(state: {
  location: { id: string } | null;
  workspaceSlug: string | null;
  events: number;
  role?: string;
  job?: Record<string, unknown> | null;
}): Responder {
  return (call) => {
    if (call.table === "audit_jobs" && call.op === "select") return { data: state.job === undefined ? JOB : state.job };
    if (call.table === "workspace_members") return { data: state.role === undefined ? { role: "owner" } : state.role ? { role: state.role } : null };
    if (call.table === "workspaces" && call.op === "select") return { data: { ...WORKSPACE, slug: state.workspaceSlug } };
    if (call.table === "workspaces" && call.op === "update") {
      const slug = (call.payload as { slug?: string }).slug;
      if (slug) state.workspaceSlug = slug;
      return {};
    }
    if (call.table === "locations" && call.op === "select") return { data: state.location };
    if (call.table === "locations" && call.op === "insert") {
      state.location = { id: "loc-1" };
      return { data: { id: "loc-1" } };
    }
    if (call.table === "audit_events" && call.op === "select") return { data: state.events ? [{ id: 1 }] : [] };
    if (call.table === "audit_events" && call.op === "insert") {
      state.events += 1;
      return {};
    }
    return {};
  };
}

describe("completeWorkspaceClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_attached without any write when the job carries no workspace_id (guardrail 15)", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "audit_jobs" ? { data: { ...JOB, workspace_id: null } } : {}));

    const result = await completeWorkspaceClaim(db, INPUT);

    expect(result).toEqual({ kind: "not_attached" });
    expect(writes(calls)).toEqual([]);
    // It never even looks at memberships: there is no workspace to be a member of.
    expect(calls.map((call) => call.table)).toEqual(["audit_jobs"]);
  });

  it("returns not_found without any write for an unknown slug", async () => {
    const { db, calls } = fakeDb(() => ({ data: null }));

    expect(await completeWorkspaceClaim(db, INPUT)).toEqual({ kind: "not_found" });
    expect(writes(calls)).toEqual([]);
  });

  it("returns forbidden without any write when the caller is only a viewer on the attached workspace", async () => {
    const { db, calls } = fakeDb(happyResponder({ location: null, workspaceSlug: null, events: 0, role: "viewer" }));

    expect(await completeWorkspaceClaim(db, INPUT)).toEqual({ kind: "forbidden" });
    expect(writes(calls)).toEqual([]);
    const membershipLookup = calls.find((call) => call.table === "workspace_members")!;
    expect(membershipLookup.filters).toEqual(
      expect.arrayContaining([
        ["eq", "workspace_id", "ws-1"],
        ["eq", "user_id", "user-1"],
        ["not", "accepted_at", "is null"],
      ]),
    );
  });

  it("returns forbidden for a manager and for a stranger", async () => {
    const manager = fakeDb(happyResponder({ location: null, workspaceSlug: null, events: 0, role: "manager" }));
    expect(await completeWorkspaceClaim(manager.db, INPUT)).toEqual({ kind: "forbidden" });
    expect(writes(manager.calls)).toEqual([]);

    const stranger = fakeDb(happyResponder({ location: null, workspaceSlug: null, events: 0, role: "" }));
    expect(await completeWorkspaceClaim(stranger.db, INPUT)).toEqual({ kind: "forbidden" });
    expect(writes(stranger.calls)).toEqual([]);
  });

  it("completes an owner's claim: workspace, primary location from the job, brand profile, usage row, job link and audit event", async () => {
    const state = { location: null, workspaceSlug: null, events: 0 };
    const { db, calls } = fakeDb(happyResponder(state));
    const buildSnapshot = vi.fn(async () => {});
    const deriveActions = vi.fn(async () => {});

    const result = await completeWorkspaceClaim(db, INPUT, {
      buildSnapshot,
      deriveActions,
      now: () => new Date("2026-09-03T18:30:00Z"),
    });

    expect(result).toEqual({ kind: "completed", workspaceId: "ws-1", workspaceSlug: "kam-man-house-2", locationId: "loc-1" });

    const workspaceUpdate = calls.find((call) => call.table === "workspaces" && call.op === "update")!;
    expect(workspaceUpdate.payload).toEqual({
      business_name: "Kam Man House",
      timezone: "Asia/Hong_Kong",
      market: "hk",
      slug: "kam-man-house-2",
    });

    const locationInsert = calls.find((call) => call.table === "locations" && call.op === "insert")!;
    expect(locationInsert.payload).toEqual({
      workspace_id: "ws-1",
      slug: "tin-hau",
      is_primary: true,
      name: "Tin Hau",
      address: "12 Electric Road",
      district: "Tin Hau",
      place_id: "ChIJ_kmh",
      ig_handle: "kammanhouse.hk",
      website_url: "https://kammanhouse.example.invalid",
    });

    const jobUpdate = calls.find((call) => call.table === "audit_jobs" && call.op === "update")!;
    expect(jobUpdate.payload).toEqual({ location_id: "loc-1" });
    expect(jobUpdate.filters).toEqual([["eq", "id", "job-1"]]);

    const brand = calls.find((call) => call.table === "brand_profiles")!;
    expect(brand.op).toBe("upsert");
    expect(brand.payload).toEqual({ workspace_id: "ws-1" });
    expect(brand.options).toEqual({ onConflict: "workspace_id", ignoreDuplicates: true });

    const usage = calls.find((call) => call.table === "workspace_usage")!;
    expect(usage.op).toBe("upsert");
    // 18:30 UTC on the 3rd is already the 4th in Hong Kong, still 2026-09.
    expect(usage.payload).toEqual({ workspace_id: "ws-1", period: "2026-09", allowance: 3 });
    expect(usage.options).toEqual({ onConflict: "workspace_id,period", ignoreDuplicates: true });

    expect(buildSnapshot).toHaveBeenCalledWith("job-1", "ws-1", "loc-1");
    expect(deriveActions).toHaveBeenCalledWith("job-1", "ws-1", "loc-1");

    const event = calls.find((call) => call.table === "audit_events" && call.op === "insert")!;
    expect(event.payload).toEqual({
      workspace_id: "ws-1",
      location_id: "loc-1",
      actor_type: "user",
      actor_id: "user-1",
      event: "workspace.claimed",
      entity_type: "audit_job",
      entity_id: "job-1",
      payload: { locale: "zh-HK" },
    });
  });

  it("is idempotent: a second call updates the same location, mints no new slug and adds no second audit event", async () => {
    const state = { location: null as { id: string } | null, workspaceSlug: null as string | null, events: 0 };
    const first = fakeDb(happyResponder(state));
    const firstResult = await completeWorkspaceClaim(first.db, INPUT);

    const second = fakeDb(happyResponder(state));
    const secondResult = await completeWorkspaceClaim(second.db, { ...INPUT, primaryLocation: { name: "Tin Hau", address: "New address" } });

    expect(secondResult).toEqual(firstResult);

    const workspaceUpdate = second.calls.find((call) => call.table === "workspaces" && call.op === "update")!;
    expect(workspaceUpdate.payload).not.toHaveProperty("slug");

    expect(second.calls.filter((call) => call.table === "locations" && call.op === "insert")).toEqual([]);
    const locationUpdate = second.calls.find((call) => call.table === "locations" && call.op === "update")!;
    expect(locationUpdate.filters).toEqual([["eq", "id", "loc-1"]]);
    expect(locationUpdate.payload).toEqual(expect.objectContaining({ name: "Tin Hau", address: "New address" }));

    expect(second.calls.filter((call) => call.table === "audit_events" && call.op === "insert")).toEqual([]);
    expect(state.events).toBe(1);
  });

  it("prefers the audit_jobs columns over the snapshot and reads legacy snapshot spellings", async () => {
    const job = {
      ...JOB,
      ig_handle: "columnhandle",
      website_url: "https://column.example",
      district: null,
      input_snapshot: { ig: { handle: "@nested" }, website_url: "https://snake.example", district: "Wan Chai" },
    };
    const { db, calls } = fakeDb(happyResponder({ location: null, workspaceSlug: "kam-man-house", events: 1, job }));

    await completeWorkspaceClaim(db, INPUT);

    const locationInsert = calls.find((call) => call.table === "locations" && call.op === "insert")!;
    expect(locationInsert.payload).toEqual(
      expect.objectContaining({ ig_handle: "columnhandle", website_url: "https://column.example", district: "Wan Chai" }),
    );

    const nested = fakeDb(happyResponder({ location: null, workspaceSlug: "kam-man-house", events: 1, job: { ...job, ig_handle: null } }));
    await completeWorkspaceClaim(nested.db, INPUT);
    expect(nested.calls.find((call) => call.table === "locations" && call.op === "insert")!.payload).toEqual(
      expect.objectContaining({ ig_handle: "nested" }),
    );
  });

  it("uses a paid workspace's unlimited allowance and a valid requested timezone", async () => {
    const { db, calls } = fakeDb((call) => {
      if (call.table === "workspaces" && call.op === "select") return { data: { ...WORKSPACE, slug: "kmh", tier: "paid" } };
      return happyResponder({ location: null, workspaceSlug: "kmh", events: 1 })(call);
    });

    await completeWorkspaceClaim(db, { ...INPUT, timezone: "Asia/Taipei" }, { now: () => new Date("2026-08-31T20:00:00Z") });

    const usage = calls.find((call) => call.table === "workspace_usage")!;
    // 20:00 UTC on 31 Aug is 04:00 on 1 Sep in Taipei.
    expect(usage.payload).toEqual({ workspace_id: "ws-1", period: "2026-09", allowance: null });
    const workspaceUpdate = calls.find((call) => call.table === "workspaces" && call.op === "update")!;
    expect(workspaceUpdate.payload).toEqual(expect.objectContaining({ timezone: "Asia/Taipei" }));
  });

  it("falls back to the workspace timezone when the requested one is invalid", async () => {
    const { db, calls } = fakeDb(happyResponder({ location: null, workspaceSlug: "kmh", events: 1 }));

    await completeWorkspaceClaim(db, { ...INPUT, timezone: "Mars/Olympus" });

    const workspaceUpdate = calls.find((call) => call.table === "workspaces" && call.op === "update")!;
    expect(workspaceUpdate.payload).toEqual(expect.objectContaining({ timezone: "Asia/Hong_Kong" }));
  });

  it("throws (for the route to map to 503) when a read fails, and writes nothing", async () => {
    const { db, calls } = fakeDb((call) => (call.table === "audit_jobs" ? { error: { message: "connection refused" } } : {}));

    await expect(completeWorkspaceClaim(db, INPUT)).rejects.toThrow("job lookup failed");
    expect(writes(calls)).toEqual([]);
  });
});

describe("claimPeriod / isValidTimezone", () => {
  it("formats the period in the given zone", () => {
    expect(claimPeriod("Asia/Hong_Kong", new Date("2026-01-31T17:00:00Z"))).toBe("2026-02");
    expect(claimPeriod("UTC", new Date("2026-01-31T17:00:00Z"))).toBe("2026-01");
  });

  it("accepts IANA zones and rejects garbage", () => {
    expect(isValidTimezone("Asia/Taipei")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });
});
