import { describe, expect, it, vi } from "vitest";
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

describe("createAnalyticsDependencies", () => {
  it("preserves explicit storage and transport ports", () => {
    const insert = vi.fn();
    const capture = vi.fn();
    expect(createAnalyticsDependencies(insert, capture)).toMatchObject({
      insert,
      capturePostHog: capture,
    });
  });
  it("forwards dedupe identity and cancellation to the supplied store", async () => {
    const insert = vi.fn(async () => ({ inserted: false }));
    const capture = vi.fn();
    expect(
      await recordEvent(
        { name: "scan_started", properties: { market: "HK", locale: "en" } },
        { jobId: "job", anonymousSessionId: "session", dedupeKey: "key" },
        createAnalyticsDependencies(insert, capture),
      ),
    ).toEqual({ recorded: false, deduplicated: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupe_key: "key" }),
      expect.any(AbortSignal),
    );
    expect(capture).not.toHaveBeenCalled();
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
