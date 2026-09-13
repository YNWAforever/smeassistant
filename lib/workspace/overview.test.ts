import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { buildActionOverview, displayPhaseKey, type ActionRow } from "./overview";
import { TEMPLATES } from "./templates";

const lt = (s: string) => ({ en: s, "zh-HK": s, "zh-TW": s });

const row: ActionRow = {
  id: "a1",
  workspace_id: "ws",
  location_id: "loc",
  template_key: "review-response",
  source: "finding",
  source_finding_keys: ["gbp.owner_response_low"],
  title: lt("Reply"),
  summary: lt("s"),
  evidence: { factType: "Observed", source: "Google Business Profile", value: "18%", detail: lt("d"), observedAt: "2026-09-01T00:00:00Z", freshness: lt("f") },
  priority: "urgent",
  priority_score: "61.5",
  priority_factors: [{ key: "impact", points: 30 }],
  effort_minutes: 10,
  required_inputs: ["brand_voice", "language"],
  provided_inputs: { brand_voice: "warm" },
  assignee_user_id: null,
  due_at: null,
  action_state: "needs_input",
  measurement_state: "not_eligible",
  capability: "Live",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

describe("displayPhaseKey", () => {
  const b = { capability: "Live" as const, actionState: "recommended" as const, runState: null, approvalState: null, deliveryState: "not_requested" as const, measurementState: "not_eligible" as const };
  it("follows the 3.4 order", () => {
    expect(displayPhaseKey({ ...b, capability: "Requires connection" })).toBe("requires_connection");
    expect(displayPhaseKey({ ...b, actionState: "needs_input", runState: "running" })).toBe("needs_input");
    expect(displayPhaseKey({ ...b, runState: "queued" })).toBe("generating");
    expect(displayPhaseKey({ ...b, approvalState: "draft" })).toBe("draft_ready");
    expect(displayPhaseKey({ ...b, approvalState: "changes_requested" })).toBe("changes_requested");
    expect(displayPhaseKey({ ...b, approvalState: "approved", deliveryState: "export_ready" })).toBe("approved_export_ready");
    expect(displayPhaseKey({ ...b, approvalState: "approved", deliveryState: "exported" })).toBe("exported");
    expect(displayPhaseKey({ ...b, measurementState: "awaiting_comparable_scan" })).toBe("awaiting_comparable_scan");
    expect(displayPhaseKey({ ...b, measurementState: "measured" })).toBe("measured");
    expect(displayPhaseKey(b)).toBe("recommended");
  });
});

describe("buildActionOverview", () => {
  it("rolls up the latest run and version and lists missing inputs", () => {
    const overview = buildActionOverview(row, {
      location: { id: "loc", slug: "yik-yam", name: lt("Yik Yam Street") },
      latestRun: { state: "succeeded" },
      latestVersion: { id: "v2", version_no: 2, approval_state: "draft", delivery_state: "not_requested" },
    });
    expect(overview.missingInputs).toEqual(["language"]);
    expect(overview.displayPhaseKey).toBe("needs_input");
    expect(overview.latestVersion).toEqual({ id: "v2", versionNo: 2, approvalState: "draft", deliveryState: "not_requested" });
    expect(overview.priorityFactors[0].label.en).toBe(copy.en.workspace.factors.impact);
    expect(overview.displayPhase["zh-HK"]).toBe(copy["zh-HK"].workspace.phases.needs_input);
  });

  it("stops reporting an input the scan already answers, without rewriting the persisted list", () => {
    // A row derived before the evidence-aware rule: required_inputs still lists
    // the review key and action_state is still needs_input, but the detail page
    // resolves the evidence live.
    const overview = buildActionOverview({ ...row, required_inputs: ["brand_voice", "reviews_without_response"], provided_inputs: {} }, {
      location: null,
      latestRun: null,
      latestVersion: null,
      scanSatisfiedInputs: ["reviews_without_response"],
    });
    expect(overview.missingInputs).toEqual(["brand_voice"]);
    expect(overview.requiredInputs).toContain("reviews_without_response");
    expect(overview.evidenceInputs).toEqual(["reviews_without_response"]);
    // The persisted state is unchanged, so the transitional row still reads as
    // needs_input until the next derivation rewrites it.
    expect(overview.displayPhaseKey).toBe("needs_input");
  });

  it("does not read a missing run as generating and defaults location to all", () => {
    const overview = buildActionOverview({ ...row, action_state: "recommended", location_id: null }, { location: null, latestRun: null, latestVersion: null });
    expect(overview.displayPhaseKey).toBe("recommended");
    expect(overview.runState).toBe("queued");
    expect(overview.location.slug).toBe("all");
  });
});

const EMPTY_CTX = { location: null, latestRun: null, latestVersion: null };

describe("delivery mode on the overview", () => {
  // P2.1 item 6 / P2.2 item 12: the page decides whether an agent can draft
  // this action from `delivery`. A wrong value here is what put a "Generate a
  // draft" button on a template whose only possible answer is 409.
  it.each(TEMPLATES.map((t) => [t.key, t.delivery] as const))("surfaces %s as %s", (key, delivery) => {
    const overview = buildActionOverview({ ...row, template_key: key }, EMPTY_CTX);
    expect(overview.delivery).toBe(delivery);
  });

  it("reports null for a template this build no longer declares", () => {
    // Fails closed: the detail page treats a null delivery as "no agent", so a
    // legacy row renders without a control that cannot succeed.
    const overview = buildActionOverview({ ...row, template_key: "retired-template" }, EMPTY_CTX);
    expect(overview.delivery).toBeNull();
  });

  it("agrees with the template registry on which templates have an agent", () => {
    for (const template of TEMPLATES) {
      const agentBacked = template.delivery === "export" || template.delivery === "export_copy";
      expect(agentBacked, `${template.key} delivery=${template.delivery}`).toBe(template.agentKey !== null);
    }
  });
});
