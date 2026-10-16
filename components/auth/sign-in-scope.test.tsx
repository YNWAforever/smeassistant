// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AuthFlow } from "@/lib/identity/sign-in-flow";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), load: vi.fn(), emailOtp: vi.fn(), social: vi.fn(), requestCode: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/load-client", () => ({ loadAuthClient: mocks.load, preloadAuthClient: vi.fn() }));
vi.mock("@/lib/identity/email-code-client", () => ({ requestEmailCode: mocks.requestCode }));
import { SignInFlow } from "./sign-in-flow";

const flow: AuthFlow = { locale: "en", claim: "old-report", returnTo: "/en/owner/old-shop", method: null };
const client = { signIn: { emailOtp: mocks.emailOtp, social: mocks.social } };
const scopes: [string, Partial<AuthFlow>][] = [
  ["claim", { claim: "new-report" }],
  ["workspace destination", { returnTo: "/en/owner/new-shop" }],
  ["account-switch intent", { intent: "switch_account" }],
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function sendEmail(email = "old@fixture.test") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
}
beforeEach(() => {
  mocks.load.mockResolvedValue(client);
  mocks.requestCode.mockResolvedValue({ error: null });
  mocks.emailOtp.mockResolvedValue({ error: null });
  mocks.social.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });

it.each(scopes)("clears the old draft and ignores a held email request after changing %s", async (_name, change) => {
  const held = deferred<{ error: null | { status: number; headers: Headers } }>();
  mocks.requestCode.mockReturnValueOnce(held.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { sendEmail(); });
  expect(screen.getByRole("status")).toHaveTextContent("Sending sign-in code");
  view.rerender(<SignInFlow flow={{ ...flow, ...change }} initialReason={null} />);
  expect(screen.getByLabelText("Email address")).toBeEnabled();
  expect(screen.getByLabelText("Email address")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@fixture.test" } });
  mocks.replace.mockClear();
  await act(async () => { held.resolve({ error: { status: 429, headers: new Headers({ "retry-after": "120" }) } }); });
  expect(screen.getByLabelText("Email address")).toHaveValue("new@fixture.test");
  expect(screen.queryByLabelText("6-digit code")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText("old@fixture.test")).toBeNull();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.requestCode).toHaveBeenCalledTimes(1);
});

it.each(scopes)("clears the old code and prevents a held verification from navigating after changing %s", async (_name, change) => {
  const held = deferred<{ error: null }>();
  mocks.emailOtp.mockReturnValueOnce(held.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { sendEmail(); });
  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  expect(screen.getByRole("button", { name: "Verify and continue" })).toBeDisabled();
  view.rerender(<SignInFlow flow={{ ...flow, ...change }} initialReason={null} />);
  expect(screen.getByLabelText("Email address")).toBeEnabled();
  expect(screen.queryByLabelText("6-digit code")).toBeNull();
  mocks.replace.mockClear();
  await act(async () => { held.resolve({ error: null }); });
  expect(screen.getByLabelText("Email address")).toHaveValue("");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
});

it("does not dispatch Google when its held client load resolves after a workspace change", async () => {
  const loading = deferred<typeof client>();
  mocks.load.mockReturnValueOnce(loading.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Continue with Google$/ })); });
  view.rerender(<SignInFlow flow={{ ...flow, returnTo: "/en/owner/new-shop" }} initialReason={null} />);
  mocks.replace.mockClear();
  await act(async () => { loading.resolve(client); });
  expect(screen.getByLabelText("Email address")).toBeEnabled();
  expect(screen.queryByText("Opening Google")).toBeNull();
  expect(mocks.social).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("does not dispatch verification when its held client load resolves after a claim change", async () => {
  const loading = deferred<typeof client>();
  mocks.load.mockReturnValueOnce(loading.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { sendEmail(); });
  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  view.rerender(<SignInFlow flow={{ ...flow, claim: "new-report" }} initialReason={null} />);
  mocks.replace.mockClear();
  await act(async () => { loading.resolve(client); });
  expect(screen.getByLabelText("Email address")).toBeEnabled();
  expect(mocks.emailOtp).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("ignores a held Google failure after changing the account-switch intent", async () => {
  const held = deferred<{ error: null }>();
  mocks.social.mockReturnValueOnce(held.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Continue with Google$/ })); });
  expect(mocks.social).toHaveBeenCalledTimes(1);
  view.rerender(<SignInFlow flow={{ ...flow, intent: "switch_account" }} initialReason={null} />);
  await act(async () => { held.reject(new Error("old Google failure")); });
  expect(screen.getByLabelText("Email address")).toBeEnabled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/If Google keeps returning the same account/)).toBeVisible();
});

it("retains pending email progress when only the internal method changes", async () => {
  const held = deferred<{ error: null }>();
  mocks.requestCode.mockReturnValueOnce(held.promise);
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { sendEmail(); });
  view.rerender(<SignInFlow flow={{ ...flow, method: "email" }} initialReason={null} />);
  expect(screen.getByRole("status")).toHaveTextContent("Sending sign-in code");
  await act(async () => { held.resolve({ error: null }); });
  expect(screen.getByLabelText("6-digit code")).toBeEnabled();
  expect(screen.getByText("old@fixture.test")).toBeVisible();
  expect(mocks.requestCode).toHaveBeenCalledTimes(1);
});

it("retains the entered code and cooldown when locale, method and the destination's locale prefix change", async () => {
  vi.useFakeTimers();
  mocks.emailOtp.mockResolvedValueOnce({ error: { status: 429, headers: new Headers({ "retry-after": "120" }) } });
  const view = render(<SignInFlow flow={flow} initialReason={null} />);
  await act(async () => { sendEmail(); });
  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Verify and continue" })); });
  view.rerender(<SignInFlow flow={{ ...flow, locale: "zh-HK", method: "email", returnTo: "/zh-HK/owner/old-shop" }} initialReason={null} />);
  expect(screen.getByLabelText("六位驗證碼")).toHaveValue("123456");
  expect(screen.getByRole("button", { name: "120 秒後可再驗證" })).toBeDisabled();
  expect(mocks.requestCode).toHaveBeenCalledTimes(1);
  expect(mocks.emailOtp).toHaveBeenCalledTimes(1);
});
