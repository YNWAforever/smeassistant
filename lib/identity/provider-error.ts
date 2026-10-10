/**
 * What may be logged about an auth-provider rejection (F-21).
 *
 * Only the HTTP status and a constant-style error code: the provider's message
 * can echo the address it was asked to mail, so it is never logged. Anything
 * that is not a plain status number or an UPPER_SNAKE code becomes null.
 */
export function providerErrorDetail(error: unknown): { status: number | null; code: string | null } {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const status = Number.isInteger(record.status) && (record.status as number) >= 100 && (record.status as number) <= 599
    ? (record.status as number)
    : null;
  const code = typeof record.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(record.code) ? record.code : null;
  return { status, code };
}
