import { normalizeMerchantQuery } from "./query";
import type { MerchantCandidate } from "./types";

interface RawSerpApiCandidate {
  title?: unknown;
  name?: unknown;
  alternate_names?: unknown;
  address?: unknown;
  type?: unknown;
  category?: unknown;
  website?: unknown;
  phone?: unknown;
  thumbnail?: unknown;
  gps_coordinates?: { latitude?: unknown; longitude?: unknown } | unknown;
  rating?: unknown;
  reviews?: unknown;
  price?: unknown;
  open_state?: unknown;
  permanently_closed?: unknown;
  place_id?: unknown;
  data_id?: unknown;
  data_cid?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeUrl(value: unknown, allowHttp: boolean): string | undefined {
  const raw = text(value);
  if (!raw || raw.length > 2_048) return undefined;
  try {
    const url = new URL(raw);
    if (url.username || url.password || !url.hostname) return undefined;
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

function finite(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeSerpApiCandidate(raw: unknown, _providerIndex: number): MerchantCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as RawSerpApiCandidate;
  const name = normalizeMerchantQuery(text(row.title) ?? text(row.name) ?? "");
  if (!name) return null;
  const address = text(row.address);
  const placeId = text(row.place_id);
  const dataId = text(row.data_id);
  const dataCid = text(row.data_cid);
  const coordinates = row.gps_coordinates && typeof row.gps_coordinates === "object"
    ? row.gps_coordinates as { latitude?: unknown; longitude?: unknown }
    : undefined;
  const latitude = finite(coordinates?.latitude, -90, 90);
  const longitude = finite(coordinates?.longitude, -180, 180);
  const alternateNames = Array.isArray(row.alternate_names)
    ? [...new Set(row.alternate_names.map(text).filter((value): value is string => Boolean(value)))]
    : [];
  const openState = text(row.open_state);
  const permanentlyClosed = row.permanently_closed === true
    || /permanently closed|永久歇業|永久停業/i.test(openState ?? "");
  const id = placeId
    ? `place:${placeId}`
    : dataId
      ? `data:${dataId}`
      : dataCid
        ? `cid:${dataCid}`
        : `hash:${stableHash([
          normalizeMerchantQuery(name).toLocaleLowerCase("en"),
          address?.toLocaleLowerCase("en") ?? "",
          latitude?.toFixed(6) ?? "",
          longitude?.toFixed(6) ?? "",
        ].join("|"))}`;

  return {
    id,
    provider: "serpapi",
    name,
    alternateNames,
    permanentlyClosed,
    ...(address ? { address } : {}),
    ...(text(row.type) ?? text(row.category) ? { category: text(row.type) ?? text(row.category) } : {}),
    ...(safeUrl(row.website, true) ? { websiteUrl: safeUrl(row.website, true) } : {}),
    ...(text(row.phone) ? { phone: text(row.phone) } : {}),
    ...(safeUrl(row.thumbnail, false) ? { thumbnailUrl: safeUrl(row.thumbnail, false) } : {}),
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    ...(finite(row.rating, 0, 5) !== undefined ? { rating: finite(row.rating, 0, 5) } : {}),
    ...(finite(row.reviews, 0, Number.MAX_SAFE_INTEGER) !== undefined
      ? { reviews: finite(row.reviews, 0, Number.MAX_SAFE_INTEGER) }
      : {}),
    ...(text(row.price) ? { price: text(row.price) } : {}),
    ...(openState ? { openState } : {}),
    ...(placeId ? { placeId } : {}),
    ...(dataId ? { dataId } : {}),
    ...(dataCid ? { dataCid } : {}),
  };
}

function sharesIdentity(left: MerchantCandidate, right: MerchantCandidate): boolean {
  return Boolean(
    left.placeId && left.placeId === right.placeId
    || left.dataId && left.dataId === right.dataId
    || left.dataCid && left.dataCid === right.dataCid
    || left.id === right.id,
  );
}

function mergeCandidate(left: MerchantCandidate, right: MerchantCandidate): MerchantCandidate {
  const merged = { ...right, ...left };
  merged.alternateNames = [...new Set([
    ...left.alternateNames,
    ...right.alternateNames,
    ...(right.name !== left.name ? [right.name] : []),
  ])];
  return merged;
}

export function mergeMerchantCandidates(candidates: readonly MerchantCandidate[]): MerchantCandidate[] {
  const merged: MerchantCandidate[] = [];
  for (const candidate of candidates) {
    const index = merged.findIndex((current) => sharesIdentity(current, candidate));
    if (index === -1) merged.push(candidate);
    else merged[index] = mergeCandidate(merged[index], candidate);
  }
  return merged;
}
