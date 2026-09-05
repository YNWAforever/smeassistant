// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));
import { SignInPage } from "@/components/sign-in-page";
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
it("blocks native pre-hydration submission then posts email with claim context after hydration", async () => {
  const page = <SignInPage locale="en" claim="fixture-report" returnTo="/en/owner/fixture" />;
  const container = document.createElement("div");
  container.innerHTML = renderToString(page); document.body.append(container);
  const input = container.querySelector<HTMLInputElement>("#sign-in-email")!;
  const submit = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(input.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
  const fetch = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetch);
  await act(async () => { root = hydrateRoot(container, page); });
  await waitFor(() => expect(input.disabled).toBe(false));
  expect(submit.disabled).toBe(false);
  fireEvent.change(input, { target: { value: "owner@acceptance.test" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith("/api/owner/magic-link", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "owner@acceptance.test", slug: "fixture-report", locale: "en", returnTo: "/en/owner/fixture" }) }));
});
