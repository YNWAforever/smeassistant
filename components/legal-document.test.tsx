// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/legal/privacy", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { LegalDocument } from "./legal-document";

describe("LegalDocument", () => {
  it("lists every section in an in-page contents nav that links to its heading", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(
      <LegalDocument locale="en" title="Privacy" versionLabel="Version 2026-07-28" backLabel="Back" contentsLabel="On this page"
        sections={[{ key: "controller", heading: "Who collects", body: "Fimmick." }, { key: "rights", heading: "Your rights", body: "Ask us." }]} />,
    );
    const nav = root.querySelector("nav[aria-labelledby='legal-toc-heading']");
    expect(nav?.querySelector("#legal-toc-heading")?.textContent).toBe("On this page");
    const links = Array.from(nav?.querySelectorAll("a") ?? []).map((a) => [a.getAttribute("href"), a.textContent]);
    expect(links).toEqual([["#controller", "Who collects"], ["#rights", "Your rights"]]);
    for (const [href] of links) expect(root.querySelector(href!)).not.toBeNull();
  });
});
