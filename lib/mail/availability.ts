/**
 * Mail (the outbox sender, docs/superpowers/specs/2026-09-27-mail-outbox-
 * design.md §1) stays closed until someone has explicitly approved the
 * current mail templates *and* the provider is fully configured. Mirrors
 * lib/commercial/availability.ts's `billingAvailability` shape: both
 * `mail_unapproved` and `provider_unconfigured` are "closed", collapsed to
 * one hold reason (`mail_unapproved`) by the outbox so nothing downstream
 * has to distinguish "nobody approved it" from "somebody typed the wrong
 * version" or "the provider isn't wired up".
 */
export type MailAvailability =
  | { open: true }
  | { open: false; reason: "mail_unapproved" | "provider_unconfigured" };

export const MAIL_TEMPLATES_VERSION = "2026-09-event-mail-v1";

const MAIL_ENV_KEYS = ["RESEND_API_KEY", "REPORT_EMAIL_FROM", "APP_ORIGIN"] as const;

const MIN_UNSUBSCRIBE_SECRET_BYTES = 32;

/**
 * Reads `APPLICATION_MAIL_APPROVED` and the provider/secret variables from
 * the given env (defaults to `process.env` so callers don't have to thread
 * it through). Every value is trimmed before comparison, so a blank or
 * whitespace-only value reads as unset rather than as a mismatch -- unset is
 * the ordinary "not approved yet" state and never warns; a *present but
 * wrong* value is a configuration mistake worth a warning.
 */
export function mailAvailability(
  env: Record<string, string | undefined> = process.env,
): MailAvailability {
  const approved = env.APPLICATION_MAIL_APPROVED?.trim();
  if (!approved) {
    return { open: false, reason: "mail_unapproved" };
  }
  if (approved !== MAIL_TEMPLATES_VERSION) {
    console.warn("[mail] approval_mismatch", { expected: MAIL_TEMPLATES_VERSION });
    return { open: false, reason: "mail_unapproved" };
  }

  const providerConfigured =
    MAIL_ENV_KEYS.every((key) => Boolean(env[key]?.trim())) && isHttpOrigin(env.APP_ORIGIN?.trim() ?? "");
  const secret = env.MAIL_UNSUBSCRIBE_SECRET?.trim();
  const secretLongEnough = Boolean(secret) && Buffer.byteLength(secret ?? "", "utf8") >= MIN_UNSUBSCRIBE_SECRET_BYTES;
  if (!providerConfigured || !secretLongEnough) {
    return { open: false, reason: "provider_unconfigured" };
  }

  return { open: true };
}

/**
 * Every mailed link is built from `APP_ORIGIN`, so a value that is not an
 * absolute http(s) URL ("localhost:3000", a bare host, "ftp://...") would
 * send links that go nowhere. `new URL("localhost:3000")` parses with the
 * protocol "localhost:", hence the explicit protocol check.
 */
function isHttpOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== "null";
}

/**
 * `MAIL_RECIPIENT_ALLOWLIST` (DEC-05): a comma-separated test-recipient list
 * that, while set, is the only thing outbound mail may reach. Case- and
 * whitespace-insensitive; an allowlist made only of commas or blanks is
 * treated the same as unset (`null`), never as "no recipient is allowed".
 */
export function parseRecipientAllowlist(value: string | undefined): Set<string> | null {
  if (!value) return null;
  const entries = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;
  return new Set(entries);
}
