// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const messages = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/en/owner/kam-man-house/actions/act-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: messages }));

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
    delivery_state: "not_requested", approved_at: null, reviewer_comment: null, created_at: "2026-09-01T10:00:00Z", first_exported_at: null, origin: "agent_run", agentKey: null,
    checked: false, guardrails: [], agentNotes: [], acceptanceCriteria: [], offerRevision: null,
  };
}

// Newest first, as the page loads them.
const VERSIONS = [versionRow("ver-2", 2, "second body"), versionRow("ver-1", 1, "first body")];

function mount(opts: { initialVersionId?: string | null; missingInputs?: string[]; locale?: "en" | "zh-HK" } = {}) {
  const value: ActionDetail = { action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] };
  if (opts.missingInputs) {
    value.action.actionState = "needs_input";
    value.action.missingInputs = opts.missingInputs;
  }
  return render(
    <ActionDetailClient locale={opts.locale ?? "en"} workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId={opts.initialVersionId} />,
  );
}

const draft = () => (document.querySelector("#draft-content") as HTMLTextAreaElement).value;
const requests = vi.fn();

beforeEach(() => {
  requests.mockClear();
  vi.stubGlobal("fetch", requests);
  router.replace.mockClear();
  messages.error.mockClear();
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  expect(requests).not.toHaveBeenCalled();
  cleanup();
  vi.unstubAllGlobals();
});

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

  for (const locale of ["en", "zh-HK"] as const) {
    it.each(["ver-nope", ""])("%s fails closed without mounting another version on first load (" + locale + ")", initialVersionId => {
      mount({ initialVersionId, locale });
      expect(screen.getByRole("alert")).toHaveTextContent(locale === "en" ? "This saved version is unavailable" : "無法讀取指定的已儲存版本");
      expect(document.querySelector("#draft-content")).toBeNull();
      expect(screen.getByRole("link")).toHaveAttribute("href", `/${locale}/owner/kam-man-house?location=yik-yam`);
      expect(screen.queryByRole("button", { name: /Approve|核准/ })).toBeNull();
    });
  }

  it("keeps the named version when the page re-renders with the same versions", () => {
    const view = mount({ initialVersionId: "ver-1" });
    view.rerender(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={{ action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] }} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId="ver-1" />,
    );
    expect(draft()).toBe("first body");
  });

  function rerenderWith(view: ReturnType<typeof mount>, initialVersionId: string | null, workspaceId = "ws-1") {
    view.rerender(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId={workspaceId} timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={{ action: overview(), offerId: null, versions: VERSIONS, runs: [], measurements: [], scanInputs: [], businessContext: [], faqQuestions: [] }} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} initialVersionId={initialVersionId} />,
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

  it("blocks an unknown parameter and restores the selected version when the parameter is cleared", () => {
    const view = mount({ initialVersionId: "ver-1" });
    rerenderWith(view, "ver-nope");
    expect(screen.getByRole("alert")).toHaveTextContent("This saved version is unavailable");
    expect(screen.queryByRole("textbox", { name: /^Draft$/ })).toBeNull();
    rerenderWith(view, null);
    expect(draft()).toBe("first body");
  });

  it("retains unsaved edits when an unknown parameter is followed by the original valid version", () => {
    const view = mount({ initialVersionId: "ver-1" });
    fireEvent.change(document.querySelector("#draft-content")!, { target: { value: "Unsaved owner text" } });
    rerenderWith(view, "ver-nope");
    expect(screen.queryByRole("textbox", { name: /^Draft$/ })).toBeNull();
    rerenderWith(view, "ver-1");
    expect(draft()).toBe("Unsaved owner text");
  });

  it("offers same-page recovery instead of a home link while a previous editor may contain unsaved input", () => {
    const view = mount({ initialVersionId: "ver-1" });
    fireEvent.change(document.querySelector("#draft-content")!, { target: { value: "Unsaved owner text" } });
    rerenderWith(view, "ver-nope");
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("[data-retained-action-editor]")).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Return to the previous view" }));
    expect(router.replace).toHaveBeenCalledWith("/en/owner/kam-man-house/actions/act-1?version=ver-1&location=yik-yam");
    rerenderWith(view, "ver-1");
    expect(draft()).toBe("Unsaved owner text");
  });

  it("still refuses switching to another valid version while the current draft is dirty", () => {
    const view = mount({ initialVersionId: "ver-1" });
    fireEvent.change(document.querySelector("#draft-content")!, { target: { value: "Unsaved owner text" } });
    rerenderWith(view, "ver-2");
    expect(draft()).toBe("Unsaved owner text");
    expect(messages.error).toHaveBeenCalledOnce();
  });

  it("never restores a previous workspace's unsaved editor through an invalid parameter", () => {
    const view = mount({ initialVersionId: "ver-1" });
    fireEvent.change(document.querySelector("#draft-content")!, { target: { value: "Workspace A private draft" } });
    rerenderWith(view, "ver-nope", "ws-other");
    expect(document.querySelector("#draft-content")).toBeNull();
    rerenderWith(view, null, "ws-other");
    expect(draft()).toBe("second body");
  });

  it("puts the inputs anchor on the input form when it shows", () => {
    mount({ missingInputs: ["brand_voice"] });
    fireEvent.click(screen.getByRole("button", { name: "Change the draft" }));
    const form = document.querySelector("form.input-form");
    expect(form).not.toBeNull();
    expect(document.querySelector("#inputs")).toBe(form);
  });

  it("has no inputs anchor when no input is needed", () => {
    mount();
    expect(document.querySelector("#inputs")).toBeNull();
  });
});
