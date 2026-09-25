import { describe, expect, it } from "vitest";
import { CLAIMABLE_JOB_CONDITION_SQL, DEAD_LETTERED_JOB_CONDITION_SQL } from "./claimable";

describe("claim conditions", () => {
  it("keeps the claimable condition byte-identical to the lease contract", () => {
    expect(CLAIMABLE_JOB_CONDITION_SQL).toBe(
      "(status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'))",
    );
  });

  it("states dead-lettered as in flight, three or more attempts, and stale", () => {
    expect(DEAD_LETTERED_JOB_CONDITION_SQL).toBe(
      "(status IN ('collecting','scoring','persisting') AND attempt_count>=3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes')",
    );
  });
});
