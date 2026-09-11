/**
 * Reads `output_versions.meta` into something the approval UI can render.
 *
 * The agents already compute guardrail violations -- prohibited brand terms, a
 * compensation promise in a review reply, an over-long body, a missing alt
 * text -- and `lib/repositories/artifacts.ts` persists them into
 * `meta.warnings`. Nothing ever read them back: the versions query did not
 * select `meta`, `VersionRow` had no field for it, and the approval panel
 * showed a hard-coded "Brand guardrail reminder - 1 reminder" on every draft,
 * clean or not. So the one number on the page was a constant, and a real
 * violation looked exactly like no violation.
 *
 * Parsing happens here rather than in the component so the raw blob never
 * reaches the client, and so the classification is unit-testable without a
 * database.
 */

export type VersionOrigin = "manual" | "agent_run" | "assistant";

export type GuardrailCode =
  | "prohibited_term"
  | "compensation_promise"
  | "length"
  | "alt_text_missing"
  | "too_many_hashtags"
  | "jsonld_missing"
  | "title_too_long"
  | "bio_too_long";

export interface GuardrailFlag {
  code: GuardrailCode;
  /** The offending term for `prohibited_term`; the limit for a length flag. */
  detail?: string;
}

export interface VersionMeta {
  origin: VersionOrigin;
  agentKey: string | null;
  /**
   * True when the stored meta actually carried a `warnings` array -- i.e. an
   * agent checked this version. It is what separates "the check ran and found
   * nothing" from "no check applies here", which is the case for a manual edit
   * and for every row written before warnings were surfaced. Without it, a
   * clean agent draft and a hand-typed one would render identically.
   */
  checked: boolean;
  guardrails: GuardrailFlag[];
  /** Warnings the model itself raised, i.e. anything not a known guardrail code. */
  agentNotes: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isOrigin(value: unknown): value is VersionOrigin {
  return value === "manual" || value === "agent_run" || value === "assistant";
}

/**
 * The vocabulary the agents emit, from lib/agents/guardrails.ts and
 * lib/agents/agents/*. Anything unrecognised is kept as an agent note rather
 * than dropped -- an unclassified warning the approver can read beats a
 * silently discarded one, and a new agent code should degrade to visible.
 */
function classify(warning: string): GuardrailFlag | null {
  if (warning.startsWith("prohibited_term:")) {
    return { code: "prohibited_term", detail: warning.slice("prohibited_term:".length) };
  }
  if (warning === "compensation_promise") return { code: "compensation_promise" };
  if (warning === "alt_text_missing") return { code: "alt_text_missing" };
  if (warning === "too_many_hashtags") return { code: "too_many_hashtags" };
  if (warning === "jsonld_missing") return { code: "jsonld_missing" };
  const over = /^(body|title|bio)_over_(\d+)_chars$/.exec(warning);
  if (over) {
    const code: GuardrailCode = over[1] === "title" ? "title_too_long" : over[1] === "bio" ? "bio_too_long" : "length";
    return { code, detail: over[2] };
  }
  return null;
}

export function parseVersionMeta(meta: unknown, authorType: "user" | "agent"): VersionMeta {
  const source = record(meta);
  const rawWarnings = source?.warnings;
  const checked = Array.isArray(rawWarnings);
  const warnings = checked ? (rawWarnings as unknown[]).filter((entry): entry is string => typeof entry === "string") : [];

  const guardrails: GuardrailFlag[] = [];
  const agentNotes: string[] = [];
  for (const warning of warnings) {
    const flag = classify(warning);
    if (flag) guardrails.push(flag);
    else agentNotes.push(warning);
  }

  const agentKeyRaw = source?.agent_key;
  return {
    // Rows written before `origin` existed fall back to the author type, so an
    // older agent version still reads as agent-generated rather than manual.
    origin: isOrigin(source?.origin) ? source.origin : authorType === "agent" ? "agent_run" : "manual",
    agentKey: typeof agentKeyRaw === "string" && agentKeyRaw ? agentKeyRaw : null,
    checked,
    guardrails,
    agentNotes,
  };
}
