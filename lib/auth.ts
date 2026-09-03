import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseServer } from "@/lib/supabase/admin";
import { authorizeWorkspace, type WorkspaceRole } from "@/lib/workspace/authorize-workspace";

/**
 * Session and workspace authorization for the owner app (CLAUDE.md §3.9).
 *
 * The impure half only: this module reads cookies and the database, then hands
 * the access decision to upstream's pure `authorizeWorkspace`, the same split
 * as upstream's owner-session.ts. Data is read with the service-role client
 * after the decision; the anon client is used for `auth.*` only.
 *
 * Staff sessions are never accepted here — the staff console is the legacy
 * app — so every workspace check requires `kind === "member"`.
 */

export type SessionUser = { id: string; email: string; verified: boolean };

export type Membership = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  email: string;
  role: WorkspaceRole;
  /** workspace_members.location_scope (uuid[]); null = all locations. */
  locationScope: string[] | null;
};

export type RouteAuth =
  | { ok: true; user: SessionUser; membership: Membership }
  | { ok: false; status: 401 | 403 | 404; code: "unauthenticated" | "forbidden" | "not_found" };

export interface MembershipOptions {
  minRole?: WorkspaceRole;
  locationId?: string;
}

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 3, manager: 2, viewer: 1 };

/** owner > manager > viewer. */
export function roleAtLeast(role: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * A manager with a non-null location_scope is in scope only for those
 * locations. Owners and viewers are never location-restricted (§3.9), a null
 * locationId means "workspace-wide", and a null scope means "all locations".
 */
export function inLocationScope(m: Membership, locationId: string | null): boolean {
  if (locationId === null) return true;
  if (m.role !== "manager") return true;
  if (m.locationScope === null) return true;
  return m.locationScope.includes(locationId);
}

/**
 * The signed-in, email-verified user, or null. Mirrors the user block of
 * upstream's loadOwnerSession: a missing Supabase Auth configuration reads as
 * "not signed in", never a 500, and an unverified email is not a session.
 */
export async function getUser(): Promise<SessionUser | null> {
  let user: SessionUser | null = null;
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    const found = data?.user;
    if (error || !found?.id || !found.email) return null;
    user = {
      id: found.id,
      email: found.email,
      verified: Boolean(found.email_confirmed_at ?? found.confirmed_at),
    };
  } catch {
    // A missing Supabase Auth configuration must read as "not signed in", not as
    // a 500 — an owner hitting an outage should see the sign-in path, not a stack.
    return null;
  }
  // Deliberately stricter than the OAuth start routes, which check only
  // user.id. The callback requires a verified email before binding a
  // workspace, so every surface that displays one must too.
  if (!user.verified) return null;
  return user;
}

export function signInPath(locale: string, returnTo: string): string {
  return `/${locale}/owner/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function requireUser(locale: string, returnTo: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(signInPath(locale, returnTo));
  return user;
}

interface MembershipRow {
  workspace_id: string;
  role: WorkspaceRole;
  location_scope: string[] | null;
  email: string | null;
}

interface WorkspaceRefRow {
  id: string;
  slug: string | null;
}

async function loadWorkspaceRef(ref: { id?: string; slug?: string }): Promise<WorkspaceRefRow | null> {
  const db = supabaseServer();
  let query = db.from("workspaces").select("id, slug");
  if (ref.id) query = query.eq("id", ref.id);
  else if (ref.slug) query = query.eq("slug", ref.slug);
  else return null;
  const { data, error } = await query.maybeSingle<WorkspaceRefRow>();
  // Throw rather than fall through to "not found": supabase-js resolves
  // `{ data: null, error }` instead of rejecting, so swallowing this would deny
  // a legitimate member on any transient PostgREST blip.
  if (error) {
    console.error("[auth] workspace lookup failed", { category: "auth_query_failed" });
    throw new Error("Unable to load workspace");
  }
  return data ?? null;
}

async function loadAcceptedMembership(userId: string, workspaceId: string): Promise<MembershipRow | null> {
  const { data, error } = await supabaseServer()
    .from("workspace_members")
    .select("workspace_id, role, location_scope, email")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .not("accepted_at", "is", null)
    .limit(1)
    .returns<MembershipRow[]>();
  if (error) {
    console.error("[auth] membership lookup failed", { category: "auth_query_failed" });
    throw new Error("Unable to load membership");
  }
  return data?.[0] ?? null;
}

type Decision =
  | { kind: "ok"; membership: Membership }
  | { kind: "none" }
  | { kind: "forbidden" };

/**
 * The shared decision behind requireMembership and authorizeWorkspaceRequest:
 * accepted row → authorizeWorkspace → member-only → role floor → location scope.
 */
async function decideMembership(
  user: SessionUser,
  workspace: WorkspaceRefRow,
  opts: MembershipOptions,
): Promise<Decision> {
  const row = await loadAcceptedMembership(user.id, workspace.id);
  const access = authorizeWorkspace({
    membership: row ? { workspaceId: row.workspace_id, role: row.role } : null,
    sessionUser: { id: user.id, email: user.email },
  });
  // Member-only on purpose. A staff allowlist hit without a membership must not
  // open a merchant's workspace — the staff console is their surface.
  if (access.kind !== "member" || !row) return { kind: "none" };

  const membership: Membership = {
    workspaceId: access.workspaceId,
    workspaceSlug: workspace.slug ?? "",
    userId: access.userId,
    email: row.email ?? user.email,
    role: access.role,
    locationScope: Array.isArray(row.location_scope) ? row.location_scope : null,
  };
  if (opts.minRole && !roleAtLeast(membership.role, opts.minRole)) return { kind: "forbidden" };
  if (opts.locationId && !inLocationScope(membership, opts.locationId)) return { kind: "forbidden" };
  return { kind: "ok", membership };
}

/**
 * Server-component guard. Fails closed with a redirect:
 *  - signed out → sign-in with returnTo
 *  - not an accepted member (or unknown slug) → select-workspace?denied=<slug>
 *  - role below minRole, or locationId outside a manager's scope → workspace home ?forbidden=1
 */
export async function requireMembership(
  workspaceSlug: string,
  locale: string,
  opts: MembershipOptions = {},
): Promise<Membership> {
  const user = await requireUser(locale, `/${locale}/owner/${workspaceSlug}`);
  const workspace = await loadWorkspaceRef({ slug: workspaceSlug });
  const decision = workspace ? await decideMembership(user, workspace, opts) : { kind: "none" as const };
  if (decision.kind === "none") {
    redirect(`/${locale}/owner/select-workspace?denied=${encodeURIComponent(workspaceSlug)}`);
  }
  if (decision.kind === "forbidden") {
    redirect(`/${locale}/owner/${workspaceSlug}?forbidden=1`);
  }
  return decision.membership;
}

/** Route-handler variant: the same decision as requireMembership, as a status instead of a redirect. */
export async function authorizeWorkspaceRequest(
  workspaceRef: { id?: string; slug?: string },
  opts: MembershipOptions = {},
): Promise<RouteAuth> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401, code: "unauthenticated" };
  const workspace = await loadWorkspaceRef(workspaceRef);
  if (!workspace) return { ok: false, status: 404, code: "not_found" };
  const decision = await decideMembership(user, workspace, opts);
  if (decision.kind !== "ok") return { ok: false, status: 403, code: "forbidden" };
  return { ok: true, user, membership: decision.membership };
}

interface MembershipListRow extends MembershipRow {
  user_id: string;
  created_at: string;
  workspaces: { slug: string | null } | Array<{ slug: string | null }> | null;
}

/** Accepted memberships joined to workspaces.slug, oldest first. */
export async function listMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await supabaseServer()
    .from("workspace_members")
    .select("workspace_id, user_id, role, location_scope, email, created_at, workspaces(slug)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .returns<MembershipListRow[]>();
  if (error) {
    console.error("[auth] membership list failed", { category: "auth_query_failed" });
    throw new Error("Unable to load memberships");
  }
  return (data ?? []).map((row) => {
    const joined = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
    return {
      workspaceId: row.workspace_id,
      workspaceSlug: joined?.slug ?? "",
      userId: row.user_id,
      email: row.email ?? "",
      role: row.role,
      locationScope: Array.isArray(row.location_scope) ? row.location_scope : null,
    };
  });
}

/** Local sign-out (cookies only). Never throws: a safe redirect is still correct when auth is down. */
export async function signOut(): Promise<void> {
  try {
    const client = await createSupabaseServerClient();
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Auth unavailable: nothing to clear server-side.
  }
}
