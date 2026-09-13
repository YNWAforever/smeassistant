import { describe, expect, it } from "vitest";
import { deriveFaqQuestions } from "./faq-questions";

describe("deriveFaqQuestions", () => {
  it("prefers real un-cited search queries over website-check questions", () => {
    const questions = deriveFaqQuestions({
      failingWebsiteChecks: ["opening_hours_text", "phone_present"],
      aeoQueries: ["best dim sum tin hau"],
    });
    expect(questions).toHaveLength(3);
    expect(questions[0].question.en).toContain("best dim sum tin hau");
    expect(questions[0].brandFactKey).toBeNull();
    expect(questions[1].question.en).toBe("What are your opening hours?");
    expect(questions[1].brandFactKey).toBe("opening_hours");
    expect(questions[2].question.en).toBe("What is your contact phone number?");
    expect(questions[2].brandFactKey).toBe("phone");
    expect(questions.map((q) => q.key)).toEqual(["owner_fact_1", "owner_fact_2", "owner_fact_3"]);
  });

  it("ignores purely technical checks -- not facts an owner can answer in an FAQ", () => {
    const questions = deriveFaqQuestions({
      failingWebsiteChecks: ["https", "canonical", "viewport", "html_lang", "og_image", "faq_schema", "opening_hours_text"],
      aeoQueries: [],
    });
    expect(questions).toHaveLength(3);
    expect(questions[0].question.en).toBe("What are your opening hours?");
    // The rest is padded with generic fallbacks, not more technical checks.
    expect(questions[1].brandFactKey).toBeNull();
    expect(questions[2].brandFactKey).toBeNull();
  });

  it("pads with generic fallback questions down to exactly three, never fewer", () => {
    const questions = deriveFaqQuestions({ failingWebsiteChecks: [], aeoQueries: [] });
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => q.brandFactKey === null)).toBe(true);
    expect(new Set(questions.map((q) => q.question.en)).size).toBe(3);
  });

  it("never returns more than three even with abundant evidence", () => {
    const questions = deriveFaqQuestions({
      failingWebsiteChecks: ["opening_hours_text", "contact_or_booking_link", "address_present", "phone_present"],
      aeoQueries: ["a", "b", "c", "d"],
    });
    expect(questions).toHaveLength(3);
  });

  it("dedupes repeated or blank AEO queries rather than wasting a slot on them", () => {
    const questions = deriveFaqQuestions({
      failingWebsiteChecks: ["opening_hours_text"],
      aeoQueries: ["dim sum tin hau", "  ", "dim sum tin hau", ""],
    });
    // Only one distinct real query and one real check -- still pads to three,
    // but with a generic fallback, not a second copy of the same query.
    expect(questions).toHaveLength(3);
    expect(questions[0].question.en).toContain("dim sum tin hau");
    expect(questions[1].question.en).toBe("What are your opening hours?");
    expect(questions[2].brandFactKey).toBeNull();
    expect(new Set(questions.map((q) => q.question.en)).size).toBe(3);
  });

  it("localizes every question in all three locales", () => {
    const questions = deriveFaqQuestions({ failingWebsiteChecks: ["address_present"], aeoQueries: ["x"] });
    for (const q of questions) {
      expect(q.question.en.length).toBeGreaterThan(0);
      expect(q.question["zh-HK"].length).toBeGreaterThan(0);
      expect(q.question["zh-TW"].length).toBeGreaterThan(0);
    }
  });
});
