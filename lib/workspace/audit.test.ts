import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_EVENTS, ipHashFor, recordEvent } from "./audit";

function db(insert: (row: unknown) => Promise<{ error: unknown }>) {
  return { from: () => ({ insert }) } as unknown as SupabaseClient;
}

describe("recordEvent", () => {
  it("writes the §3.11 row shape with locale and ip_hash merged into the payload", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await recordEvent(db(insert), {
      workspaceId: "ws-1",
      locationId: "loc-1",
      actorType: "user",
      actorId: "user-1",
      event: "run.started",
      entityType: "action_run",
      entityId: "run-1",
      locale: "zh-HK",
      ipHash: "abc",
      payload: { agent_key: "review_reply" },
    });
    expect(insert).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      location_id: "loc-1",
      actor_type: "user",
      actor_id: "user-1",
      event: "run.started",
      entity_type: "action_run",
      entity_id: "run-1",
      payload: { locale: "zh-HK", ip_hash: "abc", agent_key: "review_reply" },
    });
  });

  it("omits ip_hash when unknown and never throws on a failed insert", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const insert = vi.fn(async () => ({ error: { message: "boom" } }));
    await expect(recordEvent(db(insert), { workspaceId: "ws-1", actorType: "system", event: "action.updated" })).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ actor_id: null, location_id: null, payload: { locale: null } }));
    await expect(recordEvent(db(async () => { throw new Error("down"); }), { workspaceId: "ws-1", actorType: "system", event: "action.updated" })).resolves.toBeUndefined();
    consoleError.mockRestore();
  });

  it("lists every §3.11 event name once", () => {
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length);
    expect(AUDIT_EVENTS).toContain("delivery.copied");
    expect(AUDIT_EVENTS).toContain("consent.public_evidence");
  });
});

describe("ipHashFor", () => {
  it("hashes the proxy identity and never returns the raw address", () => {
    const hash = ipHashFor(new Request("https://app.test/x", { headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.9");
  });
});
