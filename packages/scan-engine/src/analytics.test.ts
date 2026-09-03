import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AnalyticsValidationError,
  createAnalyticsDependencies,
  parseScanEvent,
  recordEvent,
  forwardEventToPostHog,
  type AnalyticsDependencies,
} from "./analytics";

describe("parseScanEvent", () => {
  it("accepts every allowlisted event shape", () => {
    const events = [
      { name: "scan_started", properties: { market: "HK", locale: "zh-HK" } },
      { name: "scan_completed", properties: { outcome: "partial", coverage: 0.75 } },
      { name: "report_preview_viewed", properties: { market: "TW" } },
      { name: "report_unlocked", properties: { market: "HK", channel: "whatsapp", objective: "more_leads" } },
      { name: "full_report_viewed", properties: { access: "viewer" } },
      { name: "cta_clicked", properties: { cta: "unlock_report", market: "TW" } },
    ] as const;

    expect(events.map((event) => parseScanEvent(event))).toEqual(events);
  });

  it.each(["email", "phone", "whatsapp", "line", "contact", "token", "ip", "name", "handle"])(
    "rejects the forbidden key %s recursively",
    (key) => {
      const event = {
        name: "scan_started",
        properties: {
          market: "HK",
          locale: "en",
          metadata: [{ safe: { ['customer_' + key]: "secret" } }],
        },
      };

      expect(() => parseScanEvent(event)).toThrowError(
        new AnalyticsValidationError("forbidden_property"),
      );
    },
  );

  it("rejects event names outside the allowlist", () => {
    expect(() => parseScanEvent({ name: "lead_captured", properties: {} })).toThrowError(
      new AnalyticsValidationError("invalid_event"),
    );
  });
});
describe("recordEvent", () => {
  const event = {
    name: "scan_started",
    properties: { market: "HK", locale: "en" },
  } as const;

  it("inserts the sanitized event into the authoritative backend", async () => {
    const inserted: unknown[] = [];

    const result = await recordEvent(event, {
      jobId: "11111111-1111-4111-8111-111111111111",
      anonymousSessionId: "anon-session",
    }, {
      insert: async (row) => { inserted.push(row); },
      findDuplicate: async () => false,
      capturePostHog: async () => {},
      reportError: () => {},
    });

    expect(result).toEqual({ recorded: true });
    expect(inserted).toEqual([{
      job_id: "11111111-1111-4111-8111-111111111111",
      anonymous_session_id: "anon-session",
      event_name: "scan_started",
      properties: { market: "HK", locale: "en" },
      dedupe_key: null,
    }]);
  });

  it("fails safely with only an error category when the backend is unavailable", async () => {
    const categories: string[] = [];
    let providerCalled = false;

    await expect(recordEvent(event, {
      jobId: null,
      anonymousSessionId: "anon-session",
    }, {
      insert: async () => { throw new Error("sensitive backend detail"); },
      findDuplicate: async () => false,
      capturePostHog: async () => { providerCalled = true; },
      reportError: (category) => { categories.push(category); },
    })).resolves.toEqual({ recorded: false, category: "backend_unavailable" });

    expect(categories).toEqual(["backend_unavailable"]);
    expect(providerCalled).toBe(false);
  });

  it("does not wait for the optional PostHog provider", async () => {
    const providerNeverFinishes = new Promise<void>(() => {});

    const result = await Promise.race([
      recordEvent(event, {
        jobId: "11111111-1111-4111-8111-111111111111",
        anonymousSessionId: "anon-session",
      }, {
        insert: async () => {},
        findDuplicate: async () => false,
        capturePostHog: async () => providerNeverFinishes,
        reportError: () => {},
      }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 25)),
    ]);

    expect(result).toEqual({ recorded: true });
  });
  it("deduplicates atomically before provider capture", async () => {
    let insertCalls = 0;
    let providerCalled = false;

    await expect(recordEvent(event, {
      jobId: "11111111-1111-4111-8111-111111111111",
      anonymousSessionId: "anon-session",
      dedupeKey: "scan_started:0123456789abcdef01234567",
    }, {
      insert: async () => {
        insertCalls += 1;
        return { inserted: false };
      },
      capturePostHog: async () => { providerCalled = true; },
      reportError: () => {},
    })).resolves.toEqual({ recorded: false, deduplicated: true });

    expect(insertCalls).toBe(1);
    expect(providerCalled).toBe(false);
  });
});
describe("recordEvent review regressions", () => {
  const event = { name: "report_preview_viewed", properties: { market: "HK" } } as const;

  it("aborts a never-settling authoritative insert and fails open with a safe category", async () => {
    let observedSignal: AbortSignal | undefined;
    const result = await Promise.race([
      recordEvent(event, {
        jobId: "11111111-1111-4111-8111-111111111111",
        anonymousSessionId: "11111111-1111-4111-8111-111111111111",
        dedupeKey: "report_preview_viewed:0123456789abcdef01234567",
        timeoutMs: 10,
      }, {
        insert: async (_row, signal) => {
          observedSignal = signal;
          return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ inserted: false }), { once: true }));
        },
        capturePostHog: async () => {},
        reportError: () => {},
      }),
      new Promise<"test_timeout">((resolve) => setTimeout(() => resolve("test_timeout"), 100)),
    ]);

    expect(result).toEqual({ recorded: false, category: "backend_unavailable" });
    expect(observedSignal?.aborted).toBe(true);
  });

  it("uses one atomic dedupe insert for concurrent cross-tab requests", async () => {
    const identities = new Set<string>();
    const rows: Array<{ dedupe_key: string | null }> = [];
    const dependencies = {
      insert: async (row: { dedupe_key: string | null }) => {
        rows.push(row);
        const identity = row.dedupe_key ?? "";
        if (identities.has(identity)) return { inserted: false };
        identities.add(identity);
        return { inserted: true };
      },
      capturePostHog: async () => {},
      reportError: () => {},
    };
    const context = {
      jobId: "11111111-1111-4111-8111-111111111111",
      anonymousSessionId: "11111111-1111-4111-8111-111111111111",
      dedupeKey: "report_preview_viewed:0123456789abcdef01234567",
      timeoutMs: 50,
    } as const;

    const results = await Promise.all([
      recordEvent(event, context, dependencies),
      recordEvent(event, context, dependencies),
    ]);

    expect(results).toContainEqual({ recorded: true });
    expect(results).toContainEqual({ recorded: false, deduplicated: true });
    expect(identities.size).toBe(1);
    expect(rows.every((row) => row.dedupe_key === context.dedupeKey)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("private-report-token");
  });
});

function createStubSupabaseClient(maybeSingleResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(maybeSingleResult);
  const abortSignal = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ abortSignal });
  const upsert = vi.fn().mockReturnValue({ select });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ upsert, insert });
  const client = { from } as unknown as SupabaseClient;
  return { client, from, upsert, insert };
}

describe("createAnalyticsDependencies", () => {
  const event = { name: "scan_started", properties: { market: "HK", locale: "en" } } as const;

  it("upserts on the dedupe onConflict target when the row carries a dedupe_key", async () => {
    const { client, upsert, insert } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const dependencies = createAnalyticsDependencies(() => client);

    const result = await recordEvent(event, {
      jobId: "job-1",
      anonymousSessionId: "anon-session",
      dedupeKey: "scan_started:0123456789abcdef01234567",
      timeoutMs: 50,
    }, { ...dependencies, capturePostHog: async () => {} });

    expect(result).toEqual({ recorded: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupe_key: "scan_started:0123456789abcdef01234567" }),
      { onConflict: "job_id,anonymous_session_id,event_name,dedupe_key", ignoreDuplicates: true },
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("performs a plain insert when the row carries no dedupe_key", async () => {
    const { client, upsert, insert } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const dependencies = createAnalyticsDependencies(() => client);

    const result = await recordEvent(event, {
      jobId: "job-1",
      anonymousSessionId: "anon-session",
      timeoutMs: 50,
    }, { ...dependencies, capturePostHog: async () => {} });

    expect(result).toEqual({ recorded: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: null }));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("propagates a falsy insert result (no row returned) as a deduplicated recordEvent outcome", async () => {
    const { client } = createStubSupabaseClient({ data: null, error: null });
    const dependencies = createAnalyticsDependencies(() => client);

    const result = await recordEvent(event, {
      jobId: "job-1",
      anonymousSessionId: "anon-session",
      dedupeKey: "scan_started:0123456789abcdef01234567",
      timeoutMs: 50,
    }, { ...dependencies, capturePostHog: async () => {} });

    expect(result).toEqual({ recorded: false, deduplicated: true });
  });

  it("degrades to backend_unavailable, without rejecting, when the client factory throws", async () => {
    const dependencies = createAnalyticsDependencies(() => {
      throw new Error("Node.js 20 detected without native WebSocket support");
    });
    const categories: string[] = [];

    await expect(recordEvent(event, {
      jobId: "job-1",
      anonymousSessionId: "anon-session",
    }, { ...dependencies, reportError: (category) => { categories.push(category); } })).resolves.toEqual({
      recorded: false,
      category: "backend_unavailable",
    });

    expect(categories).toEqual(["backend_unavailable"]);
  });

  it("hands the fire-and-forget PostHog capture to waitUntil when the caller supplies one", async () => {
    const { client } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const waited: Promise<unknown>[] = [];
    const dependencies: AnalyticsDependencies = {
      ...createAnalyticsDependencies(() => client),
      capturePostHog: async () => {},
      waitUntil: (promise) => { waited.push(promise); },
    };

    await recordEvent(event, { jobId: "job-1", anonymousSessionId: "anon-session" }, dependencies);

    expect(waited).toHaveLength(1);
    await expect(waited[0]).resolves.toBeUndefined();
  });

  it("still resolves with recorded: true when waitUntil itself throws", async () => {
    // Cloudflare's ctx.waitUntil throws once the request context has closed.
    // recordEvent's contract is to never reject on transport/infrastructure
    // trouble, so a throwing waitUntil must not become a rejected promise.
    const { client } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const dependencies: AnalyticsDependencies = {
      ...createAnalyticsDependencies(() => client),
      capturePostHog: async () => {},
      waitUntil: () => {
        throw new Error("request context has already closed");
      },
    };

    await expect(
      recordEvent(event, { jobId: "job-1", anonymousSessionId: "anon-session" }, dependencies),
    ).resolves.toEqual({ recorded: true });
  });
});

describe("forwardEventToPostHog", () => {
  it("forwards the parsed event and an AbortSignal to the injected capture", async () => {
    const capturePostHog = vi.fn().mockResolvedValue(undefined);
    const dependencies: AnalyticsDependencies = {
      insert: async () => ({ inserted: true }),
      capturePostHog,
      reportError: () => {},
    };

    await forwardEventToPostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "anon-session",
      dependencies,
    );

    expect(capturePostHog).toHaveBeenCalledWith(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "anon-session",
      expect.any(AbortSignal),
    );
  });
});

describe("createAnalyticsDependencies's capturePostHog implementation", () => {
  const originalKey = process.env.POSTHOG_KEY;
  const originalHost = process.env.POSTHOG_HOST;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_KEY;
    else process.env.POSTHOG_KEY = originalKey;
    if (originalHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalHost;
    vi.unstubAllGlobals();
  });

  it("posts the parsed event to a normalized PostHog host with the api key and distinct_id", async () => {
    process.env.POSTHOG_KEY = "phc_test_key";
    process.env.POSTHOG_HOST = "https://posthog.example.com/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { client } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const dependencies = createAnalyticsDependencies(() => client);

    await forwardEventToPostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "anon-session",
      dependencies,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // The trailing slash on POSTHOG_HOST must not survive into the request URL.
    expect(url).toBe("https://posthog.example.com/capture/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      api_key: "phc_test_key",
      event: "report_preview_viewed",
      properties: { distinct_id: "anon-session", market: "HK" },
    });
  });

  it("skips the request entirely when POSTHOG_KEY is unset", async () => {
    delete process.env.POSTHOG_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { client } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const dependencies = createAnalyticsDependencies(() => client);

    await forwardEventToPostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "anon-session",
      dependencies,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports provider_unavailable, via reportError, when PostHog responds with a non-ok status", async () => {
    process.env.POSTHOG_KEY = "phc_test_key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as Response));

    const { client } = createStubSupabaseClient({ data: { id: "row-1" }, error: null });
    const categories: string[] = [];
    const dependencies: AnalyticsDependencies = {
      ...createAnalyticsDependencies(() => client),
      reportError: (category) => { categories.push(category); },
    };

    await forwardEventToPostHog(
      { name: "report_preview_viewed", properties: { market: "HK" } },
      "anon-session",
      dependencies,
    );

    expect(categories).toEqual(["provider_unavailable"]);
  });
});
