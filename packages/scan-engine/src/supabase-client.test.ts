import { describe, expect, it, vi } from "vitest";
import { createServiceClient } from "./supabase-client";

describe("createServiceClient", () => {
  it("uses the arguments, not process.env", () => {
    vi.stubEnv("SUPABASE_URL", "https://wrong.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://also-wrong.supabase.co");
    const client = createServiceClient("https://example.supabase.co", "service-role-key");
    const internals = client as unknown as { supabaseUrl: string; rest: { url: string } };
    expect(internals.supabaseUrl).toBe("https://example.supabase.co");
    expect(internals.rest.url).toBe("https://example.supabase.co/rest/v1");
    vi.unstubAllEnvs();
  });

  it("refuses an empty url or key rather than building a client that 401s at first use", () => {
    expect(() => createServiceClient("", "service-role-key")).toThrow("supabase_url_missing");
    expect(() => createServiceClient("https://example.supabase.co", "")).toThrow("supabase_key_missing");
  });
});
