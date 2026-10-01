import { FINDING_KEYS } from "@sme-scanner/scoring";
import { describe, expect, it } from "vitest";
import { AGENTS, isAgentKey } from "@/lib/agents";
import { CAPABILITIES } from "@/lib/capabilities";
import { ACTION_INPUT_KEYS } from "@/lib/copy-workspace";
import { EVIDENCE_INPUT_KEYS } from "@/lib/workspace/evidence-inputs";
import { TEMPLATE_METRIC } from "@/lib/workspace/measurements";
import { METRIC_KEYS } from "@/lib/workspace/metrics";
import { TEMPLATES, WEBSITE_FAQ_TRIGGER, type TemplateDelivery } from "@/lib/workspace/templates";

/**
 * The workflow contract (docs/superpowers/specs/2026-09-30-workflow-contract-design.md).
 * These rules hold for every row of the template table, so a new workflow that
 * breaks one fails here rather than in production.
 *
 * "The server chooses the agent" is already enforced and tested in runs.test.ts
 * ("refuses a registered agent that is not this action template's own agent");
 * it is deliberately not duplicated here.
 */

// Publishing is not a delivery mode (guardrail 6): this line fails typecheck if it becomes one.
// @ts-expect-error publishing is not a delivery
const _publishIsNotADelivery: TemplateDelivery = "publish";
void _publishIsNotADelivery;

const AUTHORITY_KEYS = ["role", "minRole", "scope", "locationScope", "tier", "entitlement", "permission", "permissions", "grants", "allow"];

describe.each(TEMPLATES)("workflow contract: $key", (t) => {
  it("maps to a registered agent with an agreeing capability", () => {
    if (t.agentKey !== null) {
      expect(isAgentKey(t.agentKey)).toBe(true);
      expect(AGENTS[t.agentKey].capability).toBe(t.capability);
      expect(CAPABILITIES[t.agentKey]).toBe(t.capability);
    }
    if (t.capability === "Requires connection" || t.capability === "Planned" || t.delivery === "checklist" || t.delivery === "system") {
      expect(t.agentKey).toBeNull();
    }
  });

  it("never publishes", () => {
    expect(["export_copy", "export", "checklist", "system"]).toContain(t.delivery);
  });

  it("classifies exactly the required inputs", () => {
    expect(t.requiredInputs).toEqual(t.inputs.map((i) => i.key));
    expect(new Set(t.inputs.map((i) => i.key)).size).toBe(t.inputs.length);
    for (const input of t.inputs) {
      if (input.kind === "evidence") expect(EVIDENCE_INPUT_KEYS).toContain(input.key);
      if (input.kind === "confirmed_fact") expect(ACTION_INPUT_KEYS as readonly string[]).toContain(input.key);
    }
  });

  it("triggers only on known finding keys", () => {
    for (const key of t.triggerFindingKeys) {
      expect(key === WEBSITE_FAQ_TRIGGER || (FINDING_KEYS as readonly string[]).includes(key)).toBe(true);
    }
  });

  it("counts an approved version, measures a known metric, retries once", () => {
    expect(t.deliveryUnit).toBe("approved_version");
    expect(t.measurement === null || (METRIC_KEYS as readonly string[]).includes(t.measurement)).toBe(true);
    expect(t.failure).toEqual({ retries: 1, onMissingFacts: "needs_input" });
  });

  it("carries no authority", () => {
    const keys = Object.keys(t);
    for (const forbidden of AUTHORITY_KEYS) expect(keys).not.toContain(forbidden);
  });
});

/**
 * The spec's "Input classification" table, literally. A row whose kinds drift
 * (e.g. ig-bio's cta_link re-tagged from confirmed_fact to preference, which
 * would silently stop the run gate asking for it) fails here, not in review.
 */
const SPEC_INPUT_KINDS: Record<string, Record<string, "confirmed_fact" | "evidence" | "preference">> = {
  "review-response": { brand_voice: "preference", reviews_without_response: "evidence", language: "preference" },
  "review-request": { brand_voice: "preference", channel: "preference" },
  "gbp-profile-fix": { opening_hours: "confirmed_fact", categories: "confirmed_fact" },
  "gbp-photo-pack": {},
  "gbp-post": { brand_voice: "preference" },
  "social-post": { asset_or_text_only: "confirmed_fact", alt_text: "preference" },
  "ig-bio": { brand_voice: "preference", approved_claim: "confirmed_fact", cta_link: "confirmed_fact" },
  "ig-highlights": {},
  "visibility-content": { owner_fact_1: "confirmed_fact", owner_fact_2: "confirmed_fact", owner_fact_3: "confirmed_fact" },
  "website-basics": { approved_claim: "preference" },
  "local-seo-brief": {},
  "menu-translation": { menu_items: "confirmed_fact" },
  "google-reconnect": { google_account_owner: "confirmed_fact" },
};

describe("input classification matches the spec table", () => {
  it("covers every template and no others", () => {
    expect(TEMPLATES.map((t) => t.key).sort()).toEqual(Object.keys(SPEC_INPUT_KINDS).sort());
  });

  it.each(TEMPLATES.map((t) => [t.key, t] as const))("%s tags each input with the spec's kind", (key, t) => {
    expect(Object.fromEntries(t.inputs.map((i) => [i.key, i.kind]))).toEqual(SPEC_INPUT_KINDS[key]);
  });
});

describe("workflow registry", () => {
  it("derives TEMPLATE_METRIC from the template table", () => {
    const derived = Object.fromEntries(TEMPLATES.filter((t) => t.measurement).map((t) => [t.key, t.measurement]));
    expect(TEMPLATE_METRIC).toEqual(derived);
    // Pinned as an open question (a Google post does not obviously move review recency), not as a fix.
    expect(TEMPLATE_METRIC["gbp-post"]).toBe("gbp.days_since_last_review");
  });

  it("uses every agent except validation_plan in some template", () => {
    const used = new Set(TEMPLATES.map((t) => t.agentKey).filter((k) => k !== null));
    const unused = Object.keys(AGENTS).filter((key) => key !== "validation_plan" && !used.has(key as never));
    expect(unused).toEqual([]);
  });
});
