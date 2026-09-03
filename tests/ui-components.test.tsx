import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Progress } from "@/components/ui/progress";
import { SidebarMenuSkeleton } from "@/components/ui/sidebar";

// Ported from the vinext-era tests/ui-components.test.mjs (node:test + vite SSR).
// Static markup rendering needs no DOM, so these run under the default node
// environment. Case 1 (built CSS utilities) depended on the vinext `dist/`
// output and case 3 (ChartStyle) went with components/ui/chart.tsx.

describe("ui primitives", () => {
  it("forwards progress semantics to the primitive", () => {
    const html = renderToStaticMarkup(<Progress value={37} />);

    expect(html).toMatch(/aria-valuenow="37"/);
    expect(html).toMatch(/aria-valuetext="37%"/);
    expect(html).toMatch(/data-state="loading"/);
  });

  it("renders sidebar skeletons deterministically", () => {
    const first = renderToStaticMarkup(<SidebarMenuSkeleton />);
    const second = renderToStaticMarkup(<SidebarMenuSkeleton />);

    expect(first).toBe(second);
    expect(first).toMatch(/--skeleton-width:70%/);
  });
});
