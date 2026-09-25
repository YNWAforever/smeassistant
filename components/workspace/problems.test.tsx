// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { ProblemsList } from "@/components/workspace/problems-list";
import type { OwnerAction, OwnerProblem } from "@/lib/ops/failure-types";

function problem(ownerAction: OwnerAction, overrides: Partial<OwnerProblem> = {}): OwnerProblem {
  return {
    kind: "scan_failed", id: "job-1", reference: "SCAN-3FA85F", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House" }, locationId: "loc-a", actionId: null,
    businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
    ownerAction, contactHref: null, ...overrides,
  };
}

const common = { locale: "en" as const, workspaceSlug: "kam-man-house", workspaceId: "ws-1", tier: "paid" as const, role: "owner" as const, consentPolicyVersion: "2026-07-28" };

function html(node: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(node);
  return root;
}

describe("NeedsAttentionCard", () => {
  it("renders nothing without problems", () => {
    expect(renderToStaticMarkup(<NeedsAttentionCard {...common} problems={[]} />)).toBe("");
  });

  it("shows at most two problems and links to Activity", () => {
    const root = html(<NeedsAttentionCard {...common} problems={[problem("none"), problem("none", { id: "b" }), problem("none", { id: "c" })]} />);
    expect(root.querySelectorAll("[data-problem]")).toHaveLength(2);
    expect(root.querySelector('a[href="/en/owner/kam-man-house/activity"]')).not.toBeNull();
  });
});

describe("ProblemItem buttons (via ProblemsList)", () => {
  it("renders the rescan control for rescan", () => {
    expect(html(<ProblemsList {...common} problems={[problem("rescan")]} />).textContent).toContain("Rescan");
  });

  it("links to the action for open_action", () => {
    const root = html(<ProblemsList {...common} problems={[problem("open_action", { kind: "draft_failed", actionId: "act-1", reference: "RUN-3FA85F", reason: "invalid_output" })]} />);
    expect(root.querySelector('a[href="/en/owner/kam-man-house/actions/act-1"]')?.textContent).toContain("Open action");
    expect(root.textContent).toContain("The draft could not be read.");
  });

  it("links to Google re-authorisation for reauthorise", () => {
    const root = html(<ProblemsList {...common} problems={[problem("reauthorise", { kind: "google_connection", locationId: null, reason: "error" })]} />);
    expect(root.querySelector('a[href="/api/oauth/google/start?workspace=kam-man-house&locale=en"]')).not.toBeNull();
  });

  it("links to the contact channel for contact_support, and shows text only without one", () => {
    expect(html(<ProblemsList {...common} problems={[problem("contact_support", { contactHref: "https://wa.me/85200000000" })]} />).querySelector('a[href="https://wa.me/85200000000"]')).not.toBeNull();
    const bare = html(<ProblemsList {...common} problems={[problem("contact_support")]} />);
    expect(bare.querySelector("a")).toBeNull();
    expect(bare.textContent).toContain("Contact Fimmick and quote the reference below.");
  });

  it("shows no button for none, and always shows the reference", () => {
    const root = html(<ProblemsList {...common} role="viewer" problems={[problem("none")]} />);
    expect(root.querySelector("a, button")).toBeNull();
    expect(root.textContent).toContain("Reference SCAN-3FA85F");
  });

  it("never shows a raw unknown reason code", () => {
    expect(html(<ProblemsList {...common} problems={[problem("none", { reason: "NEW_PROVIDER_CODE" })]} />).textContent).not.toContain("NEW_PROVIDER_CODE");
  });

  it("says there are no open problems only when it was given an empty list", () => {
    expect(html(<ProblemsList {...common} problems={[]} />).textContent).toContain("No open problems.");
  });
});
