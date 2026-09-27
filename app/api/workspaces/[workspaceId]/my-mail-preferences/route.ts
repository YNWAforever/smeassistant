import { NextResponse } from "next/server";

import { authorizeWorkspaceRequest } from "@/lib/auth";
import { getPool } from "@/lib/db/client";
import { isLocale } from "@/lib/locale";
import { mailOutboxRepository } from "@/lib/repositories/mail-outbox";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/security/rate-limit";

const WORKSPACE_ID_RE = /^[0-9a-f-]{36}$/i;
const KNOWN_KEYS = new Set(["rescanComplete", "regressionAlert", "locale"]);

/**
 * PATCH /api/workspaces/[workspaceId]/my-mail-preferences
 * { rescanComplete?: boolean; regressionAlert?: boolean; locale: "en"|"zh-HK"|"zh-TW" } → { ok: true }
 *
 * Any accepted member (any role) sets their own two mail switches -- the
 * counterpart to the owner-only workspace "allow" gate at
 * ../notification-preferences/route.ts. Always writes for the caller's own
 * `auth.user.id`, never a body-supplied one, so a member can never toggle
 * another member's mail. `locale` is required on every call and always
 * written (docs/superpowers/specs/2026-09-27-mail-outbox-design.md §6: saving
 * also stores the current page locale as `mail_locale`), even when neither
 * switch changed.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is invalid" }, { status: 400 });
  }

  const auth = await authorizeWorkspaceRequest({ id: workspaceId });
  if (!auth.ok) return NextResponse.json({ error: auth.code }, { status: auth.status });

  const decision = await enforceRateLimit({ req, scope: "action_mutation", identifiers: [auth.user.id], failClosed: true });
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!KNOWN_KEYS.has(key)) return NextResponse.json({ error: `Unknown field: ${key}` }, { status: 400 });
  }

  if (!isLocale(body.locale)) {
    return NextResponse.json({ error: "locale must be en, zh-HK or zh-TW" }, { status: 400 });
  }
  if (body.rescanComplete !== undefined && typeof body.rescanComplete !== "boolean") {
    return NextResponse.json({ error: "rescanComplete must be a boolean" }, { status: 400 });
  }
  if (body.regressionAlert !== undefined && typeof body.regressionAlert !== "boolean") {
    return NextResponse.json({ error: "regressionAlert must be a boolean" }, { status: 400 });
  }

  try {
    await mailOutboxRepository(getPool()).setMemberSwitches(workspaceId, auth.user.id, {
      rescanComplete: body.rescanComplete as boolean | undefined,
      regressionAlert: body.regressionAlert as boolean | undefined,
      locale: body.locale,
    });
  } catch {
    console.error("[api/workspaces/my-mail-preferences] save failed", { category: "my_mail_preferences_save_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
