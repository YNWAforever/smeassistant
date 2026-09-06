export type ScanExecutionRuntimeName = "vercel" | "cloudflare";
export type ScanDispatchPath = "client" | "scheduled";
/** No external receiver has reviewed Neon job-store parity yet. A URL or setting is not proof.
 * See docs/integration/NEON-RUNNER-COMPATIBILITY.md. Enable only with a reviewed caller/receiver change.
 */
export function resolveScanExecutionRuntime(
  path: ScanDispatchPath,
): ScanExecutionRuntimeName {
  void path;
  return "vercel";
}
/** Guard direct callers too: never forward Neon identities to the unchanged Supabase worker. */
export async function dispatchToScanWorker(jobId: string): Promise<boolean> {
  void jobId;
  return false;
}
