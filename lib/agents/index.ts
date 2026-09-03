import { faqJsonld } from "./agents/faq-jsonld";
import { gbpPost } from "./agents/gbp-post";
import { igBio } from "./agents/ig-bio";
import { localSeoBrief } from "./agents/local-seo-brief";
import { menuTranslation } from "./agents/menu-translation";
import { photoBrief } from "./agents/photo-brief";
import { reviewReply } from "./agents/review-reply";
import { reviewRequest } from "./agents/review-request";
import { socialPost } from "./agents/social-post";
import { validationPlan } from "./agents/validation-plan";
import { websiteBasics } from "./agents/website-basics";
import type { AgentDefinition, AgentKey } from "./schema";

export { composePrompt, defineAgent, type AgentSpec } from "./prompt";
export { agentOutputSchema, parseAgentOutput } from "./schema";
export type { AgentContext, AgentDefinition, AgentKey, AgentOutput, SampledReview } from "./schema";
export { GUARDRAILS, OUTPUT_KEYS } from "./guardrails";
export { computeCostUsd } from "./cost-model";

/** CLAUDE.md §3.7 / Phase 4 item 1: Live agents and Beta agents, keyed as templates name them. */
export const AGENTS: Record<AgentKey, AgentDefinition> = {
  review_reply: reviewReply,
  review_request: reviewRequest,
  social_post: socialPost,
  ig_bio: igBio,
  faq_jsonld: faqJsonld,
  website_basics: websiteBasics,
  validation_plan: validationPlan,
  gbp_post: gbpPost,
  photo_brief: photoBrief,
  local_seo_brief: localSeoBrief,
  menu_translation: menuTranslation,
};

export function isAgentKey(value: unknown): value is AgentKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AGENTS, value);
}

/** The runtime options §3.7 fixes for every generation call. */
export const AGENT_LLM_OPTIONS = { jsonMode: true, temperature: 0.4, maxTokens: 1200, timeoutMs: 45_000 } as const;
