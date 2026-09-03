import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify, uniqueWorkspaceSlug } from "@/lib/workspace/slug";

/**
 * The database operations auth/owner/callback/route.ts performs against
 * workspace_members, workspaces, and audit_jobs, extracted into named,
 * independently-callable functions so tests can exercise the actual logic
 * instead of duplicating its SQL shape. Each function takes a Supabase client
 * as an explicit parameter so both the route (service-role client in
 * production) and tests (a real Postgres-backed client, or a mock for
 * attachJobToWorkspace) can call the same logic.
 */

/**
 * Binds a pending (user_id IS NULL) workspace_members row to the signing-in
 * user, by email. The whole concurrency story is in the WHERE clause: two
 * racing tabs produce one winner and one no-op, with no read-then-write gap.
 * A person invited to more than one workspace by the same email has more than
 * one pending row; this binds all of them in one statement.
 */
export async function bindPendingMembership(
  db: SupabaseClient,
  userId: string,
  email: string,
): Promise<string | null> {
  const { data: bound, error } = await db
    .from("workspace_members")
    .update({ user_id: userId, accepted_at: new Date().toISOString() })
    .eq("email", email)
    .is("user_id", null)
    .select("workspace_id");
  if (error) throw new Error("bind failed");
  return bound?.[0]?.workspace_id ?? null;
}

/**
 * Looks up the workspace this user owns (accepted membership with
 * role = "owner"). `.limit(1)` + reading `data?.[0]` rather than
 * `.maybeSingle()`, because unlike the dropped `workspaces.owner_user_id`
 * column, workspace_members has no uniqueness constraint on user_id — one
 * person can legitimately be a member of more than one workspace, and
 * `.maybeSingle()` would surface that as a PGRST116 "multiple rows" error
 * instead of a row.
 *
 * Shared by two callers with different error-handling postures: the
 * best-effort `ownedWorkspace` lookup in the route body (fail open, log and
 * continue — it only feeds a BD signal, not an authorization decision) and
 * `findWorkspaceForUser` inside claimScan (fail closed — claimScan's own
 * try/catch turns any thrown error into `{ kind: "unavailable" }`). Returning
 * `{ data, error }` instead of throwing lets each call site choose its own
 * posture rather than baking one in here.
 */
export async function findOwnedWorkspace(
  db: SupabaseClient,
  userId: string,
): Promise<{
  data: { workspaceId: string } | null;
  error: { message: string } | null;
}> {
  const { data, error } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .not("accepted_at", "is", null)
    .limit(1);
  return {
    data: data?.[0] ? { workspaceId: data[0].workspace_id as string } : null,
    error: error ? { message: error.message } : null,
  };
}

/**
 * Creates a new workspace and inserts its owner's workspace_members row.
 *
 * Local addition to upstream: every owner route here is addressed by
 * `workspaceSlug` (CLAUDE.md §3.1), so the slug is chosen at creation from the
 * business name with a numeric suffix on collision, and returned alongside id.
 */
export async function createWorkspaceWithOwner(
  db: SupabaseClient,
  input: {
    ownerUserId: string;
    ownerEmail: string;
    businessName: string | null;
    industry: string | null;
    district: string | null;
    market: string | null;
  },
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueWorkspaceSlug(db, slugify(input.businessName ?? "workspace"));
  const { data: created, error } = await db
    .from("workspaces")
    .insert({
      business_name: input.businessName,
      industry: input.industry,
      district: input.district,
      market: input.market === "tw" ? "tw" : "hk",
      slug,
    })
    .select("id, slug")
    .single();
  if (error || !created) throw new Error("workspace insert failed");

  const { error: memberError } = await db.from("workspace_members").insert({
    workspace_id: created.id,
    user_id: input.ownerUserId,
    email: input.ownerEmail,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });
  if (memberError) throw new Error("owner membership insert failed");

  return { id: created.id as string, slug: (created.slug as string | null) ?? slug };
}

/**
 * Attaches a job to a workspace, but only if it is not already claimed.
 * `.is("workspace_id", null)` is the whole guard: an already-claimed job
 * matches no row, so the update is a no-op rather than a theft. A `false`
 * return is therefore a lost race, not an error -- and the error itself must
 * never be swallowed, because claimScan's contract is that `false` means
 * "another claim won"; swallowing a real outage as `false` tells a genuine
 * owner their scan was taken, with no retry path.
 *
 * Extracted here (rather than left inlined in auth/owner/callback/route.ts)
 * because the OAuth-verified claim flow (X6) needs the identical logic and
 * must not duplicate it.
 */
export async function attachJobToWorkspace(
  db: SupabaseClient,
  jobId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data: updated, error } = await db
    .from("audit_jobs")
    .update({ workspace_id: workspaceId })
    .eq("id", jobId)
    .is("workspace_id", null)
    .select("id");
  if (error) throw new Error("attach failed");
  return Boolean(updated?.length);
}
