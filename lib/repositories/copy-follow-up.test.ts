import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { copyFollowUpRepository } from "./copy-follow-up";
const input = { workspaceId: "workspace", actionId: "action", versionId: "version-2", actorId: "owner", locale: "zh-HK", decision: "pending" as const };
function fixture(eligible = true, previous?: { id: string; decision: string; can_answer?: boolean }) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT a.location_id") ? eligible ? [{ location_id: "location" }] : [] : sql.includes("SELECT id::text") ? previous ? [previous] : [] : sql.includes("INSERT INTO audit_events") ? [{ id: "9" }] : [] }));
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pick<Pool, "connect">;
  return { repository: copyFollowUpRepository(pool), query, release };
}
describe("clipboard follow-up persistence", () => {
  it("records an exact-version pending reminder only behind an approved-copy gate, without application or usage writes", async () => {
    const f = fixture();
    expect(await f.repository.record(input)).toEqual({ ok: true, id: "9" });
    const calls = f.query.mock.calls as unknown as [string, unknown[]][];
    const gate = calls.find(([sql]) => sql.includes("SELECT a.location_id"))!;
    expect(gate[1]).toEqual(["workspace", "action", "version-2"]);
    for (const guard of ["v.workspace_id=a.workspace_id", "v.action_id=a.id", "v.approval_state='approved'", "d.mode='copy'", "FOR UPDATE OF a,v"]) expect(gate[0]).toContain(guard);
    const insert = calls.find(([sql]) => sql.includes("INSERT INTO audit_events"))!;
    expect(insert[1]).toEqual(["workspace", "location", "owner", "action.copy_follow_up_recorded", "action", JSON.stringify({ versionId: "version-2", decision: "pending", locale: "zh-HK" })]);
    expect(calls.filter(([sql]) => /\b(?:INSERT|UPDATE)\b/.test(sql) && !sql.includes("FOR UPDATE"))).toHaveLength(1);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("refuses an unapproved, foreign, closed or undelivered version before recording anything", async () => {
    const f = fixture(false);
    expect(await f.repository.record(input)).toEqual({ ok: false, error: "version_not_applicable" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
  it("never revives a reminder on repeat copy after Not yet or Later", async () => {
    for (const decision of ["pending", "not_yet", "later"]) {
      const f = fixture(true, { id: "8", decision });
      expect(await f.repository.record(input)).toEqual({ ok: true, id: "8" });
      expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    }
  });
  it("accepts a fresh answer when the Later reminder is due again", async () => {
    const f = fixture(true, { id: "8", decision: "later", can_answer: true });
    expect(await f.repository.record({ ...input, decision: "not_yet", expectedRecordId: "8" })).toEqual({ ok: true, id: "9" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO audit_events"))).toBe(true);
  });
  it("saves an answer only against the exact pending record and handles a repeated response idempotently", async () => {
    const command = { ...input, decision: "later" as const, expectedRecordId: "8" };
    const f = fixture(true, { id: "8", decision: "pending" });
    expect(await f.repository.record(command)).toEqual({ ok: true, id: "9" });
    const stale = fixture(true, { id: "10", decision: "not_yet" });
    expect(await stale.repository.record(command)).toEqual({ ok: false, error: "follow_up_changed" });
    expect(stale.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(await fixture(true, { id: "10", decision: "later" }).repository.record(command)).toEqual({ ok: true, id: "10" });
  });
});
