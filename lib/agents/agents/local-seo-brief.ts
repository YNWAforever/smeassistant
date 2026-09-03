import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent } from "../prompt";

export const localSeoBrief = defineAgent({
  key: "local_seo_brief",
  capability: "Beta",
  promptVersion: "2026-09-03.1",
  role: "a local search analyst writing a short brief on where competitors appear above this business",
  task: () => `From the search and AI evidence, write a brief with three sections: (1) Where we appear — the queries and surfaces where the business was found, with rank and citation status copied from the evidence; (2) Where competitors appear above us — named competitors, the query, and the evidence that explains the gap (reviews, rating, photos, content); (3) What to do first — at most three actions, each tied to a piece of evidence.
Every number must come from the evidence and be labelled Observed; anything you infer must be labelled Inference. Never promise a ranking outcome. Body: the three sections as plain text with short headings.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...bodyLength(output, 8000)],
});
