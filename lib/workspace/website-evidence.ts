import type { Pool } from "pg";
import { runWebsiteChecks, type WebsiteChecks } from "@/lib/website/checks";
import { websiteUrlOf } from "@/lib/workspace/snapshots";

/**
 * Collect the fifteen website checks (CLAUDE.md §3.6.2) for a finished job,
 * outside any transaction, so the completion path can hand them to
 * `buildSnapshot` instead of recording the website as unmeasured forever.
 *
 * This is its own step because of two constraints that pull in opposite
 * directions:
 *
 *  - `buildSnapshot` inside `completionTransaction` holds row locks, so it must
 *    not make a network call; that is why the completion path is `persistedOnly`.
 *  - Recovery is contractually collector-free: the completion integration test
 *    mocks the website module to throw and asserts it is never called, so the
 *    recovery path must keep skipping the fetch entirely.
 *
 * Collecting here, before the completion claim, satisfies both: the live scan
 * path records real website evidence on every scan, while a job finished by the
 * retained scheduler still records "not evaluated" rather than a guess.
 *
 * Best-effort by contract. Every refusal returns `null`, which the snapshot
 * records as `WEBSITE_CHECKS_NOT_RECORDED` -- we did not look. That is a
 * different claim from `evaluated: 0`, which `runWebsiteChecks` returns when it
 * did look and could not read the site, and which the snapshot records as
 * `WEBSITE_UNREACHABLE`. Neither ever moves a score (guardrail 2).
 */
export interface WebsiteEvidenceJobRow {
  workspace_id: string | null;
  status: string;
  website_url: string | null;
  input_snapshot: unknown;
  raw_data: unknown;
}

const MEASURED_TERMINAL = new Set(["done", "partial"]);

export async function collectWebsiteChecksForJob(
  db: Pick<Pool, "query">,
  jobId: string,
  run: (url: string) => Promise<WebsiteChecks> = runWebsiteChecks,
): Promise<WebsiteChecks | null> {
  try {
    const job = (
      await db.query<WebsiteEvidenceJobRow>(
        "SELECT workspace_id,status,website_url,input_snapshot,raw_data FROM audit_jobs WHERE id=$1",
        [jobId],
      )
    ).rows[0];
    // A public scan never grows workspace rows (guardrail 15) and must not cost
    // an outbound request either; a failed scan gets no snapshot to carry them.
    if (!job?.workspace_id || !MEASURED_TERMINAL.has(job.status)) return null;
    const url = websiteUrlOf(job);
    if (!url) return null;
    return await run(url);
  } catch {
    console.error("[workspace/website-evidence] website checks could not be collected", {
      category: "website_checks_uncollected",
      jobId,
    });
    return null;
  }
}
