import type { AgentKey } from "../types";

export interface ReviewReplyDraft {
  agentKey: "review_reply_agent";
  /** Truncated original review text -- staff context without re-opening raw_data. */
  reviewExcerpt: string;
  reviewRating: number;
  /** Detected tag, e.g. "zh-HK" | "en" -- the review's language, not the UI locale. */
  reviewLanguage: string;
  /** Written in reviewLanguage. */
  draftReply: string;
}

export interface GBPPostDraft {
  agentKey: "gbp_post_agent";
  draftPostZh: string;
  draftPostEn: string;
  /** What the draft drew from -- lets staff sanity-check against hallucination. */
  seedEvidence: string[];
}

export type AgentDraftOutput = ReviewReplyDraft | GBPPostDraft;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateReviewReplyDraft(value: Record<string, unknown>): ReviewReplyDraft | null {
  if (!isNonEmptyString(value.reviewExcerpt)) return null;
  if (typeof value.reviewRating !== "number" || !Number.isFinite(value.reviewRating)) return null;
  if (!isNonEmptyString(value.reviewLanguage)) return null;
  if (!isNonEmptyString(value.draftReply)) return null;
  return {
    agentKey: "review_reply_agent",
    reviewExcerpt: value.reviewExcerpt,
    reviewRating: value.reviewRating,
    reviewLanguage: value.reviewLanguage,
    draftReply: value.draftReply,
  };
}

function validateGBPPostDraft(value: Record<string, unknown>): GBPPostDraft | null {
  if (!isNonEmptyString(value.draftPostZh)) return null;
  if (!isNonEmptyString(value.draftPostEn)) return null;
  if (!isStringArray(value.seedEvidence)) return null;
  return {
    agentKey: "gbp_post_agent",
    draftPostZh: value.draftPostZh,
    draftPostEn: value.draftPostEn,
    seedEvidence: value.seedEvidence,
  };
}

/**
 * Hand-validated, discriminated on agentKey. Returns null (never throws) on
 * any shape mismatch -- an unvalidated LLM response must never reach
 * agent_runs.output.
 */
export function validateAgentDraftOutput(agentKey: AgentKey, value: unknown): AgentDraftOutput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (agentKey === "review_reply_agent") return validateReviewReplyDraft(record);
  if (agentKey === "gbp_post_agent") return validateGBPPostDraft(record);
  return null;
}
