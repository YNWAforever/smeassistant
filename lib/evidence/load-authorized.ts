import "server-only";
import { supabaseServer } from "@/lib/supabase/admin";
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

function expectedSignedOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

function safeSignedUrl(
  value: unknown,
  expectedOrigin: string | null,
  expectedPath: string,
): string | null {
  const text = boundedString(value, 4_096);
  if (!text) return null;
  try {
    const url = new URL(text);
    const tokens = url.searchParams.getAll("token");
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || !expectedOrigin
      || url.origin !== expectedOrigin
      || url.pathname !== `/storage/v1/object/sign/report-evidence/${expectedPath}`
      || url.hash
      || [...url.searchParams].length !== 1
      || tokens.length !== 1
      || tokens[0]!.length < 1
      || tokens[0]!.length > 2_048
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function loadAuthorizedEvidence(
  jobId: string,
): Promise<EvidenceGalleryModel> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    throw new Error("evidence_job_id_invalid");
  }
  const supabase = supabaseServer();
  let queryResult: { data: unknown; error: unknown };
  try {
    queryResult = await supabase
      .from("report_evidence")
      .select(
        "id,provider,evidence_type,source_url,captured_at,published_at,text_content,metadata,storage_path,collection_status,limitation_code",
      )
      .eq("job_id", jobId)
      .order("captured_at", { ascending: false });
  } catch {
    throw new Error("evidence_query_failed");
  }
  if (queryResult.error) throw new Error("evidence_query_failed");
  const data = queryResult.data;

  const rows = (Array.isArray(data) ? data : [])
    .map((row) => normalizeRow(row, jobId))
    .filter((row): row is EvidenceRow => Boolean(row));
  const paths = [...new Set(
    rows.map((row) => row.storagePath).filter((path): path is string => Boolean(path)),
  )];
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    let signResult: { data: unknown; error: unknown };
    try {
      signResult = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS);
    } catch {
      throw new Error("evidence_signing_failed");
    }
    if (signResult.error) throw new Error("evidence_signing_failed");
    const signed = signResult.data;
    const origin = expectedSignedOrigin();
    for (const item of Array.isArray(signed) ? signed : []) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Record<string, unknown>;
      if (candidate.error) continue;
      const path = boundedString(candidate.path, 1_024);
      const signedUrl = path
        ? safeSignedUrl(candidate.signedUrl, origin, path)
        : null;
      if (path && paths.includes(path) && signedUrl) signedByPath.set(path, signedUrl);
    }
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
