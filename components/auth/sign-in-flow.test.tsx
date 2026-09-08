// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), social: vi.fn(), magicLink: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { social: mocks.social, magicLink: mocks.magicLink } } }));
import { SignInFlow } from "./sign-in-flow";

const flow = { locale: "en" as const, claim: null, returnTo: "/en/owner/select-workspace", method: null };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("renders one Google primary action and an explicitly labelled email alternative without promotional auth copy", () => {
  render(<SignInFlow flow={flow} initialReason={null} />);
  expect(screen.getAllByRole("button", { name: /continue with google/i })).toHaveLength(1);
  expect(screen.getByText(/or use email instead/i)).toBeTruthy();
  expect(screen.queryByText(/return securely to the business action/i)).toBeNull();
});

it("keeps submit disabled before hydration and carries flow context into an email request", async () => {
  render(<SignInFlow flow={{ ...flow, claim: "fixture-report" }} initialReason={null} />);
  const email = screen.getByLabelText(/email address/i);
  const submit = screen.getByRole("button", { name: /email me a sign-in link/i });
  mocks.magicLink.mockResolvedValue({ error: null });
  fireEvent.change(email, { target: { value: "owner@fixture.test" } }); fireEvent.click(submit);
  await waitFor(() => expect(mocks.magicLink).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@fixture.test", callbackURL: expect.stringContaining("claim=fixture-report") })));
  expect(screen.getByText(/check your inbox/i)).toBeTruthy();
});

it("shows distinct method progress and blocks a second action while Google opens", async () => {
  let resolve: ((value: { error: null }) => void) | undefined;
  mocks.social.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<SignInFlow flow={flow} initialReason={null} />);
  const google = await screen.findByRole("button", { name: /continue with google/i });
  fireEvent.click(google);
  expect(screen.getAllByText(/opening google/i)).toHaveLength(2);
  expect(screen.getByRole("button", { name: /email me a sign-in link/i })).toBeDisabled();
  fireEvent.click(google); expect(mocks.social).toHaveBeenCalledTimes(1); resolve?.({ error: null });
});

it("renders locale-specific claim eligibility copy and recovery instead of the untouched form", () => {
  render(<SignInFlow flow={{ ...flow, locale: "zh-HK", claim: "fixture-report", method: "google" }} initialReason="cancelled" />);
  expect(screen.getByText(/已取消 Google 登入/)).toBeTruthy();
  expect(screen.queryByLabelText(/電郵地址/)).toBeNull(); expect(screen.getByText(/解鎖此報告/)).toBeTruthy();
});
it("honors a Retry-After delay without automatically sending another email", async () => {
  mocks.magicLink.mockResolvedValue({ error: { status: 429, headers: new Headers({ "retry-after": "120" }) } });
  render(<SignInFlow flow={flow} initialReason={null} />);
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "owner@fixture.test" } });
  fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
  await screen.findByText(/send another link in 12[01]s/i);
  expect(mocks.magicLink).toHaveBeenCalledTimes(1);
});