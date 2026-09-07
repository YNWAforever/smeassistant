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
      remove: vi.fn<(paths: string[]) => Promise<{ error: unknown }>>().mockResolvedValue({ error: null }),
      list: vi.fn(async (): Promise<{ paths: string[]; hasMore: boolean; cursor?: string }> => ({ paths: [], hasMore: false })),
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


describe("flat cursor evidence retention", () => {
  it("unions orphan objects and database references before deleting rows", async () => {
    const deps = createDeps();
    deps.rows.listPaths.mockResolvedValue([{ storage_path: "job-1/a.jpg" }]);
    deps.storage.list.mockResolvedValueOnce({ paths: ["job-1/a.jpg", "job-1/orphan.jpg"], hasMore: false });
    await deleteEvidenceForReport("job-1", deps);
    expect(deps.storage.remove).toHaveBeenCalledWith(["job-1/a.jpg", "job-1/orphan.jpg"]);
    expect(deps.storage.remove.mock.invocationCallOrder[0]).toBeLessThan(deps.rows.delete.mock.invocationCallOrder[0]!);
  });
  it.each(["../other/a.jpg", "job-2/a.jpg", "job-1/../a.jpg", "job-1/a\\b.jpg"])("denies escaped reference %s", async path => {
    const deps = createDeps(); deps.rows.listPaths.mockResolvedValue([{ storage_path: path }]);
    await expect(deleteEvidenceForReport("job-1", deps)).rejects.toThrow("evidence_storage_path_invalid");
    expect(deps.rows.delete).not.toHaveBeenCalled(); expect(deps.storage.remove).not.toHaveBeenCalled();
  });
  it("denies escaped listed objects and malformed job IDs", async () => {
    const deps = createDeps(); deps.storage.list.mockResolvedValue({ paths: ["other/a.jpg"], hasMore: false });
    await expect(deleteEvidenceForReport("job-1", deps)).rejects.toThrow("evidence_storage_path_invalid");
    await expect(deleteEvidenceForReport("../etc", deps)).rejects.toThrow("invalid_evidence_job_id");
    expect(deps.rows.delete).not.toHaveBeenCalled();
  });
  it("fails before deleting anything on listing failure", async () => {
    const deps = createDeps(); deps.storage.list.mockRejectedValue(new Error("storage"));
    await expect(deleteEvidenceForReport("job-1", deps)).rejects.toThrow("evidence_storage_list_failed");
    expect(deps.storage.remove).not.toHaveBeenCalled(); expect(deps.rows.delete).not.toHaveBeenCalled();
  });
  it("rejects missing or repeated cursors", async () => {
    const deps = createDeps(); deps.storage.list.mockResolvedValue({ paths: [], hasMore: true, cursor: "same" });
    await expect(deleteEvidenceForReport("job-1", deps)).rejects.toThrow("evidence_storage_cursor_invalid");
    expect(deps.rows.delete).not.toHaveBeenCalled();
  });
  it("bounds pages even when empty and objects when pages are full", async () => {
    for (const full of [false, true]) {
      const deps = createDeps(); let page = 0;
      deps.storage.list.mockImplementation(async () => ({ paths: full ? Array.from({ length: 100 }, (_, i) => `job-1/${page}-${i}.jpg`) : [], hasMore: true, cursor: String(++page) }));
      await expect(deleteEvidenceForReport("job-1", deps)).rejects.toThrow("evidence_storage_sweep_too_large");
      expect(page).toBeLessThanOrEqual(200); expect(deps.rows.delete).not.toHaveBeenCalled();
    }
  });
  it("uses flat continuation cursors and removes in batches of 100", async () => {
    const deps = createDeps();
    deps.storage.list.mockResolvedValueOnce({ paths: Array.from({ length: 100 }, (_, i) => `job-1/${i}.jpg`), hasMore: true, cursor: "second" })
      .mockResolvedValueOnce({ paths: Array.from({ length: 100 }, (_, i) => `job-1/${100+i}.jpg`), hasMore: true, cursor: "third" })
      .mockResolvedValueOnce({ paths: Array.from({ length: 50 }, (_, i) => `job-1/${200+i}.jpg`), hasMore: false });
    await deleteEvidenceForReport("job-1", deps);
    expect(deps.storage.list).toHaveBeenNthCalledWith(2, "job-1", { limit: 100, cursor: "second" });
    expect(deps.storage.remove.mock.calls.map(call => (call[0] as string[]).length)).toEqual([100,100,50]);
  });
});
