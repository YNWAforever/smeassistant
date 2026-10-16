// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, refresh: vi.fn() }),
  usePathname: () => "/en/owner/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { OnboardingPage, type OnboardingProps } from "@/components/onboarding-page";

const evidence = {
  shareSlug: "fixture_report_123",
  businessName: "Fixture Bakery",
  district: "Central",
  region: "hk",
  workspaceId: "fixture-workspace",
  placeId: "fixture-place",
  igHandle: null,
  websiteUrl: null,
};

function setup(props: Partial<OnboardingProps> = {}) {
  return render(
    <OnboardingPage locale="en" claim={evidence.shareSlug} oauthEnabled={false}
      evidence={evidence} ownsWorkspace gbpConnected={false} {...props} />,
  );
}

const request = vi.fn<typeof fetch>();

beforeEach(() => {
  navigation.push.mockReset();
  request.mockReset();
  request.mockImplementation(async () => { throw new Error("Unexpected service request"); });
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false, media, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("focused onboarding journey", () => {
  it("lets a verified new owner finish from the prefilled essentials without a connection step", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toHaveValue("Fixture Bakery");
    // A district is useful context, but it is not a confirmed street address.
    expect(screen.getByLabelText("Address (optional)")).toHaveValue("");
    expect(screen.queryByLabelText(/Instagram/i)).not.toBeInTheDocument();
    const optional = screen.getByText("More settings (optional)").closest("details");
    expect(optional).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/fixture-bakery"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("/api/workspaces/claim");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      claim_slug: "fixture_report_123", workspace_name: "Fixture Bakery",
      primary_location: { name: "Fixture Bakery", address: null },
      market: "hk", timezone: "Asia/Hong_Kong", approved_claims: [],
    });
  });

  it("shows verification beside the business and refuses a forged resume step", () => {
    setup({ ownsWorkspace: false, oauthEnabled: true, resumeStep: 4 });
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verify ownership with Google" })).toHaveAttribute(
      "href", "/api/oauth/google/claim/start?slug=fixture_report_123&locale=en",
    );
    expect(screen.getByRole("link", { name: "View scan report" })).toHaveAttribute("href", "/en/r/fixture_report_123");
    expect(screen.queryByRole("button", { name: "Finish setup and view results" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("shows a manual access request immediately when Google ownership is unavailable", () => {
    setup({ ownsWorkspace: false, accessRequest: <p>Your application is pending</p> });
    expect(screen.getByText("Ask Fimmick to assign your workspace")).toBeInTheDocument();
    expect(screen.getByText("Your application is pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("offers a scan as the next step when there is no report", () => {
    setup({ evidence: null, ownsWorkspace: false });
    expect(within(screen.getByRole("main")).getByRole("link", { name: /Free scan/i })).toHaveAttribute("href", "/en/scan");
    expect(screen.queryByRole("button", { name: "Finish setup and view results" })).not.toBeInTheDocument();
  });

  it("keeps the business market when the interface uses a different locale and opens the promised action", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-tw", locationId: "fixture-location", matchedActionId: "fixture-action" }));
    setup({ evidence: { ...evidence, region: "tw" } });
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Confirmed Bakery" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/fixture-tw/actions/fixture-action"));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      workspace_name: "Confirmed Bakery", primary_location: { name: "Confirmed Bakery", address: null },
      market: "tw", timezone: "Asia/Taipei", locale: "en",
    });
  });

  it("keeps a saved location name independent from a renamed workspace", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup({ saved: { workspaceName: "Bakery Group", locationName: "Central Branch", locationAddress: "12 Fixture Road", voice: "professional", approvedClaims: "Owner confirmed fact", hasLocation: true, brandProfileExists: true, workspaceSlug: "fixture-bakery" } });
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Renamed Group" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      workspace_name: "Renamed Group", primary_location: { name: "Central Branch", address: "12 Fixture Road" },
    });
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).not.toHaveProperty("brand_voice");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).not.toHaveProperty("approved_claims");
  });

  it("uses the corrected business name for a new location when the assigned name differs from the scan", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup({ saved: { workspaceName: "Assigned workspace", locationName: null, locationAddress: null, voice: null, approvedClaims: "", hasLocation: false, brandProfileExists: false, workspaceSlug: "fixture-bakery" } });
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Corrected Bakery" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      workspace_name: "Corrected Bakery", primary_location: { name: "Corrected Bakery" },
    });
  });

  it("never lets a cleared optional location name block completion", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup();
    fireEvent.click(screen.getByText("More settings (optional)"));
    const location = screen.getByLabelText("Primary location");
    fireEvent.change(location, { target: { value: "" } });
    // The optional override falls back to the visible business name instead of
    // disabling Finish with the reason hidden inside a collapsed disclosure.
    expect(location).toHaveValue("");
    expect(location).toHaveAttribute("placeholder", "Fixture Bakery");
    fireEvent.click(screen.getByText("More settings (optional)"));
    const finish = screen.getByRole("button", { name: "Finish setup and view results" });
    expect(finish).toBeEnabled();
    fireEvent.click(finish);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/fixture-bakery"));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      workspace_name: "Fixture Bakery", primary_location: { name: "Fixture Bakery" },
    });
  });

  it("preserves spaces while typing a multiword location override", async () => {
    request.mockResolvedValue(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup();
    fireEvent.click(screen.getByText("More settings (optional)"));
    const location = screen.getByLabelText("Primary location");
    fireEvent.change(location, { target: { value: "Central " } });
    expect(location).toHaveValue("Central ");
    fireEvent.change(location, { target: { value: "Central Branch " } });
    expect(location).toHaveValue("Central Branch ");
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).primary_location.name).toBe("Central Branch");
  });

  it("retains entered facts after a failed save so a retry can complete setup", async () => {
    request.mockRejectedValueOnce(new Error("Fixture network outage"))
      .mockResolvedValueOnce(Response.json({ ok: true, workspaceSlug: "fixture-bakery", locationId: "fixture-location", matchedActionId: null }));
    setup();
    fireEvent.change(screen.getByLabelText("Address (optional)"), { target: { value: "12 Fixture Road" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Network error/i);
    expect(screen.getByLabelText("Address (optional)")).toHaveValue("12 Fixture Road");
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/fixture-bakery"));
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).primary_location.address).toBe("12 Fixture Road");
  });

  it("does not treat an incomplete success response as a usable result", async () => {
    request.mockResolvedValue(Response.json({ ok: true }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not open your results/i);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Business name")).toHaveValue("Fixture Bakery");
  });

  it("prevents a second save while completion is in flight", async () => {
    let finish!: (response: Response) => void;
    request.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
    const saving = screen.getByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    expect(request).toHaveBeenCalledTimes(1);
    finish(Response.json({ ok: true, workspaceSlug: "fixture-bakery", matchedActionId: null }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
  });
});
