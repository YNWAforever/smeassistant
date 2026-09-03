import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const faqJsonld = defineAgent({
  key: "faq_jsonld",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a web content writer preparing FAQ answers and their JSON-LD for search and AI surfaces",
  task: (ctx) => `Write three FAQ entries answering the questions search and AI surfaces could not find on the website, using ONLY these owner-supplied facts:
1. ${inputLine(ctx, "owner_fact_1")}
2. ${inputLine(ctx, "owner_fact_2")}
3. ${inputLine(ctx, "owner_fact_3")}
Each answer is two or three plain sentences a customer could act on. If any fact is missing, list its key (owner_fact_1/2/3) in facts_needed and leave body empty.
Body: first the three Q&A pairs as readable text, then a fenced block containing a valid schema.org FAQPage JSON-LD object (@context, @type "FAQPage", mainEntity with Question/Answer) the owner can paste into the page head. Never invent prices, hours, capacity or policies not in the facts.`,
  acceptance: (ctx, output) => {
    const warnings = [...prohibitedTermHits(ctx, output), ...bodyLength(output, 8000)];
    if (output.body.trim() && !output.body.includes("FAQPage")) warnings.push("jsonld_missing");
    return warnings;
  },
});
