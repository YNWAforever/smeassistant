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
  brandProfileExists: true,
  workspaceSlug: "kam-man-house",
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
    expect(render().textContent).toContain("Step 2 of 3");
  });

  it("resumes from persisted ownership, with no query parameter involved", () => {
    // The OAuth callback no longer passes `claimed=1`; an owner returning to
    // the same URL must still land past the ownership step.
    expect(render({ ownsWorkspace: true, gbpConnected: true, resumeStep: 3 }).textContent).toContain("Step 3 of 3");
  });

  it("resumes at essentials with persisted fields once the claim route has created the location", () => {
    const root = render({ ownsWorkspace: true, gbpConnected: true, resumeStep: 4, saved });
    expect(root.textContent).toContain("Step 3 of 3");
    // Saved values win over the scan's guesses.
    const inputs = [...root.querySelectorAll("input")].map((node) => node.getAttribute("value"));
    expect(inputs).toContain("Kam Man House Ltd");
    expect(inputs).toContain("Yik Yam Street");
    expect(root.textContent).toContain("Family-run since 2009");
  });

  it("ignores a stored voice this build does not know about", () => {
    // Falls back to the default rather than rendering a dead Select value.
    const root = render({ ownsWorkspace: true, resumeStep: 4, saved: { ...saved, voice: "sardonic" } });
    expect(root.textContent).toContain("Step 3 of 3");
  });
});

describe("OnboardingPage staff-assignment fallback", () => {
  // This is the branch every owner sees by default: .env.example ships
  // WORKSPACE_CLAIM_VIA_OAUTH_ENABLED=false, so `oauthEnabled` is false.
  const fallback = { oauthEnabled: false, resumeStep: 2 as const };

  it("never tells the owner to wait for or reply to an email", () => {
    // It used to promise "you will be emailed when it is done" and "Reply to
    // the report email you received". This app sends neither, so the owner was
    // left waiting on mail that could not arrive.
    const text = render(fallback).textContent ?? "";
    expect(text).not.toMatch(/be emailed|report email/i);
  });

  it("offers the market's real contact channel, carrying the report reference", () => {
    const root = render({
      ...fallback,
      contacts: [{ channel: "whatsapp", href: "https://wa.me/85212345678" }],
    });
    const link = [...root.querySelectorAll("a")].find((node) => /whatsapp/i.test(node.textContent ?? ""));
    expect(link?.getAttribute("href")).toContain("https://wa.me/85212345678");
    expect(decodeURIComponent(link?.getAttribute("href") ?? "")).toContain("abc123");
    expect(root.textContent).toContain("abc123");
  });

  it("says what to do instead when no channel is configured", () => {
    // getMarketCtas returns [] until the NEXT_PUBLIC_* contacts are set, and
    // offering a dead link would repeat the defect being fixed.
    const root = render(fallback);
    expect([...root.querySelectorAll("a")].some((node) => /whatsapp|line|call us|email us/i.test(node.textContent ?? ""))).toBe(false);
    expect(root.textContent).toContain("Fimmick representative");
    expect(root.textContent).toContain("abc123");
  });

  it("tells the owner how the wait ends", () => {
    expect(render(fallback).textContent).toContain("return to this page");
  });
});

describe("OnboardingPage wrong-business escape", () => {
  it("offers a plain scan link while nothing is attached", () => {
    const root = render();
    const escape = [...root.querySelectorAll("a")].find((node) => /scan the right business/i.test(node.textContent ?? ""));
    expect(escape?.getAttribute("href")).toBe("/en/scan");
  });

  it("does not offer self-service detachment once the report is attached", () => {
    // Ownership is proven, never self-declared -- undoing it the same way would
    // be a hijack primitive, so the escape becomes a support instruction.
    const root = render({ ownsWorkspace: true, resumeStep: 1 });
    expect([...root.querySelectorAll("a")].some((node) => /scan the right business/i.test(node.textContent ?? ""))).toBe(false);
    expect(root.textContent).toContain("Contact the Fimmick team");
  });
});

describe("OnboardingPage first-run wizard (Phase 5)", () => {
  it("shows three steps with Signed in already done", () => {
    const steps = [...render().querySelectorAll(".onboarding-steps li")];
    expect(steps.map((node) => node.getAttribute("data-state"))).toEqual(["done", "current", "todo"]);
    expect(steps[1].getAttribute("aria-current")).toBe("step");
    expect(steps[0].textContent).toContain("Signed in");
  });

  it("marks ownership done and shows the verified label once the owner is proven", () => {
    const root = render({ ownsWorkspace: true, gbpConnected: true, resumeStep: 2, saved });
    const steps = [...root.querySelectorAll(".onboarding-steps li")];
    expect(steps.map((node) => node.getAttribute("data-state"))).toEqual(["done", "done", "current"]);
    expect(root.querySelector(".onboarding-verified-strip")?.textContent).toContain("Verified with Google");
  });

  it("explains why Google beside the heading, never inside it", () => {
    const root = render();
    const row = root.querySelector(".onboarding-title-row");
    expect(row?.querySelector("h3")?.textContent).toBe("Verify ownership with Google");
    expect(row?.querySelector("button[aria-label]")).not.toBeNull();
  });

  it("keeps the wrong-business help behind a disclosure", () => {
    const details = render().querySelector("details.onboarding-not-mine");
    expect(details?.querySelector("summary")?.textContent).toBe("Not your business?");
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("shows an error with a retry, not a misleading start-from-a-scan, when a lookup failed", () => {
    const root = render({ evidence: null, lookupFailed: true });
    expect(root.querySelector("[role=alert]")?.textContent).toContain("couldn't check this report");
    expect(root.textContent).not.toContain("Start from a scan");
    expect([...root.querySelectorAll("button")].some((node) => node.textContent === "Try again")).toBe(true);
  });

  it.each(["zh-HK", "zh-TW"] as const)("speaks %s throughout, with no English step labels", (locale) => {
    const text = render({ locale }).textContent ?? "";
    expect(text).toContain("驗證擁有權");
    expect(text).not.toMatch(/Step \d|Signed in|Verify ownership/);
  });
});
