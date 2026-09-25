import { describe, expect, it } from "vitest";
import { buildOwnerProblems, filterToLocation, ownerActionFor, visibleTo, type OwnerContext } from "./owner-actions";
import type { FailureItem, FailureKind } from "./failure-types";

const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function item(kind: FailureKind, locationId: string | null = LOC_A, actionId: string | null = null): FailureItem {
  return {
    kind, id: `${kind}-id`, reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: { id: "ws", slug: "kam-man-house", name: "Kam Man House" }, locationId, actionId,
    businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
  };
}
const owner: OwnerContext = { role: "owner", locationScope: null, tier: "paid" };
const scopedManager: OwnerContext = { role: "manager", locationScope: [LOC_A], tier: "paid" };
const viewer: OwnerContext = { role: "viewer", locationScope: null, tier: "paid" };

describe("ownerActionFor", () => {
  const cases: Array<[string, FailureItem, OwnerContext, string]> = [
    ["failed scan, paid owner", item("scan_failed"), owner, "rescan"],
    ["failed scan, lite owner", item("scan_failed"), { ...owner, tier: "lite" }, "contact_support"],
    ["failed scan without a location", item("scan_failed", null), owner, "contact_support"],
    ["failed scan, manager in scope", item("scan_failed"), scopedManager, "rescan"],
    ["failed scan, manager out of scope", item("scan_failed", LOC_B), scopedManager, "none"],
    ["failed scan, viewer", item("scan_failed"), viewer, "none"],
    ["stuck scan, owner", item("scan_dead_lettered"), owner, "none"],
    ["failed draft, owner", item("draft_failed", LOC_A, "act-1"), owner, "open_action"],
    ["failed draft, manager out of scope", item("draft_failed", LOC_B, "act-1"), scopedManager, "none"],
    ["failed draft, viewer", item("draft_failed", LOC_A, "act-1"), viewer, "none"],
    ["google, owner", item("google_connection", null), owner, "reauthorise"],
    ["google, manager", item("google_connection", null), scopedManager, "ask_owner"],
    ["google, viewer", item("google_connection", null), viewer, "none"],
  ];
  it.each(cases)("%s", (_name, failure, ctx, expected) => {
    expect(ownerActionFor(failure, ctx)).toBe(expected);
  });
});

describe("visibility and location", () => {
  it("hides post-processing from everyone and other locations from a scoped manager", () => {
    expect(visibleTo(item("workspace_processing"), owner)).toBe(false);
    expect(visibleTo(item("scan_failed", LOC_B), scopedManager)).toBe(false);
    expect(visibleTo(item("scan_failed", LOC_A), scopedManager)).toBe(true);
    expect(visibleTo(item("google_connection", null), scopedManager)).toBe(true);
    expect(visibleTo(item("scan_failed", LOC_B), viewer)).toBe(true);
  });

  it("keeps workspace-wide items on every location page, and everything on 'all'", () => {
    const items = [item("scan_failed", LOC_A), item("scan_failed", LOC_B), item("google_connection", null)];
    expect(filterToLocation(items, LOC_A).map((i) => i.locationId)).toEqual([LOC_A, null]);
    expect(filterToLocation(items, "all")).toHaveLength(3);
  });

  it("builds problems with the contact link only for contact_support", () => {
    const problems = buildOwnerProblems([item("scan_failed"), item("google_connection", null)], { ...owner, tier: "lite" }, "https://wa.me/85200000000");
    expect(problems.map((p) => [p.ownerAction, p.contactHref])).toEqual([
      ["contact_support", "https://wa.me/85200000000"],
      ["reauthorise", null],
    ]);
  });
});
