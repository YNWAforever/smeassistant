import "server-only";

/**
 * Turns evidence images into base64 data URIs so a printed page needs no
 * network at print time.
 *
 * Two reasons this happens server-side during render rather than in the browser:
 * the signed URLs carry a 300s TTL and were minted in this same request, so they
 * are seconds old here and minutes old by the time a human presses print; and
 * browsers are unreliable about completing image loads mid-print.
 *
 * lib/evidence/safe-media.ts is deliberately not reused. That fetcher hardens
 * requests to untrusted third-party hosts with DNS and IP pinning, which would
 * work against our own Supabase CDN. These URLs are already origin-pinned and
 * structurally validated by safeSignedUrl in load-authorized.ts.
 */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8_000;

async function toDataUri(mediaUrl: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const response = await fetcher(mediaUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    // Swallowed on purpose: a provider message could carry the signed URL and
    // its token. A missing image degrades the document; a leaked token does not.
    return null;
  }
}

/** Maps evidence id → data URI, omitting anything that could not be inlined. */
export async function inlinePrintMedia(
  items: Array<{ id: string; mediaUrl: string | null }>,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const settled = await Promise.all(items.map(async (item) => {
    if (!item.mediaUrl) return null;
    const dataUri = await toDataUri(item.mediaUrl, fetcher);
    return dataUri ? ([item.id, dataUri] as const) : null;
  }));
  return Object.fromEntries(settled.filter((entry): entry is readonly [string, string] => entry !== null));
}
