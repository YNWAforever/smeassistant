// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PostDraftCoach, type ConfirmedPostDraft } from "./post-draft-coach";
import { postDraftCopy } from "@/lib/copy-conversation-post-draft";
import { POST_DRAFT_FIXTURES } from "@/lib/workspace/post-draft-fixture";

const writeText = vi.fn().mockResolvedValue(undefined);
const onSaveTodo = vi.fn<(draft: ConfirmedPostDraft) => "saved" | "failed">(() => "saved");

beforeEach(() => {
  writeText.mockClear();
  onSaveTodo.mockClear();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

it("keeps the locked post-draft dictionary keys identical across locales", () => {
  expect(flattenKeys(postDraftCopy.en)).toEqual(flattenKeys(postDraftCopy["zh-HK"]));
  expect(flattenKeys(postDraftCopy.en)).toEqual(flattenKeys(postDraftCopy["zh-TW"]));
});

it("runs intent → channel → tone → draft → confirm → copy without post, schedule or connect affordances", async () => {
  const t = postDraftCopy["zh-HK"];
  render(<PostDraftCoach locale="zh-HK" onSaveTodo={onSaveTodo} />);

  expect(screen.getByRole("heading", { name: t.coach.title })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t.examples.weeklyIg }));
  fireEvent.click(screen.getByRole("button", { name: t.coach.startCta }));

  const channelGroup = screen.getByRole("group", { name: t.clarify.channel.question });
  expect(channelGroup).toBeVisible();
  expect(screen.getByRole("button", { name: new RegExp(t.channel.facebook) })).toBeVisible();
  expect(screen.getByRole("button", { name: new RegExp(t.channel.instagram) })).toBeVisible();
  expect(screen.getByRole("button", { name: new RegExp(t.channel.threads) })).toBeVisible();
  expect(screen.getByRole("button", { name: new RegExp(t.channel.googleBusinessProfile) })).toBeVisible();
  expect(screen.getAllByText(t.channel.notConnected, { selector: "small" })).toHaveLength(4);
  expect(screen.queryByText(t.channel.notConnectedHint)).not.toBeInTheDocument();
  expect(screen.queryByText(/Merchant Center/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: new RegExp(t.channel.instagram) }));
  fireEvent.click(screen.getByRole("button", { name: t.clarify.tone.skip }));

  expect(screen.getByRole("heading", { name: t.card.heading })).toBeVisible();
  expect(screen.getByText(t.card.status.draft)).toBeVisible();
  expect(screen.getByText(POST_DRAFT_FIXTURES["zh-HK"][0].title)).toBeVisible();
  expect(screen.getByText(/本週末營業時間如下/)).toBeVisible();
  expect(screen.getByText(t.card.imageSlotHint)).toBeVisible();
  expect(screen.getByText(t.honesty.aiDraftsOnly)).toBeVisible();
  expect(screen.getByText(t.confirm.helper)).toBeVisible();
  for (const name of [/排程/, /發佈/, /Publish/i, /Schedule/i, /Connect/i]) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }

  fireEvent.click(screen.getByRole("button", { name: t.confirm.primaryCta }));
  expect(screen.getByText(t.confirmed.status)).toBeVisible();
  expect(screen.getByText(t.confirmed.done)).toBeVisible();
  expect(screen.queryByText(t.honesty.aiDraftsOnly)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: t.actions.copy }));
  expect(await screen.findByText(t.actions.copied.replace("{channel}", t.channel.instagram))).toBeVisible();
  expect(writeText).toHaveBeenCalledWith(`${POST_DRAFT_FIXTURES["zh-HK"][0].title}\n\n${POST_DRAFT_FIXTURES["zh-HK"][0].body}`);

  fireEvent.click(screen.getByRole("button", { name: t.actions.saveTodo }));
  expect(await screen.findByText(t.actions.savedTodo)).toBeVisible();
  expect(onSaveTodo).toHaveBeenCalledWith(expect.objectContaining({ title: POST_DRAFT_FIXTURES["zh-HK"][0].title, body: POST_DRAFT_FIXTURES["zh-HK"][0].body, channel: "instagram" }));

  fireEvent.click(screen.getByRole("button", { name: t.actions.editAgain }));
  expect(screen.getByText(t.card.status.draft)).toBeVisible();
  expect(screen.getByText(t.confirm.editResets)).toBeVisible();
  expect(screen.getByRole("button", { name: t.confirm.primaryCta })).toBeVisible();
});

it("answers a schedule or publish request honestly and still offers only draft and copy actions", () => {
  const t = postDraftCopy["zh-HK"];
  render(<PostDraftCoach locale="zh-HK" onSaveTodo={onSaveTodo} />);

  fireEvent.change(screen.getByLabelText(t.coach.inputPlaceholder), { target: { value: "幫我排程聽日八點出" } });
  fireEvent.click(screen.getByRole("button", { name: t.coach.startCta }));
  fireEvent.click(screen.getByRole("button", { name: t.clarify.channel.notSure }));
  fireEvent.click(screen.getByRole("button", { name: t.clarify.tone.skip }));

  expect(screen.getByText(t.honesty.scheduleRequestReply)).toBeVisible();
  expect(screen.getByRole("button", { name: t.confirm.primaryCta })).toBeVisible();
  expect(screen.queryByRole("button", { name: t.honesty.scheduleUnsupported })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t.honesty.publishUnsupported })).not.toBeInTheDocument();
});

it("rejects a blank intent without leaving the coach open state", () => {
  const t = postDraftCopy.en;
  render(<PostDraftCoach locale="en" onSaveTodo={onSaveTodo} />);
  const start = screen.getByRole("button", { name: t.coach.startCta });
  expect(start).toBeDisabled();
  fireEvent.change(screen.getByLabelText(t.coach.inputPlaceholder), { target: { value: "   " } });
  fireEvent.submit(screen.getByLabelText(t.coach.inputPlaceholder).closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent(t.errors.emptyIntent);
  expect(screen.getByRole("heading", { name: t.coach.title })).toBeVisible();
});

it("reports a clipboard failure without claiming the draft was copied", async () => {
  const t = postDraftCopy.en;
  writeText.mockRejectedValueOnce(new Error("denied"));
  render(<PostDraftCoach locale="en" onSaveTodo={onSaveTodo} />);
  fireEvent.click(screen.getByRole("button", { name: t.examples.weeklyIg }));
  fireEvent.click(screen.getByRole("button", { name: t.coach.startCta }));
  fireEvent.click(screen.getByRole("button", { name: t.clarify.channel.notSure }));
  fireEvent.click(screen.getByRole("button", { name: t.clarify.tone.skip }));
  fireEvent.click(screen.getByRole("button", { name: t.confirm.primaryCta }));
  fireEvent.click(screen.getByRole("button", { name: t.actions.copy }));
  expect(await screen.findByText(t.actions.copyFailed)).toBeVisible();
  expect(screen.queryByText(t.actions.copiedGeneric)).not.toBeInTheDocument();
});
