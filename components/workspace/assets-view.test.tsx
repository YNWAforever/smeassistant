// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetsView } from "./assets-view";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/zh-HK/owner/shop/business/assets", useSearchParams: () => new URLSearchParams() }));
it("keeps the viewer on Assets with one-line role copy and an Ask owner upload primary", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<AssetsView locale="zh-HK" workspaceId="ws" timezone="Asia/Hong_Kong" role="viewer" location="all" locations={[]} assets={[]} canUpload={false} />);
  expect(root.querySelector("h1")).not.toBeNull();
  expect([...root.querySelectorAll("button")].find(b => b.textContent?.includes("問店主改"))?.hasAttribute("disabled")).toBe(true);
  expect(root.querySelector(".role-notice")?.textContent).toBe("你睇到，改要問店主。");
});
