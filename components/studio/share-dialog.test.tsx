// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShareDialog } from "./share-dialog";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const CANDIDATE = "44444444-4444-4444-8444-444444444444";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const membersPayload = {
  members: [{ conversation_id: CONVERSATION, workspace_id: WORKSPACE, user_id: MEMBER, role: "editor", added_by: "user-1", created_at: "2026-11-09T00:00:00Z", user_email: "editor@example.test" }],
  candidates: [{ userId: CANDIDATE, email: "candidate@example.test", workspaceRole: "manager" }],
  canManage: true,
  accessRole: "owner",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      return json({ member: { conversation_id: CONVERSATION, workspace_id: WORKSPACE, user_id: CANDIDATE, role: "viewer", added_by: "user-1", created_at: "2026-11-09T00:00:00Z", user_email: "candidate@example.test" } }, 201);
    }
    if (init?.method === "DELETE") return json({ removed: true });
    if (url.includes("/members")) return json(membersPayload);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudioShareDialog", () => {
  it("keeps focus and data stable when streaming recreates the close callback", async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const props = { locale: "en" as const, workspaceId: WORKSPACE, conversationId: CONVERSATION };
    const view = render(<StudioShareDialog {...props} onClose={first} />);
    await screen.findByText("editor@example.test");
    const candidate = screen.getByRole("combobox", { name: "Add a teammate" });
    candidate.focus();
    const requests = fetchMock.mock.calls.length;
    view.rerender(<StudioShareDialog {...props} onClose={latest} />);
    expect(candidate).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    fireEvent.keyDown(candidate, { key: "Escape" });
    expect(latest).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("traps both Tab directions, isolates background and returns focus on unmount", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const view = render(<StudioShareDialog locale="en" workspaceId={WORKSPACE} conversationId={CONVERSATION} onClose={vi.fn()} />);
    await screen.findByText("editor@example.test");
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("combobox", { name: "Can continue" });
    expect(trigger).toHaveAttribute("inert");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    trigger.focus();
    expect(first).toHaveFocus();
    view.unmount();
    expect(trigger).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
  it("returns to an explicit persistent trigger when its menu action disappears", async () => {
    const trigger = document.createElement("button");
    const action = document.createElement("button");
    document.body.append(trigger, action);
    action.focus();
    const view = render(<StudioShareDialog locale="en" workspaceId={WORKSPACE} conversationId={CONVERSATION} onClose={vi.fn()} returnFocusRef={{ current: trigger }} />);
    await screen.findByText("editor@example.test");
    action.remove();
    view.unmount();
    expect(trigger).toHaveFocus();
  });

  it("loads members and candidates, then shares the selected teammate with the chosen role", async () => {
    render(<StudioShareDialog locale="en" workspaceId={WORKSPACE} conversationId={CONVERSATION} onClose={vi.fn()} />);
    expect(await screen.findByText("editor@example.test")).toBeInTheDocument();
    expect(screen.getByText("candidate@example.test")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Add a teammate" }), { target: { value: CANDIDATE } });
    fireEvent.change(screen.getByRole("combobox", { name: "Can continue" }), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/studio/conversations/${CONVERSATION}/members`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, userId: CANDIDATE, role: "viewer" }) }),
    ));
  });

  it("focuses the close button and dismisses with Escape", async () => {
    const onClose = vi.fn();
    render(<StudioShareDialog locale="en" workspaceId={WORKSPACE} conversationId={CONVERSATION} onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await screen.findByText("editor@example.test");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes an existing member and reports failures honestly", async () => {
    render(<StudioShareDialog locale="en" workspaceId={WORKSPACE} conversationId={CONVERSATION} onClose={vi.fn()} />);
    await screen.findByText("editor@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/studio/conversations/${CONVERSATION}/members?workspaceId=${WORKSPACE}&userId=${MEMBER}`,
      expect.objectContaining({ method: "DELETE" }),
    ));

    fetchMock.mockResolvedValueOnce(json({ error: "unavailable" }, 503));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update sharing.");
  });
});
