import { describe, expect, it } from "vitest";
import { bindOfferMeta } from "./offer-binding";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("bindOfferMeta (spec §1.3)", () => {
  it("removes a forged offer_revision from a version of a non-offer action", () => {
    expect(
      bindOfferMeta({ title: "T", offer_revision: 9, offer_id: A }, { actionOfferId: null, offerRevision: undefined, baseMeta: null }),
    ).toEqual({ title: "T" });
  });

  it("removes forged keys on a non-offer action even when the run passed a revision", () => {
    expect(bindOfferMeta({ offer_revision: 9 }, { actionOfferId: null, offerRevision: 3, baseMeta: { offer_id: A, offer_revision: 2 } })).toEqual({});
  });

  it("records the revision an agent run read, over a forged meta value", () => {
    expect(
      bindOfferMeta({ title: "T", offer_revision: 9, offer_id: B }, { actionOfferId: A, offerRevision: 3, baseMeta: null }),
    ).toEqual({ title: "T", offer_id: A, offer_revision: 3 });
  });

  it("the run's revision wins over the base version's", () => {
    expect(
      bindOfferMeta({}, { actionOfferId: A, offerRevision: 3, baseMeta: { offer_id: A, offer_revision: 2 } }),
    ).toEqual({ offer_id: A, offer_revision: 3 });
  });

  it("an owner edit inherits the base version's revision", () => {
    expect(
      bindOfferMeta({ offer_revision: 99 }, { actionOfferId: A, offerRevision: null, baseMeta: { offer_id: A, offer_revision: 2 } }),
    ).toEqual({ offer_id: A, offer_revision: 2 });
  });

  it("an edit whose base recorded a different offer records no revision", () => {
    expect(
      bindOfferMeta({ offer_revision: 99 }, { actionOfferId: A, offerRevision: undefined, baseMeta: { offer_id: B, offer_revision: 2 } }),
    ).toEqual({});
  });

  it("a version with no base on an offer action records no revision", () => {
    expect(bindOfferMeta({ offer_id: A, offer_revision: 1 }, { actionOfferId: A, offerRevision: null, baseMeta: null })).toEqual({});
  });

  it.each([["a string", "2"], ["a fraction", 1.5], ["null", null], ["missing", undefined], ["NaN", Number.NaN]])(
    "a base whose offer_revision is %s records no revision",
    (_name, revision) => {
      const baseMeta: Record<string, unknown> = { offer_id: A };
      if (revision !== undefined) baseMeta.offer_revision = revision;
      expect(bindOfferMeta({}, { actionOfferId: A, offerRevision: undefined, baseMeta })).toEqual({});
    },
  );

  it("a non-integer run revision falls back to the base rule", () => {
    expect(bindOfferMeta({}, { actionOfferId: A, offerRevision: 2.5, baseMeta: null })).toEqual({});
    expect(bindOfferMeta({}, { actionOfferId: A, offerRevision: 2.5, baseMeta: { offer_id: A, offer_revision: 2 } })).toEqual({
      offer_id: A,
      offer_revision: 2,
    });
  });

  it("does not mutate the incoming meta", () => {
    const meta = { title: "T", offer_revision: 9 };
    bindOfferMeta(meta, { actionOfferId: A, offerRevision: 3, baseMeta: null });
    expect(meta).toEqual({ title: "T", offer_revision: 9 });
  });
});
