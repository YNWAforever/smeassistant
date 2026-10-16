// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { SignInFlow } from "./sign-in-flow";
// Load the actual SDK during test collection rather than timing its module
// transformation as part of the UI's response-to-error assertion.
import "@/lib/identity/client";

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
