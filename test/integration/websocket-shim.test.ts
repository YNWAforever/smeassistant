import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type WithWebSocket = { WebSocket?: unknown };

describe("integration websocket shim", () => {
  let native: unknown;

  beforeEach(() => {
    native = (globalThis as unknown as WithWebSocket).WebSocket;
    // The shim only acts at import time, so each case needs a fresh evaluation.
    vi.resetModules();
  });

  afterEach(() => {
    (globalThis as unknown as WithWebSocket).WebSocket = native;
  });

  it("defines a WebSocket global when the runtime has none, which is what Node 20 needs", async () => {
    delete (globalThis as unknown as WithWebSocket).WebSocket;

    await import("./websocket-shim");

    // supabase-js only needs the reference to exist; without it, constructing
    // any client throws before a single PostgREST query can run.
    expect(typeof (globalThis as unknown as WithWebSocket).WebSocket).toBe("function");
  });

  it("throws on construction so a realtime dependency fails loudly rather than connecting to nothing", async () => {
    delete (globalThis as unknown as WithWebSocket).WebSocket;

    await import("./websocket-shim");
    const Stub = (globalThis as unknown as { WebSocket: new (url: string) => unknown }).WebSocket;

    expect(() => new Stub("ws://localhost")).toThrow(/realtime is not available/i);
  });

  it("leaves a native implementation alone, so Node 22+ keeps the real one", async () => {
    class Native {}
    (globalThis as unknown as WithWebSocket).WebSocket = Native;

    await import("./websocket-shim");

    expect((globalThis as unknown as WithWebSocket).WebSocket).toBe(Native);
  });
});
