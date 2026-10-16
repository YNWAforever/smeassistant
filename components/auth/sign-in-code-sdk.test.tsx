// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { SignInFlow } from "./sign-in-flow";
// Load the actual SDK during test collection rather than timing its module
// transformation as part of the UI's response-to-error assertion.
import { authClient } from "@/lib/identity/client";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([
  [401, "INVALID_OTP", "That code is invalid or has expired."],
  [429, "TOO_MANY_REQUESTS", "Too many verification attempts. Please try again later."],
  [503, "INTERNAL_SERVER_ERROR", "Sign-in is temporarily unavailable. Please try again shortly."],
] as const)("recovers from HTTP %s through the real pinned SDK client", async (status, code, message) => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/email-otp/send-verification-otp")) return Response.json({ ok: true });
    if (url.includes("/sign-in/email-otp")) return Response.json({ code, message: "private provider detail" }, { status });
    throw new Error("unexpected_fixture_request");
  }));
  render(<SignInFlow flow={{ locale: "en", claim: null, returnTo: null, method: null }} initialReason={null} />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(navigation.replace.mock.calls.some(([url]) => url.includes("/complete"))).toBe(false);
});

it("uses the one-minute verification fallback when the pinned SDK normalizes away Retry-After", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/email-otp/send-verification-otp")) return Response.json({ ok: true });
    if (String(input).includes("/sign-in/email-otp")) {
      return Response.json({ code: "TOO_MANY_REQUESTS", message: "private provider detail", retryAfterSeconds: 120 }, { status: 429, headers: { "retry-after": "120" } });
    }
    throw new Error("unexpected_fixture_request");
  }));
  render(<SignInFlow flow={{ locale: "en", claim: null, returnTo: null, method: null }} initialReason={null} />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));
  const retry = await screen.findByRole("button", { name: /Verify again in (59|60)s/ });
  expect(retry).toBeDisabled();
  expect(screen.getByRole("alert")).not.toHaveTextContent("private provider detail");
});

it("the pinned SDK retains status but discards retry headers and arbitrary JSON retry metadata", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    error: "rate_limited", retryAfterSeconds: 120, retry_after_seconds: 120,
  }, { status: 429, headers: { "retry-after": "120" } })));
  const error: unknown = await authClient.signIn.emailOtp({ email: "metadata@fixture.test", otp: "123456" })
    .then(result => result.error, (failure: unknown) => failure);
  expect(error).toMatchObject({ status: 429 });
  for (const field of ["headers", "response", "body", "retryAfterSeconds", "retry_after_seconds"]) expect(error).not.toHaveProperty(field);
});
