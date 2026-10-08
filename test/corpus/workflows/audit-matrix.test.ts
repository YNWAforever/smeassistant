import { describe, expect, it } from "vitest";
import { AGENTS } from "@/lib/agents";
import { TEMPLATES } from "@/lib/workspace/templates";
import { loadCorpus } from "./harness";

describe("T-16 registry coverage", () => {
  it("names every applicable tool/market/scenario fixture, and identifies the unrouted tool", () => {
    const cases = loadCorpus();
    const unrouted = Object.keys(AGENTS).filter((key) => !TEMPLATES.some((t) => t.agentKey === key));
    expect(unrouted).toEqual(["validation_plan"]);
    for (const key of Object.keys(AGENTS).filter((key) => !unrouted.includes(key))) {
      for (const market of ["hk", "tw"]) for (const scenario of ["normal", "missing-data", "adversarial", "recovery"]) {
        const id = `audit-${key}-${market}-${scenario}`;
        expect(cases.filter((c) => c.id === id), id).toHaveLength(1);
      }
    }
  });
});
