export const CONTACT_CHANNELS = {
  HK: ["whatsapp", "phone", "email"],
  TW: ["line", "phone", "email"],
} as const;

export type ContactMarket = keyof typeof CONTACT_CHANNELS;
export type ContactChannel = "whatsapp" | "line" | "phone" | "email";

export interface NormalizedMarketContact {
  channel: ContactChannel;
  identifier: string;
}

export function resolveContactMarket(requestedMarket: string | null, locale: string): ContactMarket {
  if (requestedMarket === "HK" || requestedMarket === "TW") return requestedMarket;
  return locale === "zh-TW" ? "TW" : "HK";
}


function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(market: ContactMarket, value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  if (!/^\d+$/.test(compact)) return null;
  if (market === "HK" && /^\d{8}$/.test(compact)) return "+852" + compact;
  if (market === "TW" && /^0\d{9}$/.test(compact)) return "+886" + compact.slice(1);
  return null;
}

export function isContactChannelForMarket(
  market: ContactMarket,
  channel: string,
): channel is ContactChannel {
  return (CONTACT_CHANNELS[market] as readonly string[]).includes(channel);
}

export function normalizeMarketContact({
  market,
  channel,
  identifier,
}: {
  market: ContactMarket;
  channel: string;
  identifier: string;
}): NormalizedMarketContact | null {
  if (!isContactChannelForMarket(market, channel)) return null;
  if (channel === "email") {
    const email = normalizeEmail(identifier);
    return email ? { channel, identifier: email } : null;
  }
  if (channel === "line") {
    const lineId = identifier.trim();
    return /^@?[A-Za-z0-9._-]{2,100}$/.test(lineId)
      ? { channel, identifier: lineId }
      : null;
  }
  const phone = normalizePhone(market, identifier);
  return phone ? { channel, identifier: phone } : null;
}
