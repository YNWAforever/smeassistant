/**
 * supabase-js builds a RealtimeClient eagerly inside the SupabaseClient
 * constructor, and realtime-js refuses to build one on Node < 22 without a
 * WebSocket implementation — it throws "Node.js 20 detected without native
 * WebSocket support" before a single query can run. .nvmrc pins Node 20 and CI
 * honours it via node-version-file, so every createClient in this suite failed
 * there while passing on developer machines, which run Node 22+ and have the
 * global natively. That is why this layer was green locally and red in CI.
 *
 * realtime-js reads globalThis.WebSocket ahead of its Node-version gate, so
 * defining one is enough to get past construction. It has to cover
 * lib/supabase.ts too, not just this suite's own fixtures: processScan calls
 * supabaseServer() itself, so patching the fixtures alone would move the throw
 * rather than remove it.
 *
 * The constructor throws instead of returning a dead object. This suite speaks
 * to PostgREST only and never opens a socket, so it is never called — and if a
 * test ever does depend on realtime, failing loudly beats silently connecting
 * to nothing.
 *
 * Deliberately a setupFile, not globalSetup: globalSetup runs in its own
 * context and the globals it sets never reach the test workers.
 */
class UnavailableWebSocket {
  constructor() {
    throw new Error(
      "Supabase realtime is not available in the integration harness, which talks to PostgREST only. " +
        "If a test now needs realtime, add `ws` and pass it as the transport rather than widening this shim.",
    );
  }
}

// Left alone on Node 22+, so developers keep the real implementation and this
// shim only ever stands in where CI would otherwise throw. The cast is the
// point rather than an oversight: globalThis.WebSocket is typed as the real
// constructor, and this deliberately is not one — realtime-js only ever holds
// the reference, so nothing here is required to behave like a socket.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = UnavailableWebSocket;
}

// Side effects are the whole payload here, so there is nothing to export — but
// without this tsc reads the file as a global script rather than a module, and
// websocket-shim.test.ts cannot import it.
export {};
