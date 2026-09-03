import { bodyLength, prohibitedTermHits } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";

export const socialPost = defineAgent({
  key: "social_post",
  capability: "Live",
  promptVersion: "2026-09-03.1",
  role: "a social media writer drafting one Instagram post about what is happening in the shop right now",
  evidence: (ctx) => ({
    asset: ctx.providedInputs.asset_id ? { asset_id: ctx.providedInputs.asset_id, alt_text: ctx.providedInputs.alt_text ?? null } : null,
    text_only: ctx.providedInputs.text_only === true,
  }),
  task: (ctx) => `Write one Instagram caption (under 220 words, or 300 Chinese characters) that fills the content gap in the evidence. Use only brand facts and the approved claims; do not invent dishes, prices, opening dates, offers or events. Hashtags: at most five, relevant to the district and category.
${ctx.providedInputs.text_only === true ? "This is a text-only post: do not describe a photo." : `An approved photo is attached (alt text: ${inputLine(ctx, "alt_text")}). Describe only what the alt text says is in it and return alt_text — a plain, factual description under 125 characters.`}
Body: the caption. acceptance_criteria: what the owner must confirm (asset rights, facts) before posting.`,
  acceptance: (ctx, output) => {
    const warnings = [...prohibitedTermHits(ctx, output), ...bodyLength(output, 2500)];
    if (ctx.providedInputs.text_only !== true && !output.alt_text) warnings.push("alt_text_missing");
    if ((output.body.match(/#/g) ?? []).length > 5) warnings.push("too_many_hashtags");
    return warnings;
  },
});
