// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two render harnesses live in this file, deliberately:
//   render()     -- renderToStaticMarkup, for asserting server-rendered markup.
//                   Cannot fire events.
//   mount()      -- @testing-library/react, for interaction tests that click.
// Extend the one that matches what you are asserting; reaching for render()
// and then wanting fireEvent is the mistake this note exists to prevent.
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ markApplied: vi.fn(), retractApplied: vi.fn() }));

vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markApplied: clientMocks.markApplied,
  retractApplied: clientMocks.retractApplied,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/actions/act-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { ActionDetailClient } from "@/components/workspace/action-detail-client";
import { copy } from "@/lib/copy";
import { getMessages } from "@/lib/i18n";
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
    applied: false,
    appliedOn: null,
    displayPhase: localized("Recommended", "建議"),
    displayPhaseKey: "recommended",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  };
}

function detail(templateKey: TemplateKey): ActionDetail {
  return { action: overview(templateKey), versions: [], runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] };
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
const appliedCopy = getMessages("en").applied;

describe("checklist templates have a completion path", () => {
  // The defect: an agent-less template rendered exactly like an agent one, so
  // the only primary control was "Generate a draft" -> 409 agent_unavailable.
  // Guards the condition over the registry, not the two instances.
  it.each(CHECKLIST_TEMPLATES.map((t) => [t.key] as const))("%s offers steps instead of Generate", (key) => {
    const text = render(key).textContent ?? "";
    const steps = copy.en.workspace.checklistSteps[key];
    expect(steps, `no checklist copy for ${key}`).toBeTruthy();
    for (const step of steps!.steps) expect(text).toContain(step);
    expect(text).toContain(appliedCopy.markButton);
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

describe("the owner's applied assertion", () => {
  const CHECKLIST_KEY = CHECKLIST_TEMPLATES[0].key;
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;

  beforeEach(() => {
    // jsdom has no matchMedia; the assistant sheet's useIsMobile calls it on mount.
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.markApplied.mockReset().mockResolvedValue({ ok: true, data: { applicationId: "app-1" } });
    clientMocks.retractApplied.mockReset().mockResolvedValue({ ok: true, data: { retracted: 1 } });
  });
  afterEach(cleanup);

  function mount(templateKey: TemplateKey, mutate: (value: ActionDetail) => void = () => {}, role: "owner" | "viewer" = "owner") {
    const value = detail(templateKey);
    mutate(value);
    renderLive(
      <ActionDetailClient
        locale="en"
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role={role}
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
  }

  const markButton = () => screen.getByRole("button", { name: new RegExp(appliedCopy.markButton, "i") });

  it("calls the applied endpoint instead of patching action_state", () => {
    mount(CHECKLIST_KEY);
    fireEvent.click(markButton());
    // A checklist action has no version to name, so the body is empty.
    expect(clientMocks.markApplied).toHaveBeenCalledWith("act-1", {});
  });

  it("names the approved version a drafted action published", () => {
    mount(DRAFTED_KEY, (value) => {
      value.action.latestVersion = { id: "ver-1", versionNo: 2, approvalState: "approved", deliveryState: "exported" };
    });
    fireEvent.click(markButton());
    expect(clientMocks.markApplied).toHaveBeenCalledWith("act-1", { output_version_id: "ver-1" });
  });

  it("never names an unapproved version", () => {
    // The route answers 409 version_not_applicable for one, so sending it
    // would fail a legitimate assertion: the owner applied something, we just
    // cannot say which approved draft it was.
    mount(DRAFTED_KEY, (value) => {
      value.action.latestVersion = { id: "ver-1", versionNo: 1, approvalState: "draft", deliveryState: "not_requested" };
    });
    fireEvent.click(markButton());
    expect(clientMocks.markApplied).toHaveBeenCalledWith("act-1", {});
  });

  it("shows the date and says nothing verified it, with a way back", () => {
    mount(CHECKLIST_KEY, (value) => {
      value.action.applied = true;
      value.action.appliedOn = "2026-09-13T00:00:00.000Z";
    });
    // appliedOn is a pinned UTC ISO string from the repository; the component
    // formats it with the same helper every other date on this page uses.
    expect(screen.getByText(/You marked this applied on 13 Sept 2026 · not independently verified/)).toBeInTheDocument();
    expect(screen.getByText(appliedCopy.retractHint)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(appliedCopy.markButton, "i") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(appliedCopy.retract, "i") }));
    expect(clientMocks.retractApplied).toHaveBeenCalledWith("act-1");
  });

  it("hides the control from viewers", () => {
    mount(CHECKLIST_KEY, () => {}, "viewer");
    expect(screen.queryByRole("button", { name: new RegExp(appliedCopy.markButton, "i") })).toBeNull();
  });
});

describe("agent-backed templates keep the draft workflow", () => {
  it.each(AGENT_TEMPLATES.map((t) => [t.key] as const))("%s still offers Generate", (key) => {
    const text = render(key).textContent ?? "";
    expect(text).toContain("Generate a draft");
    // The assertion control is now offered here too: a drafted action is
    // applied by publishing its approved version, which the product has no
    // way to observe until the next comparable scan.
    expect(text).toContain(appliedCopy.markButton);
  });
});
