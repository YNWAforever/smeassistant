import type { OfferRow } from "./types";

/**
 * Today's calendar date (YYYY-MM-DD) in the workspace timezone. An offer that
 * ends on 31 October is still running at 23:30 that day in Hong Kong, even
 * though it is already 1 November nowhere near UTC midnight. An unknown
 * timezone falls back to UTC rather than throwing, as currentPeriod does.
 */
export function localDate(timezone: string, now: Date): string {
  const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timezone || "UTC" }).format(now);
  } catch {
    formatted = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" }).format(now);
  }
  return formatted;
}

/** Ended means the last valid day is before today; an open-ended offer never ends. */
export function hasEnded(offer: Pick<OfferRow, "ends_on">, today: string): boolean {
  return offer.ends_on !== null && offer.ends_on < today;
}

/** Not yet started: the first valid day is after today. */
export function notStarted(offer: Pick<OfferRow, "starts_on">, today: string): boolean {
  return offer.starts_on > today;
}
