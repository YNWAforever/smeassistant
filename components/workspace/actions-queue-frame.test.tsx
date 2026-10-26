// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { copy } from "@/lib/copy";
import { tabHref } from "./actions-list-view";
import { ActionsQueueFrame, type QueueView } from "./actions-queue-frame";

const base = "/en/owner/kam-man-house";
function frame(role: "owner" | "manager" | "viewer", view: QueueView = "all", locale: "en" | "zh-HK" | "zh-TW" = "en") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <ActionsQueueFrame locale={locale} workspaceSlug="kam-man-house" role={role} view={view} location="yik-yam" counts={{ all: 4, drafts: 2 }} tabHref={(key) => tabHref(base, { location: "yik-yam", channel: "google" }, key)}>
      <p>body</p>
    </ActionsQueueFrame>,
  );
  return root;
}

describe("Actions queue frame (Phase 4)", () => {
  it("keeps a single waiting list and puts Due and Fimmick drafts behind More", () => {
    const root = frame("owner");
    const more = root.querySelector("details")!;
    expect(more).not.toBeNull();
    expect(more.hasAttribute("open")).toBe(false);
    expect(more.querySelector("summary")?.textContent).toBe("More");
    expect([...more.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual([
      `${base}/actions?location=yik-yam&view=due`, `${base}/actions?location=yik-yam&view=fixpack`,
    ]);
    expect(root.querySelectorAll(".action-tab-list a")).toHaveLength(0);
    expect(root.querySelector('a[href*="view=completed"]')).toBeNull();
  });

  it("keeps the selected secondary view accessible and provides a way back to the waiting list", () => {
    const root = frame("owner", "fixpack");
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toBe("Fimmick drafts");
    expect(root.querySelector(`a[href="${base}/actions?location=yik-yam&channel=google"]`)).not.toBeNull();
  });

  it("offers New to owners and managers but not viewers", () => {
    for (const role of ["owner", "manager"] as const) {
      expect(frame(role).querySelector(`a[href="${base}/actions/new?location=yik-yam"]`)?.textContent).toContain("New");
    }
    const viewer = frame("viewer");
    expect(viewer.querySelector('a[href*="/actions/new"]')).toBeNull();
    expect(viewer.querySelector(".role-notice[data-kind=viewer]")).not.toBeNull();
  });

  it.each(["zh-HK", "zh-TW"] as const)("localises the More views in %s", (locale) => {
    const text = frame("owner", "all", locale).querySelector("details")?.textContent ?? "";
    expect(text).toContain(copy[locale].shell.views.due);
    expect(text).toContain(copy[locale].shell.views.fixPack);
  });
});
