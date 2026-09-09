// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetch: vi.fn(), social: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { social: mocks.social }, signOut: mocks.signOut } }));

import { SignInCompletion } from "./sign-in-completion";

const flow = { locale: "en" as const, claim: null, returnTo: "/en/owner/select-workspace", method: "google" as const };

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("posts completion once under StrictMode and replaces only a local server destination", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "redirect", destination: "/en/owner/select-workspace" })); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />, { reactStrictMode: true });
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1)); await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en/owner/select-workspace"));
  expect(mocks.fetch).toHaveBeenCalledWith("/api/owner/sign-in/complete", expect.objectContaining({ credentials: "same-origin" }));
});

it("shows a server-authoritative no-access state and reports a failed account change", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "no_access" })); mocks.signOut.mockRejectedValue(new Error("fixture")); vi.stubGlobal("fetch", mocks.fetch);
  const { container } = render(<SignInCompletion flow={flow} />);
  await screen.findByText(/does not have access/i);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: /sign in to your workspace/i })));
  fireEvent.click(screen.getByRole("button", { name: /change account/i }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/we could not change the account/i)); expect(container.textContent).not.toContain("fixture");
});

it("uses Google technical recovery for a rejected completion request and starts a fresh Google attempt", async () => {
  mocks.fetch.mockRejectedValue(new Error("fixture request failure")); mocks.social.mockResolvedValue({ error: null }); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent(/could not finish Google sign-in/i);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: /sign in to your workspace/i })));
  fireEvent.click(screen.getByRole("button", { name: /start Google sign-in again/i }));
  await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" })));
});

it.each([
  ["a rejected HTTP response", new Response(null, { status: 503 })],
  ["a non-local destination", Response.json({ kind: "redirect", destination: "https://fixture.test/escape" })],
])("uses technical recovery after %s", async (_scenario, response) => {
  mocks.fetch.mockResolvedValue(response); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent(/could not finish Google sign-in/i);
  expect(screen.queryByText(/could not change the account/i)).toBeNull();
});

it("uses technical recovery when the completion request times out", async () => {
  vi.useFakeTimers();
  mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(screen.getByRole("alert")).toHaveTextContent(/could not finish Google sign-in/i);
});

it("waits for successful sign-out before returning to a fresh start state", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "no_access" })); mocks.signOut.mockResolvedValue(undefined); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />);
  await screen.findByText(/does not have access/i);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: /sign in to your workspace/i })));
  fireEvent.click(screen.getByRole("button", { name: /change account/i }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining("/en/owner/sign-in?returnTo="));
});

it("returns an email completion failure to a fresh email start without sending automatically", async () => {
  mocks.fetch.mockRejectedValue(new Error("fixture request failure")); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={{ ...flow, method: "email" }} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent(/could not finish email sign-in/i);
  fireEvent.click(screen.getByRole("button", { name: /start email sign-in again/i }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining("method=email")));
  expect(mocks.social).not.toHaveBeenCalled();
});

it("moves focus to the heading while a user-requested account change is pending", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "no_access" })); mocks.signOut.mockReturnValue(new Promise(() => {})); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />);
  await screen.findByText(/does not have access/i);
  const change = screen.getByRole("button", { name: /change account/i });
  change.focus(); fireEvent.click(change);
  await screen.findByRole("status");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: /sign in to your workspace/i })));
});

it("uses generic technical recovery when callback method context is absent", async () => {
  mocks.fetch.mockRejectedValue(new Error("fixture request failure")); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={{ ...flow, method: null }} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent(/could not finish sign-in\. start a new sign-in attempt/i);
  fireEvent.click(screen.getByRole("button", { name: /start sign-in again/i }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(expect.stringContaining("/en/owner/sign-in?returnTo=")));
  expect(mocks.social).not.toHaveBeenCalled();
});
