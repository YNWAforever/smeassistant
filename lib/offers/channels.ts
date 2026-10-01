// Deep import on purpose: modules reached by lib/workspace/runs.ts must load
// under tsx (scripts/eval-workflows.ts), where the vendored package's CJS
// barrel does not resolve; see lib/workspace/evidence-inputs.ts.
import { MARKETS } from "@sme-scanner/region/src/config";
import type { WorkflowDefinition } from "@/lib/workspace/templates";
import type { OfferChannel } from "./types";

/** The three promotion-copy workflows (spec §3). Created only by prepareOfferDrafts. */
export const OFFER_TEMPLATE_KEYS = ["offer-gbp-post", "offer-social-post", "offer-chat-message"] as const;
export type OfferTemplateKey = (typeof OFFER_TEMPLATE_KEYS)[number];

export function isOfferTemplateKey(value: unknown): value is OfferTemplateKey {
  return typeof value === "string" && (OFFER_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** An offer workflow is one whose inputs need a confirmed offer. */
export function isOfferWorkflow(workflow: Pick<WorkflowDefinition, "inputs">): boolean {
  return workflow.inputs.some((input) => input.key === "offer_confirmed");
}

export function offerChannel(templateKey: OfferTemplateKey, market: "hk" | "tw"): OfferChannel {
  if (templateKey === "offer-gbp-post") return "google_post";
  if (templateKey === "offer-social-post") return "instagram_post";
  return MARKETS[market].contact.channel === "line" ? "line_message" : "whatsapp_message";
}

export const CHANNEL_LIMITS: Record<OfferChannel, { maxChars: number; maxHashtags: number }> = {
  google_post: { maxChars: 1500, maxHashtags: 0 },
  instagram_post: { maxChars: 2200, maxHashtags: 5 },
  whatsapp_message: { maxChars: 500, maxHashtags: 0 },
  line_message: { maxChars: 500, maxHashtags: 0 },
};
