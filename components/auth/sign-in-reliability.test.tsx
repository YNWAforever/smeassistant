// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), emailOtp: vi.fn(), requestCode: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { emailOtp: mocks.emailOtp } } }));
vi.mock("@/lib/identity/email-code-client", () => ({ requestEmailCode: mocks.requestCode }));

import { SignInFlow } from "./sign-in-flow";

const flow = { locale: "en" as const, claim: null, returnTo: "/en/owner/select-workspace", method: null };
beforeEach(() => {
  mocks.requestCode.mockResolvedValue({ error: null });
  mocks.emailOtp.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });

async function openCodeForm() {
  render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "owner@fixture.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  });
  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
}

it.each(["returned", "thrown"] as const)("honors a %s verification 429 countdown and permits only an explicit retry after its deadline", async mode => {
  vi.useFakeTimers();
  const error = { status: 429, response: { headers: new Headers({ "retry-after": "120" }) } };
  if (mode === "returned") mocks.emailOtp.mockResolvedValueOnce({ error });
  else mocks.emailOtp.mockRejectedValueOnce(error);
  await openCodeForm();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Too many verification attempts");
  const retry = screen.getByRole("button", { name: "Verify again in 120s" });
  expect(retry).toBeDisabled();
  fireEvent.submit(retry.closest("form")!);
  await act(async () => { await vi.advanceTimersByTimeAsync(119_000); });
  expect(screen.getByRole("button", { name: "Verify again in 1s" })).toBeDisabled();
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole("button", { name: "Verify and continue" })).toBeEnabled();
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  expect(mocks.emailOtp).toHaveBeenCalledTimes(2);
  expect(mocks.replace).toHaveBeenLastCalledWith(expect.stringContaining("/sign-in/complete?"));
});

it("uses a bounded one-minute verification cooldown when the SDK error has no Retry-After", async () => {
  vi.useFakeTimers();
  mocks.emailOtp.mockRejectedValueOnce({ status: 429 });
  await openCodeForm();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  expect(screen.getByRole("button", { name: "Verify again in 60s" })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole("button", { name: "Verify and continue" })).toBeEnabled();
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
});

it("does not clear a verification cooldown by resending a code to the same recipient", async () => {
  vi.useFakeTimers();
  mocks.emailOtp.mockRejectedValueOnce({ status: 429, headers: new Headers({ "retry-after": "120" }) });
  await openCodeForm();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Send another code$/ })); });
  expect(screen.getByRole("button", { name: "Verify again in 60s" })).toBeDisabled();
  expect(mocks.requestCode).toHaveBeenCalledTimes(2);
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
});

it.each([
  ["en", "Try email instead", "Try Google again", "Email address"],
  ["zh-HK", "改用電郵", "再試一次 Google", "電郵地址"],
  ["zh-TW", "改用電子郵件", "再試一次 Google", "電子郵件地址"],
] as const)("offers a usable code alternative and Google after a legacy invalid-code failure without method context (%s)", (locale, email, google, label) => {
  render(<SignInFlow flow={{ ...flow, locale }} initialReason="expired" />);
  expect(screen.getByRole("link", { name: google })).toHaveAttribute("href", expect.stringContaining("method=google"));
  fireEvent.click(screen.getByRole("button", { name: email }));
  expect(screen.getByLabelText(label)).toBeEnabled();
  expect(mocks.requestCode).not.toHaveBeenCalled();
  expect(mocks.emailOtp).not.toHaveBeenCalled();
});
