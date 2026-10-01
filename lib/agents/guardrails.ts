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

const asText = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value));

/**
 * Everything the owner has confirmed, lowercased: typed inputs, brand facts and
 * approved claims. A link in a draft is only trusted when it already appears
 * here -- never because a review contained it, since a review is untrusted
 * text and a link it carries is exactly the injection unexpected_link exists
 * to catch.
 */
function confirmedText(ctx: AgentContext): string {
  return [
    ...Object.values(ctx.providedInputs).map(asText),
    ...Object.values(ctx.brand.facts ?? {}).map(asText),
    ...ctx.brand.approvedClaims,
    // P4.1: the owner confirmed these offer facts, so the offer's own price,
    // dates, claims and link are not "unconfirmed". Absent for every other agent.
    ...offerConfirmedText(ctx),
  ]
    .join("\n")
    .toLowerCase();
}

function offerConfirmedText(ctx: AgentContext): string[] {
  const offer = ctx.offer;
  if (!offer) return [];
  return [offer.title, offer.details, offer.terms ?? "", offer.priceDisplay ?? "", offer.validityDisplay, ...offer.approvedClaims];
}

/**
 * The confirmed text plus what the scan observed: the sampled review text and
 * the evidence block. A price or superlative in a draft is trusted when it
 * appears here, so a reply quoting a reviewer's "$300" or an observed rank does
 * not raise unconfirmed_claim.
 */
function confirmedOrObservedText(ctx: AgentContext): string {
  return [confirmedText(ctx), ...(ctx.sampledReviews ?? []).map((review) => review.text), asText(ctx.evidence)]
    .join("\n")
    .toLowerCase();
}

function draftText(output: AgentOutput): string {
  return `${output.title}\n${output.body}\n${output.alt_text ?? ""}`;
}

// CJK ideographs and CJK/full-width punctuation end a link: in zh drafts the URL is followed directly by text (https://x.test/book，歡迎光臨).
const LINK = /\bhttps?:\/\/[^\s"'<>)　-〿一-鿿＀-￯]+|\bwww\.[^\s"'<>)　-〿一-鿿＀-￯]+/gi;
const PRICE = /(?:HK\$|NT\$|US\$|\$|HKD\s?|TWD\s?)\s?\d[\d,.]*|\d[\d,.]*\s?(?:元|蚊)/gi;
// "#1" sits outside the \b group: \b never matches between a space and "#".
// Bare "best" is not a claim ("do our best", "Best regards"), so only superlative
// phrases count. 第一次 ("first time") and 最好 ("had better") are ordinary copy.
const SUPERLATIVE = /(?:\b(?:the best|best[- ]selling|best in|top[- ]rated|no\.?\s?1|number one|award[- ]winning)\b|#1\b)[^.!?\n]{0,40}|最佳|首選|得獎|第一(?!次)/gi;

/** The JSON-LD namespace every FAQ draft carries; it is not a destination for customers. */
const SCHEMA_NAMESPACE = /^https?:\/\/schema\.org\/?$/;

export function unexpectedLinks(ctx: AgentContext, output: AgentOutput): string[] {
  const confirmed = confirmedText(ctx);
  const hit = (draftText(output).match(LINK) ?? [])
    .map((link) => link.toLowerCase().replace(/[.,;:!?]+$/, ""))
    .filter((link) => !SCHEMA_NAMESPACE.test(link))
    .some((link) => !confirmed.includes(link));
  return hit ? ["unexpected_link"] : [];
}

export function unconfirmedClaims(ctx: AgentContext, output: AgentOutput): string[] {
  const text = draftText(output);
  const confirmed = confirmedOrObservedText(ctx);
  // A price is confirmed when its digit run is (a comma-grouped 1,200 matches 1200).
  const confirmedDigits = confirmed.replace(/,/g, "");
  const price = (text.match(PRICE) ?? []).some((match) => {
    const digits = /\d[\d,.]*/.exec(match)?.[0].replace(/,/g, "").replace(/\.+$/, "");
    return digits ? !confirmedDigits.includes(digits) : false;
  });
  // The superlative regex reads up to 40 characters past its keyword; cut at the
  // first clause break so an approved claim followed by ", and more" still matches.
  const superlative = (text.match(SUPERLATIVE) ?? []).some((match) => {
    const phrase = match.split(/[,;，；。]/)[0].trim().toLowerCase();
    return phrase ? !confirmed.includes(phrase) : false;
  });
  return price || superlative ? ["unconfirmed_claim"] : [];
}

/** The checks every agent runs, whatever its own acceptance adds (composed in `defineAgent`). */
export function sharedAcceptance(ctx: AgentContext, output: AgentOutput): string[] {
  return [...prohibitedTermHits(ctx, output), ...unexpectedLinks(ctx, output), ...unconfirmedClaims(ctx, output)];
}

// ---------------------------------------------------------------------------
// P4.1 offer checks (docs/superpowers/specs/2026-10-01-offer-promotion-copy-design.md §4).
// Warnings for the approver, never blocks: the owner's review is the control,
// and each list below is finite.
// ---------------------------------------------------------------------------

const OTHER_MARKET_CURRENCY: Record<AgentContext["market"], RegExp> = {
  // 元 after a digit is Taiwan usage; Hong Kong copy writes HK$ or 蚊.
  hk: /NT\$|\bTWD\b|新台幣|台幣|\d\s?元/i,
  tw: /HK\$|\bHKD\b|港幣|港元|\d\s?蚊/i,
};

/** A price written in the other market's currency. */
export function wrongMarketCurrency(ctx: AgentContext, output: AgentOutput): string[] {
  return OTHER_MARKET_CURRENCY[ctx.market].test(draftText(output)) ? ["wrong_market_currency"] : [];
}

function offerOwnText(ctx: AgentContext): string {
  return `${ctx.offer?.details ?? ""}\n${ctx.offer?.terms ?? ""}`.toLowerCase();
}

const DISCOUNT = /\d+(?:\.\d+)?\s?%(?:\s?off\b)?|\d+(?:\.\d)?\s?折|半價|half[- ]price|\bsave\s+(?:HK\$|NT\$|\$)?\s?\d[\d,.]*|(?:HK\$|NT\$|\$)\s?\d[\d,.]*\s+off\b|\d+\s+off\b|買一送一|buy one,? get one|\bfree\b|免費/gi;

/** A discount, saving or free item the offer's own details and terms never state. */
export function unconfirmedDiscount(ctx: AgentContext, output: AgentOutput): string[] {
  const own = offerOwnText(ctx);
  const hit = (draftText(output).match(DISCOUNT) ?? []).some((match) => !own.includes(match.toLowerCase()));
  return hit ? ["unconfirmed_discount"] : [];
}

const URGENCY = /limited[- ]time|last chance|while (?:stocks?|supplies) last|hurry|ends soon|don't miss out|限時|最後機會|售完即止|賣完即止|數量有限|先到先得|快將結束|即將結束|錯過不再/gi;

/** Urgency or scarcity wording on an offer the owner said has no end date (spec D7). */
export function urgencyClaim(ctx: AgentContext, output: AgentOutput): string[] {
  if (!ctx.offer?.openEnded) return [];
  const terms = (ctx.offer.terms ?? "").toLowerCase();
  const hit = (draftText(output).match(URGENCY) ?? []).some((match) => !terms.includes(match.toLowerCase()));
  return hit ? ["urgency_claim"] : [];
}

// Health and efficacy wording is the highest-risk promotion copy in both
// markets (HK Cap. 231; TW 食品安全衛生管理法 Art. 28). A reminder, not legal advice.
const HEALTH = /治療|療效|減肥|瘦身|排毒|預防|抗癌|\bcures?\b|\btreats?\b|\bdetox\w*|weight[- ]loss|slimming/gi;

/** A health or efficacy claim that is not in the offer or brand facts. */
export function healthClaim(ctx: AgentContext, output: AgentOutput): string[] {
  const confirmed = confirmedText(ctx);
  const hit = (draftText(output).match(HEALTH) ?? []).some((match) => !confirmed.includes(match.toLowerCase()));
  return hit ? ["health_claim"] : [];
}

/** Hashtags in a channel that does not use them (a Google post, a chat message). */
export function hashtagsPresent(output: AgentOutput): string[] {
  return /#[\p{L}\p{N}_]/u.test(output.body) ? ["hashtags_present"] : [];
}

export function baseAcceptance(ctx: AgentContext, output: AgentOutput): string[] {
  return sharedAcceptance(ctx, output);
}
