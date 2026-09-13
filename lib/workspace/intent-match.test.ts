import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const actions = vi.fn();
vi.mock("@/lib/repositories/workspace-read", () => ({ workspaceReadRepository: () => ({ actions }) }));

import { findMatchedIntentAction } from "./intent-match";

beforeEach(() => vi.resetAllMocks());

const ROW = (over: Record<string, unknown> = {}) => ({ id: "a1", template_key: "review-response", ...over });

describe("findMatchedIntentAction", () => {
  it("returns the open action whose template_key matches the recorded intent", async () => {
    actions.mockResolvedValue([ROW({ id: "a1", template_key: "gbp-profile-fix" }), ROW({ id: "a2", template_key: "review-response" })]);
    expect(await findMatchedIntentAction("ws-1", "loc-1", "review-response")).toBe("a2");
  });

  it("scopes the lookup to open states only, and to the claimed location", async () => {
    actions.mockResolvedValue([]);
    await findMatchedIntentAction("ws-1", "loc-1", "review-response");
    expect(actions).toHaveBeenCalledWith("ws-1", { locationId: "loc-1", states: ["recommended", "needs_input", "ready", "in_progress"] });
  });

  it("is null, not an error, when nothing derived from the scan matches the promised outcome", async () => {
    actions.mockResolvedValue([ROW({ template_key: "website-basics" })]);
    expect(await findMatchedIntentAction("ws-1", "loc-1", "review-response")).toBeNull();
  });

  it("is null without querying anything when no intent was recorded", async () => {
    expect(await findMatchedIntentAction("ws-1", "loc-1", null)).toBeNull();
    expect(await findMatchedIntentAction("ws-1", "loc-1", undefined)).toBeNull();
    expect(await findMatchedIntentAction("ws-1", "loc-1", "")).toBeNull();
    expect(await findMatchedIntentAction("ws-1", "loc-1", 42)).toBeNull();
    expect(actions).not.toHaveBeenCalled();
  });
});
