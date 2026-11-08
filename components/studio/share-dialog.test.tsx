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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudioShareDialog", () => {
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
