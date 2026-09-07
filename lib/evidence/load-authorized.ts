import "server-only";
import { evidenceRepository } from "@/lib/repositories/evidence";
import { createPrivateBlobStorage } from "@/lib/storage/private-blob";
import type {
  EvidenceGalleryItem,
  EvidenceGalleryModel,
} from "@/lib/report/view-model";
import { isSensitiveQueryName } from "@sme-scanner/scan-engine";
import type { EvidenceProvider, EvidenceType } from "./types";

const EVIDENCE_BUCKET = "report-evidence";
const SIGNED_URL_SECONDS = 300;
const PROVIDERS = new Set<EvidenceProvider>(["instagram", "google_maps"]);
const TYPES = new Set<EvidenceType>([
  "profile", "post", "reel", "story", "highlight", "photo", "review",
]);
const STATUSES = new Set<EvidenceGalleryItem["status"]>([
  "stored", "metadata_only", "failed",
]);

type EvidenceRow = {
  id: string;
  provider: EvidenceProvider;
  evidenceType: EvidenceType;
  sourceUrl: string | null;
  capturedAt: string;
  publishedAt: string | null;
  text: string | null;
  metadata: EvidenceGalleryItem["metadata"];
  storagePath: string | null;
  status: EvidenceGalleryItem["status"];
  limitationCode: string | null;
};

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function validTimestamp(value: unknown, required: boolean): string | null {
  if (value == null && !required) return null;
  const text = boundedString(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function safeSourceUrl(value: unknown): string | null {
  const text = boundedString(value, 2_048);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || [...url.searchParams.keys()].some(isSensitiveQueryName)
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeMetadata(value: unknown): EvidenceGalleryItem["metadata"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: EvidenceGalleryItem["metadata"] = {};
  for (const [key, nested] of Object.entries(value).slice(0, 32)) {
    const safeKey = boundedString(key, 80);
    if (!safeKey || isSensitiveQueryName(safeKey)) continue;
    if (typeof nested === "string") {
      result[safeKey] = nested.slice(0, 500);
    } else if (typeof nested === "number" && Number.isFinite(nested)) {
      result[safeKey] = nested;
    } else if (typeof nested === "boolean" || nested === null) {
      result[safeKey] = nested;
    } else if (Array.isArray(nested) && nested.every((item) => typeof item === "string")) {
      result[safeKey] = nested.slice(0, 20).map((item) => item.slice(0, 200));
    }
  }
  return result;
}

function ownedStoragePath(
  value: unknown,
  jobId: string,
  provider: EvidenceProvider,
  evidenceType: EvidenceType,
): string | null {
  const path = boundedString(value, 1_024);
  if (!path) return null;
  const prefix = `${jobId}/${provider}/${evidenceType}/`;
  if (!path.startsWith(prefix)) return null;
  const filename = path.slice(prefix.length);
  return /^[0-9a-f]{64}\.(?:jpg|png|webp)$/.test(filename) ? path : null;
}

function normalizeRow(value: unknown, jobId: string): EvidenceRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = boundedString(row.id, 200);
  const provider = row.provider;
  const evidenceType = row.evidence_type;
  const status = row.collection_status;
  const capturedAt = validTimestamp(row.captured_at, true);
  if (
    !id
    || typeof provider !== "string"
    || !PROVIDERS.has(provider as EvidenceProvider)
    || typeof evidenceType !== "string"
    || !TYPES.has(evidenceType as EvidenceType)
    || typeof status !== "string"
    || !STATUSES.has(status as EvidenceGalleryItem["status"])
    || !capturedAt
  ) return null;

  const typedProvider = provider as EvidenceProvider;
  const typedEvidenceType = evidenceType as EvidenceType;
  const rawStoragePath = boundedString(row.storage_path, 1_024);
  const storagePath = ownedStoragePath(
    row.storage_path,
    jobId,
    typedProvider,
    typedEvidenceType,
  );
  if (rawStoragePath && !storagePath) return null;
  const typedStatus = status as EvidenceGalleryItem["status"];
  if (
    (typedStatus === "stored" && !storagePath)
    || (typedStatus !== "stored" && rawStoragePath !== null)
  ) return null;

  return {
    id,
    provider: typedProvider,
    evidenceType: typedEvidenceType,
    sourceUrl: safeSourceUrl(row.source_url),
    capturedAt,
    publishedAt: validTimestamp(row.published_at, false),
    text: boundedString(row.text_content, 2_000),
    metadata: sanitizeMetadata(row.metadata),
    storagePath,
    status: typedStatus,
    limitationCode: boundedString(row.limitation_code, 200),
  };
}

export async function loadAuthorizedEvidence(
  jobId: string,
): Promise<EvidenceGalleryModel> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    throw new Error("evidence_job_id_invalid");
  }
  let data: unknown;
  try { data = await evidenceRepository().list(jobId); }
  catch { throw new Error("evidence_query_failed"); }

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeRow(row, jobId))
    .filter((row): row is EvidenceRow => Boolean(row));
  const paths = [...new Set(
    rows.map((row) => row.storagePath).filter((path): path is string => Boolean(path)),
  )];
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    try {
      const storage = createPrivateBlobStorage();
      for (const path of paths) signedByPath.set(path, await storage.sign(EVIDENCE_BUCKET, path, SIGNED_URL_SECONDS));
    } catch { throw new Error("evidence_signing_failed"); }
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      evidenceType: row.evidenceType,
      sourceUrl: row.sourceUrl,
      mediaUrl: row.storagePath ? signedByPath.get(row.storagePath) ?? null : null,
      capturedAt: row.capturedAt,
      publishedAt: row.publishedAt,
      text: row.text,
      metadata: row.metadata,
      status: row.status,
      limitationCode: row.limitationCode,
    })),
  };
}
