import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ append: vi.fn(), list: vi.fn(), locationExists: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/repositories/conversation-documents", () => ({ conversationDocumentRepository: () => mocks }));
vi.mock("@/lib/storage/private-blob", () => ({ createPrivateBlobStorage: () => mocks }));
import { extractConversationDocument, uploadConversationDocument, listConversationDocuments } from "./conversation-documents";

const scope = { workspaceId: "11111111-1111-4111-8111-111111111111", locationId: null };
const file = (text: string | Uint8Array, name = "menu.txt", type = "text/plain") => new File([typeof text === "string" ? text : Buffer.from(text)], name, { type });

beforeEach(() => { vi.resetAllMocks(); mocks.upload.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined); mocks.append.mockResolvedValue({ id: "version" }); });

describe("bounded UTF-8 document extraction", () => {
  it.each([["notes.txt", "text/plain"], ["notes.md", "text/markdown"], ["notes.csv", "text/csv"], ["notes.md", "text/plain"], ["notes.csv", ""]])("accepts %s with compatible MIME %s and hashes the original bytes", async (name, type) => {
    const value = "日期,備註\r\n2026-10-27,Fresh menu 🍲";
    expect(await extractConversationDocument(file(value, name, type))).toMatchObject({ text: value, truncated: false, sha256: createHash("sha256").update(value).digest("hex") });
  });
  it("accepts a browser's Excel MIME label for UTF-8 CSV and stores it as CSV text", async () => {
    const value = "date,amount\r\n2026-10-28,12";
    expect(await extractConversationDocument(file(value, "sales.csv", "application/vnd.ms-excel"))).toMatchObject({ text: value, contentType: "text/csv", title: "sales.csv", truncated: false });
  });
  it.each([
    [new Uint8Array([0xc3, 0x28]), "invalid_utf8"],
    ["valid\u0000binary", "binary_file"],
    ["%PDF-1.7\nbody", "unsupported_type"],
  ] as const)("still rejects unsafe CSV bytes with an Excel MIME label: %s", async (value, code) => {
    await expect(extractConversationDocument(file(value, "sales.csv", "application/vnd.ms-excel"))).rejects.toMatchObject({ code });
  });
  it("bounds extracted text without splitting a Unicode character", async () => {
    const value = "a".repeat(19_999) + "🍲" + "last";
    const result = await extractConversationDocument(file(value));
    expect(result.text).toBe("a".repeat(19_999));
    expect(result.truncated).toBe(true);
  });
  it.each([["menu.pdf", "application/pdf"], ["menu.txt", "application/pdf"], ["menu.png", "text/plain"], ["menu.csv", "text/markdown"]])("rejects incompatible filename/MIME %s %s", async (name, type) => {
    await expect(extractConversationDocument(file("text", name, type))).rejects.toMatchObject({ code: "unsupported_type" });
  });
  it("rejects oversized and empty files before reading bytes", async () => {
    const read = vi.fn();
    await expect(extractConversationDocument({ name: "x.txt", type: "text/plain", size: 131_073, arrayBuffer: read })).rejects.toMatchObject({ code: "file_too_large" });
    await expect(extractConversationDocument(file(""))).rejects.toMatchObject({ code: "empty_file" });
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects malformed UTF-8, binary controls, and a disguised PDF", async () => {
    await expect(extractConversationDocument(file(new Uint8Array([0xc3, 0x28])))).rejects.toMatchObject({ code: "invalid_utf8" });
    await expect(extractConversationDocument(file("valid\u0000binary"))).rejects.toMatchObject({ code: "binary_file" });
    await expect(extractConversationDocument(file("%PDF-1.7\nbody"))).rejects.toMatchObject({ code: "unsupported_type" });
  });
});

describe("private asset-backed uploads", () => {
  it("stores a new private raw asset for every revision and passes extraction to the atomic repository", async () => {
    await uploadConversationDocument({ ...scope, documentId: "existing", uploadedBy: "owner", file: file("original") });
    await uploadConversationDocument({ ...scope, documentId: "existing", uploadedBy: "owner", file: file("changed") });
    const first = mocks.append.mock.calls[0][0];
    const second = mocks.append.mock.calls[1][0];
    expect(first).toMatchObject({ ...scope, documentId: "existing", text: "original", uploadedBy: "owner", asset: { kind: "document", rights_status: "needs_review", rights_confirmed_at: null, filename: "menu.txt" } });
    expect(second.asset.id).not.toBe(first.asset.id);
    expect(mocks.upload.mock.calls[0]).toEqual(["workspace-assets", first.asset.storage_path, expect.any(Uint8Array), { contentType: "text/plain", overwrite: false }]);
  });
  it("removes the new raw object when the transaction fails without exposing SQL details", async () => {
    mocks.append.mockRejectedValue(new Error("database secret"));
    await expect(uploadConversationDocument({ ...scope, uploadedBy: "owner", file: file("text") })).rejects.toMatchObject({ code: "unavailable", message: "unavailable" });
    expect(mocks.remove).toHaveBeenCalledWith("workspace-assets", [mocks.append.mock.calls[0][0].asset.storage_path]);
  });
  it("removes the new object for a document ID outside the exact scope", async () => {
    mocks.append.mockRejectedValue(new Error("document_not_found"));
    await expect(uploadConversationDocument({ ...scope, documentId: "foreign", uploadedBy: "owner", file: file("text") })).rejects.toMatchObject({ code: "document_not_found" });
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("does no database write when validation or private upload fails", async () => {
    await expect(uploadConversationDocument({ ...scope, uploadedBy: "owner", file: file("PDF", "menu.pdf", "application/pdf") })).rejects.toMatchObject({ code: "unsupported_type" });
    mocks.upload.mockRejectedValue(new Error("token secret"));
    await expect(uploadConversationDocument({ ...scope, uploadedBy: "owner", file: file("text") })).rejects.toMatchObject({ code: "unavailable" });
    expect(mocks.append).not.toHaveBeenCalled();
  });
  it("requires every explicit citation ID to resolve in the same scope", async () => {
    mocks.list.mockResolvedValue([{ id: "one" }]);
    await expect(listConversationDocuments(scope, ["one", "foreign"])).rejects.toMatchObject({ code: "document_not_found" });
  });
});

it("rejects an inherited object-property extension as unsupported",async()=>{
  await expect(extractConversationDocument(new File(["fixture"],"shop.constructor",{type:"text/plain"}))).rejects.toMatchObject({code:"unsupported_type"});
});
