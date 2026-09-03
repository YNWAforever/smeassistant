/**
 * Evidence contracts live in `@sme-scanner/contracts` (CLAUDE.md D3) so the
 * vendored scan-engine and this app share one definition. This file keeps
 * upstream's relative `./types` imports inside lib/evidence working verbatim.
 */
export { EVIDENCE_PROVIDERS, EVIDENCE_RETENTIONS, EVIDENCE_TYPES } from "@sme-scanner/contracts";
export type {
  EvidenceCandidate,
  EvidenceProvider,
  EvidenceRetention,
  EvidenceType,
} from "@sme-scanner/contracts";
