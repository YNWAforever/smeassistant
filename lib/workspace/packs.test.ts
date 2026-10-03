import { describe, expect, it } from "vitest";
import type { ActionState, ApprovalState, DeliveryState, RunState } from "@/lib/domain";
import { buildActionOverview, type ActionOverview, type ActionRow } from "./overview";
import { workPacksEnabled } from "./packs-flag";
import { buildPackOverview, isPackFinished, packActionsToDraft, STARTER_PACK, type StarterItemKey, type WorkPack } from "./packs-model";
import { isOfferTemplate, TEMPLATES } from "./templates";

const lt = (s: string) => ({ en: s, "zh-HK": s, "zh-TW": s });

function overview(
  id: string,
  templateKey: StarterItemKey,
  opts: {
    actionState?: ActionState;
    run?: RunState;
    version?: { approval: ApprovalState; delivery?: DeliveryState };
  } = {},
): ActionOverview {
  const row: ActionRow = {
    id,
    workspace_id: "ws",
    location_id: null,
    template_key: templateKey,
    source: "owner_objective",
    source_finding_keys: [],
    title: lt(templateKey),
    summary: lt("s"),
    evidence: { factType: "Recommended", source: "Visibility starter pack", value: "", detail: lt("d"), observedAt: "2026-10-01T00:00:00Z", freshness: lt("f") },
    priority: "medium",
    priority_score: 50,
    priority_factors: [],
    effort_minutes: 10,
    required_inputs: [],
    provided_inputs: {},
    assignee_user_id: null,
    due_at: null,
    action_state: opts.actionState ?? "recommended",
    measurement_state: "not_eligible",
    capability: "Live",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
  return buildActionOverview(row, {
    location: null,
    latestRun: opts.run ? { state: opts.run } : null,
    latestVersion: opts.version
      ? { id: `${id}-v1`, version_no: 1, approval_state: opts.version.approval, delivery_state: opts.version.delivery ?? "not_requested" }
      : null,
  });
}

const pack: WorkPack = {
  id: "pack-1",
  workspaceId: "ws",
  locationId: null,
  kind: "visibility_starter",
  createdAt: "2026-10-02T00:00:00Z",
  closedAt: null,
};

describe("STARTER_PACK", () => {
  it("is the fixed visibility starter: three agent-backed, non-offer templates in position order", () => {
    expect(STARTER_PACK.kind).toBe("visibility_starter");
    expect(STARTER_PACK.items).toEqual(["review-response", "visibility-content", "website-basics"]);
    for (const key of STARTER_PACK.items) {
      const template = TEMPLATES.find((t) => t.key === key);
      expect(template, key).toBeDefined();
      expect(template!.agentKey, key).not.toBeNull();
      expect(isOfferTemplate(template!), key).toBe(false);
    }
  });
});

describe("workPacksEnabled", () => {
  it("is on only for exactly \"true\"", () => {
    expect(workPacksEnabled({ WORK_PACKS_ENABLED: "true" })).toBe(true);
    for (const value of [undefined, "", "TRUE", "True", "1", "yes", " true", "true "]) {
      expect(workPacksEnabled({ WORK_PACKS_ENABLED: value }), String(value)).toBe(false);
    }
    expect(workPacksEnabled({})).toBe(false);
  });
});

describe("buildPackOverview", () => {
  it("counts each state from the item's ActionOverview and points nextToReview at the first draft", () => {
    // Given out of position order on purpose: the overview sorts by position.
    const result = buildPackOverview(pack, [
      { templateKey: "website-basics", position: 3, action: overview("a3", "website-basics", { actionState: "in_progress", run: "succeeded", version: { approval: "approved", delivery: "exported" } }) },
      { templateKey: "review-response", position: 1, action: overview("a1", "review-response", { actionState: "in_progress", run: "succeeded", version: { approval: "draft" } }) },
      { templateKey: "visibility-content", position: 2, action: overview("a2", "visibility-content", { actionState: "needs_input", run: "succeeded" }) },
    ]);
    expect(result.pack).toBe(pack);
    expect(result.items.map((i) => i.templateKey)).toEqual(["review-response", "visibility-content", "website-basics"]);
    expect(result.items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(result.counts).toEqual({ drafted: 2, needsInput: 1, approved: 1, exported: 1, failed: 0, finished: 0 });
    expect(result.nextToReview).toEqual({ actionId: "a1", templateKey: "review-response" });
    expect(result.finished).toBe(false);
  });

  it("counts a failed latest run, and nextToReview also takes changes_requested and skips approved or absent versions", () => {
    const result = buildPackOverview(pack, [
      { templateKey: "review-response", position: 1, action: overview("a1", "review-response", { run: "failed" }) },
      { templateKey: "visibility-content", position: 2, action: overview("a2", "visibility-content", { version: { approval: "approved", delivery: "export_ready" } }) },
      { templateKey: "website-basics", position: 3, action: overview("a3", "website-basics", { version: { approval: "changes_requested" } }) },
    ]);
    expect(result.counts).toEqual({ drafted: 2, needsInput: 0, approved: 1, exported: 0, failed: 1, finished: 0 });
    expect(result.nextToReview).toEqual({ actionId: "a3", templateKey: "website-basics" });
  });

  it("has no nextToReview when nothing is waiting for review", () => {
    const result = buildPackOverview(pack, [
      { templateKey: "review-response", position: 1, action: overview("a1", "review-response") },
      { templateKey: "visibility-content", position: 2, action: overview("a2", "visibility-content", { version: { approval: "rejected" } }) },
      { templateKey: "website-basics", position: 3, action: overview("a3", "website-basics", { version: { approval: "superseded" } }) },
    ]);
    expect(result.nextToReview).toBeNull();
    expect(result.counts.drafted).toBe(2);
  });

  it("is finished only when all three items are finished", () => {
    const items = (states: [ActionState, ActionState, ActionState]) =>
      STARTER_PACK.items.map((key, i) => ({
        templateKey: key,
        position: (i + 1) as 1 | 2 | 3,
        action: overview(`a${i + 1}`, key, { actionState: states[i] }),
      }));
    const two = buildPackOverview(pack, items(["completed", "dismissed", "in_progress"]));
    expect(two.finished).toBe(false);
    expect(two.counts.finished).toBe(2);
    const all = buildPackOverview(pack, items(["completed", "cancelled", "expired"]));
    expect(all.finished).toBe(true);
    expect(all.counts.finished).toBe(3);
  });
});

describe("isPackFinished", () => {
  it("is true only when every item's action is completed, dismissed, cancelled or expired", () => {
    expect(isPackFinished(["completed", "dismissed", "cancelled"])).toBe(true);
    expect(isPackFinished(["expired", "expired", "completed"])).toBe(true);
    for (const open of ["recommended", "needs_input", "ready", "in_progress"] as const) {
      expect(isPackFinished(["completed", "completed", open]), open).toBe(false);
    }
  });

  it("is false for a pack with no items", () => {
    expect(isPackFinished([])).toBe(false);
  });
});

describe("packActionsToDraft", () => {
  function packWith(specs: Array<Parameters<typeof overview>[2]>): ReturnType<typeof buildPackOverview> {
    return buildPackOverview(
      pack,
      STARTER_PACK.items.map((templateKey, index) => ({ templateKey, position: (index + 1) as 1 | 2 | 3, action: overview(`a${index + 1}`, templateKey, specs[index]) })),
    );
  }

  it("selects every item with no version, in position order", () => {
    expect(packActionsToDraft(packWith([{}, {}, {}]))).toEqual(["a1", "a2", "a3"]);
  });

  it("skips a finished action and any latest version that is a draft, awaiting changes or approved", () => {
    expect(packActionsToDraft(packWith([{ actionState: "completed" }, { version: { approval: "draft" } }, { version: { approval: "approved" } }]))).toEqual([]);
    expect(packActionsToDraft(packWith([{ version: { approval: "changes_requested" } }, {}, {}]))).toEqual(["a2", "a3"]);
  });

  it("still drafts an item whose latest version was rejected or superseded, and one that needs facts or failed", () => {
    expect(
      packActionsToDraft(packWith([{ version: { approval: "rejected" } }, { actionState: "needs_input", run: "succeeded" }, { run: "failed" }])),
    ).toEqual(["a1", "a2", "a3"]);
  });
});
