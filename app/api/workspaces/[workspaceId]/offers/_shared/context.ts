import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest, type Membership, type SessionUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { offersEnabled } from "@/lib/offers/flag";
import { workspaceMarket } from "@/lib/offers/view";
import type { OfferServiceDeps } from "@/lib/offers/service";
import { offerRepository } from "@/lib/repositories/offers";
import { assetRepository } from "@/lib/repositories/assets";
import { workspaceReadRepository } from "@/lib/repositories/workspace-read";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";

/**
 * Shared front half of every offer route (spec §6): the flag (404 when off),
 * id shapes, membership, the workspace's market and timezone, and for
 * mutations the action_mutation rate limit. Role and location scope are
 * decided by the service, never here.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export interface OfferRouteContext {
  user: SessionUser;
  membership: NonNullable<Membership>;
  workspace: { id: string; market: "hk" | "tw"; timezone: string };
}

export async function offerRouteContext(
  req: Request,
  ids: { workspaceId: string; offerId?: string },
  opts: { mutation: boolean },
): Promise<{ ok: true; ctx: OfferRouteContext } | { ok: false; response: Response }> {
  if (!offersEnabled()) return { ok: false, response: json({ error: "not_found" }, 404) };
  if (!UUID_RE.test(ids.workspaceId)) return { ok: false, response: json({ error: "workspaceId is invalid" }, 400) };
  if (ids.offerId !== undefined && !UUID_RE.test(ids.offerId)) return { ok: false, response: json({ error: "offerId is invalid" }, 400) };
  const auth = await authorizeWorkspaceRequest({ id: ids.workspaceId });
  if (!auth.ok) return { ok: false, response: json({ error: auth.code }, auth.status) };
  if (opts.mutation) {
    const decision = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
    if (!decision.allowed) return { ok: false, response: rateLimitedResponse(decision.retryAfterSeconds) };
  }
  const row = (await workspaceReadRepository().workspaces([ids.workspaceId]))[0];
  if (!row) return { ok: false, response: json({ error: "not_found" }, 404) };
  return {
    ok: true,
    ctx: {
      user: auth.user,
      membership: auth.membership,
      workspace: { id: row.id, market: workspaceMarket(row.market), timezone: row.timezone || "Asia/Hong_Kong" },
    },
  };
}

export function requestLocale(req: Request, body: unknown): string {
  const bodyLocale = body && typeof body === "object" ? (body as { locale?: unknown }).locale : undefined;
  const candidate = typeof bodyLocale === "string" ? bodyLocale : req.headers.get("x-sme-locale") ?? "";
  return isLocale(candidate) ? candidate : DEFAULT_LOCALE;
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function serviceDeps(req: Request, ctx: OfferRouteContext, locale: string, now = new Date()): OfferServiceDeps {
  return {
    repo: offerRepository(),
    assets: assetRepository(),
    audit: recordNeonEvent,
    membership: ctx.membership,
    workspace: ctx.workspace,
    now,
    locale,
    ipHash: ipHashFor(req),
  };
}

export function expectedRevision(body: Record<string, unknown>): number | null {
  const value = body.expected_revision;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

export function unavailable(category: string) {
  console.error("[api/workspaces/offers] failed", { category });
  return json({ error: "unavailable" }, 503);
}
