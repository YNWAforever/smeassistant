import { bodyLength } from "../guardrails";
import { defineAgent, inputLine } from "../prompt";
import { agentOutputSchema } from "../schema";

const handleField = "(?:ig|instagram)\\s*(?:handle|username|帳號|賬號|帐号|账号|用戶名稱|用户名称|用戶名|用户名)";
const optionalStatus = "(?:not provided|not confirmed|missing|optional|未提供|尚未提供|未有提供|未確認|未确认|選填|选填|如有)";
const handleOnlyRequest = new RegExp(`^(?:please provide\\s+|請(?:提供|確認)\\s*)?${handleField}(?:\\s*${optionalStatus}|\\s*\\((?:${handleField}\\s*)?${optionalStatus}\\))?[。.!]?$`, "i");

function isOptionalHandleFact(fact: string): boolean {
  // Normalize full-width punctuation, key separators, case and whitespace.
  // Match the entire request so "Instagram handle and offer price" still blocks.
  const normalized = fact.normalize("NFKC").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  // The observed completion appended this handle-only explanation. Do not
  // discard arbitrary explanatory prose, which could include required facts.
  const request = normalized.replace(/\s*—+\s*如有需要可於帖文或個人檔案中連結,\s*請商戶提供[。.]?$/, "").trim();
  return handleOnlyRequest.test(request);
}

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
    const optional = output.facts_needed.filter(isOptionalHandleFact);
    return {
      ...output,
      facts_needed: output.facts_needed.filter((fact) => !isOptionalHandleFact(fact)),
      warnings: [...new Set([...output.warnings, ...optional])],
    };
  }),
};
