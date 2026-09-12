import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { findMailAttempt, recordMailAttempt } from "./ledger";

const poolQuery = vi.fn();
const db: Pick<Pool, "query"> = { query: poolQuery as unknown as Pool["query"] };

beforeEach(() => vi.resetAllMocks());

describe("recordMailAttempt", () => {
  it("inserts once against audit_events, keyed by a mail-prefixed idempotency key", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: "evt-1" }] });
    const outcome = await recordMailAttempt(db, {
      dedupeKey: "invite:member-1",
      workspaceId: "ws-1",
      result: { status: "accepted_by_provider", providerMessageId: "msg-1" },
    });
    expect(outcome).toEqual({ recorded: true, existing: null });
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO audit_events");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(sql).toContain("'mail.attempted'");
    expect(params[0]).toBe("mail:invite:member-1");
    expect(params[1]).toBe("ws-1");
    expect(params[2]).toBe("mail_attempt");
    expect(JSON.parse(params[4])).toEqual({ status: "accepted_by_provider", provider_message_id: "msg-1", error: null });
  });

  it("accepts a null workspace id, so a pre-workspace mail attempt (e.g. an access request) can still be recorded", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: "evt-2" }] });
    await recordMailAttempt(db, {
      dedupeKey: "access-request:req-1",
      workspaceId: null,
      result: { status: "not_configured" },
    });
    expect(poolQuery.mock.calls[0][1][1]).toBeNull();
  });

  it("is a no-op on a repeated dedupe key and hands back what was actually recorded the first time", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ payload: { status: "failed", error: "network_error" }, created_at: "2026-09-12T00:00:00Z" }],
      });
    const outcome = await recordMailAttempt(db, {
      dedupeKey: "invite:member-1",
      workspaceId: "ws-1",
      result: { status: "accepted_by_provider", providerMessageId: "msg-2" },
    });
    expect(outcome).toEqual({
      recorded: false,
      existing: {
        dedupeKey: "invite:member-1",
        status: "failed",
        providerMessageId: null,
        error: "network_error",
        createdAt: "2026-09-12T00:00:00Z",
      },
    });
  });
});

describe("findMailAttempt", () => {
  it("returns null when nothing has been recorded for this dedupe key", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await findMailAttempt(db, "invite:missing")).toBeNull();
  });

  it("reads the recorded status and provider message id back from the payload", async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ payload: { status: "accepted_by_provider", provider_message_id: "msg-3" }, created_at: "2026-09-12T01:00:00Z" }],
    });
    expect(await findMailAttempt(db, "invite:member-2")).toEqual({
      dedupeKey: "invite:member-2",
      status: "accepted_by_provider",
      providerMessageId: "msg-3",
      error: null,
      createdAt: "2026-09-12T01:00:00Z",
    });
  });

  it("queries by the same mail-prefixed idempotency key that recordMailAttempt writes", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await findMailAttempt(db, "invite:member-9");
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("idempotency_key = $1");
    expect(params).toEqual(["mail:invite:member-9"]);
  });
});
