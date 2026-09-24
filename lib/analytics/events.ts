// The union itself lives in @sme-scanner/scan-engine, because the engine
// validates events (parseScanEvent) and forwards scan_completed to PostHog
// through recordTerminal, and a Cloudflare Worker bundling that package must
// not reach back into this app at runtime. The durable scan_events rows are
// written by this app (lib/analytics/scan-events.ts), not by the package.
// Re-exported here so every existing "@/lib/analytics/events" importer is
// unaffected.
export type { ScanEvent } from "@sme-scanner/scan-engine";
