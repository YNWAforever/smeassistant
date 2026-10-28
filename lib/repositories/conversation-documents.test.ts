import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { conversationDocumentRepository } from "./conversation-documents";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const input = { workspaceId, locationId, documentId, uploadedBy: "owner", text: "first text", truncated: false, sha256: "a".repeat(64), title: "menu.txt", asset: { id: "asset-1", workspace_id: workspaceId, location_id: locationId, kind: "document" as const, filename: "menu.txt", storage_path: `${workspaceId}/asset-1/menu.txt`, alt_text: null, rights_status: "needs_review" as const, rights_confirmed_at: null, uploaded_by: "owner" } };

// Offline transaction protocol fixture: SQL scoping/ordering, not PostgreSQL constraint acceptance.
function fixture() {
  const state = { existing: [{ id: "old", documentId, version: 1, text: "saved text", workspaceId, locationId }] as Array<Record<string, unknown>>, failVersion: false, foreignLocation: false };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { command: sql, rows: [] };
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (sql.startsWith("SELECT id FROM locations")) return { rows: state.foreignLocation ? [] : [{ id: locationId }] };
    if (sql.includes("INSERT INTO assets")) return { rows: [{ ...input.asset, id: values[0] }] };
    if (sql.includes("SELECT version")) return { rows: state.existing.filter(r => r.workspaceId === values[0] && r.locationId === values[1] && r.documentId === values[2]).map(r => ({ version: r.version })) };
    if (sql.includes("INSERT INTO conversation_document_versions")) {
      if (state.failVersion) throw new Error("version failed");
      return { rows: [{ id: values[0], documentId: values[3], assetId: values[4], version: values[5], title: values[6], text: values[7], truncated: values[8], sha256: values[9], createdAt: "2026-10-28T00:00:00Z" }] };
    }
    if (sql.includes("FROM conversation_document_versions")) return { rows: [] };
    if (sql.includes("INSERT INTO audit_events")) return { rows: [] };
    throw new Error(`Unexpected fixture query: ${sql}`);
  });
  const release = vi.fn();
  const pool = { query, connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  return { state, query, release, repo: conversationDocumentRepository(pool) };
}

describe("immutable conversation extract repository", () => {
  it("inserts the asset and next version on one locked transaction, preserving saved text", async () => {
    const f = fixture();
    const before = structuredClone(f.state.existing);
    expect(await f.repo.append(input)).toMatchObject({ documentId, assetId: "asset-1", version: 2, text: "first text" });
    expect(f.state.existing).toEqual(before);
    const statements = f.query.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements.findIndex(sql => sql.includes("pg_advisory_xact_lock"))).toBeLessThan(statements.findIndex(sql => sql.includes("SELECT version")));
    expect(statements.findIndex(sql => sql.includes("INSERT INTO assets"))).toBeLessThan(statements.findIndex(sql => sql.includes("INSERT INTO conversation_document_versions")));
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some(sql => /^(UPDATE|DELETE)/.test(sql))).toBe(false);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["workspace", "location", "document"])("refuses a substituted %s before inserting any asset", async kind => {
    const f = fixture();
    await expect(f.repo.append({ ...input, [kind === "workspace" ? "workspaceId" : kind === "location" ? "locationId" : "documentId"]: "foreign" })).rejects.toThrow("document_not_found");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO assets"))).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("does not accept a location ID without same-workspace existence", async () => {
    const f = fixture(); f.state.foreignLocation = true;
    await expect(f.repo.append({ ...input, documentId: undefined })).rejects.toThrow("invalid_location");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO assets"))).toBe(false);
  });
  it("rolls back a raw asset row when version insertion fails", async () => {
    const f = fixture(); f.state.failVersion = true;
    await expect(f.repo.append(input)).rejects.toThrow("version failed");
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO assets"))).toBe(true);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("filters exact scope and asset ownership before bounding latest documents or explicit historical IDs", async () => {
    const f = fixture();
    await f.repo.list({ workspaceId, locationId: null });
    await f.repo.list({ workspaceId, locationId }, ["version-id"]);
    for (const [sql] of f.query.mock.calls) {
      expect(sql).toContain("IS NOT DISTINCT FROM $2::uuid");
      expect(sql).toContain("a.workspace_id=v.workspace_id");
      expect(sql).toContain("a.location_id IS NOT DISTINCT FROM v.location_id");
      expect(sql).toContain("LIMIT 50");
    }
    expect(f.query.mock.calls[0][1]).toEqual([workspaceId, null]);
    expect(f.query.mock.calls[1][1]).toEqual([workspaceId, locationId, ["version-id"]]);
    expect(f.query.mock.calls[1][0]).toContain("v.id=ANY($3::uuid[])");
  });
});
