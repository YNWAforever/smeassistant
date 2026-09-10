// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listDrafts = vi.fn();
const reviewDraft = vi.fn();

vi.mock("@/lib/owner/fix-pack-card-client", () => ({
  listDrafts: (...args: unknown[]) => listDrafts(...args),
  reviewDraft: (...args: unknown[]) => reviewDraft(...args),
}));

import { FixPackCard } from "@/components/workspace/fix-pack-card";

async function mount(drafts: unknown[]) {
  listDrafts.mockResolvedValue({ ok: true, drafts });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <FixPackCard locale="en" workspaceId="ws-1" viewerRole="owner" actionsHref="/en/owner/kam-man-house/actions" />,
    );
  });
  return result.container;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("FixPackCard empty state", () => {
  it("never promises that a scan will produce drafts", async () => {
    // Nothing in this app writes agent_runs (CLAUDE.md 3.7 forbids it and the
    // upstream generator was never ported), so "Drafts appear here after a
    // paid-tier scan completes" left every owner waiting on something that
    // could not arrive. The heading made the same claim.
    const text = (await mount([])).textContent ?? "";
    expect(text).not.toMatch(/after a paid-tier scan completes|drafted from scan findings/i);
  });

  it("names who actually prepares them, and where the owner's own drafts come from", async () => {
    const container = await mount([]);
    expect(container.textContent).toContain("a scan does not create them");
    const link = [...container.querySelectorAll("a")].find((node) => /Open Actions/i.test(node.textContent ?? ""));
    expect(link?.getAttribute("href")).toBe("/en/owner/kam-man-house/actions");
  });

  it("still renders drafts and their review controls when any exist", async () => {
    // The read/review half is genuinely live -- the fix must not disable it.
    const container = await mount([
      { id: "run-1", jobId: "job-1", businessName: "Kam Man House", findingLabel: "Owner responses", agentKey: "review_reply_agent", status: "draft", draftText: "Thank you for visiting.", reviewExcerpt: null, reviewRating: null, createdAt: "2026-09-01T00:00:00Z" },
    ]);
    expect(container.textContent).toContain("Thank you for visiting.");
    expect(container.textContent).toContain("Approve");
    // The empty-state explanation belongs only to the empty state.
    expect(container.textContent).not.toContain("a scan does not create them");
  });
});
