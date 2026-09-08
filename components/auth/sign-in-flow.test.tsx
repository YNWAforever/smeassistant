// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), social: vi.fn(), magicLink: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { social: mocks.social, magicLink: mocks.magicLink } } }));

import { SignInFlow } from "./sign-in-flow";

const flow = { locale: "en" as const, claim: null, returnTo: "/en/owner/select-workspace", method: null };

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function enterFixtureEmail() {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "owner@fixture.test" } });
  fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
}

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

it("shows one distinct polite Google progress announcement and blocks a second action while Google opens", async () => {
  let resolve: ((value: { error: null }) => void) | undefined;
  mocks.social.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<SignInFlow flow={flow} initialReason={null} />);
  const google = await screen.findByRole("button", { name: /continue with google/i });
  fireEvent.click(google);
  expect(screen.getAllByText(/opening google/i)).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent(/opening google/i);
  expect(screen.getByRole("button", { name: /email me a sign-in link/i })).toBeDisabled();
  fireEvent.click(google); expect(mocks.social).toHaveBeenCalledTimes(1); resolve?.({ error: null });
});

it("announces email progress once while its request is pending", () => {
  mocks.magicLink.mockReturnValue(new Promise(() => {}));
  render(<SignInFlow flow={flow} initialReason={null} />);
  enterFixtureEmail();
  expect(screen.getAllByText(/sending sign-in link/i)).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent(/sending sign-in link/i);
});
it("renders locale-specific claim eligibility copy and recovery instead of the untouched form", () => {
  render(<SignInFlow flow={{ ...flow, locale: "zh-HK", claim: "fixture-report", method: "google" }} initialReason="cancelled" />);
  expect(screen.getByText(/已取消 Google 登入/)).toBeTruthy();
  expect(screen.queryByLabelText(/電郵地址/)).toBeNull(); expect(screen.getByText(/解鎖此報告/)).toBeTruthy();
});

it("honors a numeric Retry-After delay without automatically sending another email", async () => {
  mocks.magicLink.mockResolvedValue({ error: { status: 429, headers: new Headers({ "retry-after": "120" }) } });
  render(<SignInFlow flow={flow} initialReason={null} />);
  enterFixtureEmail();
  await screen.findByText(/send another link in 12[01]s/i);
  expect(mocks.magicLink).toHaveBeenCalledTimes(1);
});

it("honors an HTTP-date Retry-After delay", async () => {
  const retryAt = new Date(Date.now() + 120_000).toUTCString();
  mocks.magicLink.mockResolvedValue({ error: { status: 429, headers: new Headers({ "retry-after": retryAt }) } });
  render(<SignInFlow flow={flow} initialReason={null} />);
  enterFixtureEmail();
  await screen.findByText(/send another link in 11[89]s|send another link in 120s/i);
  expect(mocks.magicLink).toHaveBeenCalledTimes(1);
});

it("uses the one-minute fallback for an invalid Retry-After", async () => {
  mocks.magicLink.mockResolvedValue({ error: { status: 429, headers: new Headers({ "retry-after": "not-a-delay" }) } });
  render(<SignInFlow flow={flow} initialReason={null} />);
  enterFixtureEmail();
  await screen.findByText(/send another link in 6[01]s/i);
  expect(mocks.magicLink).toHaveBeenCalledTimes(1);
});

it("renders resend after the elapsed deadline without sending automatically", async () => {
  vi.useFakeTimers();
  mocks.magicLink.mockResolvedValue({ error: { status: 429, headers: new Headers({ "retry-after": "0" }) } });
  render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { enterFixtureEmail(); await Promise.resolve(); });
  expect(screen.getByRole("button", { name: /send another link in 60s/i })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole("button", { name: /^send another link$/i })).toBeEnabled();
  expect(mocks.magicLink).toHaveBeenCalledTimes(1);
});

it("shows recover state after an explicitly requested resend fails", async () => {
  vi.useFakeTimers();
  mocks.magicLink.mockResolvedValueOnce({ error: { status: 429, headers: new Headers({ "retry-after": "0" }) } }).mockRejectedValueOnce(new Error("fixture resend failure"));
  render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { enterFixtureEmail(); await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
  fireEvent.click(screen.getByRole("button", { name: /^send another link$/i }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
  expect(mocks.magicLink).toHaveBeenCalledTimes(2);
});

it("does not send email when the start screen mounts again after a refresh", () => {
  const first = render(<SignInFlow flow={flow} initialReason={null} />);
  first.unmount();
  render(<SignInFlow flow={flow} initialReason={null} />);
  expect(mocks.magicLink).not.toHaveBeenCalled();
});