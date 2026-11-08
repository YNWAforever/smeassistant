import { describe, expect, it } from "vitest";
import { conversationStudioEnabled, STUDIO_FLAG_VARIABLE } from "./flag";

describe("conversationStudioEnabled", () => {
  it("is on only for the exact string true", () => {
    expect(STUDIO_FLAG_VARIABLE).toBe("CONVERSATION_STUDIO_ENABLED");
    expect(conversationStudioEnabled({ CONVERSATION_STUDIO_ENABLED: "true" })).toBe(true);
    for (const value of ["", "false", "TRUE", "True", "1", " true", "true ", "yes", undefined]) {
      expect(conversationStudioEnabled({ CONVERSATION_STUDIO_ENABLED: value })).toBe(false);
    }
    expect(conversationStudioEnabled({})).toBe(false);
  });
});
