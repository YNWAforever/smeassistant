import { bodyLength } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";
import { agentOutputSchema } from "../schema";

// Only handle-only requests are optional for caption drafting. Unknown prose
// and requests that combine a handle with required facts stay blocking.
const optionalHandleFacts = new Set([
  "ig_handle", "ig_handle_not_provided", "instagram_handle", "instagram_handle_not_provided",
  "ig handle", "instagram handle", "ig handle (optional)", "instagram handle (optional)",
  "ig handle（ig_handle_not_provided）—— 如有需要可於帖文或個人檔案中連結，請商戶提供。",
]);

const definition = defineAgent({
  key: "social_post",
  capability: "Live",
  promptVersion: "2026-10-15.1",
  role: "a social media writer drafting one Instagram post about what is happening in the shop right now",
  evidence: (ctx) => ({
    asset: ctx.providedInputs.asset_id ? { asset_id: ctx.providedInputs.asset_id, alt_text: ctx.providedInputs.alt_text ?? null } : null,
    text_only: ctx.providedInputs.text_only === true,
  }),
  task: (ctx) => `Write one Instagram caption (under 220 words, or 300 Chinese characters) that fills the content gap in the evidence. Use only brand facts and the approved claims; do not invent dishes, prices, opening dates, offers or events. Hashtags: at most five, relevant to the district and category.
This task saves a draft; it does not publish or connect an Instagram account. An Instagram handle is optional for drafting. If it is not confirmed, omit handles and profile links from the caption and mention the missing handle in warnings, never facts_needed. Keep facts_needed for required facts that prevent a factual caption.
${ctx.providedInputs.text_only === true ? "This is a text-only post: do not describe a photo." : `An approved photo is attached (alt text: ${inputLine(ctx, "alt_text")}). Describe only what the alt text says is in it and return alt_text — a plain, factual description under 125 characters.`}
Body: the caption. acceptance_criteria: what the owner must confirm (asset rights, facts) before posting.`,
  acceptance: (ctx, output) => {
    const warnings = [...bodyLength(output, 2500)];
    if (ctx.providedInputs.text_only !== true && !output.alt_text) warnings.push("alt_text_missing");
    if ((output.body.match(/#/g) ?? []).length > 5) warnings.push("too_many_hashtags");
    return warnings;
  },
});

export const socialPost = {
  ...definition,
  // Apply at the agent's parse boundary so action runs and assistant drafts use
  // the same rule, without relaxing the shared missing-fact persistence gate.
  outputSchema: agentOutputSchema.transform((output) => {
    if (!output.body.trim()) return output;
    const optional = output.facts_needed.filter((fact) => optionalHandleFacts.has(fact.toLowerCase()));
    return {
      ...output,
      facts_needed: output.facts_needed.filter((fact) => !optionalHandleFacts.has(fact.toLowerCase())),
      warnings: [...new Set([...output.warnings, ...optional])],
    };
  }),
};
