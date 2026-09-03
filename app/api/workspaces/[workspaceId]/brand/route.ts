import { NextResponse } from "next/server";
import { authorizeWorkspaceRequest } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";
import { supabaseServer } from "@/lib/supabase/admin";
import { ipHashFor } from "@/lib/workspace/audit";
import { getBrand, parseBrandBody, putBrand } from "@/lib/workspace/brand";

/**
 * GET  /api/workspaces/[workspaceId]/brand → { brand }            any accepted member
 * PUT  /api/workspaces/[workspaceId]/brand { voice, approved_claims, prohibited_terms, languages, facts } → { brand }
 *      owner only (CLAUDE.md §3.9 brand settings); audit `brand.updated` (§3.11).
 */
const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }
  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });
  try {
    const brand = await getBrand(supabaseServer(), workspaceId);
    return NextResponse.json({ brand });
  } catch {
    console.error("[api/workspaces/brand] lookup failed", { category: "brand_lookup_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId }, { minRole: "owner" });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const decision = await enforceRateLimit({ req, scope: "brand_update", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBrandBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const bodyLocale = raw && typeof raw === "object" ? (raw as { locale?: unknown }).locale : undefined;
  const candidate = typeof bodyLocale === "string" ? bodyLocale : req.headers.get("x-sme-locale") ?? "";
  const locale = isLocale(candidate) ? candidate : DEFAULT_LOCALE;

  try {
    const brand = await putBrand(supabaseServer(), { workspaceId, actorId: auth.user.id, brand: parsed.brand, locale, ipHash: ipHashFor(req) });
    return NextResponse.json({ brand });
  } catch {
    console.error("[api/workspaces/brand] save failed", { category: "brand_save_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
