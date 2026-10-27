// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CopyFollowUpCard } from "./copy-follow-up-card";
const calls = vi.hoisted(() => ({ markApplied: vi.fn(), recordCopyFollowUp: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/workspace/client", async original => ({ ...(await original<Record<string, unknown>>()), markApplied: calls.markApplied, recordCopyFollowUp: calls.recordCopyFollowUp }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const followUp = { id: "41", workspaceId: "workspace", actionId: "action", locationId: "location", versionId: "copied-v2", versionNo: 2, title: { en: "Copied reply", "zh-HK": "回覆", "zh-TW": "回覆" }, canRecord: true };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("one copy question", () => {
  it("records Posted against the copied immutable version, independent of any newer draft", async () => {
    calls.markApplied.mockResolvedValue({ ok: true, data: { applicationId: "1" } });
    render(<CopyFollowUpCard followUp={followUp} locale="zh-HK" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "貼咗" })));
    expect(calls.markApplied).toHaveBeenCalledWith("action", { output_version_id: "copied-v2" });
    expect(calls.recordCopyFollowUp).not.toHaveBeenCalled();
    expect(calls.refresh).toHaveBeenCalledOnce();
  });
  it.each([["未貼", "not_yet"], ["遲啲", "later"]])("persists %s without claiming application or a delivery", async (label, decision) => {
    calls.recordCopyFollowUp.mockResolvedValue({ ok: true, data: { id: "42" } });
    render(<CopyFollowUpCard followUp={followUp} locale="zh-HK" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
    expect(calls.recordCopyFollowUp).toHaveBeenCalledWith("action", { versionId: "copied-v2", expectedRecordId: "41", decision, locale: "zh-HK" });
    expect(calls.markApplied).not.toHaveBeenCalled();
  });
  it("refreshes the current task after a superseded copied version is refused", async () => {
    calls.markApplied.mockResolvedValue({ ok: false, status: 409, error: "version_not_applicable" });
    render(<CopyFollowUpCard followUp={followUp} locale="zh-HK" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "貼咗" })));
    expect(calls.refresh).toHaveBeenCalledOnce();
  });
  it("retains the question when the answer was refused and never writes for viewers", async () => {
    calls.recordCopyFollowUp.mockResolvedValue({ ok: false, status: 503, error: "unavailable" });
    const view = render(<CopyFollowUpCard followUp={followUp} locale="zh-HK" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "遲啲" })));
    expect(calls.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "遲啲" })).not.toBeDisabled();
    view.rerender(<CopyFollowUpCard followUp={followUp} locale="zh-HK" viewer />);
    expect(screen.getByRole("button", { name: "問店主改" })).toBeDisabled();
  });
});
