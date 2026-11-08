import { expect, it } from "vitest";
import { locationSwitchHref } from "./shell";

it.each([
  ["/en/owner/shop/actions/action-a", "location=primary&version=old&open=action-a", "/en/owner/shop/actions?location=other"],
  ["/zh-HK/owner/shop/packs/pack-a", "location=primary&mode=pack", "/zh-HK/owner/shop/actions?location=other"],
  ["/zh-TW/owner/shop/actions", "location=primary&q=reply&cursor=old&open=a&version=v", "/zh-TW/owner/shop/actions?location=other&q=reply"],
  ["/en/owner/shop/actions", "location=primary&view=due", "/en/owner/shop/actions?location=other&view=due"],
  ["/en/owner/shop/actions/new", "location=primary&mode=goal", "/en/owner/shop/actions/new?location=other&mode=goal"],
  ["/en/owner/shop/insights", "", "/en/owner/shop/insights?location=other"],
] as const)("switches safely from %s", (path, query, expected) => {
  expect(locationSwitchHref(path, query, "other")).toBe(expected);
});
