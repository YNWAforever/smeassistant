// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OnboardingPage, type OnboardingProps, type SavedSetup } from "./onboarding-page";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, refresh: vi.fn() }),
  usePathname: () => "/en/owner/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));
const request = vi.fn<typeof fetch>();
const saved: SavedSetup = {
  workspaceName: "Confirmed A", locationName: "Branch A", locationAddress: null,
  voice: "professional", approvedClaims: "Confirmed fact A", hasLocation: true,
  brandProfileExists: true, workspaceSlug: "workspace-a",
};
function props(overrides: Partial<OnboardingProps> = {}): OnboardingProps {
  return {
    locale: "en", claim: "fixture_report_a", oauthEnabled: false, ownsWorkspace: true,
    gbpConnected: false, saved, scopeKey: "actor-a",
    evidence: { shareSlug: "fixture_report_a", businessName: "Scan A", region: "hk", district: null,
      workspaceId: "workspace-a", placeId: null, igHandle: null, websiteUrl: null },
    ...overrides,
  };
}
beforeEach(() => {
  navigation.push.mockReset();
  request.mockReset().mockRejectedValue(new Error("Unexpected fixture request"));
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("matchMedia", () => ({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  { locale: "en" as const, voice: "Concise and professional", link: "Open brand settings" },
  { locale: "zh-HK" as const, voice: "簡潔、專業", link: "前往品牌設定" },
  { locale: "zh-TW" as const, voice: "簡潔、專業", link: "前往品牌設定" },
])("shows stored brand settings without ignored editors in $locale", ({ locale, voice, link }) => {
  render(<OnboardingPage {...props({ locale })} />);
  expect(screen.queryByRole("combobox", { name: /Brand voice|品牌語氣/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /Approved factual claims|已核准事實描述/ })).not.toBeInTheDocument();
  expect(screen.getByText(voice)).toBeInTheDocument();
  expect(screen.getByText("Confirmed fact A")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: link })).toHaveAttribute("href", `/${locale}/owner/workspace-a/business/profile`);
  expect(request).not.toHaveBeenCalled();
});

it("shows an existing unset voice without inventing the warm default", () => {
  render(<OnboardingPage {...props({ saved: { ...saved, voice: null } })} />);
  expect(screen.getByText("Not set")).toBeInTheDocument();
  expect(screen.queryByText("Warm, local and sincere")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /Brand voice|品牌語氣/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open brand settings" })).toHaveAttribute("href", "/en/owner/workspace-a/business/profile");
});

it("keeps a new brand editable and only submits it on explicit completion", async () => {
  request.mockResolvedValue(Response.json({ workspaceSlug: "workspace-a" }));
  render(<OnboardingPage {...props({ saved: { ...saved, brandProfileExists: false, voice: null, approvedClaims: "" } })} />);
  expect(screen.getByRole("combobox", { name: "Brand voice" })).toBeEnabled();
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/workspace-a"));
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ brand_voice: "warm", approved_claims: [] });
});

it("moves focus to the newly opened step without submitting", () => {
  render(<OnboardingPage {...props({ locale: "zh-HK", resumeStep: 1 })} />);
  fireEvent.click(screen.getByRole("button", { name: "繼續" }));
  expect(screen.getByRole("heading", { name: "基本資料及結果", level: 2 })).toHaveFocus();
  expect(request).not.toHaveBeenCalled();
});

it("does not send stale existing-brand fields when another tab changes them", async () => {
  request.mockResolvedValue(Response.json({ workspaceSlug: "workspace-a" }));
  const view = render(<OnboardingPage {...props()} />);
  view.rerender(<OnboardingPage {...props({ saved: { ...saved, voice: "playful", approvedClaims: "New fact from another tab" } })} />);
  expect(screen.getByText("Playful and energetic")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(body).not.toHaveProperty("brand_voice");
  expect(body).not.toHaveProperty("approved_claims");
});

it("drops the old workspace draft and ignores its delayed completion after switching scope", async () => {
  let finish!: (response: Response) => void;
  request.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const view = render(<OnboardingPage {...props()} />);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Unsaved A" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  view.rerender(<OnboardingPage {...props({
    scopeKey: "actor-b", claim: "fixture_report_b",
    evidence: { ...props().evidence!, shareSlug: "fixture_report_b", workspaceId: "workspace-b" },
    saved: { ...saved, workspaceSlug: "workspace-b", workspaceName: "Confirmed B" },
  })} />);
  expect(screen.getByLabelText("Business name")).toHaveValue("Confirmed B");
  await act(async () => { finish(Response.json({ workspaceSlug: "workspace-a" })); });
  expect(navigation.push).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Finish setup and view results" })).toBeEnabled();
});

it("bounds same-frame duplicate submit events to one request", async () => {
  request.mockImplementation(() => new Promise<Response>(() => {}));
  const view = render(<OnboardingPage {...props()} />);
  const form = view.container.querySelector("form#onboarding-basics")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(request).toHaveBeenCalledTimes(1);
});

it("focuses a failed-save explanation and retains inputs for an explicit retry", async () => {
  request.mockRejectedValueOnce(new Error("Fixture outage"))
    .mockResolvedValueOnce(Response.json({ workspaceSlug: "workspace-a" }));
  render(<OnboardingPage {...props()} />);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Retained name" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveFocus();
  expect(screen.getByLabelText("Business name")).toHaveValue("Retained name");
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/en/owner/workspace-a"));
  expect(request).toHaveBeenCalledTimes(2);
});

it("does not present guessed editable settings after a server read failure", () => {
  render(<OnboardingPage {...props({ saved: null, savedUnavailable: true })} />);
  expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(/could not read/i);
  expect(screen.getByRole("link", { name: "Reload settings" })).toHaveAttribute("href", "/en/owner/onboarding?claim=fixture_report_a");
  expect(screen.queryByRole("button", { name: "Finish setup and view results" })).not.toBeInTheDocument();
});

it("initializes recovered settings from persisted business and branch values", async () => {
  request.mockResolvedValue(Response.json({ workspaceSlug: "workspace-a" }));
  const view = render(<OnboardingPage {...props({ saved: null, savedUnavailable: true })} />);
  view.rerender(<OnboardingPage {...props({ saved: { ...saved, locationAddress: "Confirmed address A" } })} />);
  expect(screen.getByLabelText("Business name")).toHaveValue("Confirmed A");
  expect(screen.getByLabelText("Address (optional)")).toHaveValue("Confirmed address A");
  fireEvent.click(screen.getByRole("button", { name: "Finish setup and view results" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
    workspace_name: "Confirmed A",
    primary_location: { name: "Branch A", address: "Confirmed address A" },
  });
});

it("preserves an unsaved business draft during ordinary same-scope server refreshes", () => {
  const view = render(<OnboardingPage {...props()} />);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Unsaved correction" } });
  view.rerender(<OnboardingPage {...props({ saved: { ...saved, voice: "playful" } })} />);
  expect(screen.getByLabelText("Business name")).toHaveValue("Unsaved correction");
  expect(screen.getByText("Playful and energetic")).toBeInTheDocument();
});

it("does not reveal saved brand details or a settings link without ownership", () => {
  render(<OnboardingPage {...props({ ownsWorkspace: false, resumeStep: 4 })} />);
  expect(screen.queryByText("Confirmed fact A")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open brand settings" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
});
