import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeWorkspaceRequest, type Membership, type SessionUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse, type RateLimitScope } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { ipHashFor } from "@/lib/workspace/audit";
import { loadActionScope, loadVersionScope, type ActionScope, type VersionScope } from "@/lib/workspace/versions";

/**
 * The shared front half of every Phase 4 mutation route (CLAUDE.md §3.9):
 * load the entity's workspace + location, require owner or manager-in-scope
 * (viewer and out-of-scope manager → 403), then spend one rate-limit token
 * per session user. Authorization always runs before the limiter so an
 * unauthenticated caller cannot burn a member's budget.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Mutation<Scope> =
  | { ok: true; db: SupabaseClient; user: SessionUser; membership: Membership; scope: Scope; ipHash: string | null }
  | { ok: false; response: Response };

export function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Locale for audit payloads: the body's `locale`, else the proxy's header, else the default. */
export function localeFrom(req: Request, body: Record<string, unknown> | null): string {
  const candidate = typeof body?.locale === "string" ? body.locale : req.headers.get("x-sme-locale") ?? "";
  return isLocale(candidate) ? candidate : DEFAULT_LOCALE;
}

async function authorizeScope<Scope extends ActionScope>(req: Request, scope: Scope | null, limit: RateLimitScope): Promise<Mutation<Scope>> {
  if (!scope) return { ok: false, response: json({ error: "not_found" }, 404) };
  const auth = await authorizeWorkspaceRequest({ id: scope.workspaceId }, { minRole: "manager", locationId: scope.locationId ?? undefined });
  if (!auth.ok) return { ok: false, response: json({ error: auth.code }, auth.status) };
  const decision = await enforceRateLimit({ req, scope: limit, identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return { ok: false, response: rateLimitedResponse(decision.retryAfterSeconds) };
  return { ok: true, db: supabaseServer(), user: auth.user, membership: auth.membership, scope, ipHash: ipHashFor(req) };
}

export async function authorizeActionMutation(req: Request, actionId: string, limit: RateLimitScope): Promise<Mutation<ActionScope>> {
  if (!UUID_RE.test(actionId)) return { ok: false, response: json({ error: "actionId is invalid" }, 400) };
  let scope: ActionScope | null;
  try {
    scope = await loadActionScope(supabaseServer(), actionId);
  } catch {
    return { ok: false, response: json({ error: "unavailable" }, 503) };
  }
  return authorizeScope(req, scope, limit);
}

export async function authorizeVersionMutation(req: Request, versionId: string, limit: RateLimitScope): Promise<Mutation<VersionScope>> {
  if (!UUID_RE.test(versionId)) return { ok: false, response: json({ error: "versionId is invalid" }, 400) };
  let scope: VersionScope | null;
  try {
    scope = await loadVersionScope(supabaseServer(), versionId);
  } catch {
    return { ok: false, response: json({ error: "unavailable" }, 503) };
  }
  return authorizeScope(req, scope, limit);
}

/** `${workspaceId}:${location}:${template}:objective:<short hash>` — one open objective action per distinct objective text. */
export function objectiveDedupeKey(workspaceId: string, locationId: string | null, templateKey: string, objective: string): string {
  const hash = createHash("sha256").update(objective.trim().toLowerCase()).digest("hex").slice(0, 8);
  return `${workspaceId}:${locationId ?? "all"}:${templateKey}:objective:${hash}`;
}

export function optionalComment(body: Record<string, unknown> | null): string | null {
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
  return comment || null;
}
