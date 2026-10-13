// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/owner/kam-man-house", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { PublicPageFrame } from "@/components/product-ui";
import { WorkspacePageFrame } from "@/components/workspace-shell";
import { demoShellWorkspaceFor } from "@/lib/demo-data";

function mount(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

// The first Tab stop used to be the logo; the workspace sidebar put about a
// dozen stops before the content.
describe("skip link", () => {
  it.each([["en", "Skip to content"], ["zh-HK", "跳到主要內容"]] as const)("is the first link on public pages and targets the content (%s)", (locale, label) => {
    const root = mount(renderToStaticMarkup(<PublicPageFrame locale={locale}><main>Body</main></PublicPageFrame>));
    const first = root.querySelector("a");
    expect(first?.textContent).toBe(label);
    expect(first?.getAttribute("href")).toBe("#main-content");
    expect(root.querySelector("#main-content")?.getAttribute("tabindex")).toBe("-1");
  });

  it("is the first link in the workspace and targets its <main>", () => {
    const root = mount(renderToStaticMarkup(<WorkspacePageFrame locale="en" workspace={demoShellWorkspaceFor("en")}><p>Body</p></WorkspacePageFrame>));
    expect(root.querySelector("a")?.textContent).toBe("Skip to content");
    expect(root.querySelector("main#main-content")).not.toBeNull();
  });
});
