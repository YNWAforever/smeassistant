import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createScanExecution } from "./execution";
import type { ScanProviderCollector } from "./processor";

/**
 * Deliberately does not mock ./processor or ./analytics (unlike execution.test.ts).
 * processor.ts fire-and-forgets recordTerminal -- `void deps.recordTerminal(...)`,
 * with no await between that call and the processor returning -- so the only way
 * to prove the Worker's ctx.waitUntil actually keeps the scan_events insert alive
 * is to run the real processor and the real recordEvent together and watch when
 * waitUntil is invoked relative to that insert settling.
 */
describe("createScanExecution -- recordTerminal's analytics lifetime (real processor + real analytics)", () => {
  it("registers the whole scan_events insert with waitUntil before it settles, on a failed scan with no post-processing to provide cover", async () => {
    // createAnalyticsDependencies is real here (see the file-level comment
    // above), so its capturePostHog reads process.env.POSTHOG_KEY directly.
    // Stubbing it empty keeps this test from making a real network call to
    // PostHog if POSTHOG_KEY ever happens to be set in the dev shell it runs in.
    vi.stubEnv("POSTHOG_KEY", "");

    let resolveInsert: (() => void) | undefined;
    const insertGate = new Promise<void>((resolve) => {
      resolveInsert = resolve;
    });

    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "job-1",
          business_name: "Demo Coffee",
          ig_handle: null,
          website_url: null,
          industry: "Cafe",
          district: "Central",
          region: "hk",
        },
      ],
      error: null,
    });

    const from = vi.fn((table: string) => {
      if (table === "audit_jobs") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      if (table === "audit_findings") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table === "scan_events") {
        return {
          insert: () => ({
            select: () => ({
              abortSignal: () => ({
                maybeSingle: async () => {
                  await insertGate;
                  return { data: { id: "evt-1" }, error: null };
                },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const fakeSupabase = { rpc, from } as unknown as SupabaseClient;
    const collect = vi.fn().mockResolvedValue({
      ig: { status: "unavailable", limitationCode: "IG_NOT_MEASURED" },
      gbp: { status: "unavailable", limitationCode: "GBP_NOT_MEASURED" },
      aeo: { status: "unavailable", limitationCode: "AEO_NOT_MEASURED" },
    }) as unknown as ScanProviderCollector;
    const waitUntil = vi.fn();

    const run = createScanExecution({
      supabase: fakeSupabase,
      anonymousSessionId: "session-1",
      collect,
      persistEvidence: vi.fn(),
      waitUntil,
    });

    const result = await run("job-1");
    expect(result).toEqual({ status: "failed", failurePersistence: "persisted" });

    // run("job-1") resolving proves nothing about the analytics insert's own
    // state -- processor.ts never awaits recordTerminal. What must be true
    // regardless is that waitUntil was already given the whole recordEvent
    // promise, including the still-in-flight insert, by the time we get here.
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const registered = waitUntil.mock.calls[0]![0] as Promise<unknown>;

    let settled = false;
    void registered.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false); // the scan_events insert is still in flight

    resolveInsert?.();
    await registered;
    expect(settled).toBe(true);
  });
});
