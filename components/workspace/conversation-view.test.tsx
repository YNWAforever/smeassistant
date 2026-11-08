// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
import { ConversationView, type ConversationViewProps } from "./conversation-view";
import { conversationCopy } from "@/lib/copy-conversation";
import { CONVERSATION_LIMITS, writeConversationThreads } from "@/lib/workspace/conversation-store";
const props: ConversationViewProps = { locale: "en", timezone: "Asia/Singapore", workspaceSlug: "shop", workspaceName: "Shop", location: "branch", locationName: "Branch", scope: { userId: "u", workspaceId: "w", locationId: "l" }, initialThreadId: undefined, actions: [{ id: "a1", title: "Real work", versionId: "v1" }] };
beforeEach(() => { localStorage.clear(); replace.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function addNote(note: string) {
  fireEvent.change(screen.getByLabelText("Your note"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "Save local note" }));
  await screen.findByText(note, { selector: ".conversation-note" });
}
it.each([
  {
    locale: "en",
    privacy: ["only in this browser on this device", "do not sync to other devices", "no cloud backup", "Anyone using this browser profile can read them", "clearing site data deletes them"],
    limits: ["Per account, workspace and location", "50 threads", "40 notes per thread", "4,000 characters per note"],
    boundary: ["not AI replies or drafts", "not shared through linked tasks", "does not confirm work or count a delivery", "Ask Kinnso"],
  },
  {
    locale: "zh-HK",
    privacy: ["只留喺呢部裝置嘅呢個瀏覽器", "唔會同步去其他裝置", "冇雲端備份", "同一瀏覽器設定檔嘅人可以讀到", "清除網站資料會刪除筆記"],
    limits: ["每個帳戶、工作空間同分店範圍", "50 個討論串", "每串最多 40 則筆記", "每則最多 4,000 字元"],
    boundary: ["唔係 AI 回覆或草稿", "唔會透過連結嘅待辦分享", "儲存唔代表確認工作，唔會計作交付", "問 Kinnso"],
  },
  {
    locale: "zh-TW",
    privacy: ["只留在這台裝置的這個瀏覽器", "不會同步到其他裝置", "沒有雲端備份", "同一瀏覽器設定檔的人可以讀到", "清除網站資料會刪除筆記"],
    limits: ["每個帳戶、工作空間和分店範圍", "50 個討論串", "每串最多 40 則筆記", "每則最多 4,000 字元"],
    boundary: ["不是 AI 回覆或草稿", "不會透過連結的待辦分享", "儲存不代表確認工作，不計入交付", "問 Kinnso"],
  },
] as const)("shows $locale Park privacy, existing limits and note boundaries without opening a disclosure", async ({ locale, privacy, limits, boundary }) => {
  const view = render(<ConversationView {...props} locale={locale} />);
  await screen.findByLabelText(conversationCopy[locale].note);
  const privacyNote = view.container.querySelector(".conversation-boundaries .limitation-note")!;
  const localNote = view.container.querySelector(".conversation-local-note")!;
  for (const text of privacy) expect(privacyNote).toHaveTextContent(text);
  for (const text of limits) expect(localNote).toHaveTextContent(text);
  for (const text of boundary) expect(screen.getByText(conversationCopy[locale].boundary)).toHaveTextContent(text);
  expect(privacyNote).toBeVisible();
  expect(localNote).toBeVisible();
  expect(privacyNote.closest("details")).toBeNull();
  expect(localNote.closest("details")).toBeNull();
});
it("documents the approved Stage C Park decision, unchanged store limits and release holds", () => {
  const doc = readFileSync("docs/implementation/conversation-home-stage-c.md", "utf8");
  for (const text of [
    "Stage C = Park", "Willy Approve via Grok Master (GM) answering t299s1216",
    "not server-private", "not deeper local ops", "not ACL cloud storage",
    "no server copy, sync, backup or collaboration sharing",
    "Production conversation flag still OFF", "Stage D remains held", "Today remains the default home",
    "conversation-home-stage-1.md", "lib/workspace/conversation-store.ts", "CONVERSATION_LIMITS",
    "conversationCopy.privacy", "conversationDesignCopy.localNote", "conversationCopy.boundary",
    "localStorage keys", "merge algorithm", "limit values",
  ]) expect(doc).toContain(text);
  for (const [name, value] of Object.entries(CONVERSATION_LIMITS)) {
    expect(doc).toContain(`| \`${name}\` | ${value.toLocaleString("en-US")} |`);
  }
});
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
