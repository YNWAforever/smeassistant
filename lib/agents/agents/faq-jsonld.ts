import type { AgentContext } from "../schema";
import { bodyLength, prohibitedTermHits } from "../guardrails";
import { validateFaqJsonLd } from "../jsonld";
import { defineAgent, inputLine } from "../prompt";

/**
 * P2.3 item 11: lib/workspace/runs.ts derives these from the same evidence
 * that created the action (failing website checks, un-cited AEO queries) and
 * writes them into ctx.evidence.faq_questions. Read defensively -- evidence
 * is an unconstrained blob -- so a live-mode assistant call or an older run
 * with no derivation still gets a usable (if unlabelled) prompt.
 */
function questionFor(ctx: AgentContext, factKey: "owner_fact_1" | "owner_fact_2" | "owner_fact_3"): string | null {
  const entries = (ctx.evidence as { faq_questions?: unknown }).faq_questions;
  if (!Array.isArray(entries)) return null;
  const match = entries.find((entry): entry is { key: unknown; question: unknown } => Boolean(entry) && typeof entry === "object" && (entry as { key?: unknown }).key === factKey);
  return match && typeof match.question === "string" ? match.question : null;
}

function factLine(ctx: AgentContext, factKey: "owner_fact_1" | "owner_fact_2" | "owner_fact_3"): string {
  const question = questionFor(ctx, factKey);
  const answer = inputLine(ctx, factKey);
  return question ? `${question} — ${answer}` : answer;
}

export const faqJsonld = defineAgent({
  key: "faq_jsonld",
  capability: "Live",
  promptVersion: "2026-09-12.2",
  role: "a web content writer preparing FAQ answers and their JSON-LD for search and AI surfaces",
  task: (ctx) => `Write three FAQ entries answering the questions search and AI surfaces could not find on the website. Each numbered line below pairs the actual customer question with the owner-supplied fact that answers it -- use ONLY that fact, and write the FAQ question yourself in natural customer-facing language grounded in it:
1. ${factLine(ctx, "owner_fact_1")}
2. ${factLine(ctx, "owner_fact_2")}
3. ${factLine(ctx, "owner_fact_3")}
Each answer is two or three plain sentences a customer could act on. If any fact is missing, list its key (owner_fact_1/2/3) in facts_needed and leave body empty.
Body: first the three Q&A pairs as readable text, then the SAME three pairs as schema.org FAQPage JSON-LD (@context, @type "FAQPage", mainEntity with Question/acceptedAnswer) inside a <script type="application/ld+json"> element the owner can paste into the page head. A fenced code block is not acceptable: the next scan only reads the script element. Each Question "name" and acceptedAnswer "text" must be character-identical to the Q&A written above it.
Never invent prices, hours, capacity or policies not in the facts.`,
  acceptance: (ctx, output) => {
    const warnings = [...prohibitedTermHits(ctx, output), ...bodyLength(output, 8000)];
    // `includes("FAQPage")` passed on the word appearing anywhere in prose, and
    // said nothing about whether the next scan could read the block at all.
    if (output.body.trim()) warnings.push(...validateFaqJsonLd(output.body));
    return warnings;
  },
});
