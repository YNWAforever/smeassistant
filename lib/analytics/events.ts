// The union itself now lives in @sme-scanner/scan-engine, because the scan
// pipeline records scan_completed from inside the package and a Cloudflare
// Worker bundling that package must not reach back into apps/web at runtime.
// Re-exported here so every existing "@/lib/analytics/events" importer is
// unaffected.
export type { ScanEvent } from "@sme-scanner/scan-engine";
