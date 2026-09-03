import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const websiteBasics = defineAgent({
  key: "website_basics",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a web copywriter fixing a small business website's title, meta description and main heading",
  task: (ctx) => `Using the website checks in the evidence, write: (1) a page title of at most 60 characters naming the business, what it does and the district; (2) a meta description of 120–155 characters that describes the business plainly and uses the approved claim "${inputLine(ctx, "approved_claim")}" only if it fits naturally; (3) one H1 that states what the business is in plain words.
Body: three labelled lines — Title:, Description:, H1: — followed by a one-paragraph note of what to change on the page. Do not invent services, prices or awards; use only brand facts.`,
  acceptance: (ctx, output) => {
    const warnings = [...prohibitedTermHits(ctx, output), ...bodyLength(output, 3000)];
    const title = /Title:\s*(.+)/i.exec(output.body)?.[1]?.trim();
    if (title && title.length > 60) warnings.push("title_over_60_chars");
    return warnings;
  },
});
