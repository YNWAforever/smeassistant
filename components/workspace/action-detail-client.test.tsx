// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/actions/act-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { ActionDetailClient } from "@/components/workspace/action-detail-client";
import { copy } from "@/lib/copy";
import { localized } from "@/lib/domain";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { ActionDetail } from "@/lib/workspace/queries-pages";
import { TEMPLATES, templateByKey, type TemplateKey } from "@/lib/workspace/templates";

const CHECKLIST_TEMPLATES = TEMPLATES.filter((t) => t.delivery === "checklist");
const AGENT_TEMPLATES = TEMPLATES.filter((t) => t.agentKey !== null);

function overview(templateKey: TemplateKey): ActionOverview {
  const template = templateByKey(templateKey);
  return {
    id: "act-1",
    templateKey,
    capability: template.capability,
    delivery: template.delivery,
    location: { id: "loc-1", slug: "yik-yam", name: localized("Yik Yam", "益欣") },
    title: localized("Action title", "行動標題"),
    summary: localized("Action summary", "行動摘要"),
    evidence: {
      factType: "Observed",
      source: "Google Business Profile",
      value: "18%",
      detail: localized("Response rate fell to 18%", "回覆率降至 18%"),
      observedAt: "2026-09-01T10:00:00Z",
      freshness: localized("Updated 2 days ago", "2 日前更新"),
    },
    priority: "high",
    priorityFactors: [],
    effortMinutes: template.effortMinutes,
    requiredInputs: template.requiredInputs,
    missingInputs: [],
    actionState: "recommended",
    runState: "queued",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    displayPhase: localized("Recommended", "建議"),
    displayPhaseKey: "recommended",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  };
}

function detail(templateKey: TemplateKey): ActionDetail {
  return { action: overview(templateKey), versions: [], runs: [], measurements: [], scanInputs: [] };
}

function render(templateKey: TemplateKey) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <ActionDetailClient
      locale="en"
      workspaceSlug="kam-man-house"
      workspaceId="ws-1"
      timezone="Asia/Hong_Kong"
      role="owner"
      inScope
      location="yik-yam"
      detail={detail(templateKey)}
      auditRows={[]}
      locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
      approvedAssets={[]}
    />,
  );
  return root;
}

const checklistCopy = copy.en.workspace.checklist;

describe("checklist templates have a completion path", () => {
  // The defect: an agent-less template rendered exactly like an agent one, so
  // the only primary control was "Generate a draft" -> 409 agent_unavailable.
  // Guards the condition over the registry, not the two instances.
  it.each(CHECKLIST_TEMPLATES.map((t) => [t.key] as const))("%s offers steps instead of Generate", (key) => {
    const text = render(key).textContent ?? "";
    const steps = copy.en.workspace.checklistSteps[key];
    expect(steps, `no checklist copy for ${key}`).toBeTruthy();
    for (const step of steps!.steps) expect(text).toContain(step);
    expect(text).toContain(checklistCopy.markDone);
    expect(text).not.toContain("Generate a draft");
    expect(text).not.toContain("Regenerate with the agent as a new version");
    expect(text).not.toContain("Save manual edits as a new version");
  });

  it.each(CHECKLIST_TEMPLATES.map((t) => [t.key] as const))("%s promises no approval or export", (key) => {
    const text = render(key).textContent ?? "";
    expect(text).toContain("There is no version to approve or export");
    expect(text).not.toContain("Approve version");
  });

  it("says completion is the owner's own confirmation, not an observation", () => {
    const text = render(CHECKLIST_TEMPLATES[0].key).textContent ?? "";
    expect(text).toContain(checklistCopy.note);
    expect(checklistCopy.note).toContain("the next scan is what checks the result");
  });
});

describe("agent-backed templates keep the draft workflow", () => {
  it.each(AGENT_TEMPLATES.map((t) => [t.key] as const))("%s still offers Generate", (key) => {
    const text = render(key).textContent ?? "";
    expect(text).toContain("Generate a draft");
    expect(text).not.toContain(checklistCopy.markDone);
  });
});
