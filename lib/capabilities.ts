import type { Capability } from "@/lib/domain";

/**
 * Real capability labels (CLAUDE.md §5 "Global"). The UI reads capability from
 * here or from the template table (which must agree — see the test), never
 * from demo data. `Demo` is only ever set by the demo surfaces themselves.
 */
export const CAPABILITIES = {
  review_reply: "Live",
  review_request: "Live",
  social_post: "Live",
  faq_jsonld: "Live",
  ig_bio: "Live",
  website_basics: "Live",
  validation_plan: "Live",
  gbp_post: "Beta",
  photo_brief: "Beta",
  local_seo_brief: "Beta",
  menu_translation: "Beta",
  google_business_connect: "Live",
  google_business_publish: "Requires connection",
  instagram_publish: "Planned",
  chatgpt_perplexity_probes: "Planned",
} as const satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

export function capabilityOf(key: CapabilityKey): Capability {
  return CAPABILITIES[key];
}
