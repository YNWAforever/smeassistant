import { describe, expect, it } from "vitest";

import type { Membership } from "@/lib/auth";

import { ACTION_ID, LOCATION_ID, WORKSPACE_ID, actionRow } from "./__fixtures__";
import { AssistantAccessError } from "./errors";
import { loadSignalRows, loadSuggestions, type SignalRepository } from "./suggestions";

const L2 = "99999999-9999-4999-8999-999999999999";
const OTHER_WS = "88888888-8888-4888-8888-888888888888";
const VERSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER_ACTION = "44444444-4444-4444-8444-444444444444";
const FOREIGN_LOCATION = "77777777-7777-4777-8777-777777777777";

const owner: Membership = { workspaceId: WORKSPACE_ID, workspaceSlug: "ws", userId: "u1", email: "o@example.com", role: "owner", locationScope: null };

const loc = (id: string, isPrimary: boolean) => ({
  id,
  slug: id === LOCATION_ID ? "yik-yam" : "tin-hau",
  name: id === LOCATION_ID ? "Yik Yam" : "Tin Hau",
  address: null,
  district: null,
  is_primary: isPrimary,
});

interface Calls {
  actions: Array<{ workspaceId: string; opts: unknown }>;
  waiting: Array<[string, string | null]>;
  google: string[];
  locations: string[];
}

type Db = Parameters<typeof loadSuggestions>[0]["db"];

function fake(overrides: Record<string, unknown> = {}) {
  const calls: Calls = { actions: [], waiting: [], google: [], locations: [] };
  const db = {
    assistantLocations: async (workspaceId: string) => {
      calls.locations.push(workspaceId);
      return [loc(L2, false), loc(LOCATION_ID, true)];
    },
    assistantActions: async (workspaceId: string, opts: unknown) => {
      calls.actions.push({ workspaceId, opts });
      return [{ ...actionRow, action_state: "needs_input" as const, required_inputs: ["opening_hours"], provided_inputs: {} }];
    },
    assistantWaitingVersions: async (workspaceId: string, locationId: string | null) => {
      calls.waiting.push([workspaceId, locationId]);
      return [
        { id: VERSION_ID, action_id: ACTION_ID, version_no: 3, approval_state: "changes_requested" as const, created_at: "2026-09-01T00:00:00Z", location_id: LOCATION_ID },
      ];
    },
    assistantGoogleConnection: async (workspaceId: string) => {
      calls.google.push(workspaceId);
      return { status: "expired" as const };
    },
    actionScope: async (id: string) => {
      if (id === ACTION_ID) return { actionId: id, workspaceId: WORKSPACE_ID, locationId: LOCATION_ID };
      if (id === OTHER_ACTION) return { actionId: id, workspaceId: OTHER_WS, locationId: null };
      return null;
    },
    versionScope: async (id: string) =>
      id === VERSION_ID ? { versionId: id, actionId: ACTION_ID, workspaceId: WORKSPACE_ID, locationId: LOCATION_ID } : null,
    ...overrides,
  };
  return { db: db as unknown as Db, calls };
}

describe("loadSignalRows", () => {
  it("maps rows to camel-cased WaitingVersion and builds overviews with the open states", async () => {
    const { db, calls } = fake();
    const rows = await loadSignalRows(db as unknown as SignalRepository, WORKSPACE_ID, LOCATION_ID);
    expect(rows.waitingVersions).toEqual([
      { id: VERSION_ID, actionId: ACTION_ID, versionNo: 3, approvalState: "changes_requested", createdAt: "2026-09-01T00:00:00Z", locationId: LOCATION_ID },
    ]);
    expect(rows.google).toBe("expired");
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({ id: ACTION_ID, actionState: "needs_input", missingInputs: ["opening_hours"], location: { id: LOCATION_ID, slug: "yik-yam" } });
    expect(calls.actions[0]).toEqual({ workspaceId: WORKSPACE_ID, opts: { locationId: LOCATION_ID, states: ["recommended", "needs_input", "ready", "in_progress"] } });
    expect(calls.waiting).toEqual([[WORKSPACE_ID, LOCATION_ID]]);
  });

  it("reports google as null when there is no connection row", async () => {
    const { db } = fake({ assistantGoogleConnection: async () => null });
    expect((await loadSignalRows(db as unknown as SignalRepository, WORKSPACE_ID, null)).google).toBeNull();
  });
});

/** A refused request must stop before the three signal reads. */
const expectNoSignalReads = (calls: Calls) => {
  expect(calls.actions).toEqual([]);
  expect(calls.waiting).toEqual([]);
  expect(calls.google).toEqual([]);
};

describe("loadSuggestions", () => {
  it("resolves the primary location when none is given", async () => {
    const { db, calls } = fake();
    const out = await loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID } });
    expect(calls.waiting).toEqual([[WORKSPACE_ID, LOCATION_ID]]);
    expect(out.map((s) => s.kind)).toEqual(["missing_inputs", "review_version", "google"]);
  });

  it("falls back to the first location, then null", async () => {
    const first = fake({ assistantLocations: async () => [loc(L2, false)] });
    await loadSuggestions({ db: first.db, membership: owner, context: { workspaceId: WORKSPACE_ID } });
    expect(first.calls.waiting).toEqual([[WORKSPACE_ID, L2]]);
    const none = fake({ assistantLocations: async () => [] });
    await loadSuggestions({ db: none.db, membership: owner, context: { workspaceId: WORKSPACE_ID } });
    expect(none.calls.waiting).toEqual([[WORKSPACE_ID, null]]);
  });

  it("throws not_found for a location outside the workspace", async () => {
    const { db, calls } = fake();
    const run = () => loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID, locationId: FOREIGN_LOCATION } });
    await expect(run()).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(run()).rejects.toBeInstanceOf(AssistantAccessError);
    expectNoSignalReads(calls);
  });

  it("throws not_found for an action of another workspace or an unknown one", async () => {
    const { db, calls } = fake();
    await expect(loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID, actionId: OTHER_ACTION } })).rejects.toMatchObject({ code: "not_found" });
    await expect(
      loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID, actionId: "00000000-0000-4000-8000-000000000000" } }),
    ).rejects.toMatchObject({ code: "not_found" });
    expectNoSignalReads(calls);
  });

  it("throws not_found for a version of another workspace", async () => {
    const { db, calls } = fake({
      versionScope: async (id: string) => ({ versionId: id, actionId: ACTION_ID, workspaceId: OTHER_WS, locationId: null }),
    });
    await expect(loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID, versionId: VERSION_ID } })).rejects.toMatchObject({ code: "not_found" });
    expectNoSignalReads(calls);
  });

  it("throws not_found for a version of another action", async () => {
    const own = fake({ actionScope: async (id: string) => ({ actionId: id, workspaceId: WORKSPACE_ID, locationId: null }) });
    await expect(
      loadSuggestions({ db: own.db, membership: owner, context: { workspaceId: WORKSPACE_ID, actionId: OTHER_ACTION, versionId: VERSION_ID } }),
    ).rejects.toMatchObject({ code: "not_found" });
    expectNoSignalReads(own.calls);
  });

  it("throws forbidden before any read when the membership belongs to another workspace", async () => {
    const { db, calls } = fake();
    const foreign: Membership = { ...owner, workspaceId: OTHER_WS };
    const run = () => loadSuggestions({ db, membership: foreign, context: { workspaceId: WORKSPACE_ID } });
    await expect(run()).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(run()).rejects.toBeInstanceOf(AssistantAccessError);
    expect(calls.locations).toEqual([]);
    expectNoSignalReads(calls);
  });

  it("passes a validated focus through to the suggestions", async () => {
    const { db } = fake();
    const out = await loadSuggestions({ db, membership: owner, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID, versionId: VERSION_ID } });
    expect(out.find((s) => s.kind === "review_version")?.context.versionId).toBe(VERSION_ID);
  });
});
