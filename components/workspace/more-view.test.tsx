import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoreView } from "@/components/workspace/more-view";

/**
 * More is the only mobile route to everything outside the four primary tabs.
 * Assets and Calendar were missing from it, so on a phone they existed only in
 * the desktop sidebar (`hidden md:flex`) and were unreachable -- which blocked
 * a real job, since a social post needs an approved asset and Assets is the
 * only place to grant rights.
 */
const props = { locale: "en" as const, workspaceSlug: "kam-man-house", locationCount: 2, locationSlug: "yik-yam" };

/** Reachable without More: the four primary tabs, and the detail page you reach from Actions. */
const PRIMARY = new Set(["actions", "create", "insights", "more", "[actionId]"]);

function ownerRoutes(): string[] {
  const root = fileURLToPath(new URL("../../app/[locale]/owner/[workspaceSlug]", import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !PRIMARY.has(entry.name))
    .map((entry) => entry.name);
}

describe("MoreView", () => {
  it("reaches Brand assets and Calendar, which the mobile navigation otherwise cannot", () => {
    const html = renderToStaticMarkup(<MoreView {...props} />);
    expect(html).toContain('href="/en/owner/kam-man-house/assets?location=yik-yam"');
    expect(html).toContain('href="/en/owner/kam-man-house/calendar"');
  });

  it("carries the selected location to Assets, and to nothing that ignores it", () => {
    const html = renderToStaticMarkup(<MoreView {...props} locationSlug="tin-hau" />);
    expect(html).toContain("/assets?location=tin-hau");
    // AssetsView filters on ?location=; these do not read it, so a param there
    // would be a promise the destination does not keep.
    for (const path of ["calendar", "activity", "settings/brand", "settings/team", "settings/billing", "settings/notifications"]) {
      expect(html).toContain(`href="/en/owner/kam-man-house/${path}"`);
    }
    expect(renderToStaticMarkup(<MoreView {...props} locationSlug="all" />)).toContain("/assets?location=all");
  });

  /**
   * The real regression. Fixing two orphaned routes is worth little if the next
   * one goes unnoticed, so this fails when a new owner route appears with no
   * mobile entry point -- the condition, not the instance.
   */
  it("leaves no owner route reachable only from the desktop sidebar", () => {
    const html = renderToStaticMarkup(<MoreView {...props} />);
    const orphaned = ownerRoutes().filter((route) => !html.includes(`/owner/kam-man-house/${route}`));
    expect(orphaned).toEqual([]);
  });

  it("renders Chinese labels that match the pages they open", () => {
    const html = renderToStaticMarkup(<MoreView {...props} locale="zh-HK" />);
    // The destinations' own headings (assets-view "品牌素材", calendar-view
    // "日曆"), so a row never renames the page it opens.
    expect(html).toContain("品牌素材");
    expect(html).toContain("日曆");
  });
});
