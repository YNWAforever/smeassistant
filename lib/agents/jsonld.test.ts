import { describe, expect, it } from "vitest";
import { validateFaqJsonLd } from "./jsonld";
import { inspectHtml } from "@/lib/website/checks";

const PAIRS = [
  { q: "Do you take bookings?", a: "Yes. Call us or use the booking link on this page." },
  { q: "Are you open on public holidays?", a: "We open on public holidays except the first two days of Lunar New Year." },
];

function script(pairs: Array<{ q: string; a: string }>): string {
  const doc = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(doc, null, 2)}</script>`;
}

function body(pairs = PAIRS, block = script(PAIRS)): string {
  const prose = pairs.map(({ q, a }) => `Q: ${q}\nA: ${a}`).join("\n\n");
  return `${prose}\n\n${block}`;
}

describe("validateFaqJsonLd", () => {
  it("accepts a script element whose pairs match the prose", () => {
    expect(validateFaqJsonLd(body())).toEqual([]);
  });

  it("is the same judgement the next scan will make", () => {
    // The point of the workflow: `visibility-content` exists because
    // website.checks.faq_schema failed, and this output has to make it pass.
    const html = `<html><head>${script(PAIRS)}</head><body><h1>FAQ</h1></body></html>`;
    const faq = inspectHtml(html, "https://example.test/").find((r) => r.key === "faq_schema");
    expect(faq?.pass).toBe(true);
    expect(validateFaqJsonLd(body())).toEqual([]);
  });

  it("rejects a fenced code block, which no scan can see", () => {
    // The trap: a ```json fence reads as "valid JSON-LD" to a human and to a
    // naive substring check, and is invisible to jsonLdBlocks.
    const fenced = "```json\n" + JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] }) + "\n```";
    expect(validateFaqJsonLd(body(PAIRS, fenced))).toEqual(["jsonld_missing"]);

    const html = `<html><head></head><body>${fenced}</body></html>`;
    expect(inspectHtml(html, "https://example.test/").find((r) => r.key === "faq_schema")?.pass).toBe(false);
  });

  it("reports the word FAQPage in prose as missing, not present", () => {
    // What the old `body.includes("FAQPage")` acceptance accepted.
    expect(validateFaqJsonLd("We added a FAQPage to the website.")).toEqual(["jsonld_missing"]);
  });

  it("reports unparseable JSON inside the script element as invalid", () => {
    const broken = '<script type="application/ld+json">{ "@type": "FAQPage", mainEntity: [ }</script>';
    expect(validateFaqJsonLd(body(PAIRS, broken))).toEqual(["jsonld_invalid"]);
  });

  it.each([
    ["no @context", { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }] }],
    ["empty mainEntity", { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] }],
    ["entity is not a Question", { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Thing", name: "Q" }] }],
    ["answer is not an Answer", { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { text: "A" } }] }],
    ["answer text missing", { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer" } }] }],
  ])("reports %s as invalid", (_label, doc) => {
    const block = `<script type="application/ld+json">${JSON.stringify(doc)}</script>`;
    expect(validateFaqJsonLd(`Q: Q\nA: A\n\n${block}`)).toEqual(["jsonld_invalid"]);
  });

  it("reports a question the prose never asks as a mismatch", () => {
    const drifted = script([{ q: "Do you deliver?", a: PAIRS[0].a }]);
    expect(validateFaqJsonLd(body(PAIRS, drifted))).toEqual(["jsonld_mismatch"]);
  });

  it("reports an answer the prose never gives as a mismatch", () => {
    const drifted = script([{ q: PAIRS[0].q, a: "Yes, we deliver within two kilometres." }]);
    expect(validateFaqJsonLd(body(PAIRS, drifted))).toEqual(["jsonld_mismatch"]);
  });

  it("does not call a curly apostrophe a mismatch", () => {
    const pairs = [{ q: "What are the chef's hours?", a: "The chef is in from 11am." }];
    const curlyProse = "Q: What are the chef’s hours?\nA: The chef is in from 11am.";
    expect(validateFaqJsonLd(`${curlyProse}\n\n${script(pairs)}`)).toEqual([]);
  });

  it("finds the FAQPage inside an @graph alongside other schema types", () => {
    const doc = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "LocalBusiness", name: "A shop" },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: PAIRS[0].q, acceptedAnswer: { "@type": "Answer", text: PAIRS[0].a } }] },
      ],
    };
    const block = `<script type="application/ld+json">${JSON.stringify(doc)}</script>`;
    expect(validateFaqJsonLd(body([PAIRS[0]], block))).toEqual([]);
  });
});
