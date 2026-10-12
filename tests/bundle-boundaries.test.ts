import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/**
 * Next ships every client component a server module imports, whether or not it
 * renders, and Turbopack does not dedupe a module reached from the root
 * not-found and from a page. Each rule below kept 15-65 kB of JavaScript off
 * public pages when it was introduced.
 */
describe("client bundle boundaries", () => {
  it("public-pages does not re-export the client page components", () => {
    expect(source("components/public-pages.tsx")).not.toMatch(/export \{[^}]*\} from "@\/components\//);
  });

  it("the root 404 renders server-only chrome, not the client public frame", () => {
    const notFound = source("app/not-found.tsx");
    expect(notFound).not.toContain("@/components/product-ui");
    expect(source("components/public-chrome.tsx")).not.toMatch(/^["']use client["']/m);
  });

  it("the workspace shell is not part of the public chrome module", () => {
    const productUi = source("components/product-ui.tsx");
    expect(productUi).not.toContain("components/ui/sidebar");
    expect(productUi).not.toMatch(/export function Workspace(Shell|PageFrame)\b/);
  });

  it("pages that render the Visibility Operator load the panel lazily", () => {
    for (const path of ["components/landing-page.tsx", "components/report-view.tsx", "components/public-demo-workspace.tsx", "components/product-ui.tsx"]) {
      expect(source(path)).not.toContain("pocket-assistant/assistant-sheet");
    }
  });
});
