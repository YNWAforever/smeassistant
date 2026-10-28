import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { conversationDocumentRepository } from "@/lib/repositories/conversation-documents";
import { createPrivateBlobStorage } from "@/lib/storage/private-blob";
import { ASSET_BUCKET, CONVERSATION_DOCUMENT_SEGMENT, safeFilename, storagePathFor } from "@/lib/workspace/assets";

export const MAX_DOCUMENT_BYTES = 128 * 1024;
export const MAX_DOCUMENT_TEXT = 20_000;
export const MAX_DOCUMENT_VERSIONS = 50;
export interface DocumentScope { workspaceId: string; locationId: string | null }
export interface DocumentVersion {
  id: string;
  documentId: string;
  assetId: string;
  version: number;
  title: string;
  createdAt: string;
  text: string;
  truncated: boolean;
  /** SHA-256 of the original file bytes, including any BOM. */
  sha256: string;
}
export type DocumentErrorCode = "unsupported_type" | "file_too_large" | "empty_file" | "invalid_utf8" | "binary_file" | "document_not_found" | "invalid_location" | "invalid_ids" | "unavailable";
export class ConversationDocumentError extends Error {
  constructor(readonly code: DocumentErrorCode) { super(code); this.name = "ConversationDocumentError"; }
}
type DocumentFile = Pick<File, "name" | "type" | "size" | "arrayBuffer">;
const MIME: Record<string, { canonical: string; allowed: string[] }> = {
  txt: { canonical: "text/plain", allowed: ["", "text/plain"] },
  md: { canonical: "text/markdown", allowed: ["", "text/plain", "text/markdown"] },
  csv: { canonical: "text/csv", allowed: ["", "text/plain", "text/csv", "application/vnd.ms-excel"] },
};

/** Fatal UTF-8 decoding and binary checks happen before any storage or database write. */
export async function extractConversationDocument(file: DocumentFile) {
  if (file.size > MAX_DOCUMENT_BYTES) throw new ConversationDocumentError("file_too_large");
  if (file.size <= 0) throw new ConversationDocumentError("empty_file");
  const extension = file.name.split(/[\\/]/).pop()?.match(/\.([a-z]+)$/i)?.[1].toLowerCase();
  const allowed = extension && Object.hasOwn(MIME, extension) ? MIME[extension] : undefined;
  if (!allowed || !allowed.allowed.includes(file.type.toLowerCase().split(";")[0].trim())) throw new ConversationDocumentError("unsupported_type");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new ConversationDocumentError("file_too_large");
  if (!bytes.length) throw new ConversationDocumentError("empty_file");
  let decoded: string;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ConversationDocumentError("invalid_utf8"); }
  if (/^\s*%PDF-/.test(decoded)) throw new ConversationDocumentError("unsupported_type");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(decoded)) throw new ConversationDocumentError("binary_file");
  if (!decoded.length) throw new ConversationDocumentError("empty_file");
  let end = MAX_DOCUMENT_TEXT;
  // PostgreSQL text must not receive a dangling surrogate from truncating an emoji.
  if (decoded.length > end && /[\uD800-\uDBFF]/.test(decoded[end - 1])) end--;
  return { bytes, text: decoded.slice(0, end), truncated: decoded.length > end, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: allowed.canonical, title: safeFilename(file.name, allowed.canonical) };
}

export async function conversationDocumentLocationExists(scope: DocumentScope): Promise<boolean> {
  return scope.locationId === null || conversationDocumentRepository().locationExists(scope);
}

/** Default reads show latest versions; explicit IDs resolve saved historical citations in this exact scope. */
export async function listConversationDocuments(scope: DocumentScope, ids?: readonly string[]): Promise<DocumentVersion[]> {
  if (ids && (!ids.length || ids.length > MAX_DOCUMENT_VERSIONS)) throw new ConversationDocumentError("invalid_ids");
  const versions = await conversationDocumentRepository().list(scope, ids);
  if (ids && ids.some(id => !versions.some(version => version.id === id))) throw new ConversationDocumentError("document_not_found");
  return versions;
}

/** Each revision adds one normal private asset. The extract and asset row commit together. */
export async function uploadConversationDocument(input: DocumentScope & { documentId?: string; uploadedBy: string; file: DocumentFile; locale?: string | null; ipHash?: string | null }): Promise<DocumentVersion> {
  const extracted = await extractConversationDocument(input.file);
  const assetId = randomUUID();
  const storagePath = storagePathFor(input.workspaceId, assetId, `${CONVERSATION_DOCUMENT_SEGMENT}/${extracted.title}`);
  let storage: ReturnType<typeof createPrivateBlobStorage>;
  try {
    storage = createPrivateBlobStorage();
    await storage.upload(ASSET_BUCKET, storagePath, extracted.bytes, { contentType: extracted.contentType, overwrite: false });
  } catch { throw new ConversationDocumentError("unavailable"); }
  try {
    return await conversationDocumentRepository().append({
      workspaceId: input.workspaceId, locationId: input.locationId, documentId: input.documentId,
      uploadedBy: input.uploadedBy, locale: input.locale ?? null, ipHash: input.ipHash ?? null,
      title: extracted.title, text: extracted.text, truncated: extracted.truncated, sha256: extracted.sha256,
      asset: { id: assetId, workspace_id: input.workspaceId, location_id: input.locationId, kind: "document", storage_path: storagePath, filename: extracted.title, alt_text: null, rights_status: "needs_review", rights_confirmed_at: null, uploaded_by: input.uploadedBy },
    });
  } catch (error) {
    await storage.remove(ASSET_BUCKET, [storagePath]).catch(() => undefined);
    const code = error instanceof Error && (error.message === "document_not_found" || error.message === "invalid_location") ? error.message : "unavailable";
    throw new ConversationDocumentError(code);
  }
}
