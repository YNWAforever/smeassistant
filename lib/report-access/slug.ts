/** A public report identifier is context only, never an authorization grant. */
export function parseReportSlug(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : null;
}
