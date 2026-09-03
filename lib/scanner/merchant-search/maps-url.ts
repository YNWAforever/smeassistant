import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ParsedGoogleMapsMerchant } from "./types";

export type GoogleMapsUrlResult =
  | { ok: true; value: ParsedGoogleMapsMerchant }
  | { ok: false; error: "INVALID_MAPS_URL" };

interface AddressRecord {
  address: string;
  family: number;
}

interface RedirectResponse {
  status: number;
  headers: Pick<Headers, "get">;
}

export interface GoogleMapsResolverDependencies {
  fetcher?: (url: string, init: RequestInit) => Promise<RedirectResponse>;
  lookup?: (hostname: string, options: { all: true; verbatim: true }) => Promise<readonly AddressRecord[]>;
  maxRedirects?: number;
  timeoutMs?: number;
}

const INVALID: GoogleMapsUrlResult = { ok: false, error: "INVALID_MAPS_URL" };
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

function isGoogleOwnedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (SHORT_HOSTS.has(host)) return true;
  return /^(?:[a-z0-9-]+\.)*google\.(?:com|com\.hk|com\.tw)$/.test(host);
}

function safeDecoded(value: string): string | undefined {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim() || undefined;
  } catch {
    return undefined;
  }
}

function finiteNumber(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

export function parseGoogleMapsUrl(input: string): GoogleMapsUrlResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return INVALID;
  }
  const host = normalizedHostname(url);
  if (url.protocol !== "https:" || !isGoogleOwnedHost(host) || SHORT_HOSTS.has(host)) return INVALID;
  if (!url.pathname.toLowerCase().includes("/maps")) return INVALID;

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
  const coordinateMatch = `${url.pathname}${url.search}${url.hash}`.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z/i,
  );
  const latitude = finiteNumber(coordinateMatch?.[1]);
  const longitude = finiteNumber(coordinateMatch?.[2]);
  const zoom = finiteNumber(coordinateMatch?.[3]);
  if (
    latitude !== undefined && (latitude < -90 || latitude > 90)
    || longitude !== undefined && (longitude < -180 || longitude > 180)
    || zoom !== undefined && (zoom <= 0 || zoom > 30)
  ) return INVALID;

  const serialized = `${url.pathname}${url.search}${url.hash}`;
  const dataSegment = serialized.match(/!1s([^!]+)/i)?.[1];
  const placeId = url.searchParams.get("place_id")
    ?? url.searchParams.get("query_place_id")
    ?? serialized.match(/!1s(ChI[^!]+)/)?.[1]
    ?? undefined;
  const dataId = url.searchParams.get("data_id")
    ?? (dataSegment?.startsWith("0x") ? dataSegment : undefined)
    ?? undefined;
  const dataCid = url.searchParams.get("data_cid") ?? url.searchParams.get("cid") ?? undefined;
  const name = placeMatch ? safeDecoded(placeMatch[1]) : undefined;

  if (!name && latitude === undefined && !placeId && !dataId && !dataCid) return INVALID;
  return {
    ok: true,
    value: {
      ...(name ? { name } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(zoom !== undefined ? { zoom } : {}),
      ...(placeId ? { placeId } : {}),
      ...(dataId ? { dataId } : {}),
      ...(dataCid ? { dataCid } : {}),
      resolvedUrl: url.toString(),
    },
  };
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];
  if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd")) return false;
  if (/^fe[89ab]/.test(value) || value.startsWith("ff")) return false;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPublicIpv4(mapped) : true;
}

export function isPublicDestinationAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

async function destinationIsPublic(
  url: URL,
  lookup: NonNullable<GoogleMapsResolverDependencies["lookup"]>,
): Promise<boolean> {
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = normalizedHostname(url);
  if (!isGoogleOwnedHost(host)) return false;
  const directFamily = isIP(host);
  if (directFamily) return isPublicDestinationAddress(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((record) => isPublicDestinationAddress(record.address));
  } catch {
    return false;
  }
}

export async function resolveGoogleMapsUrl(
  input: string,
  dependencies: GoogleMapsResolverDependencies = {},
): Promise<GoogleMapsUrlResult> {
  let current: URL;
  try {
    current = new URL(input);
  } catch {
    return INVALID;
  }

  const initialHost = normalizedHostname(current);
  if (current.protocol !== "https:" || !isGoogleOwnedHost(initialHost)) return INVALID;
  if (!SHORT_HOSTS.has(initialHost)) return parseGoogleMapsUrl(current.toString());

  const fetcher = dependencies.fetcher ?? (async (url, init) => fetch(url, init));
  const lookup = dependencies.lookup ?? (dnsLookup as NonNullable<GoogleMapsResolverDependencies["lookup"]>);
  const maxRedirects = dependencies.maxRedirects ?? 4;
  const timeoutMs = dependencies.timeoutMs ?? 8_000;
  let redirects = 0;

  while (true) {
    if (!(await destinationIsPublic(current, lookup))) return INVALID;
    let response: RedirectResponse;
    try {
      response = await fetcher(current.toString(), {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "SME-Scanner-Maps-Resolver/1.0" },
      });
    } catch {
      return INVALID;
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects >= maxRedirects) return INVALID;
      const location = response.headers.get("location");
      if (!location) return INVALID;
      try {
        current = new URL(location, current);
      } catch {
        return INVALID;
      }
      if (current.protocol !== "https:" || !isGoogleOwnedHost(normalizedHostname(current))) return INVALID;
      redirects += 1;
      continue;
    }

    if (response.status < 200 || response.status >= 300) return INVALID;
    return parseGoogleMapsUrl(current.toString());
  }
}
