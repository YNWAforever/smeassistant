import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "./capabilities";
import { AGENTS } from "./agents";
import { TEMPLATES } from "./workspace/templates";

describe("capabilities", () => {
  it("agrees with every template that names an agent", () => {
    for (const template of TEMPLATES) {
      if (!template.agentKey) continue;
      expect(template.capability, template.key).toBe(CAPABILITIES[template.agentKey]);
    }
  });

  it("agrees with every agent definition", () => {
    for (const [key, agent] of Object.entries(AGENTS)) {
      expect(agent.capability, key).toBe(CAPABILITIES[key as keyof typeof CAPABILITIES]);
    }
  });

  it("never labels a real capability as Demo", () => {
    expect(Object.values(CAPABILITIES)).not.toContain("Demo");
  });
});
