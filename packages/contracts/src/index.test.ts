import { describe, expect, it } from "vitest";
import {
  EVIDENCE_PROVIDERS,
  EVIDENCE_TYPES,
  canTransitionJob,
  isTerminalJobStatus,
  serpApiHttpFailure,
} from "./index";

describe("@sme-scanner/contracts barrel", () => {
  it("re-exports the evidence provider and type lists", () => {
    expect(EVIDENCE_PROVIDERS).toEqual(["instagram", "google_maps"]);
    expect(EVIDENCE_TYPES).toContain("review");
  });

  it("re-exports the audit job state machine", () => {
    expect(isTerminalJobStatus("done")).toBe(true);
    expect(isTerminalJobStatus("partial")).toBe(true);
    expect(isTerminalJobStatus("queued")).toBe(false);
    expect(canTransitionJob("queued", "collecting")).toBe(true);
    expect(canTransitionJob("done", "queued")).toBe(false);
  });

  it("re-exports the SerpApi outcome helper", () => {
    expect(typeof serpApiHttpFailure).toBe("function");
  });
});
