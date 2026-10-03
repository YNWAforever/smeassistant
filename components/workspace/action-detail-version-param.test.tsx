// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/actions/act-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { ActionDetailClient } from "@/components/workspace/action-detail-client";
import { localized } from "@/lib/domain";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { ActionDetail } from "@/lib/workspace/queries-pages";
import { TEMPLATES } from "@/lib/workspace/templates";

const TEMPLATE = TEMPLATES.find((t) => t.agentKey !== null)!;

function overview(): ActionOverview {
  return {
    id: "act-1",
    templateKey: TEMPLATE.key,
    capability: TEMPLATE.capability,
    delivery: TEMPLATE.delivery,
    location: { id: "loc-1", slug: "yik-yam", name: localized("Yik Yam", "益欣") },
    title: localized("Action title", "行動標題"),
    summary: localized("Action summary", "行動摘要"),
    evidence: { factType: "Observed", source: "Google Business Profile", value: "18%", detail: localized("Fell", "跌"), observedAt: "2026-09-01T10:00:00Z", freshness: localized("Fresh", "新") },
    priority: "high",
    priorityFactors: [],
    effortMinutes: TEMPLATE.effortMinutes,
    requiredInputs: TEMPLATE.requiredInputs,
    missingInputs: [],
    blockingInputs: [],
    actionState: "recommended",
    runState: "queued",
    approvalState: "draft",
    deliveryState: "not_requested",
    measurementState: "not_eligible",
    applied: false,
    appliedOn: null,
    verified: false,
    verifiedOn: null,
    displayPhase: localized("Recommended", "建議"),
    displayPhaseKey: "recommended",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  };
}

function versionRow(id: string, versionNo: number, body: string): ActionDetail["versions"][number] {
  return {
    id, version_no: versionNo, approval_state: "draft", action_id: "act-1", body, alt_text: null, author_type: "agent", author_user_id: null,
    delivery_state: "not_requested", approved_at: null, reviewer_comment: null, created_at: "2026-09-01T10:00:00Z", origin: "agent_run", agentKey: null,
    checked: false, guardrails: [], agentNotes: [], acceptanceCriteria: [], offerRevision: null,
  };
}

// Newest first, as the page loads them.
const VERSIONS = [versionRow("ver-2", 2, "second body"), versionRow("ver-1", 1, "first body")];

function mount(opts: { initialVersionId?: string | null; missingInputs?: string[] } = {}) {
  const value: ActionDetail = { action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] };
  if (opts.missingInputs) {
    value.action.actionState = "needs_input";
    value.action.missingInputs = opts.missingInputs;
  }
  return render(
    <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId={opts.initialVersionId} />,
  );
}

const draft = () => (document.querySelector("#draft-content") as HTMLTextAreaElement).value;

beforeEach(() => {
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("the action page's version landing (P4.3)", () => {
  it("selects the version named by initialVersionId and loads its body", () => {
    mount({ initialVersionId: "ver-1" });
    expect(draft()).toBe("first body");
  });

  it("selects the newest version when no version is named", () => {
    mount();
    expect(draft()).toBe("second body");
    cleanup();
    mount({ initialVersionId: null });
    expect(draft()).toBe("second body");
  });

  it("falls back to the newest version for an unknown id", () => {
    mount({ initialVersionId: "ver-nope" });
    expect(draft()).toBe("second body");
  });

  it("keeps the named version when the page re-renders with the same versions", () => {
    const view = mount({ initialVersionId: "ver-1" });
    view.rerender(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={{ action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] }} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId="ver-1" />,
    );
    expect(draft()).toBe("first body");
  });

  function rerenderWith(view: ReturnType<typeof mount>, initialVersionId: string | null) {
    view.rerender(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={{ action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] }} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId={initialVersionId} />,
    );
  }

  it("selects another version when ?version= changes on the mounted page", () => {
    const view = mount();
    expect(draft()).toBe("second body");
    rerenderWith(view, "ver-1");
    expect(draft()).toBe("first body");
    rerenderWith(view, "ver-2");
    expect(draft()).toBe("second body");
  });

  it("changes nothing when the new ?version= is unknown or cleared", () => {
    const view = mount({ initialVersionId: "ver-1" });
    rerenderWith(view, "ver-nope");
    expect(draft()).toBe("first body");
    rerenderWith(view, null);
    expect(draft()).toBe("first body");
  });

  it("puts the inputs anchor on the input form when it shows", () => {
    mount({ missingInputs: ["brand_voice"] });
    const form = document.querySelector("form.input-form");
    expect(form).not.toBeNull();
    expect(document.querySelector("#inputs")).toBe(form);
  });

  it("has no inputs anchor when no input is needed", () => {
    mount();
    expect(document.querySelector("#inputs")).toBeNull();
  });
});
