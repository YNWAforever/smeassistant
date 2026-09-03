import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { buildActionOverview, displayPhaseKey, type ActionRow } from "./overview";

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

  it("does not read a missing run as generating and defaults location to all", () => {
    const overview = buildActionOverview({ ...row, action_state: "recommended", location_id: null }, { location: null, latestRun: null, latestVersion: null });
    expect(overview.displayPhaseKey).toBe("recommended");
    expect(overview.runState).toBe("queued");
    expect(overview.location.slug).toBe("all");
  });
});
