import type { AgentContext, AgentOutput } from "./schema";

/**
 * The shared system half of every agent prompt (CLAUDE.md §3.7 items 1–3 and
 * 5). Agents add only their role line and task; the guardrails below are
 * reproduced verbatim from §3.7 and never paraphrased per agent.
 */

export const LANGUAGE_INSTRUCTION: Record<AgentContext["locale"], string> = {
  "zh-HK": "Write in Traditional Chinese with a natural Hong Kong Cantonese flavour (書面粵語): the wording a Hong Kong shop would use with its own customers.",
  "zh-TW": "Write in Traditional Chinese using Taiwan Mandarin wording (台灣國語用語).",
  en: "Write in clear, plain English.",
};

export const MARKET_LABEL: Record<AgentContext["market"], string> = {
  hk: "Hong Kong",
  tw: "Taiwan",
};

/** §3.7 item 3, verbatim. */
export const GUARDRAILS = [
  "No invented ingredients, allergens, prices, offer dates, capacity, policies or legal claims.",
  "No superlatives from the prohibited list.",
  "No compensation promises in review replies.",
  "Review replies: acknowledge, thank, one concrete improvement, invite back.",
] as const;

/** §3.7 item 5, verbatim keys. */
export const OUTPUT_KEYS = '{ "title", "body", "alt_text"?, "acceptance_criteria": string[], "warnings": string[], "facts_used": string[], "facts_needed": string[] }';

export function roleBlock(role: string, ctx: AgentContext): string {
  return [
    `You are ${role} for a small business in ${MARKET_LABEL[ctx.market]}.`,
    `Locale: ${ctx.locale}. ${LANGUAGE_INSTRUCTION[ctx.locale]}`,
  ].join("\n");
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- (none)";
}

export function brandBlock(ctx: AgentContext): string {
  const facts = Object.entries(ctx.brand.facts ?? {}).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return [
    "BRAND FACTS — only these facts may be asserted:",
    `Voice: ${ctx.brand.voice || "warm"}`,
    "Approved claims:",
    list(ctx.brand.approvedClaims),
    "Prohibited terms (never use):",
    list(ctx.brand.prohibitedTerms),
    "Other confirmed facts:",
    list(facts),
    `Location: ${ctx.location.name}${ctx.location.district ? `, ${ctx.location.district}` : ""}${ctx.location.address ? ` (${ctx.location.address})` : ""}`,
  ].join("\n");
}

export function guardrailBlock(): string {
  return ["GUARDRAILS:", ...GUARDRAILS.map((rule) => `- ${rule}`), "- If a required fact is missing, do not guess: name it in facts_needed and leave body empty."].join("\n");
}

export function outputBlock(): string {
  return [
    "OUTPUT: respond with JSON only, no prose, no markdown fences, exactly these keys:",
    OUTPUT_KEYS,
    "facts_used lists the brand facts or evidence you relied on; facts_needed lists inputs the owner must supply before this can be finished.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Acceptance checks shared by agents (findings are merged into output.warnings)
// ---------------------------------------------------------------------------

const COMPENSATION = /\b(refund|compensat\w*|reimburs\w*|free (?:meal|drink|dessert|dish|item|voucher)|discount|voucher|coupon|on the house)\b|退款|賠償|補償|免費(?:送|招待|一份|一杯)|折扣|優惠券|現金券|送你|請你/i;

export function prohibitedTermHits(ctx: AgentContext, output: AgentOutput): string[] {
  const haystack = `${output.title}\n${output.body}\n${output.alt_text ?? ""}`.toLowerCase();
  return ctx.brand.prohibitedTerms
    .map((term) => term.trim())
    .filter((term) => term && haystack.includes(term.toLowerCase()))
    .map((term) => `prohibited_term:${term}`);
}

export function compensationPromise(output: AgentOutput): string[] {
  return COMPENSATION.test(output.body) ? ["compensation_promise"] : [];
}

export function bodyLength(output: AgentOutput, max: number): string[] {
  return output.body.length > max ? [`body_over_${max}_chars`] : [];
}

export function baseAcceptance(ctx: AgentContext, output: AgentOutput): string[] {
  return prohibitedTermHits(ctx, output);
}
