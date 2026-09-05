import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/admin";
import { completeWorkspaceScan, reconcileWorkspaceScans } from "@/lib/workspace/completion";

export const maxDuration = 60;
const input = z.union([z.object({ jobId: z.string().uuid() }).strict(), z.object({ reconcile: z.literal(true) }).strict()]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Prepared internal integration; activation requires reviewed schema and fencing. */
export async function POST(request: Request): Promise<Response> {
  if (process.env.WORKSPACE_COMPLETION_ENABLED !== "true") return json({ error: "not_found" }, 404);
  const secret = process.env.WORKSPACE_COMPLETION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return json({ error: "unavailable" }, 503);
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return json({ error: "unauthenticated" }, 401);
  let parsed;
  try { parsed = input.safeParse(await request.json()); } catch { return json({ error: "invalid_input" }, 400); }
  if (!parsed.success) return json({ error: "invalid_input" }, 400);
  try {
    const db = supabaseServer();
    if ("jobId" in parsed.data) {
      const result = await completeWorkspaceScan(db, parsed.data.jobId.toLowerCase());
      return json(result, result.status === "retry" ? 503 : result.status === "busy" ? 202 : 200);
    }
    const results = await reconcileWorkspaceScans(db);
    return json({ results }, results.some(result => result.status === "retry") ? 503 : 200);
  } catch { return json({ error: "completion_unavailable" }, 503); }
}
