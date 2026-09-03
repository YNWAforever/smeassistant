import { z } from "zod";
import type { PrototypeLocale } from "@/lib/copy";
import type { ActionOverview } from "@/lib/workspace/overview";
import type { WorkspaceAgentKey } from "@/lib/workspace/templates";

/**
 * Agent contracts (CLAUDE.md §3.7). Every agent produces the same JSON shape
 * so the run orchestrator (lib/workspace/runs.ts) can validate, persist and
 * version outputs without knowing which agent ran.
 */
export type AgentKey = WorkspaceAgentKey | "validation_plan";

export interface AgentOutput {
  title: string;
  body: string;
  alt_text?: string;
  acceptance_criteria: string[];
  warnings: string[];
  facts_used: string[];
  facts_needed: string[];
}

export interface SampledReview {
  rating: number | null;
  text: string;
  time: string | null;
}

export interface AgentContext {
  locale: PrototypeLocale;
  market: "hk" | "tw";
  brand: {
    voice: string;
    approvedClaims: string[];
    prohibitedTerms: string[];
    languages: string[];
    facts: Record<string, unknown>;
  };
  location: { name: string; address?: string | null; district?: string | null };
  action: ActionOverview;
  /** Snapshot metrics, module states, website checks and the action's own evidence, already bounded. */
  evidence: Record<string, unknown>;
  providedInputs: Record<string, unknown>;
  /** Reviews without an owner response, newest first, excerpts only (review_reply). */
  sampledReviews?: SampledReview[];
}

export interface AgentDefinition {
  key: AgentKey;
  capability: "Live" | "Beta";
  promptVersion: string;
  buildPrompt(ctx: AgentContext): string;
  outputSchema: z.ZodType<AgentOutput, z.ZodTypeDef, unknown>;
  /** Guardrail violations found in a validated output (empty = clean). They are merged into `warnings`. */
  acceptance(ctx: AgentContext, output: AgentOutput): string[];
}

const stringList = z.preprocess(
  (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : []),
  z.array(z.string().trim().max(500)).max(40),
);

/** The exact keys of §3.7 item 5. Missing list keys read as empty; extra keys are dropped. */
export const agentOutputSchema: z.ZodType<AgentOutput, z.ZodTypeDef, unknown> = z
  .object({
    title: z.string().trim().max(200).default(""),
    body: z.string().max(20_000).default(""),
    alt_text: z.string().trim().max(500).optional().nullable().transform((v) => (v ? v : undefined)),
    acceptance_criteria: stringList,
    warnings: stringList,
    facts_used: stringList,
    facts_needed: stringList,
  })
  .refine((output) => output.body.trim().length > 0 || output.facts_needed.length > 0, {
    message: "body or facts_needed required",
  });

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced) return fenced[1].trim();
  // Prose around a JSON object: take the outermost braces.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

/** Parse + validate a completion. Tolerates ```json fences and surrounding prose; null on anything else. */
export function parseAgentOutput(text: string | null | undefined, schema: AgentDefinition["outputSchema"] = agentOutputSchema): AgentOutput | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}
