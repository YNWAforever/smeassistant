import { downloadEvidenceMedia, type MediaDownload } from "./safe-media";
import type { EvidenceCandidate } from "./types";
import { supabaseServer } from "@/lib/supabase/admin";

const EVIDENCE_BUCKET = "report-evidence";
const JOB_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Wall-clock budget for media downloads across the whole loop.
 *
 * The loop is sequential over up to 41 candidates (EVIDENCE_LIMITS) at 8 s each,
 * so it could spend 328 s — the single largest term in a scan whose own timeouts
 * already sum to roughly 600 s. It runs after the job row is already terminal, so
 * overrunning does not fail the scan; it burns function time and gets truncated
 * wherever the platform kills the request, which is arbitrary.
 *
 * 45 s guarantees a floor of ~5 fully-attempted downloads even if every one hangs
 * to its 8 s ceiling, and on a healthy scan with sub-second fetches it is never
 * reached, so nothing is lost.
 *
 * Deliberately NOT bounded concurrency. Storage paths are content-addressed, and
 * the orphan-cleanup path asks listPaths() whether any row already references a
 * digest before deleting it. Run two items at once and A's row may not be visible
 * when B's cleanup runs, so B deletes the object A is about to point at — leaving
 * a row marked "stored" whose storage_path 404s. Concurrency also contends with
 * the process-global decode limiter in safe-media, which turns valid images into
 * persisted decode_failed rows under load.
 */
const EVIDENCE_DOWNLOAD_BUDGET_MS = 45_000;

type StorageUploadOptions = {
  contentType: string;
  upsert: boolean;
  cacheControl: string;
};

/** One entry from a Storage listing. Supabase gives folders a null `id`. */
type StorageEntry = { name: string; id: string | null };

export interface EvidencePersistenceDeps {
  download: (url: string) => Promise<MediaDownload>;
  storage: {
    upload: (
      path: string,
      bytes: Uint8Array,
      options: StorageUploadOptions,
    ) => Promise<unknown>;
    remove: (paths: string[]) => Promise<unknown>;
    /**
     * Lists one level under a prefix. Required, not optional, so a fake that
     * forgets it fails typecheck instead of silently skipping the sweep in
     * deleteEvidenceForReport — which would be a test that proves erasure works
     * while erasure quietly leaves objects behind.
     */
    list: (prefix: string, options: { limit: number; offset: number }) => Promise<unknown>;
  };
  rows: {
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<void>;
    listPaths: (jobId: string) => Promise<Array<{ storage_path: string | null }>>;
    delete: (jobId: string) => Promise<void>;
  };
  /** Injectable clock so the download budget is testable without fake timers. */
  now?: () => number;
}

/**
 * Exported so lib/lifecycle/erase-report.ts can reject a malformed job id before
 * it starts removing anything, rather than re-declaring the rule. A second copy
 * of a containment check is exactly the drift this repo has been bitten by
 * before (responseRate, implemented twice with incompatible denominators).
 */
export function assertJobSegment(jobId: string): void {
  if (!JOB_SEGMENT.test(jobId)) {
    throw new Error("invalid_evidence_job_id");
  }
}

function throwForApiError(result: unknown, code: string): void {
  if (
    result
    && typeof result === "object"
    && "error" in result
    && (result as { error?: unknown }).error
  ) {
    throw new Error(code);
  }
}

function createEvidenceRowRepository(
  supabase: ReturnType<typeof supabaseServer>,
): EvidencePersistenceDeps["rows"] {
  return {
    async upsert(row, options) {
      const { error } = await supabase.from("report_evidence").upsert(row, options);
      if (error) throw new Error("evidence_row_upsert_failed");
    },
    async listPaths(jobId) {
      const { data, error } = await supabase
        .from("report_evidence")
        .select("storage_path")
        .eq("job_id", jobId);
      if (error) throw new Error("evidence_path_query_failed");
      return data ?? [];
    },
    async delete(jobId) {
      const { error } = await supabase
        .from("report_evidence")
        .delete()
        .eq("job_id", jobId);
      if (error) throw new Error("evidence_row_delete_failed");
    },
  };
}

function createProductionEvidenceDeps(): EvidencePersistenceDeps {
  const supabase = supabaseServer();
  const bucket = supabase.storage.from(EVIDENCE_BUCKET);
  return {
    download: downloadEvidenceMedia,
    storage: {
      upload: (path, bytes, options) => bucket.upload(path, bytes, options),
      remove: (paths) => bucket.remove(paths),
      list: (prefix, options) => bucket.list(prefix, options),
    },
    rows: createEvidenceRowRepository(supabase),
  };
}

function extensionFor(
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function limitationFor(
  candidate: EvidenceCandidate,
  media: MediaDownload | null,
): string | null {
  if (media && !media.ok) return media.code;
  if (candidate.retention === "metadata_only") return "snapshot_not_permitted";
  if (!candidate.mediaUrl) return "EVIDENCE_MEDIA_URL_MISSING";
  return null;
}

/**
 * Support diagnostics for a refused snapshot. `limitation_code` must keep its
 * existing values because the report UI maps them to merchant-facing copy and
 * falls back to neutral text for anything unknown, so the finer discriminator
 * is stored additively in the existing `metadata` JSON column instead. Our key
 * is written last so provider metadata can never forge it.
 */
function evidenceMetadata(
  candidate: EvidenceCandidate,
  media: MediaDownload | null,
): EvidenceCandidate["metadata"] {
  if (!media || media.ok || media.code !== "EVIDENCE_MEDIA_TYPE_BLOCKED") {
    return candidate.metadata;
  }
  return { ...candidate.metadata, mediaRejectionDetail: media.detail };
}

function toEvidenceRow(
  jobId: string,
  candidate: EvidenceCandidate,
  media: MediaDownload | null,
  storagePath: string | null,
): Record<string, unknown> {
  const storedMedia = media?.ok ? media : null;
  return {
    job_id: jobId,
    provider: candidate.provider,
    evidence_type: candidate.evidenceType,
    source_id: candidate.sourceId,
    source_url: candidate.sourceUrl,
    captured_at: candidate.capturedAt,
    published_at: candidate.publishedAt,
    text_content: candidate.text,
    metadata: evidenceMetadata(candidate, media),
    storage_bucket: storagePath ? EVIDENCE_BUCKET : null,
    storage_path: storagePath,
    content_sha256: storedMedia?.sha256 ?? null,
    mime_type: storedMedia?.mimeType ?? null,
    byte_size: storedMedia?.byteSize ?? null,
    width: storedMedia?.width ?? null,
    height: storedMedia?.height ?? null,
    collection_status: storedMedia ? "stored" : "metadata_only",
    limitation_code: limitationFor(candidate, media),
  };
}

export async function persistEvidenceSnapshots(
  jobId: string,
  candidates: EvidenceCandidate[],
  deps: EvidencePersistenceDeps = createProductionEvidenceDeps(),
): Promise<void> {
  assertJobSegment(jobId);
  const now = deps.now ?? Date.now;
  const deadline = now() + EVIDENCE_DOWNLOAD_BUDGET_MS;
  for (const candidate of candidates) {
    const eligible = candidate.retention === "snapshot_permitted" && Boolean(candidate.mediaUrl);
    // Past the budget, skip the fetch but still write the row. Reusing the
    // existing EVIDENCE_MEDIA_FETCH_FAILED code matters: the report maps it to a
    // neutral "unavailable" tile, whereas an unknown code is rendered verbatim to
    // the merchant, and a plain null here would produce limitation_code: null,
    // which the UI shows as "unknown".
    const media = !eligible
      ? null
      : now() >= deadline
        ? ({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" } as const)
        : await deps.download(candidate.mediaUrl!);
    const objectPath = media?.ok
      ? `${jobId}/${candidate.provider}/${candidate.evidenceType}/${media.sha256}.${extensionFor(media.mimeType)}`
      : null;

    if (media?.ok && objectPath) {
      const result = await deps.storage.upload(objectPath, media.bytes, {
        contentType: media.mimeType,
        upsert: true,
        // Supabase FileOptions expects seconds, not a full Cache-Control header.
        cacheControl: "0",
      });
      throwForApiError(result, "evidence_storage_upload_failed");
    }

    try {
      await deps.rows.upsert(
        toEvidenceRow(jobId, candidate, media, objectPath),
        { onConflict: "job_id,provider,evidence_type,source_id" },
      );
    } catch {
      if (objectPath) {
        try {
          const existingRows = await deps.rows.listPaths(jobId);
          const alreadyReferenced = existingRows.some(
            (row) => row.storage_path === objectPath,
          );
          if (!alreadyReferenced) {
            const cleanup = await deps.storage.remove([objectPath]);
            throwForApiError(cleanup, "evidence_row_upsert_cleanup_failed");
          }
        } catch {
          throw new Error("evidence_row_upsert_cleanup_failed");
        }
      }
      throw new Error("evidence_row_upsert_failed");
    }
  }
}

function ownedStoragePaths(
  jobId: string,
  rows: Array<{ storage_path: string | null }>,
): string[] {
  const prefix = `${jobId}/`;
  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  if (paths.some((path) => !path.startsWith(prefix) || path.includes("..") || path.includes("\\"))) {
    throw new Error("evidence_storage_path_invalid");
  }
  return [...new Set(paths)];
}

/** Page size, recursion depth and entry ceiling for the prefix sweep below. */
const SWEEP_PAGE_SIZE = 100;
const SWEEP_MAX_DEPTH = 8;
/**
 * Counts EVERY entry seen, folders included — not just the files that end up
 * removed. Bounding files alone let a prefix that returns a full page of folders
 * paginate forever: folder entries land in the next frontier rather than in
 * `files`, so the ceiling never tripped and the loop never exited. That hangs an
 * operator's erasure request instead of failing it, which is the worse of the two.
 */
const SWEEP_MAX_ENTRIES = 10_000;
/** Second, independent bound: no single prefix may be paged more than this. */
const SWEEP_MAX_PAGES_PER_PREFIX = 200;

/**
 * Supabase Storage rejects an over-large remove() batch, and the sweep can now
 * surface far more paths than the ≤41 evidence rows a job is capped at, so the
 * removal is chunked. An unchunked call would fail the whole erasure on exactly
 * the buckets that most needed sweeping.
 */
const REMOVE_BATCH_SIZE = 100;

function storageEntries(result: unknown): StorageEntry[] {
  const data = result && typeof result === "object" ? (result as { data?: unknown }).data : null;
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== "string" || !name || name.includes("/")) return [];
    const id = (entry as { id?: unknown }).id;
    return [{ name, id: typeof id === "string" ? id : null }];
  });
}

/**
 * Every object actually sitting under `${jobId}/`, whatever report_evidence says.
 *
 * The row list is not a complete index of the bucket. persistEvidenceSnapshots
 * uploads the object and then writes the row, so any failure between the two —
 * a crashed function, a row write that errors — leaves an object with nothing
 * pointing at it. Erasing only row-referenced paths left those behind forever:
 * unreachable through the app and now undeletable, because the row that named
 * them is gone too. That is the state the design rejects a pure cascade for, and
 * it arrived by a different door.
 *
 * Walks breadth-first because Storage lists one level at a time and evidence
 * paths are `${jobId}/{provider}/{type}/{file}`. Bounded on depth, page count and
 * total objects: this runs inside an operator's erasure request, and an
 * unbounded walk over a malformed prefix would hang it.
 */
async function sweepStoragePrefix(
  jobId: string,
  deps: EvidencePersistenceDeps,
): Promise<string[]> {
  const files: string[] = [];
  let seen = 0;
  let frontier = [jobId];

  for (let depth = 0; depth < SWEEP_MAX_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const prefix of frontier) {
      for (let page = 0; page < SWEEP_MAX_PAGES_PER_PREFIX; page += 1) {
        const result = await deps.storage.list(prefix, {
          limit: SWEEP_PAGE_SIZE,
          offset: page * SWEEP_PAGE_SIZE,
        });
        throwForApiError(result, "evidence_storage_list_failed");
        const entries = storageEntries(result);
        for (const entry of entries) {
          const path = `${prefix}/${entry.name}`;
          if (entry.id === null) next.push(path);
          else files.push(path);
        }
        // Every entry counts, not just the files. See SWEEP_MAX_ENTRIES.
        seen += entries.length;
        if (seen > SWEEP_MAX_ENTRIES) throw new Error("evidence_storage_sweep_too_large");
        if (entries.length < SWEEP_PAGE_SIZE) break;
      }
    }
    frontier = next;
  }

  return files;
}

export async function deleteEvidenceForReport(
  jobId: string,
  deps: EvidencePersistenceDeps = createProductionEvidenceDeps(),
): Promise<void> {
  assertJobSegment(jobId);
  const rows = await deps.rows.listPaths(jobId);

  // Union of what the rows claim and what the bucket actually holds. Both go
  // through ownedStoragePaths, so a tampered storage_path and a surprising
  // listing are held to the same `${jobId}/` containment rule.
  const swept = await sweepStoragePrefix(jobId, deps);
  const paths = ownedStoragePaths(jobId, [
    ...rows,
    ...swept.map((storage_path) => ({ storage_path })),
  ]);

  // Chunked: the sweep can surface far more paths than the ≤41 evidence rows a
  // job is capped at, and an over-large remove() batch fails the whole erasure on
  // exactly the buckets that most needed sweeping.
  for (let start = 0; start < paths.length; start += REMOVE_BATCH_SIZE) {
    const result = await deps.storage.remove(paths.slice(start, start + REMOVE_BATCH_SIZE));
    throwForApiError(result, "evidence_storage_remove_failed");
  }
  await deps.rows.delete(jobId);
}
