import {
  collectScanProviders,
  processScan,
  type ScanProcessResult,
  type ScanProviderCollector,
} from "@sme-scanner/scan-engine";
import { persistEvidenceSnapshots } from "@/lib/evidence/persist";
import { supabaseServer } from "@/lib/supabase/admin";
import { postProcessWorkspaceScan } from "@/lib/workspace/post-process";
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

/**
 * Run one queued scan inline: upstream's `processScan` (claim via
 * `claim_audit_job`, collect, score, persist, diff, AEO snapshots) with this
 * app's evidence persistence and service-role client. The only thing the
 * source mode changes is the `collect` dependency.
 */
export async function runScan(jobId: string, anonymousSessionId: string): Promise<ScanProcessResult> {
  const db = supabaseServer();
  const result = await processScan(jobId, anonymousSessionId, resolveScanCollector(), persistEvidenceSnapshots, db);
  // Workspace-linked jobs also get a snapshot and derived actions (Phase 3).
  // postProcessWorkspaceScan checks the attachment and terminal status itself
  // and never throws: the scan result the merchant sees is already final.
  if (result.status === "done" || result.status === "partial") await postProcessWorkspaceScan(db, jobId);
  return result;
}
