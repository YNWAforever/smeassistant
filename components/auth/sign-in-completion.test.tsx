// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetch: vi.fn(), social: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/identity/client", () => ({ authClient: { signIn: { social: mocks.social }, signOut: mocks.signOut } }));
import { SignInCompletion } from "./sign-in-completion";
const flow = { locale: "en" as const, claim: null, returnTo: "/en/owner/select-workspace", method: "google" as const };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("posts completion once under StrictMode and replaces only a local server destination", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "redirect", destination: "/en/owner/select-workspace" })); vi.stubGlobal("fetch", mocks.fetch);
  render(<SignInCompletion flow={flow} />, { reactStrictMode: true });
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1)); await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/en/owner/select-workspace"));
  expect(mocks.fetch).toHaveBeenCalledWith("/api/owner/sign-in/complete", expect.objectContaining({ credentials: "same-origin" }));
});
it("shows a server-authoritative no-access state and recovers when account change fails", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ kind: "no_access" })); mocks.signOut.mockRejectedValue(new Error("fixture")); vi.stubGlobal("fetch", mocks.fetch);
  const { container } = render(<SignInCompletion flow={flow} />);
  await screen.findByText(/does not have access/i); fireEvent.click(screen.getByRole("button", { name: /change account/i }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/we could not change the account/i)); expect(container.textContent).not.toContain("fixture");
});