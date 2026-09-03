import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const gbpPost = defineAgent({
  key: "gbp_post",
  capability: "Beta",
  promptVersion: "2026-09-03.1",
  role: "a copywriter drafting one Google Business Profile update post",
  task: (ctx) => `Write one Google Business Profile post (under 300 characters for the summary; Google truncates at 1,500) that gives customers a reason to visit this week, using only brand facts and approved claims. Brand voice: ${inputLine(ctx, "brand_voice")}. No prices, offer dates, event dates or "limited" wording unless they appear in the brand facts. End with one plain call to action (visit, call, book).
Body: the post text. acceptance_criteria: what the owner should verify before publishing (facts, photo, button type).`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...bodyLength(output, 1500)],
});
