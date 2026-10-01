import type { WorkflowDefinition } from "@/lib/workspace/templates";

/**
 * The three promotion-copy workflows (spec §3), created only by
 * prepareOfferDrafts. Kept free of the region package so client components
 * (the Create page) can import it.
 */
export const OFFER_TEMPLATE_KEYS = ["offer-gbp-post", "offer-social-post", "offer-chat-message"] as const;
export type OfferTemplateKey = (typeof OFFER_TEMPLATE_KEYS)[number];

export function isOfferTemplateKey(value: unknown): value is OfferTemplateKey {
  return typeof value === "string" && (OFFER_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/** An offer workflow is one whose inputs need a confirmed offer. */
export function isOfferWorkflow(workflow: Pick<WorkflowDefinition, "inputs">): boolean {
  return workflow.inputs.some((input) => input.key === "offer_confirmed");
}
