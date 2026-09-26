import { describe, expect, it } from "vitest";
import { connectionReference, parseFailureSearch, referenceFor, runReference } from "./references";

const ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("references", () => {
  it("formats run and connection references like the scan reference", () => {
    expect(runReference(ID)).toBe("RUN-3FA85F");
    expect(connectionReference(ID)).toBe("CONN-3FA85F");
    expect(referenceFor("scan_failed", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("scan_dead_lettered", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("workspace_processing", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("draft_failed", ID)).toBe("RUN-3FA85F");
    expect(referenceFor("google_connection", ID)).toBe("CONN-3FA85F");
  });
});

describe("parseFailureSearch", () => {
  it("returns null for an empty or missing query", () => {
    expect(parseFailureSearch(undefined)).toBeNull();
    expect(parseFailureSearch("   ")).toBeNull();
  });

  it("maps a reference to its kinds and a lower-case hex prefix", () => {
    expect(parseFailureSearch(" scan-3fa85f ")).toEqual({ kinds: ["scan_failed", "scan_dead_lettered", "workspace_processing"], hexPrefix: "3fa85f", uuid: null });
    expect(parseFailureSearch("RUN-3FA85F")).toEqual({ kinds: ["draft_failed"], hexPrefix: "3fa85f", uuid: null });
    expect(parseFailureSearch("CONN-3FA85F")).toEqual({ kinds: ["google_connection"], hexPrefix: "3fa85f", uuid: null });
  });

  it("matches a full id across every kind", () => {
    expect(parseFailureSearch(ID.toUpperCase())).toEqual({ kinds: null, hexPrefix: null, uuid: ID });
  });

  it("rejects anything else", () => {
    expect(parseFailureSearch("SCAN-3FA85")).toBe("invalid");
    expect(parseFailureSearch("JOB-3FA85F")).toBe("invalid");
    expect(parseFailureSearch("'; DROP TABLE audit_jobs; --")).toBe("invalid");
  });
});
