import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachJobToWorkspace, createWorkspaceWithOwner } from "./callback-queries";

describe("createWorkspaceWithOwner", () => {
  // Local addition: the workspace slug is chosen here from the business name
  // (kebab-case, "-<n>" on collision) and returned with the id.
  function harness(existingSlugs: string[]) {
    const workspaceInsert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: "ws-new", slug: "kam-man-house-2" }, error: null }) }),
    }));
    const memberInsert = vi.fn(async () => ({ error: null }));
    const like = vi.fn(async () => ({ data: existingSlugs.map((slug) => ({ slug })), error: null }));
    const from = vi.fn((table: string) => {
      if (table === "workspaces") return { select: () => ({ like }), insert: workspaceInsert };
      if (table === "workspace_members") return { insert: memberInsert };
      throw new Error(`unexpected table ${table}`);
    });
    return { db: { from } as unknown as SupabaseClient, workspaceInsert, memberInsert, like };
  }

  const input = {
    ownerUserId: "user-1",
    ownerEmail: "owner@example.com",
    businessName: "Kam Man House",
    industry: "Cafe",
    district: "Tin Hau",
    market: "hk",
  };

  it("inserts the workspace with a unique slug and returns { id, slug }", async () => {
    const h = harness(["kam-man-house"]);

    await expect(createWorkspaceWithOwner(h.db, input)).resolves.toEqual({ id: "ws-new", slug: "kam-man-house-2" });
    expect(h.like).toHaveBeenCalledWith("slug", "kam-man-house%");
    expect(h.workspaceInsert).toHaveBeenCalledWith({
      business_name: "Kam Man House",
      industry: "Cafe",
      district: "Tin Hau",
      market: "hk",
      slug: "kam-man-house-2",
    });
    expect(h.memberInsert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "ws-new", user_id: "user-1", email: "owner@example.com", role: "owner" }),
    );
  });

  it("falls back to 'workspace' when the scan carried no business name", async () => {
    const h = harness([]);
    await createWorkspaceWithOwner(h.db, { ...input, businessName: null });
    expect(h.workspaceInsert).toHaveBeenCalledWith(expect.objectContaining({ slug: "workspace" }));
  });
});

describe("attachJobToWorkspace", () => {
  it("attaches the job when it is unclaimed", async () => {
    const eq2 = vi.fn(() => ({ select: async () => ({ data: [{ id: "job-1" }], error: null }) }));
    const eq1 = vi.fn(() => ({ is: () => eq2() }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const db = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;

    await expect(attachJobToWorkspace(db, "job-1", "ws-1")).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ workspace_id: "ws-1" });
  });

  it("reports a lost race as false rather than an error", async () => {
    const eq2 = vi.fn(() => ({ select: async () => ({ data: [], error: null }) }));
    const eq1 = vi.fn(() => ({ is: () => eq2() }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const db = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;

    await expect(attachJobToWorkspace(db, "job-1", "ws-1")).resolves.toBe(false);
  });

  it("throws rather than swallowing a database error", async () => {
    // claimScan's contract is that false means "another claim won" -- an
    // outage must not be reported the same way, or the genuine owner is told
    // their scan was taken with no retry path.
    const eq2 = vi.fn(() => ({ select: async () => ({ data: null, error: { message: "db down" } }) }));
    const eq1 = vi.fn(() => ({ is: () => eq2() }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const db = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient;

    await expect(attachJobToWorkspace(db, "job-1", "ws-1")).rejects.toThrow("attach failed");
  });

  it("scopes the write to the right job, table, and unclaimed-only guard", async () => {
    // None of the tests above inspect what .eq()/.is()/.from() were actually
    // called with -- their stub chains return a fixed shape no matter what
    // arguments they receive. A regression that pointed the guard at the
    // wrong column or table, or aimed .eq() at the wrong id (a one-sided
    // jobId/workspaceId swap, not a full swap of both -- the test above
    // already asserts the update body), would still satisfy every assertion
    // above. This test exists to catch exactly that class of bug, since it
    // would otherwise hand out (or block) a claim on the wrong job with every
    // other test in this file still green.
    const from = vi.fn(() => ({ update }));
    const update = vi.fn(() => ({ eq }));
    const eq = vi.fn(() => ({ is }));
    const is = vi.fn(() => ({ select: async () => ({ data: [{ id: "job-1" }], error: null }) }));
    const db = { from } as unknown as SupabaseClient;

    await attachJobToWorkspace(db, "job-1", "ws-1");

    expect(from).toHaveBeenCalledWith("audit_jobs");
    expect(eq).toHaveBeenCalledWith("id", "job-1");
    expect(is).toHaveBeenCalledWith("workspace_id", null);
  });
});
