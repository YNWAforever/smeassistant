import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The database trigger validates these private headers on every write transaction. */
export function completionClient(jobId: string, token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("completion_database_unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-workspace-completion-job": jobId, "x-workspace-completion-token": token } },
  });
}
