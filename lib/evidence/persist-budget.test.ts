import { describe, expect, it, vi } from "vitest";
import type { MediaDownload } from "./safe-media";
import type { EvidenceCandidate } from "./types";
import { persistEvidenceSnapshots } from "./persist";

/**
 * The download budget.
 *
 * The loop is sequential over up to 41 candidates at 8 s each — 328 s, the single
 * largest term in a scan whose own timeouts already sum to ~600 s. It runs after
 * the job row is terminal, so overrunning does not fail the scan; it burns
 * function time until the platform kills the request at an arbitrary point,
 * truncating the evidence set unpredictably.
 *
 * These tests pin the properties that would be silent if wrong: that skipped
 * candidates still get a row, that they carry a code the report can render, and
 * that a healthy scan is untouched.
 */

function candidateAt(index: number): EvidenceCandidate {
  return {
    provider: "instagram",
    evidenceType: "post",
    sourceId: `post-${index}`,
    sourceUrl: `https://www.instagram.com/p/code-${index}/`,
    mediaUrl: `https://images.example/post-${index}.jpg`,
    capturedAt: "2026-07-29T00:00:00.000Z",
    publishedAt: "2026-07-28T00:00:00.000Z",
    text: `Post ${index}`,
    metadata: { likes: index },
    retention: "snapshot_permitted",
  };
}

/** A clock that advances a fixed amount on every read. */
function steppingClock(stepMs: number) {
  let current = 0;
  return () => {
    const value = current;
    current += stepMs;
    return value;
  };
}

function createDeps(now?: () => number) {
  return {
    download: vi.fn(async (): Promise<MediaDownload> => ({
      ok: true as const,
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg" as const,
      sha256: "a".repeat(64),
      byteSize: 3,
      width: 1,
      height: 1,
    })),
    storage: {
      upload: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
      remove: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
      list: vi.fn(async (): Promise<{ data: unknown[]; error: unknown }> => ({ data: [], error: null })),
    },
    rows: {
      // Parameters are declared so mock.calls is typed and the row assertions
      // below do not need a cast through unknown.
      upsert: vi.fn(async (_row: Record<string, unknown>, _options: { onConflict: string }) => undefined),
      listPaths: vi.fn(async () => [] as Array<{ storage_path: string | null }>),
      delete: vi.fn(async () => undefined),
    },
    now,
  };
}

describe("evidence download budget", () => {
  it("downloads every candidate on a healthy scan", async () => {
    // A frozen clock never reaches the deadline, which is the sub-second case.
    const deps = createDeps(() => 0);
    await persistEvidenceSnapshots("job-1", [candidateAt(1), candidateAt(2), candidateAt(3)], deps);
    expect(deps.download).toHaveBeenCalledTimes(3);
    expect(deps.rows.upsert).toHaveBeenCalledTimes(3);
  });

  it("stops downloading once the budget is spent", async () => {
    // 20 s per read blows the 45 s budget partway through.
    const deps = createDeps(steppingClock(20_000));
    const candidates = [1, 2, 3, 4, 5, 6].map(candidateAt);
    await persistEvidenceSnapshots("job-1", candidates, deps);
    expect(deps.download.mock.calls.length).toBeLessThan(candidates.length);
    expect(deps.download.mock.calls.length).toBeGreaterThan(0);
  });

  it("still writes a row for every skipped candidate", async () => {
    // Skipping the row instead would drop the item from the report gallery with
    // no explanation at all — worse than a neutral unavailable tile.
    const deps = createDeps(steppingClock(20_000));
    const candidates = [1, 2, 3, 4, 5, 6].map(candidateAt);
    await persistEvidenceSnapshots("job-1", candidates, deps);
    expect(deps.rows.upsert).toHaveBeenCalledTimes(candidates.length);
  });

  it("marks a skipped candidate with a code the report already renders", async () => {
    // EVIDENCE_MEDIA_FETCH_FAILED maps to the neutral "unavailable" category. An
    // invented code falls through to "unknown" AND is printed verbatim to the
    // merchant in a monospace line; a null code renders as "unknown" too.
    const deps = createDeps(steppingClock(60_000));
    await persistEvidenceSnapshots("job-1", [candidateAt(1)], deps);
    const row = deps.rows.upsert.mock.calls[0]![0];
    expect(row.collection_status).toBe("metadata_only");
    expect(row.limitation_code).toBe("EVIDENCE_MEDIA_FETCH_FAILED");
    expect(row.storage_path).toBeNull();
  });

  it("never uploads for a skipped candidate", async () => {
    const deps = createDeps(steppingClock(60_000));
    await persistEvidenceSnapshots("job-1", [candidateAt(1)], deps);
    expect(deps.storage.upload).not.toHaveBeenCalled();
  });

  it("does not spend budget on candidates that were never eligible", async () => {
    // metadata_only candidates take no network path at all, so they must not
    // consume the budget that protects the ones that do.
    const deps = createDeps(() => 0);
    const metadataOnly: EvidenceCandidate = { ...candidateAt(1), retention: "metadata_only" };
    await persistEvidenceSnapshots("job-1", [metadataOnly], deps);
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.rows.upsert).toHaveBeenCalledTimes(1);
  });
});
