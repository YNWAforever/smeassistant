// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { BrandSettingsForm } from "./brand-client";
import { BrandView } from "./brand-view";
import type { BrandProfile } from "@/lib/workspace/brand";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const REVISION = "22222222-2222-4222-8222-222222222222";
const NEXT_REVISION = "33333333-3333-4333-8333-333333333333";
const fetchMock = vi.fn<typeof fetch>();
const profile = (patch: Partial<BrandProfile> = {}): BrandProfile => ({
  workspaceId: WORKSPACE, voice: "direct", voiceConfigured: true,
  approvedClaims: ["Established 1998"], prohibitedTerms: ["Guaranteed"],
  languages: ["en"], facts: { hours: "11-22" },
  updatedAt: "2026-10-15T12:00:00Z", revisionId: REVISION, ...patch,
});
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
const mount = (brand = profile(), actorId = "owner-a") => render(
  <BrandSettingsForm locale="en" workspaceId={brand.workspaceId} actorId={actorId} brand={brand} readOnly={false} />,
);
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save current profile" }));
function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Brand settings reliability", () => {
  it("retains every input after a failed PUT and gives a focused retry that preserves the CAS", async () => {
    fetchMock.mockResolvedValueOnce(response(503, { error: "unavailable" }))
      .mockResolvedValueOnce(response(200, { brand: profile({ revisionId: NEXT_REVISION }) }));
    mount();
    fireEvent.change(screen.getByLabelText("Approved claims (one per line)"), { target: { value: "Draft claim" } });
    fireEvent.change(screen.getByLabelText("Prohibited terms (one per line)"), { target: { value: "No promises" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "12-23" } });
    save();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("Draft claim");
    expect(screen.getByLabelText("Prohibited terms (one per line)")).toHaveValue("No promises");
    expect(screen.getByLabelText("Value")).toHaveValue("12-23");
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toHaveTextContent("Short and direct");
    expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
    expect(mocks.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      voice: "direct", approved_claims: ["Draft claim"], prohibited_terms: ["No promises"],
      languages: ["en"], facts: { hours: "12-23" }, expectedRevisionId: REVISION,
    });
  });

  it.each([null, {}, { brand: {} }, { brand: profile({ workspaceId: "other-workspace" }) },
    { brand: profile({ revisionId: null }) }, { brand: profile({ voice: "unrecognised" as BrandProfile["voice"] }) },
    { brand: profile({ revisionId: NEXT_REVISION, voiceConfigured: false }) },
    { brand: profile({ revisionId: NEXT_REVISION, facts: { seats: 42 } as unknown as BrandProfile["facts"] }) },
  ])("rejects malformed or wrong-workspace success %j without refreshing or discarding inputs", async (body) => {
    fetchMock.mockResolvedValue(response(200, body));
    mount();
    fireEvent.change(screen.getByLabelText("Approved claims (one per line)"), { target: { value: "Still a draft" } });
    save();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("Still a draft");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry save" })).toBeEnabled();
  });

  it("rejects a success that repeats the original revision instead of confirming a new save", async () => {
    fetchMock.mockResolvedValue(response(200, { brand: profile() }));
    mount();
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be verified/i);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(["account", "workspace", "permission"] as const)("resets the draft and pending state on a %s switch and fences the old response", async (switchKind) => {
    const pending = pendingResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const view = mount();
    fireEvent.change(screen.getByLabelText("Approved claims (one per line)"), { target: { value: "Owner A secret draft" } });
    save();
    const nextBrand = profile({ workspaceId: switchKind === "workspace" ? "workspace-b" : WORKSPACE, voice: "professional", approvedClaims: ["Owner B claim"] });
    view.rerender(<BrandSettingsForm locale="en" workspaceId={nextBrand.workspaceId}
      actorId={switchKind === "account" ? "owner-b" : "owner-a"} brand={nextBrand} readOnly={switchKind === "permission"} />);
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("Owner B claim");
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toHaveTextContent("Clear and professional");
    if (switchKind !== "permission") expect(screen.getByRole("button", { name: "Save current profile" })).toBeEnabled();
    await act(async () => pending.resolve(response(200, { brand: profile({ revisionId: NEXT_REVISION }) })));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("Owner B claim");
  });

  it("fences an old failure after an account switch while the new owner's save is pending", async () => {
    const oldRequest = pendingResponse();
    const newRequest = pendingResponse();
    fetchMock.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const view = mount();
    save();
    view.rerender(<BrandSettingsForm locale="en" workspaceId={WORKSPACE} actorId="owner-b" brand={profile()} readOnly={false} />);
    save();
    await act(async () => oldRequest.resolve(response(503, { error: "unavailable" })));
    expect(screen.getByRole("button", { name: "Save current profile" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.error).not.toHaveBeenCalled();
    await act(async () => newRequest.resolve(response(200, { brand: profile({ revisionId: NEXT_REVISION }) })));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save current profile" })).toBeEnabled();
  });

  it("retains a stale draft and requires explicit review and replacement before another save", async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: "brand_revision_conflict" }))
      .mockResolvedValueOnce(response(200, { brand: profile({ voice: "professional", approvedClaims: ["Latest claim"], revisionId: NEXT_REVISION }) }))
      .mockResolvedValueOnce(response(200, { brand: profile({ voice: "professional", approvedClaims: ["Latest claim"], revisionId: "44444444-4444-4444-8444-444444444444" }) }));
    mount();
    fireEvent.change(screen.getByLabelText("Approved claims (one per line)"), { target: { value: "My stale draft" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/another save/i);
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("My stale draft");
    expect(screen.getByRole("button", { name: "Save current profile" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Review latest profile" }));
    expect(await screen.findByRole("region", { name: "Latest saved profile" })).toHaveTextContent("Latest claim");
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("My stale draft");
    fireEvent.click(screen.getByRole("button", { name: "Use latest profile and replace my draft" }));
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("Latest claim");
    save();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).expectedRevisionId).toBe(NEXT_REVISION);
  });

  it("shows a missing persisted voice as unset and refuses a save until a valid explicit selection", async () => {
    mount(profile({ voiceConfigured: false }));
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toHaveTextContent("Choose a voice");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a voice");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toHaveAttribute("aria-invalid", "true");
  });

  it("saves an explicit valid choice from an unset profile through the real PUT helper", async () => {
    fetchMock.mockResolvedValue(response(200, { brand: profile({ voice: "professional", revisionId: NEXT_REVISION }) }));
    mount(profile({ voiceConfigured: false }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Choose voice" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Clear and professional" }));
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toHaveTextContent("Clear and professional");
    save();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/workspaces/${WORKSPACE}/brand`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ voice: "professional", expectedRevisionId: REVISION, facts: { hours: "11-22" } });
  });

  it("does not submit twice while the first save is pending", async () => {
    const pending = pendingResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const view = mount();
    const form = view.container.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response(200, { brand: profile({ revisionId: NEXT_REVISION }) })));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the draft intact when loading the latest conflict version fails", async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: "brand_revision_conflict" }))
      .mockResolvedValueOnce(response(200, { brand: profile({ workspaceId: "different-workspace" }) }));
    mount();
    fireEvent.change(screen.getByLabelText("Approved claims (one per line)"), { target: { value: "My retained edits" } });
    save();
    fireEvent.click(await screen.findByRole("button", { name: "Review latest profile" }));
    expect(await screen.findByText(/latest profile could not be loaded/i)).toBeVisible();
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveValue("My retained edits");
    expect(screen.getByRole("button", { name: "Save current profile" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Latest saved profile" })).not.toBeInTheDocument();
  });

  it("explains viewer access and exposes no save control", () => {
    render(<BrandView locale="en" workspaceId={WORKSPACE} actorId="viewer-a" brand={profile()} role="viewer" />);
    expect(screen.getByText(/only the owner can save/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save current profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose voice" })).toBeDisabled();
    expect(screen.getByLabelText("Approved claims (one per line)")).toHaveAttribute("readonly");
  });
});
