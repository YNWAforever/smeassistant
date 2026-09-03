import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanEvent } from "./analytics-events";

export class AnalyticsValidationError extends Error {
  constructor(readonly category: "invalid_event" | "forbidden_property") {
    super(category);
    this.name = "AnalyticsValidationError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isMarket(value: unknown): value is "HK" | "TW" {
  return value === "HK" || value === "TW";
}

const FORBIDDEN_PROPERTY_KEY = /email|phone|whatsapp|line|contact|token|ip|name|handle/i;

function hasForbiddenProperty(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasForbiddenProperty(item, seen));
  return Object.entries(value).some(
    ([key, nested]) => FORBIDDEN_PROPERTY_KEY.test(key) || hasForbiddenProperty(nested, seen),
  );
}

export function parseScanEvent(input: unknown): ScanEvent {
  if (!isObject(input) || !hasExactKeys(input, ["name", "properties"]) || !isObject(input.properties)) {
    throw new AnalyticsValidationError("invalid_event");
  }
  if (hasForbiddenProperty(input.properties)) throw new AnalyticsValidationError("forbidden_property");

  const properties = input.properties;
  switch (input.name) {
    case "scan_started":
      if (hasExactKeys(properties, ["market", "locale"]) && isMarket(properties.market) && typeof properties.locale === "string") return input as ScanEvent;
      break;
    case "scan_completed":
      if (hasExactKeys(properties, ["outcome", "coverage"]) && ["done", "partial", "failed"].includes(String(properties.outcome)) && typeof properties.coverage === "number" && Number.isFinite(properties.coverage)) return input as ScanEvent;
      break;
    case "report_preview_viewed":
      if (hasExactKeys(properties, ["market"]) && isMarket(properties.market)) return input as ScanEvent;
      break;
    case "report_unlocked":
      if (hasExactKeys(properties, ["market", "channel", "objective"]) && isMarket(properties.market) && typeof properties.channel === "string" && typeof properties.objective === "string") return input as ScanEvent;
      break;
    case "full_report_viewed":
      if (hasExactKeys(properties, ["access"]) && (properties.access === "viewer" || properties.access === "staff")) return input as ScanEvent;
      break;
    case "cta_clicked":
      if (hasExactKeys(properties, ["cta", "market"]) && typeof properties.cta === "string" && isMarket(properties.market)) return input as ScanEvent;
      break;
  }
  throw new AnalyticsValidationError("invalid_event");
}

export interface AnalyticsEventRow {
  job_id: string | null;
  anonymous_session_id: string;
  event_name: ScanEvent["name"];
  properties: ScanEvent["properties"];
  dedupe_key: string | null;
}

export interface RecordEventContext {
  jobId?: string | null;
  anonymousSessionId: string;
  dedupeKey?: string;
  timeoutMs?: number;
}

export interface AnalyticsDependencies {
  insert: (row: AnalyticsEventRow, signal: AbortSignal) => Promise<void | { inserted: boolean }>;
  capturePostHog: (event: ScanEvent, anonymousSessionId: string, signal: AbortSignal) => Promise<void>;
  reportError: (category: "backend_unavailable" | "provider_unavailable") => void;
  findDuplicate?: (row: AnalyticsEventRow) => Promise<boolean>;
  /**
   * Optional lifetime owner for the fire-and-forget PostHog capture. On Node
   * the process outlives the response and this is unnecessary; in a
   * Cloudflare Worker an in-flight fetch is killed when the handler's work
   * resolves, so the Worker passes ctx.waitUntil here. apps/web passes
   * nothing.
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

function safeReportError(category: "backend_unavailable" | "provider_unavailable"): void {
  console.error("[analytics] event_record_failed", { category });
}

async function runAbortBounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const pending = Promise.resolve().then(() => operation(controller.signal));
  // Keep ownership of an operation that rejects after abort so it can never
  // become an unhandled rejection after the caller has failed open.
  void pending.catch(() => {});
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error("analytics_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * The production dependency set, with the Supabase client injected as a
 * factory rather than an instance. apps/web passes supabaseServer() itself
 * (not its result); the Cloudflare scan Worker passes a factory built from
 * its own secrets. This package must never construct one itself -- doing so
 * is what forced a runtime import back into apps/web before L6 Plan B.
 *
 * The factory is called lazily, inside `insert`, so a throwing client
 * construction (e.g. createClient's Node-version guard) surfaces inside
 * recordEvent's try/catch and degrades to
 * `{ recorded: false, category: "backend_unavailable" }` instead of
 * rejecting before recordEvent's body ever runs.
 */
export function createAnalyticsDependencies(getSupabase: () => SupabaseClient): AnalyticsDependencies {
  return {
    insert: async (row, signal) => {
      const table = getSupabase().from("scan_events");
      const query = row.dedupe_key
        ? table.upsert(row, {
            onConflict: "job_id,anonymous_session_id,event_name,dedupe_key",
            ignoreDuplicates: true,
          })
        : table.insert(row);
      const { data, error } = await query.select("id").abortSignal(signal).maybeSingle();
      if (error) throw new Error("analytics_insert_failed");
      return { inserted: Boolean(data) };
    },
    capturePostHog: async (event, anonymousSessionId, signal) => {
      const key = process.env.POSTHOG_KEY;
      if (!key) return;
      const host = (process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/$/, "");
      const response = await fetch(host + "/capture/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          event: event.name,
          properties: { distinct_id: anonymousSessionId, ...event.properties },
        }),
        signal,
      });
      if (!response.ok) throw new Error("posthog_capture_failed");
    },
    reportError: safeReportError,
  };
}

export async function forwardEventToPostHog(
  input: unknown,
  anonymousSessionId: string,
  dependencies: AnalyticsDependencies,
  timeoutMs = 2000,
): Promise<void> {
  const event = parseScanEvent(input);
  try {
    await runAbortBounded(
      (signal) => dependencies.capturePostHog(event, anonymousSessionId, signal),
      timeoutMs,
    );
  } catch {
    dependencies.reportError("provider_unavailable");
  }
}

export async function recordEvent(
  input: unknown,
  context: RecordEventContext,
  dependencies: AnalyticsDependencies,
): Promise<
  | { recorded: true }
  | { recorded: false; deduplicated: true }
  | { recorded: false; category: "backend_unavailable" }
> {
  const event = parseScanEvent(input);
  const row: AnalyticsEventRow = {
    job_id: context.jobId ?? null,
    anonymous_session_id: context.anonymousSessionId,
    event_name: event.name,
    properties: event.properties,
    dedupe_key: context.dedupeKey ?? null,
  };

  let inserted: void | { inserted: boolean };
  try {
    inserted = await runAbortBounded(
      (signal) => dependencies.insert(row, signal),
      context.timeoutMs ?? 250,
    );
  } catch {
    dependencies.reportError("backend_unavailable");
    return { recorded: false, category: "backend_unavailable" };
  }
  if (inserted && !inserted.inserted) return { recorded: false, deduplicated: true };

  const pending = forwardEventToPostHog(event, context.anonymousSessionId, dependencies).catch(() => {
    dependencies.reportError("provider_unavailable");
  });
  if (dependencies.waitUntil) {
    try {
      dependencies.waitUntil(pending);
    } catch {
      // ctx.waitUntil throws once the request context has closed. The capture is
      // already in flight and recordEvent must never reject on transport trouble.
      void pending;
    }
  } else {
    void pending;
  }
  return { recorded: true };
}
