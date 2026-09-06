import { redirect } from "next/navigation";
import { membershipRepository } from "@/lib/repositories/membership";
import { authorizeWorkspace, type WorkspaceRole } from "@/lib/workspace/authorize-workspace";

/**
 * Session and workspace authorization for the owner app (CLAUDE.md §3.9).
 *
 * The impure half only: this module reads cookies and the database, then hands
 * the access decision to upstream's pure `authorizeWorkspace`, the same split
 * as upstream's owner-session.ts. Business data is read from Neon
 * after the decision; managed identity is resolved independently.
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

/** Verified server identity mapped to an app UUID. Outages remain errors, absence is null. */
export async function getUser(): Promise<SessionUser | null> {
  const { neonIdentityProvider } = await import("@/lib/identity/neon");
  const identity = await neonIdentityProvider.getIdentity();
  if (!identity) return null;
  const { resolveApplicationUser } = await import("@/lib/identity/users");
  return resolveApplicationUser(identity);
}

export function signInPath(locale: string, returnTo: string): string {
  return `/${locale}/owner/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function requireUser(locale: string, returnTo: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(signInPath(locale, returnTo));
  return user;
}

interface WorkspaceRefRow { id: string; slug: string | null }
const loadWorkspaceRef = membershipRepository.workspace;
const loadAcceptedMembership = membershipRepository.accepted;

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

/** Accepted memberships joined to workspaces.slug, oldest first. */
export async function listMemberships(userId: string): Promise<Membership[]> {
 return (await membershipRepository.listAccepted(userId)).map(row => ({
  workspaceId: row.workspace_id, workspaceSlug: row.workspace_slug ?? "",
  userId: row.user_id, email: row.email ?? "", role: row.role,
  locationScope: Array.isArray(row.location_scope) ? row.location_scope : null,
 }));
}

/** Revoke managed identity; always invalidate local cookies, report remote failure. */
export async function signOut(): Promise<void> {
  let failed = false;
  try {
    const { neonIdentityProvider } = await import("@/lib/identity/neon");
    await neonIdentityProvider.signOut();
  } catch { failed = true; }
  try {
    const { cookies } = await import("next/headers");
    const { MANAGED_AUTH_COOKIES, expiredAuthCookie } = await import("@/lib/identity/cookies");
    const jar = await cookies();
    for (const name of MANAGED_AUTH_COOKIES) jar.set(name, "", expiredAuthCookie);
  } catch { failed = true; }
  if (failed) throw new Error("identity_signout_failed");
}
