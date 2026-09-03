// Exported as const arrays -- not just union types -- so runtime validators
// (the /api/scan/evidence route boundary, in particular) can check membership
// against the same list the type is derived from. Two independently
// maintained literal lists is how a future provider or evidence type quietly
// stops being enforced at the trust boundary while still typechecking.
export const EVIDENCE_PROVIDERS = ["instagram", "google_maps"] as const;
export type EvidenceProvider = (typeof EVIDENCE_PROVIDERS)[number];

export const EVIDENCE_TYPES = [
  "profile",
  "post",
  "reel",
  "story",
  "highlight",
  "photo",
  "review",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const EVIDENCE_RETENTIONS = ["snapshot_permitted", "metadata_only"] as const;
export type EvidenceRetention = (typeof EVIDENCE_RETENTIONS)[number];

export interface EvidenceCandidate {
  provider: EvidenceProvider;
  evidenceType: EvidenceType;
  sourceId: string;
  sourceUrl: string | null;
  mediaUrl: string | null;
  capturedAt: string;
  publishedAt: string | null;
  text: string | null;
  metadata: Record<string, string | number | boolean | null | string[]>;
  retention: EvidenceRetention;
}
