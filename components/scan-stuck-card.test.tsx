// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// FactType (used inside the card) reads its own locale from the pathname
// (components/product-ui.tsx:544-545), so it needs a router context even
// under renderToStaticMarkup. Same pattern as landing-page.test.tsx /
// onboarding-page.test.tsx / score-dial.test.tsx.
const nav = vi.hoisted(() => ({ pathname: "/en" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { ScanStuckCard } from "@/components/scan-stuck-card";

function render(locale: "en" | "zh-HK" | "zh-TW") {
  nav.pathname = `/${locale}`;
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<ScanStuckCard locale={locale} reference="SCAN-3FA85F" />);
  return root;
}

describe("ScanStuckCard", () => {
  it("explains the stuck scan, gives the reference, and links to a new scan instead of Resume", () => {
    const root = render("en");
    expect(root.textContent).toContain("This scan stopped responding");
    expect(root.textContent).toContain("within 24 hours");
    expect(root.textContent).toContain("Reference SCAN-3FA85F");
    expect(root.querySelector("a")?.getAttribute("href")).toBe("/en/scan");
    expect(root.textContent).not.toMatch(/resume/i);
  });

  it("is localized", () => {
    expect(render("zh-HK").textContent).toContain("這次掃描停止回應");
    expect(render("zh-TW").querySelector("a")?.getAttribute("href")).toBe("/zh-TW/scan");
  });
});
