import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { imageSize } from "image-size";
import sharp from "sharp";

const MAX_BYTES = 5_242_880;
const MAX_DIMENSION = 4_800;
const MAX_DECODE_PIXELS = 12_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_PENDING_DNS = 32;
const MAX_ACTIVE_DECODES = 2;
const MAX_QUEUED_DECODES = 8;
const ACCEPTED_TYPES = "image/jpeg, image/png, image/webp";
let pendingDns = 0;

type AllowedMimeType = "image/jpeg" | "image/png" | "image/webp";
type ImageDecodeForTest = (input: {
  bytes: Uint8Array;
  mimeType: AllowedMimeType;
  width: number;
  height: number;
  signal: AbortSignal;
}) => Promise<boolean>;
type ResolveHost = (hostname: string, signal: AbortSignal) => Promise<string[]>;
type PinnedRequester = (
  url: URL,
  address: string,
  signal: AbortSignal,
) => Promise<Response>;

type DecodeWaiter = {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  onAbort: () => void;
};

export type MediaDownload =
  | {
    ok: true;
    bytes: Uint8Array;
    mimeType: AllowedMimeType;
    sha256: string;
    byteSize: number;
    width: number;
    height: number;
  }
  | {
    ok: false;
    code:
      | "EVIDENCE_MEDIA_URL_BLOCKED"
      | "EVIDENCE_MEDIA_FETCH_FAILED"
      | "EVIDENCE_MEDIA_TOO_LARGE";
  }
  | {
    ok: false;
    code: "EVIDENCE_MEDIA_TYPE_BLOCKED";
    /**
     * Which validation check refused the bytes. Carried on the result — not
     * only in the log — so callers can persist it beside the stable `code`.
     */
    detail: MediaRejectionDetail;
  };

/**
 * Why a byte stream was refused. `code` stays coarse and stable because it is
 * persisted and rendered; this narrows the single opaque
 * `EVIDENCE_MEDIA_TYPE_BLOCKED` down to the check that actually failed so
 * rejections can be diagnosed from logs.
 */
export type MediaRejectionDetail =
  | "missing_content_type"
  | "sniff_failed"
  | "sniff_declared_mismatch"
  | "container_boundary"
  | "dimensions_rejected"
  | "decode_failed"
  | "decode_threw";

/**
 * Deliberately carries no URL, host, path, or query: media URLs identify the
 * merchant being scanned, and this repo keeps provider logs sanitized.
 */
export interface MediaRejectionEvent {
  code: "EVIDENCE_MEDIA_TYPE_BLOCKED";
  detail: MediaRejectionDetail;
  declaredType: AllowedMimeType | null;
  sniffedType: AllowedMimeType | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
}

export interface MediaDownloadLogger {
  warn(event: MediaRejectionEvent): void;
}

const defaultMediaLogger: MediaDownloadLogger = {
  warn: (event) => console.warn("[evidence/media] rejected", event),
};

export interface MediaDownloadDependencies {
  fetcher?: typeof fetch;
  resolveHost?: ResolveHost;
  /**
   * Observability seam for media rejections; defaults to sanitized console
   * output.
   */
  logger?: MediaDownloadLogger;
  /**
   * Lower-level injection for deterministic transport tests. Production callers
   * must leave this unset so the built-in HTTPS transport pins the connection.
   */
  requestPinned?: PinnedRequester;
  timeoutMs?: number;
  /**
   * Test-only native decoder seam; production always uses Sharp.
   */
  decodeImageForTest?: ImageDecodeForTest;
}

let activeDecodes = 0;
const decodeWaiters: DecodeWaiter[] = [];

function normalizedHostname(url: URL): string {
  return url.hostname.startsWith("[") && url.hostname.endsWith("]")
    ? url.hostname.slice(1, -1)
    : url.hostname;
}

function parseSafeUrl(urlText: string | URL, base?: URL): URL | null {
  try {
    const url = urlText instanceof URL ? new URL(urlText) : new URL(urlText, base);
    const hostname = normalizedHostname(url).toLowerCase().replace(/\.+$/, "");
    if (
      url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || hostname === ""
      || hostname === "localhost"
      || hostname.endsWith(".localhost")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function ipv4ToUint(address: string): number {
  return address.split(".").reduce(
    (value, octet) => ((value << 8) | Number(octet)) >>> 0,
    0,
  );
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

  const words = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((word) => Number.parseInt(word, 16));
  return words.length === 8 && words.every(
    (word) => Number.isInteger(word) && word >= 0 && word <= 0xffff,
  )
    ? words
    : null;
}

function embeddedIpv4(words: number[], offset = 6): string {
  return [
    words[offset]! >>> 8,
    words[offset]! & 0xff,
    words[offset + 1]! >>> 8,
    words[offset + 1]! & 0xff,
  ].join(".");
}

function standardizedEmbeddedIpv4(
  words: number[],
): { address: string; localUse: boolean } | null {
  const mapped = words.slice(0, 5).every((word) => word === 0)
    && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const translated = words.slice(0, 4).every((word) => word === 0)
    && words[4] === 0xffff
    && words[5] === 0;
  const nat64 = words[0] === 0x0064
    && words[1] === 0xff9b
    && words.slice(2, 6).every((word) => word === 0);
  const localNat64 = words[0] === 0x0064
    && words[1] === 0xff9b
    && words[2] === 1
    && words.slice(3, 6).every((word) => word === 0);
  if (mapped || compatible || translated || nat64 || localNat64) {
    return { address: embeddedIpv4(words), localUse: localNat64 };
  }
  if (words[0] === 0x2002) {
    return { address: embeddedIpv4(words, 1), localUse: false };
  }
  return null;
}

function isNonGlobalIpv6(address: string): boolean {
  const words = parseIpv6Words(address);
  if (!words) return true;

  const embedded = standardizedEmbeddedIpv4(words);
  if (embedded) {
    return embedded.localUse || isNonGlobalIpv4(embedded.address);
  }
  const first = words[0]!;
  const second = words[1]!;
  const allocatedGlobalUnicast = (first & 0xe000) === 0x2000;
  const ietfSpecialPurpose = first === 0x2001 && second <= 0x01ff;
  const documentation = first === 0x2001 && second === 0x0db8;
  const documentationV2 = first === 0x3fff && (second & 0xf000) === 0;
  return !allocatedGlobalUnicast
    || ietfSpecialPurpose
    || documentation
    || documentationV2;
}

function isNonGlobalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonGlobalIpv4(address);
  if (family === 6) return isNonGlobalIpv6(address);
  return true;
}

async function resolvePublicAddresses(
  url: URL,
  resolver: ResolveHost,
  signal: AbortSignal,
): Promise<string[] | null> {
  const hostname = normalizedHostname(url);
  const literalFamily = isIP(hostname);
  const addresses = literalFamily === 0 ? await resolver(hostname, signal) : [hostname];
  if (
    addresses.length === 0
    || addresses.some((address) => isNonGlobalAddress(address))
  ) {
    return null;
  }
  return [...new Set(addresses)];
}

function raceWithSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

function decodeRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = decodeWaiters.shift();
    if (next) {
      next.signal.removeEventListener("abort", next.onAbort);
      next.resolve(decodeRelease());
    } else {
      activeDecodes -= 1;
    }
  };
}

function acquireDecodeSlot(signal: AbortSignal): Promise<() => void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (activeDecodes < MAX_ACTIVE_DECODES) {
    activeDecodes += 1;
    return Promise.resolve(decodeRelease());
  }
  if (decodeWaiters.length >= MAX_QUEUED_DECODES) {
    return Promise.reject(new Error("Image decode concurrency limit reached"));
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter: DecodeWaiter = {
      signal,
      resolve,
      reject,
      onAbort: () => {
        const index = decodeWaiters.indexOf(waiter);
        if (index >= 0) decodeWaiters.splice(index, 1);
        reject(signal.reason);
      },
    };
    signal.addEventListener("abort", waiter.onAbort, { once: true });
    decodeWaiters.push(waiter);
  });
}

function sharpFormat(mimeType: AllowedMimeType): "jpeg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

async function defaultResolver(
  hostname: string,
  signal: AbortSignal,
): Promise<string[]> {
  if (pendingDns >= MAX_PENDING_DNS) {
    throw new Error("DNS concurrency limit reached");
  }
  pendingDns += 1;
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw signal.reason;
    const answers = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
    if (signal.aborted) throw signal.reason;
    const addresses = answers.flatMap((answer) =>
      answer.status === "fulfilled"
        ? answer.value
        : [],
    );
    if (addresses.length === 0) {
      throw new Error("DNS resolution failed");
    }
    return addresses;
  } finally {
    signal.removeEventListener("abort", cancel);
    pendingDns -= 1;
  }
}

function responseHeaders(
  headers: NodeJS.Dict<string | string[]>,
): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.append(name, value);
    }
  }
  return result;
}

async function requestPinnedHttps(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<Response> {
  const family = isIP(address) as 4 | 6;
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, address, family);
  };

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "GET",
      agent: false,
      headers: {
        accept: ACCEPTED_TYPES,
      },
      family,
      lookup: pinnedLookup,
      servername: normalizedHostname(url),
      signal,
    }, (incoming) => {
      const status = incoming.statusCode ?? 0;
      const hasNullBody = status === 101 || status === 204 || status === 205 || status === 304;
      const body = hasNullBody
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      try {
        resolve(new Response(body, {
          status,
          statusText: incoming.statusMessage,
          headers: responseHeaders(incoming.headers),
        }));
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });
    request.once("error", reject);
    request.end();
  });
}

function fetchOptions(signal: AbortSignal): RequestInit {
  return {
    method: "GET",
    headers: {
      accept: ACCEPTED_TYPES,
    },
    credentials: "omit",
    redirect: "manual",
    referrerPolicy: "no-referrer",
    signal,
  };
}

async function cancelResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const cancellation = response.body?.cancel();
    if (cancellation) {
      await (signal ? raceWithSignal(cancellation, signal) : cancellation);
    }
  } catch {
    // Cancellation is best-effort; the caller still returns a sanitized code.
  }
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  try {
    await raceWithSignal(reader.cancel(), signal);
  } catch {
    // Cancellation is best-effort and must not outlive the operation deadline.
  }
}

function redirectStatus(status: number): boolean {
  return status >= 300 && status <= 399;
}

function sniffAllowedImage(bytes: Uint8Array): AllowedMimeType | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Structural walk of a JPEG that also proves the container ends exactly at EOI.
 * Baseline (SOF0), extended sequential (SOF1) and progressive (SOF2) 8-bit
 * Huffman frames are recognised; every other frame type stays rejected.
 * Progressive is admitted because it is the default output of mozjpeg and of
 * most CDN re-encoders, and Sharp decodes it, but it legitimately breaks four
 * baseline assumptions: several scans per component, per-band spectral
 * selection, successive approximation, and EOBn AC Huffman symbols. Each
 * relaxation below is gated on the frame actually being progressive, and none
 * of them touches the boundary guarantee: the EOI arm still demands
 * `offset === bytes.length`, so no appended byte can survive.
 */
function isStructuredJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }
  const quantTables = new Set<number>();
  const huffmanTables = new Set<string>();
  const frameComponents = new Map<number, number>();
  const scannedComponents = new Set<number>();
  let offset = 2;
  let sawFrame = false;
  let progressive = false;
  let sawEobnAcSymbol = false;
  let sawScan = false;
  let restartInterval = 0;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++]!;
    if (marker === 0xd9) {
      return sawFrame && sawScan
        && (progressive || !sawEobnAcSymbol)
        && scannedComponents.size === frameComponents.size
        && offset === bytes.length;
    }
    if (
      marker === 0x00
      || marker === 0xd8
      || marker === 0x01
      || (marker >= 0xd0 && marker <= 0xd7)
    ) {
      return false;
    }
    if (offset + 2 > bytes.length) return false;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2) return false;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) return false;
    const dataStart = offset + 2;

    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      offset = segmentEnd;
      continue;
    }

    if (marker === 0xdb) {
      let cursor = dataStart;
      while (cursor < segmentEnd) {
        const tableInfo = bytes[cursor++]!;
        const precision = tableInfo >>> 4;
        const tableId = tableInfo & 0x0f;
        if (precision > 1 || tableId > 3) return false;
        const valueBytes = precision === 0 ? 1 : 2;
        if (cursor + (64 * valueBytes) > segmentEnd) return false;
        for (let index = 0; index < 64; index += 1) {
          const valueOffset = cursor + (index * valueBytes);
          const value = valueBytes === 1
            ? bytes[valueOffset]!
            : (bytes[valueOffset]! << 8) | bytes[valueOffset + 1]!;
          if (value === 0) return false;
        }
        cursor += 64 * valueBytes;
        quantTables.add(tableId);
      }
      if (cursor !== segmentEnd) return false;
      offset = segmentEnd;
      continue;
    }

    if (marker === 0xc4) {
      let cursor = dataStart;
      while (cursor < segmentEnd) {
        const tableInfo = bytes[cursor++]!;
        const tableClass = tableInfo >>> 4;
        const tableId = tableInfo & 0x0f;
        if (tableClass > 1 || tableId > 3 || cursor + 16 > segmentEnd) return false;
        let symbolCount = 0;
        let availableCodes = 1;
        for (let length = 0; length < 16; length += 1) {
          const count = bytes[cursor + length]!;
          availableCodes = (availableCodes * 2) - count;
          if (availableCodes < 0) return false;
          symbolCount += count;
        }
        cursor += 16;
        if (symbolCount === 0 || cursor + symbolCount > segmentEnd) return false;
        for (let index = 0; index < symbolCount; index += 1) {
          const symbol = bytes[cursor + index]!;
          if (tableClass === 0 && symbol > 11) return false;
          if (tableClass === 1) {
            const run = symbol >>> 4;
            const size = symbol & 0x0f;
            if (size > 10) return false;
            // EOBn (size 0, run 1..14) only exists in progressive AC scans.
            // DHT may precede SOF, so this is settled at EOI once the frame
            // type is known rather than assumed here.
            if (size === 0 && run !== 0 && run !== 15) sawEobnAcSymbol = true;
          }
        }
        cursor += symbolCount;
        huffmanTables.add(`${tableClass}:${tableId}`);
      }
      if (cursor !== segmentEnd) return false;
      offset = segmentEnd;
      continue;
    }

    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (sawFrame || segmentLength < 11 || bytes[dataStart] !== 8) return false;
      progressive = marker === 0xc2;
      const height = (bytes[dataStart + 1]! << 8) | bytes[dataStart + 2]!;
      const width = (bytes[dataStart + 3]! << 8) | bytes[dataStart + 4]!;
      const componentCount = bytes[dataStart + 5]!;
      if ((componentCount !== 1 && componentCount !== 3)
        || segmentLength !== 8 + (3 * componentCount)
        || width === 0 || height === 0
        || width > MAX_DIMENSION || height > MAX_DIMENSION) {
        return false;
      }
      let samplingUnits = 0;
      for (let index = 0; index < componentCount; index += 1) {
        const cursor = dataStart + 6 + (3 * index);
        const componentId = bytes[cursor]!;
        const sampling = bytes[cursor + 1]!;
        const horizontal = sampling >>> 4;
        const vertical = sampling & 0x0f;
        const quantTable = bytes[cursor + 2]!;
        if (frameComponents.has(componentId)
          || horizontal === 0 || horizontal > 4
          || vertical === 0 || vertical > 4
          || quantTable > 3) {
          return false;
        }
        samplingUnits += horizontal * vertical;
        frameComponents.set(componentId, quantTable);
      }
      if (samplingUnits > 10) return false;
      sawFrame = true;
      offset = segmentEnd;
      continue;
    }

    if (marker === 0xdd) {
      if (segmentLength !== 4) return false;
      restartInterval = (bytes[dataStart]! << 8) | bytes[dataStart + 1]!;
      offset = segmentEnd;
      continue;
    }

    if (marker !== 0xda || !sawFrame) return false;
    const scanComponentCount = bytes[dataStart]!;
    if (scanComponentCount === 0
      || scanComponentCount > frameComponents.size
      || segmentLength !== 6 + (2 * scanComponentCount)) {
      return false;
    }
    const spectralStart = bytes[segmentEnd - 3]!;
    const spectralEnd = bytes[segmentEnd - 2]!;
    const approximation = bytes[segmentEnd - 1]!;
    const approximationHigh = approximation >>> 4;
    const approximationLow = approximation & 0x0f;
    if (progressive) {
      // A progressive scan codes exactly one band: DC (0..0, any component
      // count) or a single-component AC range, optionally as a successive
      // approximation refinement of the band already sent.
      if (spectralEnd > 63
        || spectralStart > spectralEnd
        || (spectralStart === 0 && spectralEnd !== 0)
        || (spectralStart !== 0 && scanComponentCount !== 1)
        || approximationHigh > 13
        || approximationLow > 13
        || (approximationHigh !== 0 && approximationHigh !== approximationLow + 1)) {
        return false;
      }
    } else if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0) {
      return false;
    }
    // DC refinement scans code raw bits and reference no Huffman table; every
    // other scan must still name a table that was actually defined.
    const usesDcTable = !progressive
      || (spectralStart === 0 && approximationHigh === 0);
    const usesAcTable = !progressive || spectralEnd !== 0;

    const scanComponents: number[] = [];
    for (let index = 0; index < scanComponentCount; index += 1) {
      const cursor = dataStart + 1 + (2 * index);
      const componentId = bytes[cursor]!;
      const tableSelectors = bytes[cursor + 1]!;
      const dcTable = tableSelectors >>> 4;
      const acTable = tableSelectors & 0x0f;
      const quantTable = frameComponents.get(componentId);
      if (quantTable === undefined
        // Sequential frames send each component once; progressive revisits a
        // component in every band it refines.
        || (!progressive && scannedComponents.has(componentId))
        || scanComponents.includes(componentId)
        || !quantTables.has(quantTable)
        || (usesDcTable && !huffmanTables.has(`0:${dcTable}`))
        || (usesAcTable && !huffmanTables.has(`1:${acTable}`))) {
        return false;
      }
      scanComponents.push(componentId);
    }

    offset = segmentEnd;
    let foundMarker = false;
    let entropyBytes = 0;
    let expectedRestart = 0;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      const markerStart = offset;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) return false;
      const entropyMarker = bytes[offset]!;
      if (entropyMarker === 0x00) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      if (entropyMarker >= 0xd0 && entropyMarker <= 0xd7) {
        if (restartInterval === 0 || entropyMarker !== 0xd0 + expectedRestart) return false;
        expectedRestart = (expectedRestart + 1) % 8;
        offset += 1;
        continue;
      }
      offset = markerStart;
      foundMarker = true;
      break;
    }
    if (!foundMarker || entropyBytes === 0) return false;
    for (const componentId of scanComponents) scannedComponents.add(componentId);
    sawScan = true;
  }
  return false;
}

function isStructuredWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return false;
  let offset = 12;
  let frame: { type: "VP8" | "VP8L"; width: number; height: number; alpha: boolean } | null = null;
  let extended: { width: number; height: number; flags: number } | null = null;
  let sawAlphaChunk = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const chunkLength = view.getUint32(offset + 4, true);
    const paddedLength = chunkLength + (chunkLength & 1);
    const nextOffset = offset + 8 + paddedLength;
    if (nextOffset > bytes.length) return false;
    if ((chunkLength & 1) === 1 && bytes[nextOffset - 1] !== 0) return false;
    const payload = offset + 8;

    if (type === "ANIM" || type === "ANMF") return false;
    if (type === "VP8X") {
      if (extended || offset !== 12 || chunkLength !== 10) return false;
      const flags = bytes[payload]!;
      if ((flags & 0xc3) !== 0 || bytes[payload + 1] !== 0
        || bytes[payload + 2] !== 0 || bytes[payload + 3] !== 0) {
        return false;
      }
      const width = bytes[payload + 4]!
        | (bytes[payload + 5]! << 8)
        | (bytes[payload + 6]! << 16);
      const height = bytes[payload + 7]!
        | (bytes[payload + 8]! << 8)
        | (bytes[payload + 9]! << 16);
      extended = { width: width + 1, height: height + 1, flags };
      if (extended.width > MAX_DIMENSION || extended.height > MAX_DIMENSION) return false;
    } else if (type === "ALPH") {
      if (sawAlphaChunk || frame || chunkLength < 1) return false;
      sawAlphaChunk = true;
    } else if (type === "VP8 ") {
      if (frame || chunkLength < 10) return false;
      const frameTag = bytes[payload]!
        | (bytes[payload + 1]! << 8)
        | (bytes[payload + 2]! << 16);
      const partitionLength = frameTag >>> 5;
      if ((frameTag & 1) !== 0 || partitionLength === 0
        || partitionLength + 10 > chunkLength
        || bytes[payload + 3] !== 0x9d
        || bytes[payload + 4] !== 0x01
        || bytes[payload + 5] !== 0x2a) {
        return false;
      }
      const width = view.getUint16(payload + 6, true) & 0x3fff;
      const height = view.getUint16(payload + 8, true) & 0x3fff;
      if (width === 0 || height === 0
        || width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
      frame = { type: "VP8", width, height, alpha: sawAlphaChunk };
    } else if (type === "VP8L") {
      if (frame || sawAlphaChunk || chunkLength < 6 || bytes[payload] !== 0x2f) return false;
      const bits = view.getUint32(payload + 1, true);
      if ((bits >>> 29) !== 0) return false;
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >>> 14) & 0x3fff) + 1;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
      frame = { type: "VP8L", width, height, alpha: (bits & 0x10000000) !== 0 };
    }
    offset = nextOffset;
  }
  if (offset !== bytes.length || !frame) return false;
  if (!extended) return true;
  const declaredAlpha = (extended.flags & 0x10) !== 0;
  return (extended.flags & 0x02) === 0
    && extended.width === frame.width
    && extended.height === frame.height
    && declaredAlpha === frame.alpha;
}

function hasExactContainerBoundary(
  bytes: Uint8Array,
  mimeType: AllowedMimeType,
): boolean {
  if (mimeType === "image/jpeg") {
    return isStructuredJpeg(bytes);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === "image/webp") {
    return isStructuredWebp(bytes);
  }

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset);
    const nextOffset = offset + 12 + chunkLength;
    if (nextOffset > bytes.length) return false;
    const isIend = bytes[offset + 4] === 0x49
      && bytes[offset + 5] === 0x45
      && bytes[offset + 6] === 0x4e
      && bytes[offset + 7] === 0x44;
    if (isIend) {
      return chunkLength === 0 && nextOffset === bytes.length;
    }
    offset = nextOffset;
  }
  return false;
}

type DecodeOperation = {
  promise: Promise<boolean>;
  requestStop?: () => void;
};

function startSharpDecode(
  bytes: Uint8Array,
  mimeType: AllowedMimeType,
  width: number,
  height: number,
): DecodeOperation {
  const decoder = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: MAX_DECODE_PIXELS,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  });
  const promise = (async () => {
    try {
      const metadata = await decoder.metadata();
      if (metadata.format !== sharpFormat(mimeType)
        || metadata.width !== width
        || metadata.height !== height
        || (metadata.pages ?? 1) !== 1) {
        return false;
      }
      await decoder.stats();
      return true;
    } catch {
      return false;
    } finally {
      if (!decoder.destroyed) decoder.destroy();
    }
  })();
  return {
    promise,
    requestStop: () => {
      if (!decoder.destroyed) decoder.destroy();
    },
  };
}

async function isFullyDecodableImage(
  bytes: Uint8Array,
  mimeType: AllowedMimeType,
  width: number,
  height: number,
  signal: AbortSignal,
  decodeImageForTest?: ImageDecodeForTest,
): Promise<boolean> {
  let release: () => void;
  try {
    release = await acquireDecodeSlot(signal);
  } catch {
    return false;
  }

  let operation: DecodeOperation;
  try {
    operation = decodeImageForTest
      ? {
        promise: Promise.resolve().then(
          () => decodeImageForTest({ bytes, mimeType, width, height, signal }),
        ),
      }
      : startSharpDecode(bytes, mimeType, width, height);
  } catch {
    release();
    return false;
  }

  const settled = operation.promise.then(
    (decoded) => {
      release();
      return decoded;
    },
    () => {
      release();
      return false;
    },
  );
  const requestStop = () => operation.requestStop?.();
  signal.addEventListener("abort", requestStop, { once: true });
  if (signal.aborted) requestStop();
  try {
    return await raceWithSignal(settled, signal);
  } finally {
    signal.removeEventListener("abort", requestStop);
  }
}

function declaredMimeType(response: Response): AllowedMimeType | null {
  const contentType = response.headers.get("content-type");
  if (!contentType) return null;
  const normalized = contentType.split(";", 1)[0]!.trim().toLowerCase();
  return normalized === "image/jpeg"
    || normalized === "image/png"
    || normalized === "image/webp"
    ? normalized
    : null;
}

async function readBoundedBody(
  response: Response,
  signal: AbortSignal,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; tooLarge: boolean }
> {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    if (!/^\d+$/.test(rawLength)) {
      await cancelResponse(response, signal);
      return { ok: false, tooLarge: false };
    }
    const declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength)) {
      await cancelResponse(response, signal);
      return { ok: false, tooLarge: true };
    }
    if (declaredLength > MAX_BYTES) {
      await cancelResponse(response, signal);
      return { ok: false, tooLarge: true };
    }
  }

  if (!response.body) return { ok: false, tooLarge: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await raceWithSignal(reader.read(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await cancelReader(reader, signal);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    await cancelReader(reader, signal);
    return { ok: false, tooLarge: false };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * Records why validation refused the bytes and returns the stable public code
 * alongside the discriminator. The `code` value is intentionally unchanged: it
 * is persisted as `report_evidence.limitation_code` and mapped to merchant
 * copy by the report UI, so `detail` rides beside it rather than narrowing it.
 * `detail` never carries the URL, host, or path of the rejected media.
 */
function typeBlocked(
  logger: MediaDownloadLogger,
  event: Omit<MediaRejectionEvent, "code">,
): MediaDownload {
  logger.warn({ code: "EVIDENCE_MEDIA_TYPE_BLOCKED", ...event });
  return {
    ok: false,
    code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
    detail: event.detail,
  };
}

async function validateImageResponse(
  response: Response,
  signal: AbortSignal,
  logger: MediaDownloadLogger,
  decodeImageForTest?: ImageDecodeForTest,
): Promise<MediaDownload> {
  const declaredType = declaredMimeType(response);
  if (!declaredType) {
    await cancelResponse(response, signal);
    return typeBlocked(logger, {
      detail: "missing_content_type",
      declaredType: null,
      sniffedType: null,
      byteSize: null,
      width: null,
      height: null,
    });
  }

  const body = await readBoundedBody(response, signal);
  if (!body.ok) {
    return {
      ok: false,
      code: body.tooLarge
        ? "EVIDENCE_MEDIA_TOO_LARGE"
        : "EVIDENCE_MEDIA_FETCH_FAILED",
    };
  }

  const sniffedType = sniffAllowedImage(body.bytes);
  const byteSize = body.bytes.byteLength;
  const rejection = { declaredType, sniffedType, byteSize, width: null, height: null };
  if (sniffedType === null) {
    return typeBlocked(logger, { ...rejection, detail: "sniff_failed" });
  }
  if (sniffedType !== declaredType) {
    return typeBlocked(logger, { ...rejection, detail: "sniff_declared_mismatch" });
  }
  if (!hasExactContainerBoundary(body.bytes, sniffedType)) {
    return typeBlocked(logger, { ...rejection, detail: "container_boundary" });
  }

  let measuredWidth: number | null = null;
  let measuredHeight: number | null = null;
  try {
    const dimensions = imageSize(body.bytes);
    const width = dimensions.width;
    const height = dimensions.height;
    measuredWidth = width;
    measuredHeight = height;
    if (
      !Number.isInteger(width)
      || !Number.isInteger(height)
      || width < 1
      || height < 1
      || width > MAX_DIMENSION
      || height > MAX_DIMENSION
      || width * height > MAX_DECODE_PIXELS
    ) {
      return typeBlocked(logger, {
        ...rejection,
        detail: "dimensions_rejected",
        width,
        height,
      });
    }
    if (!await isFullyDecodableImage(
      body.bytes, sniffedType, width, height, signal, decodeImageForTest,
    )) {
      return typeBlocked(logger, {
        ...rejection,
        detail: "decode_failed",
        width,
        height,
      });
    }
    return {
      ok: true,
      bytes: body.bytes,
      mimeType: sniffedType,
      sha256: createHash("sha256").update(body.bytes).digest("hex"),
      byteSize: body.bytes.byteLength,
      width,
      height,
    };
  } catch {
    return typeBlocked(logger, {
      ...rejection,
      detail: "decode_threw",
      width: measuredWidth,
      height: measuredHeight,
    });
  }
}

export async function downloadEvidenceMedia(
  urlText: string,
  dependencies: MediaDownloadDependencies = {},
): Promise<MediaDownload> {
  let currentUrl = parseSafeUrl(urlText);
  if (!currentUrl) {
    return { ok: false, code: "EVIDENCE_MEDIA_URL_BLOCKED" };
  }

  const requestedTimeout = dependencies.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, REQUEST_TIMEOUT_MS)
    : REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { signal } = controller;
  const decodeImageForTest = process.env.NODE_ENV === "test"
    ? dependencies.decodeImageForTest
    : undefined;
  const logger = dependencies.logger ?? defaultMediaLogger;
  try {
    const resolver = dependencies.resolveHost ?? defaultResolver;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let addresses: string[] | null;
      try {
        addresses = await raceWithSignal(
          resolvePublicAddresses(currentUrl, resolver, signal),
          signal,
        );
      } catch {
        return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
      }
      if (!addresses) {
        return { ok: false, code: "EVIDENCE_MEDIA_URL_BLOCKED" };
      }

      let response: Response;
      try {
        response = await raceWithSignal(
          dependencies.fetcher
            ? dependencies.fetcher(currentUrl, fetchOptions(signal))
            : (dependencies.requestPinned ?? requestPinnedHttps)(
              currentUrl,
              addresses[0]!,
              signal,
            ),
          signal,
        );
      } catch {
        return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
      }

      if (redirectStatus(response.status)) {
        await cancelResponse(response, signal);
        if (redirects === MAX_REDIRECTS) {
          return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
        }
        const location = response.headers.get("location");
        if (!location) {
          return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
        }
        const redirectUrl = parseSafeUrl(location, currentUrl);
        if (!redirectUrl) {
          return { ok: false, code: "EVIDENCE_MEDIA_URL_BLOCKED" };
        }
        currentUrl = redirectUrl;
        continue;
      }

      if (!response.ok) {
        await cancelResponse(response, signal);
        return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
      }
      try {
        return await raceWithSignal(
          validateImageResponse(response, signal, logger, decodeImageForTest),
          signal,
        );
      } catch {
        return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
      }
    }

    return { ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}
