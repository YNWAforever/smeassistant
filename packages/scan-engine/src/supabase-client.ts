import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime is never used by the scan pipeline. Supplying an explicit transport
 * keeps createClient from calling WebSocketFactory, whose Node-version gate
 * throws on the Node 20 in .nvmrc ("Node.js 20 detected without native
 * WebSocket support") and whose Cloudflare branch is a coin-flip: it returns a
 * throwing result whenever WebSocketPair exists but globalThis.WebSocket does
 * not, which is exactly the Workers runtime this package is built for.
 */
class RealtimeUnavailable {
  constructor() {
    throw new Error("scan-engine never uses Supabase realtime");
  }
}

/**
 * A service-role client built from explicit values.
 *
 * Deliberately not reading process.env: apps/web names these
 * NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, and the Cloudflare scan
 * Worker names them SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in its own secret
 * store. This package has no business knowing either contract -- it takes the
 * values and constructs the client.
 *
 * Both values are checked because supabase-js will happily construct a client
 * from an empty string and only fail later, at the first query, as an opaque
 * network or 401 error inside a scan that has already burned provider quota.
 *
 * auth.autoRefreshToken defaults to true, which -- even with persistSession:
 * false -- runs startAutoRefresh()'s setInterval(..., 30_000) for the life of
 * the client. On Node that timer is .unref()'d and invisible; a Cloudflare
 * Worker has no unref, so every call would leave a live 30-second ticker
 * touching storage outside the request that created it. A service-role key
 * has no session to refresh, so the whole subsystem is disabled explicitly
 * rather than relying on the default. detectSessionInUrl is meaningless
 * server-side and is disabled for the same reason: nothing should run that
 * this client has no use for.
 */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (!url) throw new Error("supabase_url_missing");
  if (!serviceRoleKey) throw new Error("supabase_key_missing");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: RealtimeUnavailable as never },
  });
}
