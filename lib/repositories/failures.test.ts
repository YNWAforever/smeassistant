import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();
vi.mock("../db/client", () => ({ getPool: () => ({ query: poolQuery }) }));

import { failuresRepository, type FailureQuery } from "./failures";

const ALL: FailureQuery = { kinds: null, hexPrefix: null, uuid: null, workspaceId: null, limit: 200 };

const DEAD_ROW = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  correlation_id: null,
  occurred_at: new Date("2026-09-20T00:00:00.000Z"),
  workspace_id: "ws-1",
  workspace_slug: "kam-man-house",
  workspace_name: "Kam Man House",
  location_id: null,
  action_id: null,
  business_name: "Kam Man House",
  reason: "provider_response_missing_id",
  attempts: 5,
};

beforeEach(() => vi.resetAllMocks());

describe("failuresRepository: mail_dead", () => {
  it("lists a dead mail row with a MAIL- reference, workspace slug, and no address anywhere in the item", async () => {
    poolQuery.mockResolvedValue({ rows: [DEAD_ROW], rowCount: 1 });
    const items = await failuresRepository().list({ ...ALL, kinds: ["mail_dead"] });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "mail_dead",
        id: DEAD_ROW.id,
        reference: "MAIL-3FA85F",
        workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House" },
        locationId: null,
        actionId: null,
        reason: "provider_response_missing_id",
        attempts: 5,
        operatorAction: "none",
      }),
    ]);
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain("to_address");
    expect(serialized).not.toMatch(/[\w.-]+@[\w.-]+/);
  });

  it("scopes the query by workspace, hex prefix and full id like every other kind, and reads occurred_at from updated_at", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await failuresRepository().list({ kinds: ["mail_dead"], hexPrefix: "3fa85f", uuid: null, workspaceId: "ws-1", limit: 50 });
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("FROM mail_outbox o JOIN workspaces w ON w.id = o.workspace_id");
    expect(sql).toContain("o.state = 'dead'");
    // Matches every other kind's "last activity" convention (e.g. google_connection's
    // c.updated_at): when the row went dead, not when it was first queued.
    expect(sql).toContain("o.updated_at AS occurred_at");
    expect(params).toEqual(["ws-1", "3fa85f", null, 50]);
  });
});

describe("failuresRepository.health: mail", () => {
  it("includes mail_dead in open counts and delegates the last-24h queued/held mail counts to the outbox repository, no re-derived SQL", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ scan_day: 0, scan_week: 0, draft_day: 0, draft_week: 0, dead: 0, processing: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ n: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ dead_total: 2, queued_24h: 3 }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          { hold_reason: "opted_out", n: 2 },
          { hold_reason: "no_address", n: 1 },
        ],
        rowCount: 2,
      });
    const health = await failuresRepository().health();
    expect(health.open.mail_dead).toBe(2);
    expect(health.mail).toEqual({
      queued: 3,
      held: { mail_unapproved: 0, kind_disabled: 0, opted_out: 2, no_address: 1, not_allowlisted: 0, not_member: 0 },
    });
    // The 4th/5th queries are operatorCounts()'s own SQL (lib/repositories/mail-outbox.ts),
    // not a copy re-derived here -- both use the DB clock, never a JS Date.
    const [deadQueuedSql] = poolQuery.mock.calls[3];
    expect(deadQueuedSql).toContain("now() - interval '24 hours'");
    const [heldSql] = poolQuery.mock.calls[4];
    expect(heldSql).toContain("now() - interval '24 hours'");
    expect(heldSql).not.toContain("$1");
  });
});
