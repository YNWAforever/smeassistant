import { jsonLdBlocks } from "@/lib/website/checks";

/**
 * FAQ + JSON-LD acceptance (P2.2 item 9).
 *
 * The workflow's whole value is that the NEXT scan can confirm the owner
 * pasted the block: `visibility-content` is triggered by the failing
 * `website.checks.faq_schema` check, and that check only ever looks inside a
 * `<script type="application/ld+json">` element. So this validates against
 * `jsonLdBlocks` -- the very function that will re-check the page -- rather
 * than a second definition of "valid". A fenced ```json block is not something
 * the scan can see, and calling it valid would bless precisely the output that
 * silently fails the recheck after the owner has already done the work.
 *
 * The old acceptance was `body.includes("FAQPage")`, which passes on the word
 * appearing anywhere in prose.
 */
export type FaqJsonLdIssue = "jsonld_missing" | "jsonld_invalid" | "jsonld_mismatch";

/** Straight-quote, lowercase, single-space -- so a curly apostrophe is not a mismatch. */
function normalise(value: string): string {
  return value
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function typeMatches(value: unknown, wanted: string): boolean {
  return asArray(value).some((entry) => typeof entry === "string" && entry.toLowerCase() === wanted.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every node in a `@graph`, an array document, or a bare object. */
function nodes(parsed: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const entry of asArray(parsed)) {
    if (!isRecord(entry)) continue;
    out.push(entry);
    for (const child of asArray(entry["@graph"])) if (isRecord(child)) out.push(child);
  }
  return out;
}

/** Question name + answer text pairs, or null when the structure is not usable. */
function faqPairs(faq: Record<string, unknown>): Array<{ question: string; answer: string }> | null {
  // schema.org is written as a string, sometimes with a trailing slash, and
  // sometimes as an object; any of those is fine, absent is not.
  const context = faq["@context"];
  const contextText = typeof context === "string" ? context : JSON.stringify(context ?? "");
  if (!/schema\.org/i.test(contextText)) return null;

  const entities = asArray(faq.mainEntity);
  if (entities.length === 0) return null;
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const entity of entities) {
    if (!isRecord(entity) || !typeMatches(entity["@type"], "Question")) return null;
    const question = entity.name;
    const accepted = entity.acceptedAnswer;
    if (typeof question !== "string" || !question.trim()) return null;
    if (!isRecord(accepted) || !typeMatches(accepted["@type"], "Answer")) return null;
    const answer = accepted.text;
    if (typeof answer !== "string" || !answer.trim()) return null;
    pairs.push({ question, answer });
  }
  return pairs;
}

/** The readable half: the body with every JSON-LD script element removed. */
function prose(body: string): string {
  return normalise(body.replace(/<script\b[\s\S]*?<\/script>/gi, " "));
}

/**
 * Returns the guardrail warnings for the FAQ body. Empty means the block is
 * structurally valid AND its questions and answers appear verbatim in the
 * prose above it, which is what makes the exported text and the pasted markup
 * one artefact rather than two that can drift.
 */
export function validateFaqJsonLd(body: string): FaqJsonLdIssue[] {
  const blocks = jsonLdBlocks(body);
  if (blocks.length === 0) return ["jsonld_missing"];

  let pairs: Array<{ question: string; answer: string }> | null = null;
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    for (const node of nodes(parsed)) {
      if (!typeMatches(node["@type"], "FAQPage")) continue;
      const found = faqPairs(node);
      if (found) {
        pairs = found;
        break;
      }
    }
    if (pairs) break;
  }

  // A block the scan will find but this cannot read is invalid, not missing:
  // the page would pass faq_schema while carrying an unusable entity list.
  if (!pairs) return ["jsonld_invalid"];

  const readable = prose(body);
  const drifted = pairs.some(
    ({ question, answer }) => !readable.includes(normalise(question)) || !readable.includes(normalise(answer)),
  );
  return drifted ? ["jsonld_mismatch"] : [];
}
