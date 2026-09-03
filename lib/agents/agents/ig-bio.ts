import { prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const igBio = defineAgent({
  key: "ig_bio",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a copywriter rewriting an Instagram bio",
  task: (ctx) => `Rewrite the Instagram bio so the first two lines say what the business does, where it is, and how to book or order. Hard limit 150 characters including line breaks and emoji (Instagram truncates beyond that). Brand voice: ${inputLine(ctx, "brand_voice")}. You may use the approved claim "${inputLine(ctx, "approved_claim")}" and must end with the call to action for ${inputLine(ctx, "cta_link")}.
Do not add claims that are not approved, and do not use any prohibited term. Body: the bio text only, line breaks as they should appear.`,
  acceptance: (ctx, output) => [...prohibitedTermHits(ctx, output), ...(output.body.length > 150 ? ["bio_over_150_chars"] : [])],
});
