/** A local navigation target; inspect repeated decoding without changing valid context. */
export function safeReturnPath(value: string, fallback: string): string {
  if (!value || value.length > 2048) return fallback;
  let decoded = value;
  for (let depth = 0; depth < 8; depth++) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return new URL(value, "https://local.invalid").origin === "https://local.invalid" ? value : fallback;
      decoded = next;
    } catch { return fallback; }
  }
  return fallback;
}
