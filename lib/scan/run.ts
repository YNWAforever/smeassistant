import { waitUntil } from "@vercel/functions";
import {
  collectScanProviders,
  processScan,
  persistScanDiff,
  persistAeoSnapshots,
  type ScanProcessResult,
  type ScanProviderCollector,
} from "@sme-scanner/scan-engine";
import { persistEvidenceSnapshots } from "@/lib/evidence/persist";
import { getPool } from "@/lib/db/client";
import { createScanExecutionStore, buildTrendDiffDeps, buildAeoSnapshotDeps } from "./execution-store";
import { createFixtureCollector, isScanFixtureName, type ScanFixtureName } from "./fixtures";

export {
  dispatchToScanWorker,
  resolveScanExecutionRuntime,
  resolveScanExecutionRuntime as resolveScanRuntime,
  type ScanDispatchPath,
  type ScanExecutionRuntimeName,
} from "./dispatch-runtime";

/**
 * `SCAN_SOURCES=live|fixture` (CLAUDE.md 3.2.1). An explicit value always wins;
 * otherwise fixtures are used under vitest (`NODE_ENV=test`) and live providers
 * everywhere else. Preview deployments that lack provider keys set
 * `SCAN_SOURCES=fixture` explicitly.
 */
export type ScanSourceMode = "live" | "fixture";

export function resolveScanSourceMode(env: NodeJS.ProcessEnv = process.env): ScanSourceMode {
  const raw = env.SCAN_SOURCES?.trim().toLowerCase();
  if (raw === "fixture" && env.VERCEL_ENV === "production") {
    // A preview setting copied into production would ship fixture scans to
    // merchants. Fail towards live evidence and say so loudly.
    console.error("[scan] SCAN_SOURCES=fixture is not allowed in production; using live", { category: "scan_sources_fixture_in_production" });
    return "live";
  }
  if (raw === "live" || raw === "fixture") return raw;
  if (raw) console.warn("[scan] SCAN_SOURCES not recognised, using the default", { category: "scan_sources_unrecognised" });
  return env.NODE_ENV === "test" ? "fixture" : "live";
}

/** Optional `SCAN_FIXTURE=<name>` pins one fixture; otherwise the job picks (see resolveFixtureName). */
export function resolveScanFixtureName(env: NodeJS.ProcessEnv = process.env): ScanFixtureName | undefined {
  const raw = env.SCAN_FIXTURE?.trim();
  if (!raw) return undefined;
  if (isScanFixtureName(raw)) return raw;
  console.warn("[scan] SCAN_FIXTURE not recognised, selecting by job", { category: "scan_fixture_unrecognised" });
  return undefined;
}

export function resolveScanCollector(env: NodeJS.ProcessEnv = process.env): ScanProviderCollector {
  return resolveScanSourceMode(env) === "fixture"
    ? createFixtureCollector(resolveScanFixtureName(env))
    : collectScanProviders;
}

/** Execute with application-owned SQL and explicit media persistence. */
export async function runScan(
  jobId: string,
  anonymousSessionId: string,
): Promise<ScanProcessResult> {
  const result = await processScan(jobId, {
    // Keep terminal insertion and its later capture owned by this Vercel request.
    store: createScanExecutionStore(anonymousSessionId, { waitUntil }),
    collect: resolveScanCollector(),
    persistEvidence: persistEvidenceSnapshots,
    persistDiff: (id) => persistScanDiff(id, buildTrendDiffDeps(getPool(), id)),
    persistAeoSnapshots: (id) =>
      persistAeoSnapshots(id, buildAeoSnapshotDeps(getPool())),
  });
  // Task13 must replace this visible intermediate boundary before release.
  // Never pass a Neon job to the legacy workspace completion client.
  if (result.status !== "already_claimed") {
    console.error("[scan] workspace completion pending", {
      category: "neon_workspace_completion_pending",
      jobId,
    });
  }
  return result;
}
