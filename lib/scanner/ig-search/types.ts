/**
 * The Instagram search types moved into `@sme-scanner/contracts` (CLAUDE.md D3)
 * so the vendored scan-engine can reach them without importing the app. This
 * file keeps upstream's relative `./types` / `../ig-search/types` imports
 * working verbatim; it declares nothing of its own.
 */
export type {
  IgMatchProvenance,
  IgSearchAttempt,
  IgSearchOutcome,
  IgSearchProviderMetadata,
  IgSearchProviderResult,
  IgSearchResponse,
  IgSourceOutcome,
  IgSourceResult,
  InstagramCandidate,
} from "@sme-scanner/contracts";
