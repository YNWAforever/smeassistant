import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaDownload } from "./safe-media";
import type { EvidenceCandidate } from "./types";
import { deleteEvidenceForReport, persistEvidenceSnapshots } from "./persist";

const candidate: EvidenceCandidate = {
  provider: "instagram",
  evidenceType: "post",
  sourceId: "post-1",
  sourceUrl: "https://www.instagram.com/p/code/",
  mediaUrl: "https://images.example/post.jpg",
  capturedAt: "2026-07-21T00:00:00.000Z",
  publishedAt: "2026-07-20T00:00:00.000Z",
  text: "Post",
  metadata: { likes: 5 },
  retention: "snapshot_permitted",
};

function createDeps() {
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
      upsert: vi.fn(async () => undefined),
      listPaths: vi.fn(async () => [] as Array<{ storage_path: string | null }>),
      delete: vi.fn(async () => undefined),
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("persistEvidenceSnapshots", () => {
  it("uploads a digest-addressed private object and upserts server-only metadata", async () => {
    const deps = createDeps();

    await persistEvidenceSnapshots("job-1", [candidate], deps);

    expect(deps.storage.upload).toHaveBeenCalledWith(
      `job-1/instagram/post/${"a".repeat(64)}.jpg`,
      expect.any(Uint8Array),
      { contentType: "image/jpeg", upsert: true, cacheControl: "0" },
    );
    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        job_id: "job-1",
        storage_bucket: "report-evidence",
        storage_path: `job-1/instagram/post/${"a".repeat(64)}.jpg`,
        collection_status: "stored",
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("stores metadata only when snapshot retention is not permitted", async () => {
    const deps = createDeps();

    await persistEvidenceSnapshots("job-1", [{
      ...candidate,
      mediaUrl: "https://images.example/secret.jpg",
      retention: "metadata_only",
    }], deps);

    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.storage.upload).not.toHaveBeenCalled();
    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_bucket: null,
        storage_path: null,
        collection_status: "metadata_only",
        limitation_code: "snapshot_not_permitted",
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("records why an allowed snapshot has no media URL", async () => {
    const deps = createDeps();

    await persistEvidenceSnapshots("job-1", [{
      ...candidate,
      mediaUrl: null,
    }], deps);

    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.storage.upload).not.toHaveBeenCalled();
    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_status: "metadata_only",
        limitation_code: "EVIDENCE_MEDIA_URL_MISSING",
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("records a sanitized metadata-only limitation when media download fails", async () => {
    const deps = createDeps();
    deps.download.mockResolvedValueOnce({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });

    await persistEvidenceSnapshots("job-1", [candidate], deps);

    expect(deps.storage.upload).not.toHaveBeenCalled();
    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_status: "metadata_only",
        limitation_code: "EVIDENCE_MEDIA_FETCH_FAILED",
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("keeps the stable limitation code and records the rejection detail in metadata", async () => {
    const deps = createDeps();
    deps.download.mockResolvedValueOnce({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_threw",
    });

    await persistEvidenceSnapshots("job-1", [candidate], deps);

    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_status: "metadata_only",
        // The report UI maps this code to merchant-facing copy, so the detail
        // must ride along in metadata instead of narrowing the code.
        limitation_code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
        metadata: { likes: 5, mediaRejectionDetail: "decode_threw" },
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("never lets provider metadata forge the recorded rejection detail", async () => {
    const deps = createDeps();
    deps.download.mockResolvedValueOnce({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });

    await persistEvidenceSnapshots("job-1", [{
      ...candidate,
      metadata: { likes: 5, mediaRejectionDetail: "sniff_failed" },
    }], deps);

    expect(deps.rows.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { likes: 5, mediaRejectionDetail: "container_boundary" },
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("leaves candidate metadata untouched when no rejection detail exists", async () => {
    const deps = createDeps();
    deps.download
      .mockResolvedValueOnce({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" });

    // First candidate fails without a detail, second one is stored.
    await persistEvidenceSnapshots("job-1", [candidate], deps);
    await persistEvidenceSnapshots("job-2", [candidate], deps);

    expect(deps.rows.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        limitation_code: "EVIDENCE_MEDIA_FETCH_FAILED",
        metadata: { likes: 5 },
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
    expect(deps.rows.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        collection_status: "stored",
        metadata: { likes: 5 },
      }),
      { onConflict: "job_id,provider,evidence_type,source_id" },
    );
  });

  it("removes an uploaded object when its metadata row cannot be persisted", async () => {
    const deps = createDeps();
    deps.rows.upsert.mockRejectedValueOnce(new Error("provider database detail"));

    await expect(persistEvidenceSnapshots("job-1", [candidate], deps))
      .rejects.toThrow("evidence_row_upsert_failed");
    expect(deps.storage.remove).toHaveBeenCalledWith([
      `job-1/instagram/post/${"a".repeat(64)}.jpg`,
    ]);
  });

  it("does not delete a digest object already referenced by another evidence row", async () => {
    const deps = createDeps();
    const objectPath = `job-1/instagram/post/${"a".repeat(64)}.jpg`;
    deps.rows.upsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("provider database detail"));
    deps.rows.listPaths.mockResolvedValueOnce([{ storage_path: objectPath }]);

    await expect(persistEvidenceSnapshots("job-1", [
      candidate,
      { ...candidate, sourceId: "post-2" },
    ], deps)).rejects.toThrow("evidence_row_upsert_failed");

    expect(deps.rows.listPaths).toHaveBeenCalledWith("job-1");
    expect(deps.storage.remove).not.toHaveBeenCalled();
  });

  it("reports a sanitized cleanup failure when orphan compensation also fails", async () => {
    const deps = createDeps();
    deps.rows.upsert.mockRejectedValueOnce(new Error("provider database detail"));
    deps.storage.remove.mockResolvedValueOnce({ error: new Error("provider storage detail") });

    await expect(persistEvidenceSnapshots("job-1", [candidate], deps))
      .rejects.toThrow("evidence_row_upsert_cleanup_failed");
  });

  it("does not mark evidence stored when the Storage API returns an error", async () => {
    const deps = createDeps();
    deps.storage.upload.mockResolvedValueOnce({ error: new Error("provider detail") });

    await expect(persistEvidenceSnapshots("job-1", [candidate], deps))
      .rejects.toThrow("evidence_storage_upload_failed");
    expect(deps.rows.upsert).not.toHaveBeenCalled();
  });
});

describe("deleteEvidenceForReport", () => {
  it("removes private objects before deleting their metadata rows", async () => {
    const deps = createDeps();
    deps.rows.listPaths.mockResolvedValueOnce([
      { storage_path: "job-1/instagram/post/a.jpg" },
      { storage_path: null },
      { storage_path: "job-1/google_maps/photo/b.webp" },
    ]);

    await deleteEvidenceForReport("job-1", deps);

    expect(deps.storage.remove).toHaveBeenCalledWith([
      "job-1/instagram/post/a.jpg",
      "job-1/google_maps/photo/b.webp",
    ]);
    expect(deps.rows.delete).toHaveBeenCalledWith("job-1");
    expect(deps.storage.remove.mock.invocationCallOrder[0])
      .toBeLessThan(deps.rows.delete.mock.invocationCallOrder[0]!);
  });

  it("keeps metadata rows retryable when object removal fails", async () => {
    const deps = createDeps();
    deps.rows.listPaths.mockResolvedValueOnce([
      { storage_path: "job-1/instagram/post/a.jpg" },
    ]);
    deps.storage.remove.mockResolvedValueOnce({ error: new Error("provider detail") });

    await expect(deleteEvidenceForReport("job-1", deps))
      .rejects.toThrow("evidence_storage_remove_failed");
    expect(deps.rows.delete).not.toHaveBeenCalled();
  });
});

/**
 * The containment guard is the only thing standing between a malformed or tampered
 * storage_path and a bucket removal outside the job's own prefix. It threw
 * correctly from the day it was written and nothing asserted it, so a refactor
 * that softened it would have been silent.
 */
function deps(
  paths: Array<{ storage_path: string | null }>,
  listing: Record<string, Array<{ name: string; id: string | null }>> = {},
) {
  const removed: string[][] = [];
  let rowsDeleted = false;
  return {
    removed,
    wasRowsDeleted: () => rowsDeleted,
    deps: {
      download: async () => { throw new Error("not used"); },
      storage: {
        upload: async () => ({}),
        remove: async (targets: string[]) => { removed.push(targets); return {}; },
        list: async (prefix: string, options: { offset: number }) => ({
          // One page is enough for these fixtures; a second call must return
          // nothing or the sweep would loop.
          data: options.offset === 0 ? listing[prefix] ?? [] : [],
          error: null,
        }),
      },
      rows: {
        upsert: async () => {},
        listPaths: async () => paths,
        delete: async () => { rowsDeleted = true; },
      },
    } as unknown as Parameters<typeof deleteEvidenceForReport>[1],
  };
}

describe("deleteEvidenceForReport path containment", () => {
  it("refuses a stored path that escapes the job prefix", async () => {
    const harness = deps([{ storage_path: "../other-job/instagram/post/a.jpg" }]);
    await expect(deleteEvidenceForReport("job-1", harness.deps)).rejects.toThrow("evidence_storage_path_invalid");
    expect(harness.removed).toEqual([]);
    expect(harness.wasRowsDeleted()).toBe(false);
  });

  it("refuses a path belonging to a different job", async () => {
    const harness = deps([{ storage_path: "job-2/instagram/post/a.jpg" }]);
    await expect(deleteEvidenceForReport("job-1", harness.deps)).rejects.toThrow("evidence_storage_path_invalid");
    expect(harness.removed).toEqual([]);
  });

  it("refuses a job id that is not a safe path segment", async () => {
    const harness = deps([]);
    await expect(deleteEvidenceForReport("../etc", harness.deps)).rejects.toThrow("invalid_evidence_job_id");
  });

  it("removes owned paths once, then the rows", async () => {
    const harness = deps([
      { storage_path: "job-1/instagram/post/a.jpg" },
      { storage_path: "job-1/instagram/post/a.jpg" },
      { storage_path: null },
    ]);
    await deleteEvidenceForReport("job-1", harness.deps);
    expect(harness.removed).toEqual([["job-1/instagram/post/a.jpg"]]);
    expect(harness.wasRowsDeleted()).toBe(true);
  });
});

/**
 * The row list is not a complete index of the bucket. persistEvidenceSnapshots
 * uploads the object and then writes the row, so a crash between the two leaves
 * an object nothing points at. Erasing only row-referenced paths left those
 * behind permanently -- unreachable through the app AND undeletable, because the
 * row that named them was gone too.
 */
describe("deleteEvidenceForReport storage sweep", () => {
  it("removes an orphaned object that no row references", async () => {
    const harness = deps(
      [],
      {
        "job-1": [{ name: "instagram", id: null }],
        "job-1/instagram": [{ name: "post", id: null }],
        "job-1/instagram/post": [{ name: "orphan.jpg", id: "obj-1" }],
      },
    );
    await deleteEvidenceForReport("job-1", harness.deps);
    expect(harness.removed).toEqual([["job-1/instagram/post/orphan.jpg"]]);
    expect(harness.wasRowsDeleted()).toBe(true);
  });

  it("unions swept objects with row-referenced paths, without duplicating", async () => {
    const harness = deps(
      [{ storage_path: "job-1/instagram/post/a.jpg" }],
      {
        "job-1": [{ name: "instagram", id: null }],
        "job-1/instagram": [{ name: "post", id: null }],
        "job-1/instagram/post": [
          { name: "a.jpg", id: "obj-1" },
          { name: "orphan.jpg", id: "obj-2" },
        ],
      },
    );
    await deleteEvidenceForReport("job-1", harness.deps);
    expect(harness.removed[0]!.sort()).toEqual([
      "job-1/instagram/post/a.jpg",
      "job-1/instagram/post/orphan.jpg",
    ]);
  });

  it("holds swept paths to the same containment rule as rows", async () => {
    // A listing is not more trustworthy than a stored path just because it came
    // from the bucket. Both go through ownedStoragePaths.
    const harness = deps([], { "job-1": [{ name: "..", id: "obj-1" }] });
    await expect(deleteEvidenceForReport("job-1", harness.deps)).rejects.toThrow(
      "evidence_storage_path_invalid",
    );
    expect(harness.removed).toEqual([]);
  });

  it("aborts the erasure when the listing itself fails", async () => {
    const removed: string[][] = [];
    const failing = {
      download: async () => { throw new Error("not used"); },
      storage: {
        upload: async () => ({}),
        remove: async (targets: string[]) => { removed.push(targets); return {}; },
        list: async () => ({ data: null, error: { message: "down" } }),
      },
      rows: {
        upsert: async () => {},
        listPaths: async () => [{ storage_path: "job-1/instagram/post/a.jpg" }],
        delete: async () => { throw new Error("rows must not be deleted"); },
      },
    } as unknown as Parameters<typeof deleteEvidenceForReport>[1];

    await expect(deleteEvidenceForReport("job-1", failing)).rejects.toThrow("evidence_storage_list_failed");
    // A listing outage must not downgrade into "erased what we could see".
    expect(removed).toEqual([]);
  });

  it("does not walk forever when the bucket keeps returning folders", async () => {
    // Depth is bounded, so a cyclic or pathological prefix cannot hang an
    // operator's erasure request.
    const harness = deps([], new Proxy({}, {
      get: () => [{ name: "deeper", id: null }],
      has: () => true,
    }) as Record<string, Array<{ name: string; id: string | null }>>);
    await deleteEvidenceForReport("job-1", harness.deps);
    expect(harness.wasRowsDeleted()).toBe(true);
  });
});

describe("deleteEvidenceForReport sweep termination", () => {
  /** Returns a FULL page of folders every time, so pagination never self-limits. */
  function foldersForever(safetyLimit = 400) {
    let calls = 0;
    return {
      calls: () => calls,
      deps: {
        download: async () => { throw new Error("not used"); },
        storage: {
          upload: async () => ({}),
          remove: async () => ({}),
          list: async () => {
            calls += 1;
            if (calls > safetyLimit) throw new Error("list_called_unboundedly");
            return {
              data: Array.from({ length: 100 }, (_, index) => ({ name: `d${index}`, id: null })),
              error: null,
            };
          },
        },
        rows: {
          upsert: async () => {},
          listPaths: async () => [],
          delete: async () => { throw new Error("rows must not be deleted"); },
        },
      } as unknown as Parameters<typeof deleteEvidenceForReport>[1],
    };
  }

  it("gives up instead of paginating forever on a page full of folders", async () => {
    // Folder entries do not grow `files`, so a ceiling that only counts files
    // never trips and the pagination loop runs forever -- hanging the operator's
    // erasure request rather than failing it.
    const harness = foldersForever();
    await expect(deleteEvidenceForReport("job-1", harness.deps)).rejects.toThrow(
      "evidence_storage_sweep_too_large",
    );
    expect(harness.calls()).toBeLessThanOrEqual(400);
  });

  it("chunks the removal so a large sweep is not one over-sized batch", async () => {
    // 250 objects under one folder -> three remove() calls, not one.
    const listing: Record<string, Array<{ name: string; id: string | null }>> = {
      "job-1": [{ name: "instagram", id: null }],
    };
    const objects = Array.from({ length: 250 }, (_, index) => ({ name: `f${index}.jpg`, id: `o${index}` }));
    const removed: string[][] = [];
    const deps = {
      download: async () => { throw new Error("not used"); },
      storage: {
        upload: async () => ({}),
        remove: async (targets: string[]) => { removed.push(targets); return {}; },
        list: async (prefix: string, options: { limit: number; offset: number }) => ({
          data: prefix === "job-1/instagram"
            ? objects.slice(options.offset, options.offset + options.limit)
            : options.offset === 0 ? listing[prefix] ?? [] : [],
          error: null,
        }),
      },
      rows: {
        upsert: async () => {},
        listPaths: async () => [],
        delete: async () => {},
      },
    } as unknown as Parameters<typeof deleteEvidenceForReport>[1];

    await deleteEvidenceForReport("job-1", deps);
    expect(removed.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(removed.flat()).toHaveLength(250);
  });
});
