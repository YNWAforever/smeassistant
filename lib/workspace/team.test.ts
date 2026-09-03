import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceContext } from "@/lib/workspace/queries";
import { getTeam, loadLocationIds, rowToTeamMember } from "./team";

type Row = Record<string, unknown>;

function client(rows: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    const terminal = () => ({ data: rows[table] ?? [], error: null });
    Object.assign(chain, {
      select: self,
      eq: self,
      order: self,
      returns: () => Promise.resolve(terminal()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(terminal()).then(resolve, reject),
    });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const ctx: WorkspaceContext = {
  workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House", market: "hk", tier: "paid", timezone: "Asia/Hong_Kong", isDemo: false, instagramHandle: null, industry: null, district: null },
  locations: [{ id: "loc-1", slug: "yik-yam", name: "Yik Yam Street", address: null, district: null, isPrimary: true, placeId: "place-1" }],
  usage: { period: "2026-09", approvedDeliveries: 0, allowance: null },
  unreadNotifications: 0,
  membership: { workspaceId: "ws-1", workspaceSlug: "kam-man-house", userId: "u1", email: "o@example.test", role: "owner", locationScope: null },
  account: { name: "o", email: "o@example.test" },
};

const rows = {
  workspace_members: [
    { id: "m-2", email: "m@example.test", role: "manager", user_id: "u2", accepted_at: "2026-09-02T00:00:00Z", invited_at: "2026-09-01T00:00:00Z", location_scope: ["loc-1"], created_at: "2026-09-01T00:00:00Z" },
    { id: "m-1", email: "o@example.test", role: "owner", user_id: "u1", accepted_at: "2026-08-01T00:00:00Z", invited_at: null, location_scope: null, created_at: "2026-08-01T00:00:00Z" },
    { id: "m-3", email: "v@example.test", role: "viewer", user_id: null, accepted_at: null, invited_at: "2026-09-03T00:00:00Z", location_scope: null, created_at: "2026-09-03T00:00:00Z" },
  ],
  locations: [{ id: "loc-1" }, { id: "loc-2" }],
};

describe("getTeam", () => {
  it("lists every member row (pending invites included), owner first, with the workspace's locations", async () => {
    const team = await getTeam(ctx, client(rows));
    expect(team.members.map((m) => m.id)).toEqual(["m-1", "m-2", "m-3"]);
    expect(team.members[1]).toEqual({ id: "m-2", email: "m@example.test", role: "manager", userId: "u2", acceptedAt: "2026-09-02T00:00:00Z", invitedAt: "2026-09-01T00:00:00Z", locationScope: ["loc-1"] });
    expect(team.members[2]).toMatchObject({ userId: null, acceptedAt: null, locationScope: null });
    expect(team.locations).toBe(ctx.locations);
  });

  it("normalises a malformed location_scope to null", () => {
    expect(rowToTeamMember({ id: "m", email: "e", role: "viewer", user_id: null, accepted_at: null, invited_at: null, location_scope: "loc-1" as unknown as string[], created_at: "" }).locationScope).toBeNull();
  });
});

describe("loadLocationIds", () => {
  it("returns the workspace's location ids as a set", async () => {
    expect(await loadLocationIds(client(rows), "ws-1")).toEqual(new Set(["loc-1", "loc-2"]));
  });
});
