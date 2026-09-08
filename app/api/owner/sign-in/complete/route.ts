import { NextResponse } from "next/server";

import { completeSignIn } from "@/lib/identity/complete-sign-in";
import { createCompletionPorts } from "@/lib/identity/complete-sign-in-ports";
import { parseAuthFlow } from "@/lib/identity/sign-in-flow";

const MAX_BODY_BYTES = 4 * 1024;
const FLOW_KEYS = new Set(["locale", "claim", "returnTo", "method"]);

function response(body: Record<string, string>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin
      && origin === new URL(origin).origin
      && !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "");
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

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return response({ error: "invalid_request" }, 400);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.split(";", 1)[0]?.trim() !== "application/json") return response({ error: "invalid_request" }, 400);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return response({ error: "invalid_request" }, 400);

  let input: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return response({ error: "invalid_request" }, 400);
    input = JSON.parse(body);
  } catch {
    return response({ error: "invalid_request" }, 400);
  }
  const params = validFlowInput(input);
  if (!params) return response({ error: "invalid_request" }, 400);

  try {
    const result = await completeSignIn(parseAuthFlow(params), await createCompletionPorts(request));
    if (result.kind === "redirect") return response({ kind: result.kind, destination: result.destination });
    if (result.kind === "no_access") return response({ kind: result.kind });
    return response({ kind: result.kind, reason: result.reason }, result.reason === "invalid_session" ? 401 : 503);
  } catch {
    return response({ kind: "recover", reason: "unavailable" }, 503);
  }
}
