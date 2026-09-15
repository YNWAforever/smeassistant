import { describe, expect, it } from "vitest";
import { strongestBasis, type ApplicationRecord } from "./applications";

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
    expect(strongestBasis([], false, HEAD_STARTED)).toBeNull();
  });

  it("returns exported when only the export precedes the head scan", () => {
    expect(strongestBasis([], true, HEAD_STARTED)).toBe("exported");
  });

  it("prefers owner_asserted over exported, because export is not publication", () => {
    expect(strongestBasis([application()], true, HEAD_STARTED)).toBe("owner_asserted");
  });

  it("prefers verified over owner_asserted", () => {
    expect(
      strongestBasis([application(), application({ id: "app-2", source: "verified" })], true, HEAD_STARTED),
    ).toBe("verified");
  });

  it("ignores a retracted application", () => {
    expect(strongestBasis([application({ retracted_at: "2026-09-05T00:00:00Z" })], false, HEAD_STARTED)).toBeNull();
  });

  it("ignores an application asserted after the head scan started", () => {
    expect(strongestBasis([application({ asserted_at: "2026-09-11T00:00:00Z" })], false, HEAD_STARTED)).toBeNull();
  });

  it("ignores an application with an unparseable timestamp", () => {
    expect(strongestBasis([application({ asserted_at: "not-a-date" })], false, HEAD_STARTED)).toBeNull();
  });

  it("finds verified even when an earlier retracted verified row and a valid owner_asserted row precede it", () => {
    expect(
      strongestBasis(
        [
          application({ id: "app-1", source: "verified", retracted_at: "2026-09-05T00:00:00Z" }),
          application({ id: "app-2", source: "owner_asserted" }),
          application({ id: "app-3", source: "verified" }),
        ],
        false,
        HEAD_STARTED,
      ),
    ).toBe("verified");
  });
});
