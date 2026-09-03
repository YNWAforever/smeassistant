import { brandBlock, guardrailBlock, outputBlock, roleBlock } from "./guardrails";
import { agentOutputSchema, type AgentContext, type AgentDefinition, type AgentKey, type AgentOutput } from "./schema";

/**
 * What each agent file declares. `composePrompt` turns it into the §3.7
 * skeleton: role + locale + market → brand facts → guardrails → evidence JSON
 * and task → JSON-only output instruction.
 */
export interface AgentSpec {
  key: AgentKey;
  capability: "Live" | "Beta";
  promptVersion: string;
  /** "a review-reply writer", "a local SEO analyst", … */
  role: string;
  task(ctx: AgentContext): string;
  /** Extra evidence merged into the JSON block (sampled reviews, inputs, …). */
  evidence?(ctx: AgentContext): Record<string, unknown>;
  acceptance?(ctx: AgentContext, output: AgentOutput): string[];
}

function evidenceBlock(spec: AgentSpec, ctx: AgentContext): string {
  const evidence = {
    action: {
      template: ctx.action.templateKey,
      title: ctx.action.title,
      summary: ctx.action.summary,
      evidence: ctx.action.evidence,
    },
    ...ctx.evidence,
    provided_inputs: ctx.providedInputs,
    ...(spec.evidence ? spec.evidence(ctx) : {}),
  };
  return ["EVIDENCE (JSON):", JSON.stringify(evidence, null, 2)].join("\n");
}

export function composePrompt(spec: AgentSpec, ctx: AgentContext): string {
  return [
    roleBlock(spec.role, ctx),
    brandBlock(ctx),
    guardrailBlock(),
    evidenceBlock(spec, ctx),
    `TASK:\n${spec.task(ctx).trim()}`,
    outputBlock(),
    `(prompt ${spec.key}@${spec.promptVersion})`,
  ].join("\n\n");
}

export function defineAgent(spec: AgentSpec): AgentDefinition {
  return {
    key: spec.key,
    capability: spec.capability,
    promptVersion: spec.promptVersion,
    buildPrompt: (ctx) => composePrompt(spec, ctx),
    outputSchema: agentOutputSchema,
    acceptance: (ctx, output) => (spec.acceptance ? spec.acceptance(ctx, output) : []),
  };
}

/** Provided inputs as a readable list for task text. */
export function inputLine(ctx: AgentContext, key: string): string {
  const value = ctx.providedInputs[key];
  if (value === undefined || value === null || value === "") return "(not provided)";
  return typeof value === "string" ? value : JSON.stringify(value);
}
