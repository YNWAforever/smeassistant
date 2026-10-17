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

const clientMocks = vi.hoisted(() => ({ markApplied: vi.fn(), retractApplied: vi.fn(), runAction: vi.fn(), approveVersion: vi.fn(), exportVersion: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));

vi.mock("@/lib/workspace/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  markApplied: clientMocks.markApplied,
  retractApplied: clientMocks.retractApplied,
  runAction: clientMocks.runAction,
  approveVersion: clientMocks.approveVersion,
  exportVersion: clientMocks.exportVersion,
}));
vi.mock("sonner", () => ({ toast: toastMocks }));
const downloadMocks = vi.hoisted(() => ({ copyToClipboard: vi.fn(async () => true), downloadText: vi.fn() }));
vi.mock("@/lib/download", () => downloadMocks);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house/actions/act-1",
  useSearchParams: () => new URLSearchParams(),
}));

import { ActionDetailClient, ownerInputPatch, type OfferCardData } from "@/components/workspace/action-detail-client";
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

function detail(templateKey: TemplateKey, measurements: ActionDetail["measurements"] = []): ActionDetail {
  return { action: overview(templateKey), offerId: null, versions: [], runs: [], measurements, scanInputs: [], businessContext: [], faqQuestions: [] };
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
    first_exported_at: null,
    origin: "agent_run",
    agentKey: null,
    checked: false,
    guardrails: [],
    agentNotes: [],
    acceptanceCriteria: [],
    offerRevision: null,
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

describe("focused draft review", () => {
  it("keeps the lifecycle available on demand without putting it ahead of the editor", () => {
    const root = render("review-response");
    const disclosure = root.querySelector(".provenance-chain")?.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.hasAttribute("open")).toBe(false);
    expect(root.querySelector(".draft-editor-card")?.closest("details")).toBeNull();
  });
});

describe("scanned review choices", () => {
  afterEach(cleanup);

  it("labels rating-only review choices with their star ratings", () => {
    const value = detail("review-response");
    value.scanInputs = [{
      key: "reviews_without_response", source: "gbp_reviews", factType: "Observed",
      snapshotId: "snapshot-1", jobId: "job-1", observedAt: "2026-10-15T00:00:00Z",
      reviews: [
        { key: "five", rating: 5, excerpt: "", time: null },
        { key: "one", rating: 1, excerpt: "", time: null },
      ],
      selected: ["five"], available: 2, inspected: 2, populationCount: 2,
    }];
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
    expect(screen.getByRole("checkbox", { name: `${copy.en.workspace.scanInputs.include}: ★ 5` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: `${copy.en.workspace.scanInputs.include}: ★ 1` })).not.toBeChecked();
  });
});

describe("assistant revisions preserve unsaved edits", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    fetchSpy.mockReset().mockRejectedValue(new Error("Unexpected request in a UI-only test"));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    { locale: "en" as const, field: "body" as const },
    { locale: "zh-HK" as const, field: "body" as const },
    { locale: "zh-TW" as const, field: "body" as const },
    { locale: "en" as const, field: "alt_text" as const },
  ])("requires saving or undoing $field edits before assistant revision in $locale", ({ locale, field }) => {
    const value = detail("review-response");
    value.versions = [versionRow({
      id: "saved-version", version_no: 3, approval_state: "draft",
      body: "Saved example reply", alt_text: "Saved example description",
    })];
    const chinese = locale !== "en";
    const message = locale === "zh-TW" ? "請先將手動修改儲存為新版本，再產生內容。"
      : chinese ? "請先將手動修改儲存為新版本，再生成內容。"
      : "Save manual edits as a new version before generating more content.";
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="example-business"
        workspaceId="example-workspace"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Example location" }]}
        approvedAssets={[]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: chinese ? "用助理修改並建立新版本" : "Revise with operator as a new version",
    });
    const regenerate = screen.getByRole("button", {
      name: chinese ? "以 Agent 重新生成為新版本" : "Regenerate with the agent as a new version",
    });
    const editor = screen.getByLabelText(field === "body" ? (chinese ? "草稿" : "Draft") : "Image alt text");
    const savedValue = field === "body" ? "Saved example reply" : "Saved example description";
    expect(trigger).toBeEnabled();
    expect(regenerate).toBeEnabled();

    fireEvent.change(editor, { target: { value: "Unsaved local edit" } });
    expect(trigger).toBeDisabled();
    expect(regenerate).toBeDisabled();
    expect(editor).toHaveValue("Unsaved local edit");
    expect(screen.getByRole("button", {
      name: chinese ? "儲存手動修改為新版本" : "Save manual edits as a new version",
    })).toBeEnabled();
    expect(screen.getByText(message)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(editor, { target: { value: savedValue } });
    expect(trigger).toBeEnabled();
    expect(regenerate).toBeEnabled();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});

describe("all generation paths preserve unsaved edits", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset();
    toastMocks.error.mockReset();
    fetchSpy.mockReset().mockRejectedValue(new Error("Unexpected request"));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  function draft() {
    const value = detail("review-response");
    value.versions = [versionRow({ id: "saved-version", version_no: 3, approval_state: "draft", body: "Saved reply", alt_text: "Saved description" })];
    return value;
  }
  function element(value: ActionDetail) {
    return <ActionDetailClient locale="en" workspaceSlug="example-business" workspaceId="example-workspace"
      timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]}
      locations={[{ slug: "yik-yam", name: "Example location" }]} approvedAssets={[]} />;
  }
  function withReviews(value: ActionDetail) {
    value.scanInputs = [{
      key: "reviews_without_response", source: "gbp_reviews", factType: "Observed",
      snapshotId: "snapshot-1", jobId: "job-1", observedAt: "2026-10-15T00:00:00Z",
      reviews: [{ key: "review-1", rating: 5, excerpt: "Fixture review", time: null }],
      selected: ["review-1"], available: 1, inspected: 1, populationCount: 1,
    }];
    return value;
  }

  it("refuses dirty required-input submission before saving facts or generating", async () => {
    const value = draft();
    value.action.actionState = "needs_input";
    value.action.missingInputs = ["language"];
    renderLive(element(value));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved reply" } });
    fireEvent.change(screen.getByLabelText(copy.en.workspace.inputs.language), { target: { value: "en" } });
    const submit = screen.getByRole("button", { name: "Save inputs and generate" });
    expect(submit).toBeDisabled();
    // Enter submits the form without relying on the disabled button.
    await act(async () => { fireEvent.submit(screen.getByRole("form", { name: "Required inputs" })); });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clientMocks.runAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved reply");
  });

  it("refuses dirty owner-review-note generation before saving the note", async () => {
    renderLive(element(withReviews(draft())));
    fireEvent.click(screen.getByText(copy.en.workspace.scanInputs.addOwn));
    const note = document.querySelector<HTMLTextAreaElement>("#input-owner-review")!;
    fireEvent.change(note, { target: { value: "Additional owner-supplied review" } });
    fireEvent.change(screen.getByLabelText("Image alt text"), { target: { value: "Unsaved description" } });
    const generate = screen.getByRole("button", { name: copy.en.workspace.scanInputs.addOwnSubmit });
    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(clientMocks.runAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Image alt text")).toHaveValue("Unsaved description");
  });

  it.each(["regenerate", "manual save"] as const)("keeps the editor locked after %s succeeds until its saved version arrives", async (kind) => {
    const value = draft();
    const view = renderLive(element(value));
    clientMocks.runAction.mockResolvedValue({ ok: true, data: { state: "succeeded", versionId: "new-version", versionNo: 4 } });
    fetchSpy.mockResolvedValue(Response.json({ versionId: "new-version", versionNo: 4 }));
    if (kind === "manual save") fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Manually saved reply" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: kind === "manual save" ? "Save manual edits as a new version" : "Regenerate with the agent as a new version" }));
    });
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    expect(screen.getByLabelText("Image alt text")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload saved version" })).toBeEnabled();
    const refreshed = { ...value, versions: [
      versionRow({ id: "new-version", version_no: 4, approval_state: "draft", body: kind === "manual save" ? "Manually saved reply" : "Generated reply" }),
      ...value.versions,
    ] };
    view.rerender(element(refreshed));
    expect(screen.getByLabelText("Draft")).toBeEnabled();
    expect(screen.getByLabelText("Draft")).toHaveValue(kind === "manual save" ? "Manually saved reply" : "Generated reply");
    expect(screen.queryByRole("button", { name: "Reload saved version" })).not.toBeInTheDocument();
  });

  it("unlocks when refreshed versions arrive before the save response", async () => {
    let finish!: (response: Response) => void;
    fetchSpy.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const value = draft();
    const view = renderLive(element(value));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Manually saved reply" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save manual edits as a new version" })); });
    view.rerender(element({ ...value, versions: [
      versionRow({ id: "new-version", version_no: 4, approval_state: "draft", body: "Manually saved reply" }),
      ...value.versions,
    ] }));
    await act(async () => { finish(Response.json({ versionId: "new-version", versionNo: 4 })); });
    expect(screen.getByLabelText("Draft")).toBeEnabled();
    expect(screen.getByLabelText("Draft")).toHaveValue("Manually saved reply");
    expect(screen.queryByRole("button", { name: "Reload saved version" })).not.toBeInTheDocument();
  });

  it("shows the latest saved text for comparison and rebases only after an explicit choice", async () => {
    const value = draft();
    const view = renderLive(element(value));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "My local changes" } });
    fetchSpy.mockResolvedValue(Response.json({ error: "version_conflict" }, { status: 409 }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save manual edits as a new version" })); });
    fireEvent.click(screen.getByRole("button", { name: "Load latest safely" }));
    view.rerender(element({ ...value, versions: [
      versionRow({ id: "newer-version", version_no: 4, approval_state: "draft", body: "Another reviewer's saved changes" }),
      ...value.versions,
    ] }));
    expect(screen.getByLabelText("Draft")).toHaveValue("My local changes");
    expect(screen.getByLabelText("Latest saved draft for comparison")).toHaveValue("Another reviewer's saved changes");
    expect(screen.getByRole("button", { name: "Approve Version 3" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my edits over Version 4" }));
    expect(screen.getByLabelText("Draft")).toHaveValue("My local changes");
    fetchSpy.mockResolvedValue(Response.json({ versionId: "merged-version", versionNo: 5 }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save manual edits as a new version" })); });
    const writes = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/versions"));
    expect(JSON.parse(String(writes.at(-1)?.[1]?.body))).toMatchObject({ body: "My local changes", base_version_id: "newer-version" });
  });

  it("drops a previous workspace's unsaved editor when soft navigation reuses the page", () => {
    const view = renderLive(element(draft()));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Private unsaved workspace A text" } });
    const other = draft();
    other.action = { ...other.action, id: "action-b" };
    other.versions = [];
    view.rerender(<ActionDetailClient locale="en" workspaceSlug="other-business" workspaceId="workspace-b"
      timezone="Asia/Hong_Kong" role="owner" inScope location="other" detail={other} auditRows={[]}
      locations={[{ slug: "other", name: "Other location" }]} approvedAssets={[]} />);
    expect(screen.getByLabelText("Draft")).toHaveValue("");
    expect(screen.queryByDisplayValue("Private unsaved workspace A text")).toBeNull();
  });

  it("requires reading current run status after a lost generation response before another model request", async () => {
    renderLive(element(draft()));
    clientMocks.runAction.mockResolvedValue({ ok: false, status: 0, error: "network" });
    const generate = screen.getByRole("button", { name: "Regenerate with the agent as a new version" });
    await act(async () => { fireEvent.click(generate); });
    expect(generate).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload draft and run status" })).toBeEnabled();
    fireEvent.click(generate);
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1);
  });

  it("clears a fulfilled facts request after a definitive generation failure so retry does not ask again", async () => {
    const value = draft();
    value.versions = [];
    const view = renderLive(element(value));
    clientMocks.runAction
      .mockResolvedValueOnce({ ok: true, data: { runId: "missing-run", state: "succeeded", factsNeeded: ["reviews_without_response"] } })
      .mockResolvedValueOnce({ ok: true, data: { runId: "failed-run", state: "failed", error: "unconfirmed_business_fact" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Generate a draft$/ })); });
    const input = document.querySelector<HTMLTextAreaElement>("#input-reviews_without_response")!;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "A review supplied by the owner" } });
    fetchSpy.mockResolvedValue(Response.json({ action: value.action }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save inputs and generate" })); });
    // The server has stored the input even though the provider could not
    // supply a safe draft. The old local request must not outlive that read.
    view.rerender(element({ ...value, action: { ...value.action, actionState: "needs_input", missingInputs: [] } }));
    expect(document.querySelector("#input-reviews_without_response")).toBeNull();
    expect(screen.getByRole("button", { name: /^Generate a draft$/ })).toBeEnabled();
    expect(clientMocks.runAction).toHaveBeenCalledTimes(2);
  });

  it("clears an old conflict after the server confirms an explicitly regenerated version", async () => {
    const value = draft();
    const view = renderLive(element(value));
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "An abandoned local edit" } });
    fetchSpy.mockResolvedValue(Response.json({ error: "version_conflict" }, { status: 409 }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save manual edits as a new version" })); });
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Saved reply" } });
    clientMocks.runAction.mockResolvedValue({ ok: true, data: { state: "succeeded", versionId: "regenerated-version", versionNo: 5 } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Regenerate with the agent as a new version" })); });
    view.rerender(element({ ...value, versions: [
      versionRow({ id: "regenerated-version", version_no: 5, approval_state: "draft", body: "A fresh server-confirmed reply" }),
      ...value.versions,
    ] }));
    expect(screen.getByLabelText("Draft")).toHaveValue("A fresh server-confirmed reply");
    expect(screen.queryByText("Another reviewer changed this output")).toBeNull();
    expect(screen.getByRole("button", { name: /^Approve Version 5$/ })).toBeEnabled();
  });

  it.each(["required inputs", "owner review note"] as const)("still generates from clean %s", async (kind) => {
    const value = draft();
    if (kind === "required inputs") {
      value.action.actionState = "needs_input";
      value.action.missingInputs = ["language"];
    } else withReviews(value);
    renderLive(element(value));
    fetchSpy.mockResolvedValue(Response.json({ ok: true }));
    clientMocks.runAction.mockResolvedValue({ ok: true, data: { state: "succeeded", versionId: "new-version", versionNo: 4 } });
    if (kind === "required inputs") {
      fireEvent.change(screen.getByLabelText(copy.en.workspace.inputs.language), { target: { value: "en" } });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save inputs and generate" })); });
    } else {
      fireEvent.click(screen.getByText(copy.en.workspace.scanInputs.addOwn));
      fireEvent.change(document.querySelector<HTMLTextAreaElement>("#input-owner-review")!, { target: { value: "Additional review" } });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: copy.en.workspace.scanInputs.addOwnSubmit })); });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clientMocks.runAction).toHaveBeenCalledWith("act-1", { inputs: kind === "required inputs" ? { language: "en" } : { reviews_without_response: "Additional review" } });
    expect(screen.getByLabelText("Draft")).toBeDisabled();
  });

  it.each([false, true])("assistant version saving respects current dirty state (%s)", async (makeDirty) => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/assistant/suggestions")) return Response.json({ suggestions: [] });
      if (url === "/api/assistant/run") return Response.json({
        runId: "assistant-run", draftRunId: "persisted-assistant-draft", state: "needs_approval",
        answer: "Revised reply preview", nextAction: "Review the preview", evidenceRefs: [], warnings: [],
        requiresApproval: true, demoBoundary: "Nothing is published",
        output: { artifactId: "artifact-1", type: "review_reply", title: "Reply", body: "Revised reply", version: 1, acceptanceCriteria: [] },
      });
      return Response.json({ versionId: "assistant-version", versionNo: 4 });
    });
    renderLive(element(draft()));
    const editor = screen.getByLabelText("Draft");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Revise with operator as a new version" })); });
    const warmer = await screen.findByRole("button", { name: "Make it warmer without overpromising" });
    await act(async () => { fireEvent.click(warmer); });
    const createName = "Create a new version without overwriting";
    expect(screen.getByRole("button", { name: createName })).toBeInTheDocument();
    if (makeDirty) {
      // Models an editor update while a previously opened assistant is still
      // holding its preview. A disabled launcher alone cannot secure the save.
      fireEvent.change(editor, { target: { value: "Unsaved reply" } });
      expect(screen.queryByRole("button", { name: createName })).not.toBeInTheDocument();
      expect(editor).toHaveValue("Unsaved reply");
      expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/versions"))).toHaveLength(0);
    } else {
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: createName })); });
      const saves = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/versions"));
      expect(saves).toHaveLength(1);
      expect(JSON.parse(String(saves[0][1]?.body))).toEqual({
        assistant_run_id: "persisted-assistant-draft", base_version_id: "saved-version",
      });
      expect(editor).toBeDisabled();
    }
  });
});

describe("version history preserves unsaved edits", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    toastMocks.error.mockReset();
    fetchSpy.mockReset().mockRejectedValue(new Error("Unexpected request in a UI-only test"));
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function mountHistory(locale: "en" | "zh-HK" | "zh-TW" = "en") {
    const value = detail("review-response");
    value.versions = [
      versionRow({ id: "current-version", version_no: 3, approval_state: "draft", body: "Current reply", alt_text: "Current description" }),
      versionRow({ id: "earlier-version", version_no: 2, approval_state: "superseded", body: "Earlier reply", alt_text: "Earlier description" }),
    ];
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="example-business"
        workspaceId="example-workspace"
        timezone="Asia/Hong_Kong"
        role="owner"
        inScope
        location="yik-yam"
        detail={value}
        auditRows={[]}
        locations={[{ slug: "yik-yam", name: "Example location" }]}
        approvedAssets={[]}
      />,
    );
  }

  it.each([
    { locale: "en" as const, field: "body" as const },
    { locale: "zh-HK" as const, field: "body" as const },
    { locale: "zh-TW" as const, field: "body" as const },
    { locale: "en" as const, field: "alt_text" as const },
  ])("keeps $field edits when another version is selected in $locale, then allows a clean switch", ({ locale, field }) => {
    mountHistory(locale);
    const chinese = locale !== "en";
    const editorLabel = field === "body" ? (chinese ? "草稿" : "Draft") : "Image alt text";
    const historyTab = () => screen.getByRole("tab", { name: chinese ? /版本/ : /Version & audit history/ });
    const draftTab = () => screen.getByRole("tab", { name: chinese ? /草稿/ : /Draft & approval/ });
    fireEvent.change(screen.getByLabelText(editorLabel), { target: { value: "Unsaved local edit" } });
    fireEvent.mouseDown(historyTab(), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: chinese ? /^第 2 版/ : /^Version 2/ }));
    fireEvent.mouseDown(draftTab(), { button: 0 });

    expect(screen.getByLabelText(editorLabel)).toHaveValue("Unsaved local edit");
    expect(toastMocks.error).toHaveBeenCalledWith(chinese
      ? "請先將手動修改儲存為新版本，再切換版本。"
      : "Save manual edits as a new version before switching versions.");
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(editorLabel), {
      target: { value: field === "body" ? "Current reply" : "Current description" },
    });
    fireEvent.mouseDown(historyTab(), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: chinese ? /^第 2 版/ : /^Version 2/ }));
    fireEvent.mouseDown(draftTab(), { button: 0 });
    expect(screen.getByLabelText(chinese ? "草稿" : "Draft")).toHaveValue("Earlier reply");
    expect(screen.getByLabelText(chinese ? "圖片替代文字" : "Image alt text")).toHaveValue("Earlier description");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not reset local edits when the already selected version is clicked", () => {
    mountHistory();
    fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved local edit" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Version & audit history/ }), { button: 0 });
    fireEvent.click(screen.getByRole("button", { name: /^Version 3/ }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Draft & approval/ }), { button: 0 });
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved local edit");
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

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

describe("AI drafting paused for maintenance (P3.5d)", () => {
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;

  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset().mockResolvedValue({ ok: false, status: 503, error: "ai_paused" });
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "Generate a draft"],
    ["zh-HK", "生成草稿"],
    ["zh-TW", "生成草稿"],
  ] as const)("says in %s that AI drafting is paused", async (locale, label) => {
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
    expect(toastMocks.error).toHaveBeenCalledWith(getMessages(locale).pause.ai);
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

describe("provider limits while generating a draft", () => {
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    clientMocks.runAction.mockReset().mockResolvedValue({ ok: true, data: { state: "failed", error: "provider_rate_limited" } });
    clientMocks.approveVersion.mockReset();
    clientMocks.exportVersion.mockReset();
    toastMocks.error.mockReset();
  });
  afterEach(cleanup);

  it.each([
    ["en", "Regenerate with the agent as a new version", /limit/i, /manually/i],
    ["zh-HK", "以 Agent 重新生成為新版本", /用量|請求/, /手動/],
    ["zh-TW", "以 Agent 重新生成為新版本", /用量|請求/, /手動/],
  ] as const)("in %s explains the provider limit and preserves the draft without delivering it", async (locale, generateLabel, limitLabel, manualLabel) => {
    const value = detail("review-request");
    value.versions = [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", author_type: "user", body: "[TEST DRAFT - DO NOT SEND] Existing owner draft" })];
    renderLive(
      <ActionDetailClient
        locale={locale}
        workspaceSlug="eldage"
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: generateLabel }));
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(limitLabel);
    expect(alert.textContent).toMatch(manualLabel);
    expect(document.body.textContent).not.toContain("provider_rate_limited");
    expect((screen.getByDisplayValue("[TEST DRAFT - DO NOT SEND] Existing owner draft") as HTMLTextAreaElement).value).toBe("[TEST DRAFT - DO NOT SEND] Existing owner draft");
    expect(clientMocks.runAction).toHaveBeenCalledTimes(1);
    expect(clientMocks.approveVersion).not.toHaveBeenCalled();
    expect(clientMocks.exportVersion).not.toHaveBeenCalled();
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

describe("the brand guardrail panel names the P4.4 shared checks", () => {
  // Before: unexpected_link / unconfirmed_claim were agentNotes, so the panel
  // said "checked, nothing was flagged" and then printed the raw English code,
  // in every locale.
  const EXPECTED = {
    en: ["Contains a link you did not supply — check it before approving.", "Mentions a price or superlative that is not in your confirmed facts — check it before approving.", "2 flagged"],
    "zh-HK": ["含有你沒有提供的連結，審批前請先檢查。", "提及你未確認的價錢或誇大字眼，審批前請先檢查。", "2 項違規"],
    "zh-TW": ["包含你沒有提供的連結，核准前請先確認。", "提到你未確認的價格或誇大用語，核准前請先確認。", "2 項違規"],
  } as const;

  it.each(Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>)("renders both codes as guardrail findings in %s", (locale) => {
    const value = detail(AGENT_TEMPLATES[0].key);
    value.versions = [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", checked: true, guardrails: [{ code: "unexpected_link" }, { code: "unconfirmed_claim" }] })];
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
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
    const text = root.textContent ?? "";
    for (const expected of EXPECTED[locale]) expect(text).toContain(expected);
    expect(text).not.toContain("unexpected_link");
    expect(text).not.toContain("unconfirmed_claim");
    expect(text).not.toContain("nothing was flagged");
    expect(text).not.toContain("未發現違規");
  });
});

describe("ownerInputPatch", () => {
  it("persists text_only: true next to the text-only marker so later runs and assistant drafts are not blocked", () => {
    expect(ownerInputPatch(["asset_or_text_only"], { asset_or_text_only: "text_only" })).toEqual({
      provided: { asset_or_text_only: "text_only", text_only: true },
      runInputs: {},
    });
  });

  it("keeps an asset choice as the asset id, never as text_only", () => {
    expect(ownerInputPatch(["asset_or_text_only", "alt_text"], { asset_or_text_only: "asset-9", alt_text: " A plate " })).toEqual({
      provided: { asset_or_text_only: "asset", asset_id: "asset-9", alt_text: "A plate" },
      runInputs: { asset_id: "asset-9" },
    });
  });
});

describe("offer promotion actions (P4.1)", () => {
  const OFFER_KEY = "offer-instagram-post" as TemplateKey;
  const offerCopy = copy.en.workspace.offers;
  const offer: OfferCardData = { title: "Autumn set menu", priceText: "HK$1,280", validFrom: "2026-10-01", validUntil: "2026-10-31", revision: 2, status: "confirmed", expired: false };

  function mountOffer(props: { offer?: typeof offer | null; latestVersionOfferRevision?: number | null; versions?: ActionDetail["versions"]; locale?: "en" | "zh-HK" | "zh-TW"; initialVersionId?: string }) {
    const value = detail(OFFER_KEY);
    value.offerId = "offer-1";
    value.versions = props.versions ?? [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 1 })];
    renderLive(
      <ActionDetailClient
        locale={props.locale ?? "en"}
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
        offer={props.offer === undefined ? offer : props.offer}
        latestVersionOfferRevision={props.latestVersionOfferRevision === undefined ? 1 : props.latestVersionOfferRevision}
        offersEnabled
        initialVersionId={props.initialVersionId ?? null}
      />,
    );
  }
  beforeEach(() => { clientMocks.approveVersion.mockReset(); toastMocks.error.mockReset(); });
  afterEach(cleanup);

  it("shows the offer card beside the evidence: title, price, validity and revision", () => {
    mountOffer({ latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
    const card = screen.getByTestId("offer-card");
    expect(card).toHaveTextContent("Autumn set menu");
    expect(card).toHaveTextContent("HK$1,280");
    expect(card).toHaveTextContent("1 Oct 2026 to 31 Oct 2026");
    expect(card).toHaveTextContent("Revision2");
  });

  it("shows the stale banner when the latest version recorded an older revision than the offer's", () => {
    mountOffer({ latestVersionOfferRevision: 1 });
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_changed);
  });

  it("shows no banner when the draft was written from the current revision", () => {
    mountOffer({ latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
    expect(screen.queryByTestId("offer-stale-banner")).toBeNull();
  });

  it("shows no banner before any draft exists", () => {
    mountOffer({ latestVersionOfferRevision: null, versions: [] });
    expect(screen.queryByTestId("offer-stale-banner")).toBeNull();
  });

  it("says the offer has ended, or is not confirmed, in plain words", () => {
    mountOffer({ offer: { ...offer, expired: true }, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_expired);
    cleanup();
    mountOffer({ offer: { ...offer, status: "archived" }, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_inactive);
  });

  it.each([
    ["changed", { latestVersionOfferRevision: 1 }],
    ["ended", { offer: { ...offer, expired: true }, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] }],
    ["inactive", { offer: { ...offer, status: "archived" as const }, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] }],
  ] satisfies Array<[string, Parameters<typeof mountOffer>[0]]>)("disables every Approve control while the stale-offer banner shows (%s)", (_kind, props) => {
    mountOffer(props);
    expect(screen.getByTestId("offer-stale-banner")).toBeInTheDocument();
    const approves = screen.getAllByRole("button", { name: /^Approve/ });
    expect(approves.length).toBeGreaterThan(0);
    for (const button of approves) expect(button).toBeDisabled();
  });

  it("disables Export and Copy for an approved version once its offer has ended", () => {
    mountOffer({ offer: { ...offer, expired: true }, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", offerRevision: 2 })] });
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_expired);
    for (const name of [/^Export/, /^Copy text/]) {
      const buttons = screen.getAllByRole("button", { name });
      for (const button of buttons) expect(button).toBeDisabled();
    }
  });

  it("judges an older approved version by its own recorded revision, not the latest draft's", () => {
    // v1 was approved from revision 1; the offer moved to revision 2 and v2 was drafted from it.
    // The server refuses to export v1 (offer_changed), so selecting it from history must not enable delivery.
    mountOffer({
      latestVersionOfferRevision: 2,
      versions: [
        versionRow({ id: "ver-2", version_no: 2, approval_state: "draft", offerRevision: 2 }),
        versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", offerRevision: 1 }),
      ],
      initialVersionId: "ver-1",
    });
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_changed);
    for (const name of [/^Export/, /^Copy text/]) {
      for (const button of screen.getAllByRole("button", { name })) expect(button).toBeDisabled();
    }
  });

  it("keeps Export enabled for an approved version of a current, confirmed offer", () => {
    mountOffer({ latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", offerRevision: 2 })] });
    expect(screen.queryByTestId("offer-stale-banner")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Export/ }).some((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("maps an approve answering 409 offer_changed to the owner copy, never the code", async () => {
    clientMocks.approveVersion.mockResolvedValue({ ok: false, status: 409, error: "offer_changed" });
    mountOffer({ latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve" })); });
    expect(clientMocks.approveVersion).toHaveBeenCalledWith("ver-1", undefined);
    expect(toastMocks.error).toHaveBeenCalledWith(offerCopy.stale.offer_changed);
    expect(screen.getByTestId("offer-stale-banner")).toHaveTextContent(offerCopy.stale.offer_changed);
    expect(document.body.textContent ?? "").not.toContain("offer_changed");
  });

  it.each(["offer_expired", "offer_inactive"] as const)("maps 409 %s in every locale", async (code) => {
    for (const locale of ["en", "zh-HK", "zh-TW"] as const) {
      clientMocks.approveVersion.mockResolvedValue({ ok: false, status: 409, error: code });
      toastMocks.error.mockReset();
      mountOffer({ locale, latestVersionOfferRevision: 2, versions: [versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 })] });
      const approve = locale === "en" ? "Approve" : "核准";
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: approve })); });
      expect(toastMocks.error).toHaveBeenCalledWith(copy[locale].workspace.offers.stale[code]);
      expect(document.body.textContent ?? "").not.toContain(code);
      cleanup();
    }
  });

  it("drops a refusal banner once a new draft exists, so it never outlives the state it described", async () => {
    clientMocks.approveVersion.mockResolvedValue({ ok: false, status: 409, error: "offer_changed" });
    const current = (versions: ActionDetail["versions"], revision: number | null) => {
      const value = detail(OFFER_KEY);
      value.offerId = "offer-1";
      value.versions = versions;
      return (
        <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} offer={offer} latestVersionOfferRevision={revision} />
      );
    };
    const v1 = versionRow({ id: "ver-1", version_no: 1, approval_state: "draft", offerRevision: 2 });
    const view = renderLive(current([v1], 2));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve" })); });
    expect(screen.getByTestId("offer-stale-banner")).toBeInTheDocument();
    // A new draft is generated from the current offer: the page re-renders with it.
    view.rerender(current([versionRow({ id: "ver-2", version_no: 2, approval_state: "draft", offerRevision: 2 }), v1], 2));
    expect(screen.queryByTestId("offer-stale-banner")).toBeNull();
  });

  it("never offers an input for offer_id, even when the run reports it as missing", () => {
    const value = detail(OFFER_KEY);
    value.offerId = "offer-1";
    value.action.actionState = "needs_input";
    value.action.missingInputs = ["offer_id", "brand_voice"];
    renderLive(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} offer={offer} latestVersionOfferRevision={null} />,
    );
    expect(document.querySelector("#input-offer_id")).toBeNull();
    expect(document.querySelector("#input-brand_voice")).not.toBeNull();
    expect(screen.queryByLabelText(copy.en.workspace.inputs.offer_id)).toBeNull();
  });

  it("renders no offer card or banner for an ordinary action", () => {
    const value = detail(AGENT_TEMPLATES[0].key);
    renderLive(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} />,
    );
    expect(screen.queryByTestId("offer-card")).toBeNull();
    expect(screen.queryByTestId("offer-stale-banner")).toBeNull();
  });
});

describe("export step and button read first_exported_at, not delivery_state (P4.6)", () => {
  const KEY = AGENT_TEMPLATES[0].key;

  function renderVersion(version: Partial<ActionDetail["versions"][number]>) {
    const value = detail(KEY);
    value.versions = [versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", approved_at: "2026-10-04T01:00:00Z", ...version })];
    value.action.latestVersion = { id: "ver-1", versionNo: 1, approvalState: "approved", deliveryState: value.versions[0].delivery_state };
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam" detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} />,
    );
    return root.textContent ?? "";
  }

  it("exported then published: the export stays recorded and the button offers a repeat export", () => {
    const text = renderVersion({ delivery_state: "published", first_exported_at: "2026-10-04T02:00:00Z" });
    expect(text).toContain("Export recorded");
    expect(text).toContain("Export again (not counted twice)");
  });

  it("exporting a published version reads as exported", () => {
    // export_output_version keeps delivery_state 'published' and only sets first_exported_at.
    const text = renderVersion({ delivery_state: "published", first_exported_at: "2026-10-04T03:00:00Z" });
    expect(text).toContain("Export recorded");
  });

  it("published but never exported: the export step is still pending", () => {
    const text = renderVersion({ delivery_state: "published", first_exported_at: null });
    expect(text).not.toContain("Export recorded");
    expect(text).not.toContain("Export again (not counted twice)");
  });

  it("a deleted Google reply on an exported version still shows the export", () => {
    const text = renderVersion({ delivery_state: "exported", first_exported_at: "2026-10-04T02:00:00Z" });
    expect(text).toContain("Export recorded");
    expect(text).toContain("Export again (not counted twice)");
  });
});

describe("copying an approved version", () => {
  const DRAFTED_KEY = AGENT_TEMPLATES[0].key;
  beforeEach(() => {
    if (!window.matchMedia)
      window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
    clientMocks.exportVersion.mockReset();
    downloadMocks.copyToClipboard.mockReset();
  });
  afterEach(cleanup);

  function mountApproved() {
    const value = detail(DRAFTED_KEY);
    value.action.latestVersion = { id: "ver-1", versionNo: 1, approvalState: "approved", deliveryState: "exported" };
    value.versions = [versionRow({ id: "ver-1", version_no: 1, approval_state: "approved", delivery_state: "exported" })];
    renderLive(
      <ActionDetailClient locale="en" workspaceSlug="kam-man-house" workspaceId="ws-1" timezone="Asia/Hong_Kong" role="owner" inScope location="yik-yam"
        detail={value} auditRows={[]} locations={[{ slug: "yik-yam", name: "Yik Yam" }]} approvedAssets={[]} />,
    );
  }

  it("does not claim the text was copied when the clipboard refused it", async () => {
    downloadMocks.copyToClipboard.mockResolvedValue(false);
    clientMocks.exportVersion.mockResolvedValue({ ok: true, data: { counted: false } });
    mountApproved();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Copy text/ })[0]); });
    expect(toastMocks.error).toHaveBeenCalledWith("Clipboard unavailable; copy the text manually.");
    expect(JSON.stringify(toastMocks.success.mock.calls)).not.toContain("Approved text copied");
  });

  it("still confirms a successful repeat copy", async () => {
    downloadMocks.copyToClipboard.mockResolvedValue(true);
    clientMocks.exportVersion.mockResolvedValue({ ok: true, data: { counted: false } });
    mountApproved();
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /^Copy text/ })[0]); });
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(toastMocks.success).toHaveBeenCalledWith(expect.stringContaining("Approved text copied"));
  });
});
