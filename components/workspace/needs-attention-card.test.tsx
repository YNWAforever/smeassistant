// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NeedsAttentionCard } from "./needs-attention-card";
import type { OwnerProblem } from "@/lib/ops/failure-types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const problem: OwnerProblem = { kind: "draft_failed", id: "r1", reference: "RUN-123ABC", correlationId: null, occurredAt: "2026-10-01T00:00:00Z", workspace: { id: "ws", slug: "shop", name: "Shop" }, locationId: "loc", actionId: "a1", businessName: "Shop", reason: "invalid_output", attempts: null, operatorAction: "none", ownerAction: "open_action", contactHref: null };
function view(overrides: Partial<OwnerProblem> = {}, tier: "lite" | "paid" = "paid", role: "owner" | "viewer" = "owner") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<NeedsAttentionCard locale="zh-HK" workspaceSlug="shop" workspaceId="ws" tier={tier} role={role} consentPolicyVersion="2026-07-28" problems={[{ ...problem, ...overrides }, { ...problem, id: "second" }]} />);
  return root;
}
describe("one shop recovery line", () => {
  it("keeps one problem and one recovery; references are only in the closed Why", () => {
    const root = view();
    expect(root.querySelectorAll("[data-problem]")).toHaveLength(1);
    expect([...root.querySelectorAll("a")].map(a => a.textContent)).toEqual(["再開張稿"]);
    expect(root.querySelector('a[href*="activity"]')).toBeNull();
    const details = root.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("RUN-123ABC");
    details?.remove();
    expect(root.textContent).not.toMatch(/參考|RUN-|invalid_output|生成|評分/);
  });
  it("places the allowed rescan beside its sentence and hides it for an ineligible shop", () => {
    const paid = view({ kind: "scan_failed", reason: "SCORING_FAILED", ownerAction: "rescan" });
    expect(paid.querySelector('button')?.textContent).toContain("再掃一次");
    for (const root of [view({ kind: "scan_failed", ownerAction: "rescan" }, "lite"), view({ kind: "scan_failed", ownerAction: "rescan" }, "paid", "viewer")]) {
      expect(root.querySelectorAll("button:not([disabled])")).toHaveLength(0);
      root.querySelector("details")?.remove();
      expect(root.textContent).toContain("下次掃完再睇");
    }
  });
});

it("uses the real dead-letter owner-action matrix and never points at an absent rescan", async () => {
  const { buildOwnerProblems } = await import("@/lib/ops/owner-actions");
  const [dead] = buildOwnerProblems([{ ...problem, kind: "scan_dead_lettered" }], { role: "owner", locationScope: null, tier: "paid" }, null);
  const root = view(dead);
  root.querySelector("details")?.remove();
  expect(root.textContent).toContain("下次掃完再睇");
  expect(root.textContent).not.toContain("再掃一次");
  expect(root.querySelectorAll("button")).toHaveLength(0);
});
