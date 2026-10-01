import { describe, expect, it } from "vitest";
import { offerRow } from "./fixtures.test-helpers";
import { offerPhase, toOfferView, workspaceMarket } from "./view";

describe("offerPhase", () => {
  it("groups offers for the list", () => {
    expect(offerPhase(offerRow(), "2026-10-10")).toBe("running");
    expect(offerPhase(offerRow(), "2026-10-01")).toBe("upcoming");
    expect(offerPhase(offerRow(), "2026-11-01")).toBe("ended");
    expect(offerPhase(offerRow({ status: "draft" }), "2026-10-10")).toBe("draft");
    expect(offerPhase(offerRow({ status: "archived" }), "2026-10-10")).toBe("archived");
  });
});

describe("toOfferView", () => {
  it("drops who confirmed and created it and adds display fields", () => {
    const view = toOfferView(offerRow(), { today: "2026-10-10", locale: "en", draftCount: 2 });
    expect(view).not.toHaveProperty("created_by");
    expect(view).not.toHaveProperty("confirmed_by");
    expect(view).toMatchObject({ priceDisplay: "HK$88", validity: "2026-10-05 – 2026-10-31", phase: "running", draftCount: 2 });
  });
  it("reads the workspace market like runs.ts", () => {
    expect(workspaceMarket("TW")).toBe("tw");
    expect(workspaceMarket(null)).toBe("hk");
  });
});
