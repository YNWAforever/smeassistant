// @vitest-environment jsdom
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// product-ui's PublicHeader renders LocaleSelect, which calls all three hooks.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/owner/kam-man-house",
  useSearchParams: () => new URLSearchParams(),
}));

import { ScoreDial } from "@/components/product-ui";

function render(node: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(node);
  return root;
}

describe("ScoreDial change claim", () => {
  it("makes no change claim at all when no delta is given", () => {
    // Home used to coerce a null delta to 0, so the largest number on the page
    // asserted "unchanged since comparable scan" next to a "Not comparable"
    // badge. The component must stay silent when the caller omits the prop --
    // in the visible text AND in the screen-reader label.
    const root = render(<ScoreDial score={62} coverage={78} />);
    expect(root.textContent).not.toContain("since comparable scan");
    expect(root.querySelector("[role=img]")?.getAttribute("aria-label")).not.toContain("Change");
  });

  it("still reports a real comparable change", () => {
    const root = render(<ScoreDial score={62} coverage={78} delta={4} />);
    expect(root.textContent).toContain("+4");
    expect(root.textContent).toContain("since comparable scan");
    expect(root.querySelector("[role=img]")?.getAttribute("aria-label")).toContain("Change 4");
  });

  it("reports a genuine zero when the scans really were comparable", () => {
    // A measured no-change is an honest Observed result; only a fabricated one
    // was the problem.
    const root = render(<ScoreDial score={62} coverage={78} delta={0} />);
    expect(root.textContent).toContain("since comparable scan");
  });
});
