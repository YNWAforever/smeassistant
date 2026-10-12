// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let localeHeader = "en";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-sme-locale": localeHeader }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/missing", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { copy } from "@/lib/copy";
import NotFound from "./not-found";

describe("branded 404", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("renders in %s with locale-prefixed recovery links", async (locale) => {
    localeHeader = locale;
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(await NotFound());
    const t = copy[locale].funnel.notFound;
    expect(root.querySelector("h1")?.textContent).toBe(t.title);
    const links = Array.from(root.querySelectorAll(".not-found-page a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([`/${locale}/scan`, `/${locale}/sample-report`, `/${locale}`]);
  });
});
