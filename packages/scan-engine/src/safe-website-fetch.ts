import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

/**
 * SSRF-safe HTML fetch for the website checks (FAQ schema / meta description /
 * H1 count) in collect-providers.ts. The merchant-supplied `website_url` is
 * attacker-influenced input reaching this from the public scan-start API, so
 * it needs the same class of protection as lib/evidence/safe-media.ts: HTTPS
 * only, DNS-resolved and pinned to a public address, every redirect hop
 * re-resolved and re-checked (never followed blindly), a request deadline and
 * a response-size cap.
 *
 * This is a deliberately independent, sharp-free reimplementation of that
 * validation core rather than an import: packages/scan-engine must never pull
 * in `sharp` (see evidence-media-boundary.test.ts) because the whole point of
 * this package is to stay importable from a future Cloudflare Worker. Node's
 * raw DNS/socket APIs used here are themselves Node-specific; a Workers port
 * would need this file re-verified against that runtime's fetch/DNS model,
 * not assumed to work unchanged.
 */

const MAX_BYTES = 5_242_880;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const ACCEPT_HEADER = "text/html,application/xhtml+xml";

export type SafeWebsiteFetch =
  | { ok: true; html: string }
  | { ok: false; code: "WEBSITE_URL_BLOCKED" | "WEBSITE_FETCH_FAILED" | "WEBSITE_TOO_LARGE" | "WEBSITE_INVALID_CONTENT_TYPE" };

type ResolveHost = (hostname: string, signal: AbortSignal) => Promise<string[]>;
type PinnedRequester = (url: URL, address: string, signal: AbortSignal) => Promise<Response>;

export interface SafeWebsiteFetchDependencies {
  resolveHost?: ResolveHost;
  requestPinned?: PinnedRequester;
  timeoutMs?: number;
}

function normalizedHostname(url: URL): string {
  return url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
}

function parseSafeUrl(urlText: string | URL, base?: URL): URL | null {
  try {
    const url = urlText instanceof URL ? new URL(urlText) : new URL(urlText, base);
    const hostname = normalizedHostname(url).toLowerCase().replace(/\.+$/, "");
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || hostname === "" || hostname === "localhost" || hostname.endsWith(".localhost")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function ipv4ToUint(address: string): number {
  return address.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function inIpv4Subnet(value: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function isNonGlobalIpv4(address: string): boolean {
  const value = ipv4ToUint(address);
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [ipv4ToUint("0.0.0.0"), 8],
    [ipv4ToUint("10.0.0.0"), 8],
    [ipv4ToUint("100.64.0.0"), 10],
    [ipv4ToUint("127.0.0.0"), 8],
    [ipv4ToUint("169.254.0.0"), 16],
    [ipv4ToUint("172.16.0.0"), 12],
    [ipv4ToUint("192.0.0.0"), 24],
    [ipv4ToUint("192.0.2.0"), 24],
    [ipv4ToUint("192.88.99.0"), 24],
    [ipv4ToUint("192.168.0.0"), 16],
    [ipv4ToUint("198.18.0.0"), 15],
    [ipv4ToUint("198.51.100.0"), 24],
    [ipv4ToUint("203.0.113.0"), 24],
    [ipv4ToUint("224.0.0.0"), 4],
    [ipv4ToUint("240.0.0.0"), 4],
  ];
  return ranges.some(([network, prefix]) => inIpv4Subnet(value, network, prefix));
}

function parseIpv6Words(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let expanded = address.toLowerCase();
  const dottedIndex = expanded.lastIndexOf(":");
  if (expanded.includes(".")) {
    const ipv4 = expanded.slice(dottedIndex + 1);
    if (isIP(ipv4) !== 4) return null;
    const value = ipv4ToUint(ipv4);
    expanded = `${expanded.slice(0, dottedIndex)}:${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const words = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null;
}

function embeddedIpv4(words: number[], offset = 6): string {
  return [words[offset]! >>> 8, words[offset]! & 0xff, words[offset + 1]! >>> 8, words[offset + 1]! & 0xff].join(".");
}

function standardizedEmbeddedIpv4(words: number[]): { address: string; localUse: boolean } | null {
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const translated = words.slice(0, 4).every((word) => word === 0) && words[4] === 0xffff && words[5] === 0;
  const nat64 = words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0);
  const localNat64 = words[0] === 0x0064 && words[1] === 0xff9b && words[2] === 1 && words.slice(3, 6).every((word) => word === 0);
  if (mapped || compatible || translated || nat64 || localNat64) return { address: embeddedIpv4(words), localUse: localNat64 };
  if (words[0] === 0x2002) return { address: embeddedIpv4(words, 1), localUse: false };
  return null;
}

function isNonGlobalIpv6(address: string): boolean {
  const words = parseIpv6Words(address);
  if (!words) return true;
  const embedded = standardizedEmbeddedIpv4(words);
  if (embedded) return embedded.localUse || isNonGlobalIpv4(embedded.address);
  const first = words[0]!;
  const second = words[1]!;
  const allocatedGlobalUnicast = (first & 0xe000) === 0x2000;
  const ietfSpecialPurpose = first === 0x2001 && second <= 0x01ff;
  const documentation = first === 0x2001 && second === 0x0db8;
  const documentationV2 = first === 0x3fff && (second & 0xf000) === 0;
  return !allocatedGlobalUnicast || ietfSpecialPurpose || documentation || documentationV2;
}

function isNonGlobalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonGlobalIpv4(address);
  if (family === 6) return isNonGlobalIpv6(address);
  return true;
}

async function resolvePublicAddresses(url: URL, resolver: ResolveHost, signal: AbortSignal): Promise<string[] | null> {
  const hostname = normalizedHostname(url);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily === 0 ? await resolver(hostname, signal) : [hostname];
  if (addresses.length === 0 || addresses.some((address) => isNonGlobalAddress(address))) return null;
  return [...new Set(addresses)];
}

async function defaultResolver(hostname: string, signal: AbortSignal): Promise<string[]> {
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw signal.reason;
    const answers = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
    if (signal.aborted) throw signal.reason;
    const addresses = answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : []));
    if (addresses.length === 0) throw new Error("DNS resolution failed");
    return addresses;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

function responseHeaders(headers: NodeJS.Dict<string | string[]>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const item of value) result.append(name, item);
    else if (value !== undefined) result.append(name, value);
  }
  return result;
}

async function requestPinnedHttps(url: URL, address: string, signal: AbortSignal): Promise<Response> {
  const family = isIP(address) as 4 | 6;
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => callback(null, address, family);
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, { method: "GET", agent: false, headers: { accept: ACCEPT_HEADER }, family, lookup: pinnedLookup, servername: normalizedHostname(url), signal }, (incoming) => {
      const status = incoming.statusCode ?? 0;
      const hasNullBody = status === 101 || status === 204 || status === 205 || status === 304;
      const body = hasNullBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
      try {
        resolve(new Response(body, { status, statusText: incoming.statusMessage, headers: responseHeaders(incoming.headers) }));
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });
    request.once("error", reject);
    request.end();
  });
}

function redirectStatus(status: number): boolean {
  return status >= 300 && status <= 399;
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // best-effort
  }
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const [type] = contentType.split(";");
  const normalized = type?.trim().toLowerCase() ?? "";
  return normalized === "text/html" || normalized === "application/xhtml+xml";
}

async function readBoundedText(response: Response, signal: AbortSignal): Promise<string | null> {
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > MAX_BYTES) {
    await cancelResponse(response);
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

/**
 * Fetches a merchant-supplied URL for the website checks, refusing anything
 * that resolves (directly or via a redirect hop) to a private, loopback,
 * link-local, or otherwise non-global address, and rejecting non-HTML
 * responses and oversized bodies. Mirrors lib/evidence/safe-media.ts's
 * validation core; see the module comment for why it is not imported.
 */
export async function fetchWebsiteSafely(urlText: string, dependencies: SafeWebsiteFetchDependencies = {}): Promise<SafeWebsiteFetch> {
  let currentUrl = parseSafeUrl(urlText);
  if (!currentUrl) return { ok: false, code: "WEBSITE_URL_BLOCKED" };

  const requestedTimeout = dependencies.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? Math.min(requestedTimeout, REQUEST_TIMEOUT_MS) : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { signal } = controller;
  const resolver = dependencies.resolveHost ?? defaultResolver;
  const requester = dependencies.requestPinned ?? requestPinnedHttps;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let addresses: string[] | null;
      try {
        addresses = await resolvePublicAddresses(currentUrl, resolver, signal);
      } catch {
        return { ok: false, code: "WEBSITE_FETCH_FAILED" };
      }
      if (!addresses) return { ok: false, code: "WEBSITE_URL_BLOCKED" };

      let response: Response;
      try {
        response = await requester(currentUrl, addresses[0]!, signal);
      } catch {
        return { ok: false, code: "WEBSITE_FETCH_FAILED" };
      }

      if (redirectStatus(response.status)) {
        await cancelResponse(response);
        if (redirects === MAX_REDIRECTS) return { ok: false, code: "WEBSITE_FETCH_FAILED" };
        const location = response.headers.get("location");
        if (!location) return { ok: false, code: "WEBSITE_FETCH_FAILED" };
        const redirectUrl = parseSafeUrl(location, currentUrl);
        if (!redirectUrl) return { ok: false, code: "WEBSITE_URL_BLOCKED" };
        currentUrl = redirectUrl;
        continue;
      }

      if (!response.ok) {
        await cancelResponse(response);
        return { ok: false, code: "WEBSITE_FETCH_FAILED" };
      }
      if (!isHtmlContentType(response.headers.get("content-type"))) {
        await cancelResponse(response);
        return { ok: false, code: "WEBSITE_INVALID_CONTENT_TYPE" };
      }
      const html = await readBoundedText(response, signal);
      if (html === null) return { ok: false, code: "WEBSITE_TOO_LARGE" };
      return { ok: true, html };
    }
    return { ok: false, code: "WEBSITE_FETCH_FAILED" };
  } catch {
    return { ok: false, code: "WEBSITE_FETCH_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}
