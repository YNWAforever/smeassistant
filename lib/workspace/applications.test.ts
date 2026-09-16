import { describe, expect, it } from "vitest";
import { recordApplication, strongestBasis, type ApplicationRecord } from "./applications";
import type { ApplicationRepository } from "@/lib/repositories/applications";

const HEAD_STARTED = Date.parse("2026-09-10T00:00:00Z");

function application(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: "app-1",
    action_id: "action-1",
    source: "owner_asserted",
    asserted_at: "2026-09-01T00:00:00Z",
    retracted_at: null,
    ...overrides,
  };
}

describe("strongestBasis", () => {
  it("returns null when nothing applies", () => {
    expect(strongestBasis([], { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED })).toBeNull();
  });

  it("returns exported when only the export precedes the head scan", () => {
    expect(strongestBasis([], { exportedBeforeHead: true, headStartedAtMs: HEAD_STARTED })).toBe("exported");
  });

  it("prefers owner_asserted over exported, because export is not publication", () => {
    expect(
      strongestBasis([application()], { exportedBeforeHead: true, headStartedAtMs: HEAD_STARTED }),
    ).toBe("owner_asserted");
  });

  it("prefers verified over owner_asserted", () => {
    expect(
      strongestBasis([application(), application({ id: "app-2", source: "verified" })], {
        exportedBeforeHead: true,
        headStartedAtMs: HEAD_STARTED,
      }),
    ).toBe("verified");
  });

  it("ignores a retracted application", () => {
    expect(
      strongestBasis([application({ retracted_at: "2026-09-05T00:00:00Z" })], {
        exportedBeforeHead: false,
        headStartedAtMs: HEAD_STARTED,
      }),
    ).toBeNull();
  });

  it("ignores an application asserted after the head scan started", () => {
    expect(
      strongestBasis([application({ asserted_at: "2026-09-11T00:00:00Z" })], {
        exportedBeforeHead: false,
        headStartedAtMs: HEAD_STARTED,
      }),
    ).toBeNull();
  });

  it("ignores an application with an unparseable timestamp", () => {
    expect(
      strongestBasis([application({ asserted_at: "not-a-date" })], {
        exportedBeforeHead: false,
        headStartedAtMs: HEAD_STARTED,
      }),
    ).toBeNull();
  });

  it("finds verified even when an earlier retracted verified row and a valid owner_asserted row precede it", () => {
    expect(
      strongestBasis(
        [
          application({ id: "app-1", source: "verified", retracted_at: "2026-09-05T00:00:00Z" }),
          application({ id: "app-2", source: "owner_asserted" }),
          application({ id: "app-3", source: "verified" }),
        ],
        { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED },
      ),
    ).toBe("verified");
  });

  it("falls through to owner_asserted when the only verified row is retracted", () => {
    expect(
      strongestBasis(
        [
          application({ id: "app-1", source: "verified", retracted_at: "2026-09-05T00:00:00Z" }),
          application({ id: "app-2", source: "owner_asserted" }),
        ],
        { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED },
      ),
    ).toBe("owner_asserted");
  });
});

describe("recordApplication", () => {
  function fakeRepo() {
    let captured: unknown = null;
    const repo: ApplicationRepository = {
      insert: async (row) => {
        captured = row;
        return { id: "inserted-1" };
      },
      forActions: async () => [],
      approvedVersion: async () => false,
      assertApplied: async () => ({ ok: false, reason: "closed" }),
      retract: async () => ({ retracted: 0 }),
    };
    return { repo, getCaptured: () => captured };
  }

  it("maps camelCase input to the snake_case row, defaulting omitted optionals to null (not undefined), and passes a provided evidence object through unchanged", async () => {
    const { repo, getCaptured } = fakeRepo();

    const result = await recordApplication(repo, {
      workspaceId: "ws-1",
      actionId: "action-1",
      source: "owner_asserted",
    });

    expect(result).toEqual({ id: "inserted-1" });
    expect(getCaptured()).toEqual({
      workspace_id: "ws-1",
      action_id: "action-1",
      output_version_id: null,
      source: "owner_asserted",
      asserted_by: null,
      note: null,
      evidence: null,
    });

    const evidence = { provider: "gbp", confirmation_id: "abc-123" };
    await recordApplication(repo, {
      workspaceId: "ws-1",
      actionId: "action-1",
      source: "verified",
      evidence,
    });

    expect((getCaptured() as { evidence: unknown }).evidence).toBe(evidence);
  });
});
