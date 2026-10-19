import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ownerReviewCheckRepository } from "./owner-review-check";
import { OWNER_REVIEW_CHECK_EVENT, type OwnerCheckCommand } from "@/lib/workspace/owner-review-check";

const uuid = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const command: OwnerCheckCommand = { versionId: uuid(3), latestVersionId: uuid(3), requestId: uuid(4), expectedRecordId: null,
  decision: "checked", reviewReference: "Reviewer/date/excerpt", note: "Reply matches", evidenceAssetId: null,
  confirmBusiness: true, confirmReview: true, confirmReply: true };
const input = { workspaceId: uuid(1), actionId: uuid(2), locationId: null, actorId: uuid(5), locale: "en", ipHash: null, command };

// This is an offline PostgreSQL protocol double, not SQL engine or RLS acceptance.
function fixture() {
  const state = {
    actionWorkspace: uuid(1), actionState: "completed", latestVersion: uuid(3), applied: true, latestCheck: null as string | null,
    rows: [] as Array<Record<string, unknown>>, inserts: 0, asset: false,
    usage: { approved_deliveries: 2, allowance: 3 }, approval: "approved", deliveryCount: 2,
  };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { command: sql, rows: [] };
    if (sql.includes("FOR UPDATE")) return { rows: [{ id: uuid(2), workspace_id: state.actionWorkspace, location_id: null, template_key: "review-response", action_state: state.actionState }] };
    if (sql.includes("ORDER BY version_no")) return { rows: [{ id: state.latestVersion }] };
    if (sql.includes("FROM output_versions")) return { rows: values[2] === uuid(3) ? [{ id: uuid(3) }] : [] };
    if (sql.includes("FROM action_applications")) return { rows: state.applied ? [{ output_version_id: uuid(3) }] : [] };
    if (sql.includes("FROM assets")) return { rows: state.asset ? [{ filename: "existing-proof.jpg" }] : [] };
    if (sql.includes("owner_check,requestId")) return { rows: state.rows.filter(row => (row.payload as { owner_check: OwnerCheckCommand }).owner_check.requestId === values[4]) };
    if (sql.includes("SELECT id FROM audit_events")) return { rows: state.latestCheck ? [{ id: state.latestCheck }] : [] };
    if (sql.includes("FROM audit_events")) return { rows: state.rows };
    if (sql.includes("INSERT INTO audit_events")) {
      state.inserts++;
      const row = { id: 5 + state.inserts, workspace_id: uuid(1), location_id: null, actor_type: "user", actor_id: uuid(5),
        event: OWNER_REVIEW_CHECK_EVENT, entity_type: "action", entity_id: uuid(2), payload: JSON.parse(values[5] as string), created_at: `2026-10-19T02:00:0${state.inserts}Z` };
      state.rows.push(row); state.latestCheck = String(row.id);
      return { rows: [row] };
    }
    throw new Error("Unexpected query in offline fixture");
  });
  const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { state, query, repository: ownerReviewCheckRepository(pool) };
}

describe("append-only owner check transaction (offline protocol fixture)", () => {
  it("saves then reads the same version-bound receipt without changing 2/3 usage or approval/delivery", async () => {
    const f = fixture();
    const before = structuredClone({ usage: f.state.usage, approval: f.state.approval, deliveryCount: f.state.deliveryCount });
    const result = await f.repository.record(input);
    expect(result).toMatchObject({ ok: true, record: { versionId: uuid(3), decision: "checked", independent: false } });
    expect(f.state.inserts).toBe(1);
    expect((await f.repository.load(input)).records[0]).toMatchObject({ id: "6", versionId: uuid(3), independent: false });
    expect({ usage: f.state.usage, approval: f.state.approval, deliveryCount: f.state.deliveryCount }).toEqual(before);
    const writes = f.query.mock.calls.filter(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()));
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toContain("INSERT INTO audit_events");
  });
  it("deduplicates a response-lost retry before checking its now-old base token", async () => {
    const f = fixture();
    await f.repository.record(input);
    expect(await f.repository.record(input)).toMatchObject({ ok: true, duplicate: true, record: { id: "6" } });
    expect(f.state.inserts).toBe(1);
    expect(await f.repository.record({ ...input, command: { ...command, note: "different" } })).toEqual({ ok: false, error: "idempotency_conflict" });
  });
  it("appends a correction and withdrawal while retaining the original check and its version", async () => {
    const f = fixture();
    await f.repository.record(input);
    await f.repository.record({ ...input, command: { ...command, requestId: uuid(7), expectedRecordId: "6", decision: "not_found", note: "Wrong review" } });
    await f.repository.record({ ...input, command: { ...command, requestId: uuid(8), expectedRecordId: "7", decision: "retracted", note: "Withdrawing the last statement" } });
    expect((await f.repository.load(input)).records.map(r => [r.id, r.decision, r.previousId])).toEqual([
      ["8", "retracted", "7"], ["7", "not_found", "6"], ["6", "checked", null],
    ]);
    expect(f.state.usage).toEqual({ approved_deliveries: 2, allowance: 3 });
  });
  it("keeps a version's newest check when other versions fill the bounded history window", async () => {
    const f = fixture();
    await f.repository.record(input);
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => {
      if (sql.includes("FROM audit_events") && !sql.includes("DISTINCT ON")) return { rows: [] };
      return original(sql, values);
    });
    expect((await f.repository.load(input)).records[0]?.id).toBe("6");
  });
  it("allows withdrawing an old check after the applied statement was withdrawn, without restoring completion", async () => {
    const f = fixture();
    await f.repository.record(input);
    f.state.applied = false;
    f.state.actionState = "in_progress";
    expect(await f.repository.record({ ...input, command: { ...command, requestId: uuid(7), expectedRecordId: "6", decision: "retracted", note: "Applied statement was withdrawn." } }))
      .toMatchObject({ ok: true, record: { decision: "retracted", previousId: "6" } });
    expect(f.state.applied).toBe(false);
    expect(f.state.actionState).toBe("in_progress");
    expect(f.state.usage).toEqual({ approved_deliveries: 2, allowance: 3 });
  });
  it.each(["version", "foreign_version", "record", "workspace", "applied", "asset"])("refuses a stale or out-of-scope %s without inserting", async kind => {
    const f = fixture();
    if (kind === "version") f.state.latestVersion = uuid(7);
    if (kind === "record") f.state.latestCheck = "7";
    if (kind === "workspace") f.state.actionWorkspace = uuid(7);
    if (kind === "applied") f.state.applied = false;
    const request = kind === "asset" ? { ...input, command: { ...command, evidenceAssetId: uuid(7) } }
      : kind === "foreign_version" ? { ...input, command: { ...command, versionId: uuid(7) } } : input;
    expect(await f.repository.record(request)).toMatchObject({ ok: false });
    expect(f.state.inserts).toBe(0);
  });
});
