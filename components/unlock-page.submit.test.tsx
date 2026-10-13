// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/en/unlock/fixture", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));

import { copy, type PrototypeLocale } from "@/lib/copy";
import { UnlockPage } from "@/components/unlock-page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// A failed unlock showed the server's own error string to the owner.
it.each(["en", "zh-HK", "zh-TW"] as PrototypeLocale[])("shows its own copy, not the server's error, when unlock fails (%s)", async (locale) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "unlock_failed: complete_report_unlock raised" }) }));
  const c = copy[locale].funnel.unlock;
  render(<UnlockPage locale={locale} slug="fixture" market="hk" />);
  fireEvent.change(document.getElementById("unlock-contact")!, { target: { value: "owner@example.com" } });
  const email = document.getElementById("unlock-channel-email");
  if (email) fireEvent.click(email);
  fireEvent.change(document.getElementById("unlock-contact")!, { target: { value: "owner@example.com" } });
  fireEvent.click(document.getElementById("delivery-consent")!);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(c.submit) }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(c.errors.failed);
  expect(alert.textContent).not.toContain("complete_report_unlock");
  expect(document.activeElement).toBe(alert);
});
