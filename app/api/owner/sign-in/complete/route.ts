import { NextResponse } from "next/server";

import { completeSignIn } from "@/lib/identity/complete-sign-in";
import { createCompletionPorts } from "@/lib/identity/complete-sign-in-ports";
import { parseAuthFlow } from "@/lib/identity/sign-in-flow";
import { authDiagnostic } from "@/lib/identity/sign-in-diagnostics";

const MAX_BODY_BYTES = 4 * 1024;
const FLOW_KEYS = new Set(["locale", "claim", "returnTo", "method"]);

function response(
  body: Record<string, string>,
  status = 200,
  headers: HeadersInit = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...headers, "Cache-Control": "no-store" },
  });
}

function methodNotAllowed(): NextResponse {
  return response({ error: "method_not_allowed" }, 405, { Allow: "POST" });
}

/**
 * Port construction happens immediately before fresh identity retrieval, so a
 * construction failure is recorded as the fixed `fresh_session` stage.
 */
function unavailable(): NextResponse {
  const correlationId = crypto.randomUUID();
  try {
    console.error(authDiagnostic("fresh_session", correlationId));
  } catch {
    // Diagnostics must not alter the fixed recovery response.
  }
  return response({ kind: "recover", reason: "unavailable" }, 503);
}

// Not exported: Next.js allows a route file to export only the HTTP method
// handlers and its known config values, and type-checks that at build time.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return (
      new URL(origin).origin === new URL(request.url).origin &&
      origin === new URL(origin).origin &&
      !["cross-site", "same-site"].includes(
        request.headers.get("sec-fetch-site") ?? "",
      )
    );
  } catch {
    return false;
  }
}

function validFlowInput(input: unknown): URLSearchParams | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (!FLOW_KEYS.has(key) || typeof value !== "string") return null;
    params.set(key, value);
  }
  const flow = parseAuthFlow(params);
  for (const key of FLOW_KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    if (key === "locale" && flow.locale !== value) return null;
    if (key === "claim" && flow.claim !== value) return null;
    if (key === "returnTo" && flow.returnTo !== value) return null;
    if (key === "method" && flow.method !== value) return null;
  }
  return params;
}
export function GET(): NextResponse {
  return methodNotAllowed();
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return response({ error: "invalid_request" }, 400);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.split(";", 1)[0]?.trim() !== "application/json")
    return response({ error: "invalid_request" }, 400);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES)
    return response({ error: "invalid_request" }, 400);

  let input: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
      return response({ error: "invalid_request" }, 400);
    input = JSON.parse(body);
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  const params = validFlowInput(input);
  if (!params) return response({ error: "invalid_request" }, 400);

  try {
    const result = await completeSignIn(
      parseAuthFlow(params),
      await createCompletionPorts(request),
    );
    if (result.kind === "redirect")
      return response({ kind: result.kind, destination: result.destination });
    if (result.kind === "no_access") return response({ kind: result.kind });
    return response(
      { kind: result.kind, reason: result.reason },
      result.reason === "invalid_session" ? 401 : 503,
    );
  } catch {
    return unavailable();
  }
}
