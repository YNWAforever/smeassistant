import { copy, type PrototypeLocale } from "@/lib/copy";

const validDate = (value?: string | null): value is string => Boolean(value && !Number.isNaN(Date.parse(value)));

/** The source's own observation date; else the scan that collected it; else "Date not recorded". Never blank. */
export function ObservationDate({ value, scannedAt, locale }: { value?: string | null; scannedAt?: string | null; locale: PrototypeLocale }) {
  const r = copy[locale].report;
  if (validDate(value)) return <time dateTime={value}>{value.slice(0, 10)}</time>;
  if (validDate(scannedAt)) {
    const [before, after = ""] = r.scannedOn.split("{date}");
    return <span>{before}<time dateTime={scannedAt}>{scannedAt.slice(0, 10)}</time>{after}</span>;
  }
  return <span>{r.dateNotRecorded}</span>;
}
