// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), emailOtp: vi.fn(), magicLink: vi.fn(async () => ({ error: null })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { emailOtp: mocks.emailOtp, magicLink: mocks.magicLink } } }));
import { SignInFlow } from "./sign-in-flow";

const flow = { locale: "en" as const, claim: "fixture-report", returnTo: "/en/owner/select-workspace", method: null };
beforeEach(() => {
  mocks.emailOtp.mockResolvedValue({ error: null });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

async function requestCode() {
  render(<SignInFlow flow={flow} initialReason={null} />);
  const email = screen.getByLabelText("Email address");
  fireEvent.change(email, { target: { value: "Owner@fixture.test" } });
  fireEvent.submit(email.closest("form")!);
  return screen.findByLabelText("6-digit code");
}

it("sends through the bounded email-code route and verifies the code before completion", async () => {
  const code = await requestCode();
  expect(fetch).toHaveBeenCalledWith("/api/auth/email-otp/send-verification-otp", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ email: "owner@fixture.test", type: "sign-in", callbackURL: "/auth/callback?locale=en&claim=fixture-report&returnTo=%2Fen%2Fowner%2Fselect-workspace&method=email" }),
  }));
  expect(mocks.magicLink).not.toHaveBeenCalled();
  expect(mocks.emailOtp).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  await waitFor(() => expect(mocks.emailOtp).toHaveBeenCalledExactlyOnceWith({ email: "owner@fixture.test", otp: "123456" }));
  expect(mocks.replace).toHaveBeenLastCalledWith("/en/owner/sign-in/complete?claim=fixture-report&returnTo=%2Fen%2Fowner%2Fselect-workspace&method=email");
  const verify = screen.getByRole("button", { name: "Verify and continue" });
  expect(verify).toBeDisabled();
  fireEvent.click(verify);
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
});

it("retains the recipient and code form when the provider rejects a code", async () => {
  mocks.emailOtp.mockResolvedValue({ error: { status: 400, message: "private provider detail" } });
  const code = await requestCode();
  fireEvent.change(code, { target: { value: "654321" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("That code is invalid or has expired.");
  expect(screen.getByText("owner@fixture.test")).toBeVisible();
  expect(screen.getByLabelText("6-digit code")).toBeEnabled();
  expect(screen.queryByText("private provider detail")).toBeNull();
  expect(mocks.replace.mock.calls.some(([url]) => url.includes("/complete"))).toBe(false);
});

it("blocks duplicate verification and never auto-submits an incomplete code", async () => {
  mocks.emailOtp.mockReturnValue(new Promise(() => {}));
  const code = await requestCode();
  fireEvent.change(code, { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(mocks.emailOtp).not.toHaveBeenCalled();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  await waitFor(() => expect(mocks.emailOtp).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Verifying code");
});

it.each([
  [429, "Too many verification attempts. Please try again later."],
  [503, "Sign-in is temporarily unavailable. Please try again shortly."],
] as const)("keeps the code form recoverable after verification status %s", async (status, message) => {
  mocks.emailOtp.mockResolvedValue({ error: { status, message: "private provider detail" } });
  const code = await requestCode();
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  if (status === 429) expect(screen.getByRole("button", { name: /Verify again in/ })).toBeDisabled();
  else expect(screen.getByRole("button", { name: "Verify and continue" })).toBeEnabled();
  expect(mocks.replace.mock.calls.some(([url]) => url.includes("/complete"))).toBe(false);
});
