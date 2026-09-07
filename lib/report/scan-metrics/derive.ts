import { deriveInstagramSample } from './instagram';
import { deriveSearchMetrics } from './search';
import type { ScanMetrics } from './types';

/** Derive only measured modules from the authorized, untruncated stored payload. */
export function deriveScanMetrics(rawData: unknown, measured: { ig: boolean; aeo: boolean }): ScanMetrics {
  const raw = typeof rawData === 'object' && rawData !== null && !Array.isArray(rawData)
    ? rawData as Record<string, unknown> : {};
  const search = measured.aeo ? deriveSearchMetrics(raw.aeo) : { groups: [], omittedGroups: 0 };
  return {
    instagram: measured.ig ? deriveInstagramSample(raw.ig) : null,
    search: search.groups,
    omittedSearchGroups: search.omittedGroups,
  };
}
