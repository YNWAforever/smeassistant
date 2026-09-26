// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two render harnesses live in this file, deliberately:
//   render()     -- renderToStaticMarkup, for asserting server-rendered markup.
//                   Cannot fire events.
//   mount()      -- @testing-library/react, for interaction tests that click.
// Extend the one that matches what you are asserting; reaching for render()
// and then wanting fireEvent is the mistake this note exists to prevent.
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render as renderLive, screen } from "@testing-library/react";

const clientMocks = vi.hoisted(() => ({ markApplied: vi.fn(), retractApplied: vi.fn(), runAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));

vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markApplied: clientMocks.markApplied,
  retractApplied: clientMocks.retractApplied,
  runAction: clientMocks.runAction,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));

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
    verified: false,
    verifiedOn: null,
    displayPhase: localized("Recommended", "建議"),
    displayPhaseKey: "recommended",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  };
}

function detail(templateKey: TemplateKey, measurements: ActionDetail["measurements"] = []): ActionDetail {
  return { action: overview(templateKey), versions: [], runs: [], measurements, scanInputs: [], businessContext: [], faqQuestions: [] };
}

function versionRow(overrides: Partial<ActionDetail["versions"][number]> & { id: string; version_no: number; approval_state: ActionDetail["versions"][number]["approval_state"] }): ActionDetail["versions"][number] {
  return {
    action_id: "act-1",
    body: "draft body",
    alt_text: null,
    author_type: "agent",
    author_user_id: null,
    delivery_state: "not_requested",
    approved_at: null,
    reviewer_comment: null,
    created_at: "2026-09-01T10:00:00Z",
    origin: "agent_run",
    agentKey: null,
    checked: false,
    guardrails: [],
    agentNotes: [],
    acceptanceCriteria: [],
    ...overrides,
  };
}

function render(templateKey: TemplateKey, measurements: ActionDetail["measurements"] = []) {
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
      detail={detail(templateKey, measurements)}
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
      value.versions = [versionRow({ id: "ver-1", version_no: 2, approval_state: "approved", delivery_state: "exported" })];
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
      value.versions = [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft" })];
    });
    fireEvent.click(markButton());
    expect(clientMocks.markApplied).toHaveBeenCalledWith("act-1", {});
  });

  it("names the latest approved version, not the latest version, when a newer draft exists", () => {
    // Owner approved v1 and published it, then generated a v2 draft that is
    // still unapproved. action.latestVersion (newest overall) would be the
    // draft; the assertion must still name v1, the version actually eligible
    // to be asserted about.
    mount(DRAFTED_KEY, (value) => {
      value.action.latestVersion = { id: "ver-2", versionNo: 2, approvalState: "draft", deliveryState: "not_requested" };
      value.versions = [
        versionRow({ id: "ver-2", version_no: 2, approval_state: "draft" }),
        versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", delivery_state: "exported" }),
      ];
    });
    fireEvent.click(markButton());
    expect(clientMocks.markApplied).toHaveBeenCalledWith("act-1", { output_version_id: "ver-1" });
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

describe("the independent verification line", () => {
  const CHECKLIST_KEY = CHECKLIST_TEMPLATES[0].key;

  function mount(templateKey: TemplateKey, mutate: (value: ActionDetail) => void = () => {}) {
    const value = detail(templateKey);
    mutate(value);
    renderLive(
      <ActionDetailClient
        locale="en"
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
  }
  afterEach(cleanup);

  it("renders the date, and the caveat that we checked the page not who changed it", () => {
    mount(CHECKLIST_KEY, (value) => {
      value.action.verified = true;
      value.action.verifiedOn = "2026-09-13T00:00:00.000Z";
    });
    expect(screen.getByText(/Verified on your site on 13 Sept 2026 · we checked the page, not who changed it/)).toBeInTheDocument();
    // Text only -- no control to retract a system-written check.
    expect(screen.queryByRole("button", { name: /verifi/i })).toBeNull();
  });

  it("does not render when verified is false", () => {
    mount(CHECKLIST_KEY, (value) => {
      value.action.verified = false;
      value.action.verifiedOn = null;
    });
    expect(screen.queryByText(/we checked the page, not who changed it/)).toBeNull();
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

describe("the Before and after measurement card", () => {
  // The shared fixture hard-codes measurements: [], so this Attributed
  // branch never rendered in any test before this. It is the honesty-critical
  // path: a NULL basis must read as "basis not recorded", never a guessed one.
  // Radix only mounts the active tab's content, so this needs the live
  // (@testing-library/react) harness with a click into the Evidence tab, not
  // the static-markup render() helper the other describe blocks use.
  const TEMPLATE_KEY = AGENT_TEMPLATES[0].key;
  const baseMeasurement = {
    id: "meas-1",
    action_id: "act-1",
    metric_key: "gbp.response_rate_pct",
    before_value: 18,
    after_value: 42,
    delta: 24,
    window_days: 30,
    created_at: "2026-09-10T00:00:00Z",
    location_id: "loc-1",
  };

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => cleanup());

  function mountOnEvidenceTab(measurements: ActionDetail["measurements"]) {
    const value = detail(TEMPLATE_KEY, measurements);
    renderLive(
      <ActionDetailClient
        locale="en"
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
    const evidenceTab = screen.getByRole("tab", { name: "Source evidence" });
    fireEvent.mouseDown(evidenceTab, { button: 0, ctrlKey: false });
  }

  it("renders 'basis not recorded' for a null attribution_basis and no other basis string", () => {
    mountOnEvidenceTab([{ ...baseMeasurement, fact_type: "Attributed", attribution_basis: null }]);
    expect(screen.getByText(/basis not recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/verified on site/)).toBeNull();
    expect(screen.queryByText(/you reported applying this/)).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/·\s*exported\b/);
  });

  it("renders the recorded basis for a non-null attribution_basis", () => {
    mountOnEvidenceTab([{ ...baseMeasurement, fact_type: "Attributed", attribution_basis: "verified" }]);
    expect(screen.getByText(/verified on site/)).toBeInTheDocument();
    expect(screen.queryByText(/basis not recorded/)).toBeNull();
  });
});

describe("the AI drafting limit", () => {
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset().mockResolvedValue({ ok: false, status: 429, error: "ai_budget_reached" });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "Generate a draft"],
    ["zh-HK", "生成草稿"],
    ["zh-TW", "生成草稿"],
  ] as const)("says in %s that today's drafting limit was reached", async (locale, label) => {
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={detail(DRAFTED_KEY)}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
    });
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1", {});
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).budget.aiLimit);
  });
});

describe("the fallback failure toast", () => {
  // P3.5b Task 12: an owner must never see a raw provider/internal error code
  // in front of them. A failure that isn't offline/network, a budget refusal,
  // 403, 429 or agent_unavailable falls through to the generic branch, which
  // used to interpolate the raw code straight into the toast.
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset().mockResolvedValue({ ok: false, status: 500, error: "weird_internal_code" });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "Generate a draft", "The request failed. Try again, or contact Fimmick if it keeps happening."],
    ["zh-HK", "生成草稿", "操作失敗，請再試一次；如持續出現，請聯絡 Fimmick。"],
  ] as const)("in %s shows a friendly message with no raw error code", async (locale, label, expected) => {
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={detail(DRAFTED_KEY)}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
    });
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1", {});
    expect(toastMocks.error).toHaveBeenCalledWith(expected);
    expect(JSON.stringify(vi.mocked(toastMocks.error).mock.calls)).not.toContain("weird_internal_code");
  });
});

describe("failed assistant drafts in the run history", () => {
  // recordAssistantDraftFailure stores a reason code in action_runs.error;
  // the workflow tab must show owners a label, never the code.
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;
  const LABELS = {
    en: { facts_needed: "Needed more facts", invalid_output: "Draft could not be read", no_model_output: "AI drafting unavailable", tab: "Workflow states" },
    "zh-HK": { facts_needed: "需要更多資料", invalid_output: "未能讀取草稿", no_model_output: "AI 草稿生成暫時未能使用", tab: "流程狀態" },
    "zh-TW": { facts_needed: "需要更多資訊", invalid_output: "無法讀取草稿", no_model_output: "AI 草稿生成目前無法使用", tab: "流程狀態" },
  } as const;
  const CODES = ["facts_needed", "invalid_output", "no_model_output"] as const;

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });
  afterEach(cleanup);

  it.each(Object.keys(LABELS) as Array<keyof typeof LABELS>)("labels every reason code in %s and leaves other errors as they are", (locale) => {
    const value = detail(DRAFTED_KEY);
    value.runs = [
      ...CODES.map((code, i) => ({ id: `run-${code}`, action_id: "act-1", agent_key: "faq_jsonld", state: "failed" as const, error: code, created_at: `2026-09-0${3 - i}T10:00:00Z`, finished_at: null })),
      { id: "run-task", action_id: "act-1", agent_key: "faq_jsonld", state: "failed", error: "The model timed out.", created_at: "2026-08-30T10:00:00Z", finished_at: null },
    ];
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="kam-man-house"
        workspaceId="ws-1"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Yik Yam" }]}
        approvedAssets={[]}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: LABELS[locale].tab }), { button: 0, ctrlKey: false });
    const text = document.body.textContent ?? "";
    for (const code of CODES) {
      expect(text).toContain(LABELS[locale][code]);
      expect(text).not.toContain(code);
    }
    expect(text).toContain("The model timed out.");
  });
});
