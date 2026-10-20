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
  it("shows the status tabs plus Due and Fix Pack as views of one queue", () => {
    const tabs = Array.from(frame("owner").querySelectorAll("nav a"));
    expect(tabs.map((tab) => tab.textContent?.replace(/\s*\d+$/, ""))).toEqual(["All", "Needs input", "Drafts", "Approvals", "Completed", "Due", "Fix Pack"]);
    expect(tabs[0].textContent).toContain("4");
    expect(tabs[5].textContent).toBe("Due");
  });

  it("keeps list filters on status tabs and only the location on Due and Fix Pack", () => {
    const hrefs = Array.from(frame("owner").querySelectorAll("nav a")).map((tab) => tab.getAttribute("href"));
    expect(hrefs[2]).toBe(`${base}/actions?location=yik-yam&channel=google&view=drafts`);
    expect(hrefs[5]).toBe(`${base}/actions?location=yik-yam&view=due`);
    expect(hrefs[6]).toBe(`${base}/actions?location=yik-yam&view=fixpack`);
  });

  it("marks the current view", () => {
    expect(frame("owner", "fixpack").querySelector('nav a[aria-current="page"]')?.textContent).toBe("Fix Pack");
  });

  it("offers New to owners and managers but not viewers", () => {
    for (const role of ["owner", "manager"] as const) {
      expect(frame(role).querySelector(`a[href="${base}/actions/new?location=yik-yam"]`)?.textContent).toContain("New");
    }
    const viewer = frame("viewer");
    expect(viewer.querySelector('a[href*="/actions/new"]')).toBeNull();
    expect(viewer.querySelector(".role-notice[data-kind=viewer]")).not.toBeNull();
  });

  it.each(["zh-HK", "zh-TW"] as const)("localises the tabs in %s", (locale) => {
    const text = frame("owner", "all", locale).querySelector("nav")?.textContent ?? "";
    expect(text).toContain(copy[locale].shell.views.due);
    expect(text).toContain(copy[locale].shell.queue.tabs.awaiting_approval);
  });
});
