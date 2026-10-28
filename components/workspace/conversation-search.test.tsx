// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationSearch } from "./conversation-search";
import { searchCopy } from "@/lib/copy-search-gap";
import { recordFixture } from "@/test/fixtures/conversation-search";
const t = searchCopy.en, props = { locale: "en" as const, workspaceId: "w", locationId: "l", locationSlug: "central", workspaceSlug: "shop", canManage: true };
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("all shows an honest empty without any provider or storage request", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<ConversationSearch {...props} locationId="all" />);
  expect(screen.getByText(t.selectLocation)).toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
});
it("requires explicit review/confirmation, submits only a saved ID and can show an empty observation", async () => {
  const record = recordFixture(), approved = { ...record, approvedAt: "2026-10-28T12:00:00Z", actionId: "task" };
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ records: [] })).mockResolvedValueOnce(reply({ record })).mockResolvedValueOnce(reply({ record: approved })).mockResolvedValueOnce(reply({ observation: { status: "empty", reason: "later_window_required", rows: [] }, source: record.gap.source }));
  vi.stubGlobal("fetch", fetcher); render(<ConversationSearch {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: t.read })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: t.read }));
  fireEvent.click(await screen.findByRole("button", { name: t.createBrief }));
  expect(screen.getByRole("button", { name: t.approve })).toBeDisabled(); expect(screen.queryByRole("link", { name: t.openAction })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: t.confirmLabel })); fireEvent.click(screen.getByRole("button", { name: t.approve }));
  expect(await screen.findByText(t.approved)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: t.openAction })).toHaveAttribute("href", "/en/owner/shop/actions/task?location=central");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ operation: "approve", location_id: "l", id: record.id, confirmed: true });
  fireEvent.click(screen.getByRole("button", { name: t.observe })); expect(await screen.findByText(t.observations.later_window_required)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url]) => url.startsWith("/api/workspaces/w/conversation/search"))).toBe(true);
});
it("a failed confirmation preserves its draft and does not pretend a task was saved", async () => {
  const record = recordFixture();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ records: [record] })).mockResolvedValueOnce(reply({ error: "unavailable" }, false)));
  render(<ConversationSearch {...props} />);
  await waitFor(() => expect(screen.getByLabelText(t.records)).toBeEnabled()); fireEvent.change(screen.getByLabelText(t.records), { target: { value: record.id } });
  fireEvent.click(screen.getByRole("button", { name: t.createBrief })); fireEvent.click(screen.getByRole("checkbox", { name: t.confirmLabel })); fireEvent.click(screen.getByRole("button", { name: t.approve }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t.failed); expect(screen.getByText(t.draft)).toBeInTheDocument(); expect(screen.queryByRole("link", { name: t.openAction })).not.toBeInTheDocument();
});
it("read-only members cannot confirm; changing location clears saved and in-flight evidence", async () => {
  const record = recordFixture(); let resolveOld!: (value: unknown) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ records: [record] })).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(reply({ records: [] }));
  vi.stubGlobal("fetch", fetcher); const view = render(<ConversationSearch {...props} canManage={false} />);
  await waitFor(() => expect(screen.getByLabelText(t.records)).toBeEnabled()); fireEvent.change(screen.getByLabelText(t.records), { target: { value: record.id } });
  fireEvent.click(screen.getByRole("button", { name: t.createBrief })); expect(screen.queryByRole("button", { name: t.approve })).not.toBeInTheDocument();
  view.rerender(<ConversationSearch {...props} locationId="old-request" />);
  view.rerender(<ConversationSearch {...props} locationId="another" />);
  resolveOld(reply({ records: [record] }));
  await waitFor(() => expect(screen.getByLabelText(t.records)).toBeEnabled());
  expect(screen.queryByText(t.briefTitle)).not.toBeInTheDocument(); expect(screen.getByLabelText(t.records).querySelectorAll("option")).toHaveLength(1);
});
