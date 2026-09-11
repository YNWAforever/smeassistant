import { CONTACT_CHANNELS, normalizeMarketContact, type ContactChannel, type ContactMarket } from "@/lib/leads/contact";

export type UnlockMarket = "hk" | "tw";
export type UnlockChannel = ContactChannel;

/** `?market=` on the unlock URL arrives as HK/TW (upstream) or hk/tw; anything else follows the locale. */
export function resolveUnlockMarket(value: string | null | undefined, locale: string): UnlockMarket {
  const lower = value?.trim().toLowerCase();
  if (lower === "hk" || lower === "tw") return lower;
  return locale === "zh-TW" ? "tw" : "hk";
}

export function contactMarket(market: UnlockMarket): ContactMarket {
  return market === "tw" ? "TW" : "HK";
}

/** HK: whatsapp | phone | email — TW: line | phone | email. */
export function unlockChannels(market: UnlockMarket): UnlockChannel[] {
  return [...CONTACT_CHANNELS[contactMarket(market)]];
}

export function defaultUnlockChannel(market: UnlockMarket): UnlockChannel {
  return market === "tw" ? "line" : "whatsapp";
}

/** 32 random bytes, base64url without padding (43 chars) — the shape the unlock route validates. */
export function generateIdempotencyKey(getRandomValues: (bytes: Uint8Array) => Uint8Array = (bytes) => globalThis.crypto.getRandomValues(bytes)): string {
  const bytes = getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface UnlockFormValues {
  channel: UnlockChannel;
  contact: string;
  /**
   * Not a recovery address, despite the wire name. Nothing is emailed at unlock
   * time and no recovery route exists in this app. The value is persisted to
   * `report_access_grants.email_normalized` by `complete_report_unlock`, and the
   * only reader is `claimsRepository.isLeadRecipient()`, which decides whether
   * `POST /api/owner/magic-link` may send a sign-in link for this report. It is
   * never a delivery address and never ownership — that stays Google-verified or
   * staff-assigned. The key name is upstream's contract (`recovery_email` on the
   * wire, `p_recovery_email` in the RPC) and is deliberately not renamed.
   */
  recoveryEmail: string;
  reportDelivery: boolean;
  scanDiscussion: boolean;
  marketing: boolean;
}

export type UnlockFormError = "contact_required" | "contact_invalid" | "recovery_invalid" | "delivery_required";

export function validateUnlockForm(market: UnlockMarket, values: UnlockFormValues): UnlockFormError[] {
  const errors: UnlockFormError[] = [];
  if (!values.contact.trim()) errors.push("contact_required");
  else if (!normalizeMarketContact({ market: contactMarket(market), channel: values.channel, identifier: values.contact })) errors.push("contact_invalid");
  // Gated exactly as the field is rendered (components/unlock-page.tsx shows it
  // only when the channel is not email). Otherwise a stale value typed under
  // WhatsApp and left behind after switching to Email would block submission on
  // an off-screen field -- and buildUnlockPayload discards it for that channel
  // anyway, so the server would have accepted it. Reusing normalizeMarketContact
  // rather than a fresh regex keeps client acceptance byte-identical to the
  // route's, so a typo can never surface as the generic "could not be unlocked".
  if (values.channel !== "email") {
    const recovery = values.recoveryEmail.trim();
    if (recovery && !normalizeMarketContact({ market: contactMarket(market), channel: "email", identifier: recovery })) errors.push("recovery_invalid");
  }
  if (!values.reportDelivery) errors.push("delivery_required");
  return errors;
}

/** Body of POST /api/report-access/unlock — field names are upstream's, verbatim (CLAUDE.md §3.2.2). */
export interface UnlockPayload {
  slug: string;
  market: UnlockMarket;
  objective: string;
  preferred_contact_channel: UnlockChannel;
  contact_identifier: string;
  recovery_email?: string;
  locale: string;
  report_delivery: true;
  scan_discussion: boolean;
  marketing: boolean;
  idempotency_key: string;
  anonymous_session_id?: string;
}

export function buildUnlockPayload(input: {
  slug: string;
  market: UnlockMarket;
  objective: string;
  locale: string;
  values: UnlockFormValues;
  idempotencyKey: string;
  anonymousSessionId?: string;
}): UnlockPayload {
  const { values } = input;
  const contact = values.contact.trim();
  const recovery = values.channel === "email" ? contact : values.recoveryEmail.trim();
  return {
    slug: input.slug,
    market: input.market,
    objective: input.objective,
    preferred_contact_channel: values.channel,
    contact_identifier: contact,
    ...(recovery ? { recovery_email: recovery } : {}),
    locale: input.locale,
    report_delivery: true,
    scan_discussion: values.scanDiscussion,
    marketing: values.marketing,
    idempotency_key: input.idempotencyKey,
    ...(input.anonymousSessionId ? { anonymous_session_id: input.anonymousSessionId } : {}),
  };
}
