// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
// PublicPageFrame renders PublicHeader -> LocaleSelect, which calls all three
// navigation hooks; stubbing the frame (the tests/sign-in-hydration.test.tsx
// precedent) keeps the form itself as the rendered subtree.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/unlock/fixture",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/product-ui", () => ({ PublicPageFrame: ({ children }: { children: ReactNode }) => children }));
import { copy, type PrototypeLocale } from "@/lib/copy";
import { UnlockPage } from "@/components/unlock-page";

const LOCALES: PrototypeLocale[] = ["en", "zh-HK", "zh-TW"];

function render(locale: PrototypeLocale) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<UnlockPage locale={locale} slug="fixture" market="hk" />);
  return root;
}

describe("UnlockPage optional email field", () => {
  it.each(LOCALES)("labels it as a later sign-in address, not a report-recovery promise (%s)", (locale) => {
    const root = render(locale);
    expect(root.querySelector("#unlock-recovery")).not.toBeNull();
    expect(root.querySelector('label[for="unlock-recovery"]')?.textContent).toBe(copy[locale].funnel.unlock.signInEmailLabel);
    expect(root.textContent).toContain(copy[locale].funnel.unlock.signInEmailHint);
  });

  it("associates the hint with the field for screen readers", () => {
    const root = render("en");
    expect(root.querySelector("#unlock-recovery")?.getAttribute("aria-describedby")).toBe("unlock-recovery-hint");
    expect(root.querySelector("#unlock-recovery-hint")?.textContent).toBe(copy.en.funnel.unlock.signInEmailHint);
  });

  it.each(LOCALES)("never renders the withdrawn recovery promise (%s)", (locale) => {
    expect(render(locale).textContent).not.toMatch(/reopen your report|on another device|重新開啟報告|其他裝置/);
  });
});
