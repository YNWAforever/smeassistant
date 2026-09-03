/**
 * Detect SerpAPI errors that mean an engine/feature is not supported (e.g. a plan or language
 * limit), as opposed to a transient failure. SerpAPI phrases these several ways
 * ("unsupported", "is not supported", "isn't supported", "not available on your plan"), so match
 * the family rather than a single literal token. Shared by the normalizer (which sets the
 * `unsupported` flag) and the report panel (which renders the "Unsupported" status) so the two
 * never drift apart.
 */
export function isUnsupportedSerpApiError(error: string | null | undefined): boolean {
  if (!error) return false;
  return /unsupported|not supported|isn'?t supported|not available on your plan/i.test(error);
}
