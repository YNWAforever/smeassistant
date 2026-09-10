// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/owner/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { OnboardingPage, type ClaimEvidence, type SavedSetup } from "@/components/onboarding-page";

const evidence: ClaimEvidence = {
  shareSlug: "abc123",
  businessName: "Kam Man House",
  district: "Tin Hau",
  region: "hk",
  workspaceId: "ws-1",
  placeId: "place-1",
  igHandle: null,
  websiteUrl: null,
};

const saved: SavedSetup = {
  workspaceName: "Kam Man House Ltd",
  locationName: "Yik Yam Street",
  locationAddress: "12 Yik Yam Street",
  voice: "playful",
  approvedClaims: "Family-run since 2009",
  hasLocation: true,
};

function render(props: Partial<Parameters<typeof OnboardingPage>[0]> = {}) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <OnboardingPage locale="en" claim="abc123" oauthEnabled evidence={evidence} ownsWorkspace={false} gbpConnected={false} {...props} />,
  );
  return root;
}

describe("OnboardingPage resume step", () => {
  it("starts at step 1 when nothing is owned yet", () => {
    expect(render().textContent).toContain("Step 1 of 4");
  });

  it("resumes from persisted ownership, with no query parameter involved", () => {
    // The OAuth callback no longer passes `claimed=1`; an owner returning to
    // the same URL must still land past the ownership step.
    expect(render({ ownsWorkspace: true, gbpConnected: true, resumeStep: 3 }).textContent).toContain("Step 3 of 4");
  });

  it("resumes at brand basics once the claim route has created the location", () => {
    const root = render({ ownsWorkspace: true, gbpConnected: true, resumeStep: 4, saved });
    expect(root.textContent).toContain("Step 4 of 4");
    // Saved values win over the scan's guesses.
    const inputs = [...root.querySelectorAll("input")].map((node) => node.getAttribute("value"));
    expect(inputs).toContain("Kam Man House Ltd");
    expect(inputs).toContain("Yik Yam Street");
    expect(root.textContent).toContain("Family-run since 2009");
  });

  it("ignores a stored voice this build does not know about", () => {
    // Falls back to the default rather than rendering a dead Select value.
    const root = render({ ownsWorkspace: true, resumeStep: 4, saved: { ...saved, voice: "sardonic" } });
    expect(root.textContent).toContain("Step 4 of 4");
  });
});

describe("OnboardingPage wrong-business escape", () => {
  it("offers a plain scan link while nothing is attached", () => {
    const root = render();
    const escape = [...root.querySelectorAll("a")].find((node) => /not my business/i.test(node.textContent ?? ""));
    expect(escape?.getAttribute("href")).toBe("/en/scan");
  });

  it("does not offer self-service detachment once the report is attached", () => {
    // Ownership is proven, never self-declared -- undoing it the same way would
    // be a hijack primitive, so the escape becomes a support instruction.
    const root = render({ ownsWorkspace: true, resumeStep: 1 });
    expect([...root.querySelectorAll("a")].some((node) => /not my business/i.test(node.textContent ?? ""))).toBe(false);
    expect(root.textContent).toContain("Contact the Fimmick team");
  });
});
