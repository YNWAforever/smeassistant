// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
import { ConversationView, type ConversationViewProps } from "./conversation-view";
import { conversationCopy } from "@/lib/copy-conversation";
import { writeConversationThreads } from "@/lib/workspace/conversation-store";
const props: ConversationViewProps = { locale: "en", timezone: "Asia/Singapore", workspaceSlug: "shop", workspaceName: "Shop", location: "branch", locationName: "Branch", scope: { userId: "u", workspaceId: "w", locationId: "l" }, initialThreadId: undefined, actions: [{ id: "a1", title: "Real work", versionId: "v1" }] };
beforeEach(() => { localStorage.clear(); replace.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function addNote(note: string) {
  fireEvent.change(screen.getByLabelText("Your note"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Save local note" }));
  await screen.findByText(note, { selector: ".conversation-note" });
}
it.each(["en", "zh-HK", "zh-TW"] as const)("keeps the visible %s primary CTA honest before and after saving a local note", async locale => {
  const t = conversationCopy[locale];
  render(<ConversationView {...props} locale={locale} />);
  const save = await screen.findByRole("button", { name: t.save });
  expect(save).toHaveTextContent(t.save);
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText(t.note), { target: { value: "Local note" } });
  expect(save).toHaveTextContent(t.save);
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await screen.findByText("Local note", { selector: ".conversation-note" });
  expect(save).toHaveTextContent(t.save);
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: t.newThread }));
  expect(save).toHaveTextContent(t.save);
  expect(save).toBeDisabled();
});
it("renders recent local-note timestamps in the workspace timezone without changing the stored instant", async () => {
  const updatedAt = "2026-10-30T20:09:08.000Z";
  writeConversationThreads(localStorage, props.scope, [{ id: "t1", title: "Preview note", notes: ["Preview note"], actionIds: [], createdAt: updatedAt, updatedAt }]);
  const view = render(<ConversationView {...props} locale="zh-HK" />);
  const recent = await screen.findByRole("button", { name: "Preview note" });
  expect(recent.querySelector("time")).toHaveTextContent("2026年10月31日 上午4:09");
  expect(recent.querySelector("time")).toHaveAttribute("datetime", updatedAt);
  view.rerender(<ConversationView {...props} locale="zh-HK" timezone="America/New_York" />);
  expect(recent.querySelector("time")).toHaveTextContent("2026年10月30日 下午4:09");
});
it("prefills from six existing templates without saving or sending a request", async () => {
  render(<ConversationView {...props} />);
  await screen.findByLabelText("Your note");
  const buttons = screen.getAllByRole("button", { name: /Use template:/ });
  expect(buttons).toHaveLength(6);
  fireEvent.click(buttons[0]);
  expect((screen.getByLabelText("Your note") as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
  expect(localStorage.length).toBe(0);
});
it("keeps threads independent across reload, links only real actions and resets synchronously on scope changes", async () => {
  const view = render(<ConversationView {...props} />);
  await screen.findByLabelText("Your note"); await addNote("First private note");
  fireEvent.change(screen.getByLabelText("Link existing task"), { target: { value: "a1" } });
  expect(screen.getAllByRole("link", { name: "Open saved version" })[0]).toHaveAttribute("href", "/en/owner/shop/actions/a1?location=branch&version=v1");
  fireEvent.click(screen.getByRole("button", { name: "New thread" })); await addNote("Second private note");
  expect(screen.queryByText("First private note", { selector: ".conversation-note" })).not.toBeInTheDocument();
  view.unmount();
  const restored = render(<ConversationView {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "First private note" }));
  expect(screen.getByText("First private note", { selector: ".conversation-note" })).toBeInTheDocument();
  restored.rerender(<ConversationView {...props} scope={{ ...props.scope, userId: "other" }} />);
  expect(screen.queryByText("First private note", { selector: ".conversation-note" })).not.toBeInTheDocument();
  await screen.findByText("No local threads yet.");
});
it("discloses blocked storage honestly and keeps an unsaved note in memory", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  render(<ConversationView {...props} />); await screen.findByLabelText("Your note"); await addNote("Unsaved note");
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
});
it("shows a missing-thread state and never falls back to another thread's notes", async () => {
  render(<ConversationView {...props} initialThreadId="unknown" />);
  expect(await screen.findByText("This local thread is unavailable in this account, workspace and location." )).toBeInTheDocument();
});
it("keeps dictionary keys identical across locales", () => {
  expect(Object.keys(conversationCopy.en)).toEqual(Object.keys(conversationCopy["zh-HK"]));
  expect(Object.keys(conversationCopy.en)).toEqual(Object.keys(conversationCopy["zh-TW"]));
});

it("retains unsaved on-screen notes across same-scope server rerenders", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  const view = render(<ConversationView {...props} />);
  await screen.findByLabelText("Your note"); await addNote("Keep this unsaved note");
  view.rerender(<ConversationView {...props} scope={{ ...props.scope }} />);
  expect(screen.getByText("Keep this unsaved note", { selector: ".conversation-note" })).toBeInTheDocument();
});

it("keeps the unsaved warning when switching away from a thread whose write failed", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  render(<ConversationView {...props} />); await screen.findByLabelText("Your note"); await addNote("Remember unsaved status");
  fireEvent.click(screen.getByRole("button", { name: "New thread" }));
  fireEvent.click(screen.getByRole("button", { name: "Remember unsaved status" }));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
});
it("does not overwrite unknown stored notes when reading storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  const writes = vi.spyOn(Storage.prototype, "setItem");
  render(<ConversationView {...props} />); await screen.findByLabelText("Your note"); await addNote("Session only note");
  expect(writes).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
});

it("does not label unsubmitted composer text as saved when linking a task", async () => {
  render(<ConversationView {...props} />); await screen.findByLabelText("Your note"); await addNote("Saved initial note");
  fireEvent.change(screen.getByLabelText("Your note"), { target: { value: "Unsubmitted note" } });
  fireEvent.change(screen.getByLabelText("Link existing task"), { target: { value: "a1" } });
  expect(screen.queryByText("Saved in this browser")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Your note")).toHaveValue("Unsubmitted note");
});

it("flushes all pending local thread changes when a later write succeeds", async () => {
  const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  const view = render(<ConversationView {...props} />); await screen.findByLabelText("Your note"); await addNote("Pending first thread");
  fireEvent.click(screen.getByRole("button", { name: "New thread" }));
  blocked.mockRestore(); await addNote("Persisted second thread");
  view.unmount(); render(<ConversationView {...props} />);
  expect(await screen.findByRole("button", { name: "Pending first thread" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Persisted second thread" })).toBeInTheDocument();
});
