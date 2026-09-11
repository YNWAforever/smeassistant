// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const listDrafts = vi.fn();
const reviewDraft = vi.fn();

// The empty state renders CapabilityBadge, which reads usePathname().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}));

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
      // The same value home-brief.tsx passes: the owner's own drafts, not the
      // whole queue.
      <FixPackCard locale="en" workspaceId="ws-1" viewerRole="owner" actionsHref="/en/owner/kam-man-house/actions?view=drafts" />,
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

  it("does not name a supplier who cannot reach this workspace either", async () => {
    // The first attempt at this fix said the drafts were "prepared for you by
    // the Fimmick team" -- softer, still unkeepable. That tooling writes the
    // legacy Supabase database while this app reads Neon, and the cutover
    // requires an empty application-data target, so no draft can arrive.
    const text = (await mount([])).textContent ?? "";
    expect(text).not.toMatch(/prepared for you by the Fimmick team/i);
    expect(text).toContain("not available in this workspace");
    expect(text).toContain("not from a scan");
  });

  it("sends the owner to their own drafts", async () => {
    const container = await mount([]);
    const link = [...container.querySelectorAll("a")].find((node) => /Open drafts/i.test(node.textContent ?? ""));
    expect(link?.getAttribute("href")).toBe("/en/owner/kam-man-house/actions?view=drafts");
  });

  it("still renders drafts and their review controls when any exist", async () => {
    // The read/review half is genuinely live -- the fix must not disable it.
    const container = await mount([
      { id: "run-1", jobId: "job-1", businessName: "Kam Man House", findingLabel: "Owner responses", agentKey: "review_reply_agent", status: "draft", draftText: "Thank you for visiting.", reviewExcerpt: null, reviewRating: null, createdAt: "2026-09-01T00:00:00Z" },
    ]);
    expect(container.textContent).toContain("Thank you for visiting.");
    expect(container.textContent).toContain("Approve");
    // The empty-state explanation belongs only to the empty state.
    expect(container.textContent).not.toContain("not available in this workspace");
  });
});
