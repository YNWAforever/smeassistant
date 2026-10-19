// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OwnerReviewCheckPanel, type OwnerReviewCheckPanelProps } from "./owner-review-check-panel";
const id = (n: number) => `${n}`.repeat(8) + "-1111-4111-8111-111111111111";
const props = (): OwnerReviewCheckPanelProps => ({
  locale: "en", workspaceId: id(1), actionId: id(2), version: { id: id(3), version_no: 2, body: "Thank you for your review." },
  latestVersionId: id(3), identity: "Synthetic merchant · Central branch", timezone: "Asia/Hong_Kong",
  context: { records: [], appliedVersionIds: [id(3)] }, approvedAssets: [],
  mapsUrl: null, canEdit: true, offline: false, dirty: false, onSaved: vi.fn(), onReload: vi.fn(),
});
const receipt = () => ({ id: "6", versionId: id(3), decision: "checked", reviewReference: "Customer A · date · helpful",
  note: "Matched reply", evidenceAssetId: null, evidenceLabel: null, previousId: null, recordedAt: "2026-10-19T02:00:00Z", independent: false });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fillEnglish() {
  fireEvent.change(screen.getByLabelText("Review reference"), { target: { value: "Customer A · date · helpful" } });
  fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Matched reply" } });
  for (const text of ["Business and branch match", "I found and matched the specified review", "The reply matches this saved version"]) {
    fireEvent.click(screen.getByRole("checkbox", { name: text }));
  }
}
describe("owner review check offline UI", () => {
  it.each(["en", "zh-HK"] as const)("%s explains manual location and keeps independent verification separate", locale => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(<OwnerReviewCheckPanel {...props()} locale={locale} mapsUrl="https://www.google.com/maps/place/Synthetic" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://www.google.com/maps/place/Synthetic");
    expect(screen.getByText(locale === "en" ? /No exact review link/ : /沒有精確評論連結/)).toBeVisible();
    expect(screen.getByText(locale === "en" ? /This is your statement/ : /這是你的聲明/)).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("only saves a check; double-clicks do not generate, approve, export, copy or change 2/3 usage", async () => {
    let complete!: (r: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal("fetch", fetch);
    render(<><p>Usage 2/3</p><OwnerReviewCheckPanel {...props()} /></>);
    fillEnglish();
    const save = screen.getByRole("button", { name: "Save check" });
    await act(async () => { fireEvent.click(save); fireEvent.click(save); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`/api/actions/${id(2)}/owner-check`);
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    await act(async () => complete(new Response(JSON.stringify({ record: receipt(), duplicate: false }), { status: 201 })));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByText("Usage 2/3")).toBeVisible();
    expect(screen.getByTestId("current-owner-check")).toHaveTextContent("Owner checked · statement only");
    expect(screen.getByRole("button", { name: "Save check" })).toBeDisabled();
  });
  it("retains input after a save failure and retries with the same request identity", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"error":"unavailable"}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ record: receipt(), duplicate: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<OwnerReviewCheckPanel {...props()} />);
    fillEnglish();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    expect(screen.getByRole("alert")).toHaveTextContent(/not saved.*retry/i);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Matched reply");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    const bodies = fetch.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies[1].requestId).toBe(bodies[0].requestId);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
  it("keeps input on stale-tab conflict and requires an explicit reload", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"stale_check"}', { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const value = props(); render(<OwnerReviewCheckPanel {...value} />);
    fillEnglish();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    expect(screen.getByRole("alert")).toHaveTextContent(/another tab|newer version/i);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Matched reply");
    expect(value.onReload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved records" }));
    expect(value.onReload).toHaveBeenCalledOnce();
  });
  it("restores saved history after a remount but never applies version 2's check to version 3", () => {
    const value = props();
    value.context.records = [receipt() as NonNullable<typeof value.context>["records"][number]];
    const mounted = render(<OwnerReviewCheckPanel {...value} />);
    expect(screen.getByTestId("current-owner-check")).toHaveTextContent("Owner checked · statement only");
    mounted.unmount();
    const fresh = render(<OwnerReviewCheckPanel {...value} />);
    fireEvent.click(screen.getByText("Owner check history (recent records and each version's latest check)"));
    expect(screen.getByText("Matched reply")).toBeVisible();
    fresh.rerender(<OwnerReviewCheckPanel {...value} version={{ id: id(7), version_no: 3, body: "New draft" }} latestVersionId={id(7)} />);
    expect(screen.getByText(/No owner check for this version/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save check" })).toBeDisabled();
  });
  it("refuses viewer/offline/unsaved states without requests", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const blocked of [{ canEdit: false }, { offline: true }, { dirty: true }]) {
      const mounted = render(<OwnerReviewCheckPanel {...props()} {...blocked} />);
      expect(screen.getByRole("button", { name: "Save check" })).toBeDisabled();
      mounted.unmount();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not carry unsaved notes into another workspace", () => {
    const mounted = render(<OwnerReviewCheckPanel {...props()} />);
    fillEnglish();
    mounted.rerender(<OwnerReviewCheckPanel {...props()} workspaceId={id(8)} actionId={id(9)} />);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
  });
  it("can withdraw the check history after the original applied mark was withdrawn", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ record: { ...receipt(), id: "7", decision: "retracted", previousId: "6" }, duplicate: false }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const value = props();
    value.context = { records: [receipt() as typeof value.context.records[number]], appliedVersionIds: [] };
    render(<OwnerReviewCheckPanel {...value} />);
    fireEvent.change(screen.getByLabelText("Check result"), { target: { value: "retracted" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Withdraw the old check" } });
    expect(screen.getByRole("button", { name: "Save check" })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    expect(screen.getByTestId("current-owner-check")).toHaveTextContent("Owner check withdrawn");
  });
  it.each(["not_found", "later"] as const)("saves %s without requiring a positive confirmation", async decision => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ record: { ...receipt(), decision }, duplicate: false }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    render(<OwnerReviewCheckPanel {...props()} />);
    fireEvent.change(screen.getByLabelText("Check result"), { target: { value: decision } });
    if (decision === "not_found") fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Could not find the specified review" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("current-owner-check")).toHaveTextContent(decision === "not_found" ? "Not found / content differs" : "Check deferred");
  });
  it("ignores a late response after changing workspace instead of refreshing the new workspace", async () => {
    let complete!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => { complete = resolve; })));
    const value = props();
    const mounted = render(<OwnerReviewCheckPanel {...value} />);
    fillEnglish();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save check" })));
    mounted.rerender(<OwnerReviewCheckPanel {...props()} workspaceId={id(8)} actionId={id(9)} />);
    await act(async () => complete(new Response(JSON.stringify({ record: receipt(), duplicate: false }), { status: 201 })));
    expect(value.onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
  });
});
