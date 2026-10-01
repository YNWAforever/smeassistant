// Deep import on purpose: modules reached by lib/workspace/runs.ts must load
// under tsx (scripts/eval-workflows.ts), where the vendored package's CJS
// barrel does not resolve; see lib/workspace/evidence-inputs.ts.
import { MARKETS } from "@sme-scanner/region/src/config";
import type { OfferChannel } from "./types";
import type { OfferTemplateKey } from "./workflow";

export { OFFER_TEMPLATE_KEYS, isOfferTemplateKey, isOfferWorkflow, type OfferTemplateKey } from "./workflow";

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
