// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AccessRequestDecision } from "@/components/ops/access-request-decision";

function render(props: { enabled: boolean; resolved: boolean }) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<AccessRequestDecision requestId="req-1" {...props} />);
  return root;
}

describe("AccessRequestDecision", () => {
  it("offers the three decisions when DEC-06 is settled", () => {
    const text = render({ enabled: true, resolved: false }).textContent ?? "";
    expect(text).toContain("Approve and assign");
    expect(text).toContain("Ask for more");
    expect(text).toContain("Reject");
  });

  // Names what is missing, rather than "coming soon".
  it("names the missing decision inputs when the flag is off", () => {
    const text = render({ enabled: false, resolved: false }).textContent ?? "";
    expect(text).toContain("named accountable operating role");
    expect(text).toContain("independent-verification procedure");
    expect(text).not.toContain("Approve and assign");
  });

  it("offers nothing on a request already decided", () => {
    const text = render({ enabled: true, resolved: true }).textContent ?? "";
    expect(text).toContain("already been decided");
    expect(text).not.toContain("Approve and assign");
  });

  // Item 19: the reviewer records WHAT was verified and BY WHOM, and the form
  // must ask for both rather than leaving the route to reject the submission.
  it("asks what was verified and who verified it", () => {
    const text = render({ enabled: true, resolved: false }).textContent ?? "";
    expect(text).toContain("What independent control or authority did you verify?");
    expect(text).toContain("Verified by");
  });
});
