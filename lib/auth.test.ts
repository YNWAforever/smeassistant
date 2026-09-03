import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  authUser: null as null | { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null },
  authError: null as null | { message: string },
  authThrows: false,
  workspace: null as null | { id: string; slug: string | null },
  workspaceError: null as null | { message: string },
  membership: null as null | {
    workspace_id: string;
    role: WorkspaceRole;
    location_scope: string[] | null;
    email: string | null;
    accepted_at: string | null;
  },
  membershipError: null as null | { message: string },
  signOut: vi.fn(async () => ({ error: null })),
  workspaceFilters: [] as Array<[string, string]>,
  memberFilters: [] as Array<[string, string]>,
  notFilters: [] as Array<[string, string, unknown]>,
}));

class RedirectSignal extends Error {
  constructor(public readonly target: string) {
    super(`NEXT_REDIRECT ${target}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw new RedirectSignal(target);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.authThrows) throw new Error("Supabase Auth is not configured");
    return {
      auth: {
        getUser: async () => ({ data: { user: state.authUser }, error: state.authError }),
        signOut: state.signOut,
      },
    };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      if (table === "workspaces") {
        const chain = {
          select: () => chain,
          eq: (column: string, value: string) => {
            state.workspaceFilters.push([column, value]);
            return chain;
          },
          maybeSingle: async () => ({ data: state.workspace, error: state.workspaceError }),
        };
        return chain;
      }
      if (table === "workspace_members") {
        const chain = {
          select: () => chain,
          eq: (column: string, value: string) => {
            state.memberFilters.push([column, value]);
            return chain;
          },
          not: (column: string, op: string, value: unknown) => {
            state.notFilters.push([column, op, value]);
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          returns: async () => {
            const row = state.membership;
            // The real query filters accepted_at IS NOT NULL server-side; mirror it.
            const rows = row && row.accepted_at !== null ? [row] : [];
            return { data: rows, error: state.membershipError };
          },
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import {
  authorizeWorkspaceRequest,
  getUser,
  inLocationScope,
  requireMembership,
  requireUser,
  roleAtLeast,
  signOut,
  type Membership,
} from "./auth";

const VERIFIED = { id: "user-1", email: "owner@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" };
const LOCATION_A = "11111111-1111-4111-8111-111111111111";
const LOCATION_B = "22222222-2222-4222-8222-222222222222";

function accepted(role: WorkspaceRole, locationScope: string[] | null = null) {
  return {
    workspace_id: "ws-1",
    role,
    location_scope: locationScope,
    email: "owner@example.com",
    accepted_at: "2026-09-01T00:00:00Z",
  };
}

async function redirectTarget(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.target;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  state.authUser = VERIFIED;
  state.authError = null;
  state.authThrows = false;
  state.workspace = { id: "ws-1", slug: "kam-man-house" };
  state.workspaceError = null;
  state.membership = accepted("owner");
  state.membershipError = null;
  state.workspaceFilters = [];
  state.memberFilters = [];
  state.notFilters = [];
  state.signOut.mockClear();
});

describe("roleAtLeast", () => {
  it("orders owner > manager > viewer", () => {
    expect(roleAtLeast("owner", "viewer")).toBe(true);
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(roleAtLeast("owner", "owner")).toBe(true);
    expect(roleAtLeast("manager", "manager")).toBe(true);
    expect(roleAtLeast("manager", "viewer")).toBe(true);
    expect(roleAtLeast("manager", "owner")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "manager")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });
});

describe("inLocationScope", () => {
  const base: Membership = {
    workspaceId: "ws-1",
    workspaceSlug: "kam-man-house",
    userId: "user-1",
    email: "owner@example.com",
    role: "manager",
    locationScope: [LOCATION_A],
  };

  it("is true for a null locationId or a null scope", () => {
    expect(inLocationScope(base, null)).toBe(true);
    expect(inLocationScope({ ...base, locationScope: null }, LOCATION_B)).toBe(true);
  });

  it("restricts only managers", () => {
    expect(inLocationScope(base, LOCATION_A)).toBe(true);
    expect(inLocationScope(base, LOCATION_B)).toBe(false);
    expect(inLocationScope({ ...base, role: "owner" }, LOCATION_B)).toBe(true);
    expect(inLocationScope({ ...base, role: "viewer" }, LOCATION_B)).toBe(true);
  });
});

describe("getUser", () => {
  it("returns the verified user", async () => {
    await expect(getUser()).resolves.toEqual({ id: "user-1", email: "owner@example.com", verified: true });
  });

  it("treats an unverified email as signed out", async () => {
    state.authUser = { id: "user-1", email: "owner@example.com", email_confirmed_at: null, confirmed_at: null };
    await expect(getUser()).resolves.toBeNull();
  });

  it("treats a missing email, an auth error, or a misconfigured client as signed out, never throwing", async () => {
    state.authUser = { id: "user-1", email: null };
    await expect(getUser()).resolves.toBeNull();
    state.authUser = VERIFIED;
    state.authError = { message: "jwt expired" };
    await expect(getUser()).resolves.toBeNull();
    state.authError = null;
    state.authThrows = true;
    await expect(getUser()).resolves.toBeNull();
  });
});

describe("requireUser", () => {
  it("redirects to the locale sign-in with returnTo when signed out", async () => {
    state.authUser = null;
    await expect(redirectTarget(() => requireUser("en", "/en/owner/kam-man-house?tab=1"))).resolves.toBe(
      "/en/owner/sign-in?returnTo=%2Fen%2Fowner%2Fkam-man-house%3Ftab%3D1",
    );
  });
});

describe("requireMembership", () => {
  it("returns the accepted membership for an owner and queries by slug then user+workspace", async () => {
    const membership = await requireMembership("kam-man-house", "zh-HK");
    expect(membership).toEqual({
      workspaceId: "ws-1",
      workspaceSlug: "kam-man-house",
      userId: "user-1",
      email: "owner@example.com",
      role: "owner",
      locationScope: null,
    });
    expect(state.workspaceFilters).toEqual([["slug", "kam-man-house"]]);
    expect(state.memberFilters).toEqual([
      ["user_id", "user-1"],
      ["workspace_id", "ws-1"],
    ]);
    expect(state.notFilters).toEqual([["accepted_at", "is", null]]);
  });

  it("redirects a signed-out visitor to sign-in with the workspace as returnTo", async () => {
    state.authUser = null;
    await expect(redirectTarget(() => requireMembership("kam-man-house", "zh-HK"))).resolves.toBe(
      "/zh-HK/owner/sign-in?returnTo=%2Fzh-HK%2Fowner%2Fkam-man-house",
    );
  });

  it("redirects an unverified email to sign-in", async () => {
    state.authUser = { id: "user-1", email: "owner@example.com" };
    await expect(redirectTarget(() => requireMembership("kam-man-house", "zh-HK"))).resolves.toContain(
      "/zh-HK/owner/sign-in?returnTo=",
    );
  });

  it("denies a viewer when the page needs a manager", async () => {
    state.membership = accepted("viewer");
    await expect(
      redirectTarget(() => requireMembership("kam-man-house", "en", { minRole: "manager" })),
    ).resolves.toBe("/en/owner/kam-man-house?forbidden=1");
  });

  it("allows a manager inside their location scope and denies one outside it", async () => {
    state.membership = accepted("manager", [LOCATION_A]);
    await expect(
      requireMembership("kam-man-house", "en", { minRole: "manager", locationId: LOCATION_A }),
    ).resolves.toMatchObject({ role: "manager", locationScope: [LOCATION_A] });
    await expect(
      redirectTarget(() => requireMembership("kam-man-house", "en", { minRole: "manager", locationId: LOCATION_B })),
    ).resolves.toBe("/en/owner/kam-man-house?forbidden=1");
  });

  it("treats a pending or revoked row (accepted_at null) as no membership", async () => {
    state.membership = { ...accepted("owner"), accepted_at: null };
    await expect(redirectTarget(() => requireMembership("kam-man-house", "zh-TW"))).resolves.toBe(
      "/zh-TW/owner/select-workspace?denied=kam-man-house",
    );
  });

  it("never accepts a staff email without a membership", async () => {
    state.authUser = { ...VERIFIED, email: "staff@fimmick.com" };
    state.membership = null;
    await expect(redirectTarget(() => requireMembership("kam-man-house", "zh-HK"))).resolves.toBe(
      "/zh-HK/owner/select-workspace?denied=kam-man-house",
    );
  });

  it("fails closed on an unknown workspace slug", async () => {
    state.workspace = null;
    await expect(redirectTarget(() => requireMembership("nope", "zh-HK"))).resolves.toBe(
      "/zh-HK/owner/select-workspace?denied=nope",
    );
  });

  it("throws rather than denying on a database error", async () => {
    state.membershipError = { message: "db down" };
    await expect(requireMembership("kam-man-house", "zh-HK")).rejects.toThrow("Unable to load membership");
  });
});

describe("authorizeWorkspaceRequest", () => {
  it("401s a signed-out caller", async () => {
    state.authUser = null;
    await expect(authorizeWorkspaceRequest({ slug: "kam-man-house" })).resolves.toEqual({
      ok: false,
      status: 401,
      code: "unauthenticated",
    });
  });

  it("404s an unknown workspace, by id or slug", async () => {
    state.workspace = null;
    await expect(authorizeWorkspaceRequest({ id: "ws-x" })).resolves.toMatchObject({ status: 404, code: "not_found" });
    expect(state.workspaceFilters).toEqual([["id", "ws-x"]]);
    await expect(authorizeWorkspaceRequest({})).resolves.toMatchObject({ status: 404 });
  });

  it("403s a non-member, a viewer below minRole, and a manager outside scope", async () => {
    state.membership = null;
    await expect(authorizeWorkspaceRequest({ slug: "kam-man-house" })).resolves.toMatchObject({ status: 403 });
    state.membership = accepted("viewer");
    await expect(authorizeWorkspaceRequest({ slug: "kam-man-house" }, { minRole: "manager" })).resolves.toMatchObject({
      status: 403,
      code: "forbidden",
    });
    state.membership = accepted("manager", [LOCATION_A]);
    await expect(
      authorizeWorkspaceRequest({ slug: "kam-man-house" }, { minRole: "manager", locationId: LOCATION_B }),
    ).resolves.toMatchObject({ status: 403 });
  });

  it("returns the user and membership on success", async () => {
    state.membership = accepted("manager", [LOCATION_A]);
    await expect(
      authorizeWorkspaceRequest({ id: "ws-1" }, { minRole: "manager", locationId: LOCATION_A }),
    ).resolves.toEqual({
      ok: true,
      user: { id: "user-1", email: "owner@example.com", verified: true },
      membership: {
        workspaceId: "ws-1",
        workspaceSlug: "kam-man-house",
        userId: "user-1",
        email: "owner@example.com",
        role: "manager",
        locationScope: [LOCATION_A],
      },
    });
  });
});

describe("signOut", () => {
  it("signs out locally and never throws when auth is unavailable", async () => {
    await signOut();
    expect(state.signOut).toHaveBeenCalledWith({ scope: "local" });
    state.authThrows = true;
    await expect(signOut()).resolves.toBeUndefined();
  });
});
