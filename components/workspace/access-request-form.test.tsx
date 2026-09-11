// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AccessRequestForm } from "@/components/workspace/access-request-form";

function render(market: "hk" | "tw", isChinese = false) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<AccessRequestForm slug="abc123" market={market} isChinese={isChinese} />);
  return root;
}

describe("AccessRequestForm", () => {
  it("says filing is not ownership", () => {
    expect(render("hk").textContent).toContain("not proof of ownership");
  });

  // There is no upload path anywhere in this feature, so the form must not
  // invite one -- a file input here would be a promise nothing keeps.
  it("asks for a checkable reference, not a document", () => {
    const root = render("hk");
    expect(root.textContent).toContain("Do not upload documents");
    expect(root.querySelector('input[type="file"]')).toBeNull();
  });

  it("offers WhatsApp in HK and LINE in TW", () => {
    expect(render("hk").textContent).toContain("WhatsApp");
    expect(render("tw").textContent).toContain("LINE");
  });

  it("never offers a channel from the other market", () => {
    expect(render("hk").textContent).not.toContain("LINE");
    expect(render("tw").textContent).not.toContain("WhatsApp");
  });

  it("keeps the same meaning in Chinese", () => {
    const text = render("hk", true).textContent ?? "";
    expect(text).toContain("提交申請不等於證明擁有權");
    expect(text).toContain("不需上載文件");
  });
});
