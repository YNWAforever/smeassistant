import { describe, expect, it } from "vitest"

import { contextualAssistantEnabled } from "@/lib/assistant/flag"

describe("contextualAssistantEnabled", () => {
  it("is on only for the exact string true", () => {
    expect(contextualAssistantEnabled({ CONTEXTUAL_ASSISTANT_ENABLED: "true" })).toBe(true)
    for (const v of [undefined, "", "TRUE", "1", "yes", " true"]) {
      expect(contextualAssistantEnabled({ CONTEXTUAL_ASSISTANT_ENABLED: v })).toBe(false)
    }
  })

  it("is off when the variable is absent", () => {
    expect(contextualAssistantEnabled({})).toBe(false)
  })
})
