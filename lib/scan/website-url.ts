export type WebsiteUrlResult = { ok: true; value: string | null } | { ok: false; reason: "invalid_type" | "invalid_url" | "unsupported_scheme" | "too_long" };

/** Optional public URL syntax. Network collectors keep their own SSRF boundary. */
export function parseOptionalWebsiteUrl(value: unknown): WebsiteUrlResult {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, reason: "invalid_type" };
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > 2048) return { ok: false, reason: "too_long" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:/i.test(text)) return { ok: false, reason: "unsupported_scheme" };
  if (!/^https?:\/\//i.test(text) || /[\u0000-\u0020\u007f]/.test(text)) return { ok: false, reason: "invalid_url" };
  try {
    const url = new URL(text);
    return url.hostname && !url.username && !url.password && (url.protocol === "http:" || url.protocol === "https:")
      ? { ok: true, value: text } : { ok: false, reason: "invalid_url" };
  } catch { return { ok: false, reason: "invalid_url" }; }
}

/** A supplied invalid URL must never silently fall back to a candidate. */
export function resolveScanWebsite(draft: { websiteUrl: string; candidate?: { websiteUrl?: string | null } | null }): WebsiteUrlResult {
  return parseOptionalWebsiteUrl(draft.websiteUrl.trim() ? draft.websiteUrl : draft.candidate?.websiteUrl);
}
