import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  downloadEvidenceMedia,
  type MediaDownloadLogger,
  type MediaRejectionDetail,
  type MediaRejectionEvent,
} from "./safe-media";

const MAX_BYTES = 5_242_880;
const PUBLIC_ADDRESS = "93.184.216.34";
const publicResolver = vi.fn(async () => [PUBLIC_ADDRESS]);
const onePixelPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const onePixelJpeg = Uint8Array.from(Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYU"
  + "GBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAED"
  + "ASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKB"
  + "kaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZ"
  + "mqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF"
  + "BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5"
  + "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX"
  + "2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==",
  "base64",
));
const onePixelWebp = Uint8Array.from(Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v02aAA=",
  "base64",
));
const onePixelAlphaWebp = Uint8Array.from(Buffer.from(
  "UklGRlgAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAgFZQOCAwAAAA0AEAnQEqAQABAAFAJiWgAnS6AfgAA7AA/vLrf/zYFc1z7/f/0uD9Lg/S4P/SkAAA",
  "base64",
));
const onePixelLosslessWebp = Uint8Array.from(Buffer.from(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
  "base64",
));
const headerOnlyJpeg = Uint8Array.from(Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffc00011080001000103011100021100031100ffda000c03010002000300003f00ffd9",
  "hex",
));
const emptyAnimatedWebp = Uint8Array.from(Buffer.from(
  "524946461e00000057454250565038580a00000002000000000000000000414e4d4600000000",
  "hex",
));

function findWebpChunk(bytes: Uint8Array, expectedType: string): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (type === expectedType) return offset;
    const length = view.getUint32(offset + 4, true);
    offset += 8 + length + (length & 1);
  }
  throw new Error(`Missing ${expectedType} test chunk`);
}

function truncateWebpFrame(
  bytes: Uint8Array,
  frameType: "VP8 " | "VP8L",
  payloadLength: number,
): Uint8Array<ArrayBuffer> {
  const chunkOffset = findWebpChunk(bytes, frameType);
  const length = chunkOffset + 8 + payloadLength + (payloadLength & 1);
  const truncated = new Uint8Array(length);
  truncated.set(bytes.subarray(0, chunkOffset + 8 + payloadLength));
  const view = new DataView(truncated.buffer);
  view.setUint32(4, length - 8, true);
  view.setUint32(chunkOffset + 4, payloadLength, true);
  return truncated;
}

function jpegWithInsufficientEntropy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  let offset = 2;
  let frameDataStart = -1;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    const segmentEnd = offset + segmentLength;
    if (marker === 0xc0) frameDataStart = offset + 2;
    if (marker === 0xda) {
      if (frameDataStart < 0) throw new Error("Missing SOF0 test marker");
      const truncated = new Uint8Array(segmentEnd + 4);
      truncated.set(bytes.subarray(0, segmentEnd));
      truncated.set([0xff, 0x00, 0xff, 0xd9], segmentEnd);
      const view = new DataView(truncated.buffer);
      view.setUint16(frameDataStart + 1, 64);
      view.setUint16(frameDataStart + 3, 64);
      return truncated;
    }
    offset = segmentEnd;
  }
  throw new Error("Missing SOS test marker");
}

function pngResponse(headers: Record<string, string> = {}): Response {
  return new Response(onePixelPng, {
    status: 200,
    headers: { "content-type": "image/png", ...headers },
  });
}

function pngWithDimensions(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(onePixelPng);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(16, width);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(20, height);
  return bytes;
}

function streamingResponse(
  chunks: Uint8Array[],
  headers: Record<string, string>,
  onCancel: () => void,
): Response {
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      onCancel();
    },
  }), { status: 200, headers });
}

async function guardedOutcome<T>(promise: Promise<T>): Promise<T | "TEST_HUNG"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<"TEST_HUNG">((resolve) => {
    timer = setTimeout(() => resolve("TEST_HUNG"), 200);
  });
  try {
    return await Promise.race([promise, hung]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("downloadEvidenceMedia URL and address validation", () => {
  it("accepts only credential-free HTTPS URLs", async () => {
    const blocked = [
      "http://images.example/a.jpg",
      "ftp://images.example/a.jpg",
      "file:///etc/passwd",
      "https://user:pass@images.example/a.jpg",
      "not a URL",
    ];

    for (const url of blocked) {
      await expect(downloadEvidenceMedia(url)).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_URL_BLOCKED",
      });
    }
  });

  it("blocks localhost and every non-global IPv4 range", async () => {
    const blockedHosts = [
      "localhost",
      "localhost.",
      "api.localhost",
      "0.0.0.1",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.0.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ];

    for (const hostname of blockedHosts) {
      await expect(downloadEvidenceMedia(`https://${hostname}/a.jpg`, {
        resolveHost: publicResolver,
        fetcher: vi.fn(),
      }), hostname).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_URL_BLOCKED",
      });
    }
  });

  it("blocks IPv6 loopback, ULA, link-local, multicast, documentation, and private mapped or compatible addresses", async () => {
    const blockedAddresses = [
      "::",
      "::1",
      "fc00::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::127.0.0.1",
      "::10.0.0.1",
    ];

    for (const address of blockedAddresses) {
      await expect(downloadEvidenceMedia(`https://[${address}]/a.jpg`, {
        resolveHost: publicResolver,
        fetcher: vi.fn(),
      }), address).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_URL_BLOCKED",
      });
    }
  });

  it("blocks private standardized IPv4 embeddings and current non-global IPv6 allocations", async () => {
    const blockedAddresses = [
      "::ffff:0:10.0.0.1",
      "64:ff9b::10.0.0.1",
      "64:ff9b:1::10.0.0.1",
      "64:ff9b:1::93.184.216.34",
      "2002:0a00:0001::",
      "3fff::1",
      "3fff:0:0:1::1",
      "5f00::1",
    ];

    for (const address of blockedAddresses) {
      await expect(downloadEvidenceMedia(`https://[${address}]/a.png`, {
        fetcher: vi.fn(async () => pngResponse()),
      }), address).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_URL_BLOCKED",
      });
    }
  });

  it("permits public standardized IPv4 embeddings and ordinary global IPv6", async () => {
    const allowedAddresses = [
      "::ffff:93.184.216.34",
      "::93.184.216.34",
      "::ffff:0:93.184.216.34",
      "64:ff9b::93.184.216.34",
      "2002:5db8:d822::",
      "2001:4860:4860::8888",
      "2606:4700:4700::1111",
    ];

    for (const address of allowedAddresses) {
      await expect(downloadEvidenceMedia(`https://[${address}]/a.png`, {
        fetcher: vi.fn(async () => pngResponse()),
      }), address).resolves.toMatchObject({
        ok: true,
        mimeType: "image/png",
      });
    }
  });

  it("fails closed for empty DNS answers and answers containing any private address", async () => {
    const fetcher = vi.fn(async () => pngResponse());

    await expect(downloadEvidenceMedia("https://images.example/a.png", {
      resolveHost: async () => [],
      fetcher,
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_URL_BLOCKED" });

    await expect(downloadEvidenceMedia("https://images.example/a.png", {
      resolveHost: async () => [PUBLIC_ADDRESS, "10.0.0.4"],
      fetcher,
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_URL_BLOCKED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sanitizes DNS failures without exposing the URL or resolver error", async () => {
    await expect(downloadEvidenceMedia("https://secret.example/private-name.png", {
      resolveHost: async () => {
        throw new Error("resolver leaked secret.example");
      },
      fetcher: vi.fn(),
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" });
  });
});

describe("downloadEvidenceMedia transport and redirects", () => {
  it("pins the production request to an address from the validated DNS answer", async () => {
    const requestPinned = vi.fn(async () => pngResponse());
    const resolveHost = vi.fn(async () => [PUBLIC_ADDRESS]);

    await expect(downloadEvidenceMedia("https://images.example/a.png", {
      resolveHost,
      requestPinned,
    })).resolves.toMatchObject({ ok: true });

    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(requestPinned).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "images.example" }),
      PUBLIC_ADDRESS,
      expect.any(AbortSignal),
    );
  });

  it("uses an injected fetcher only after DNS validation and forces manual redirects", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(String(input));
      expect(init?.redirect).toBe("manual");
      const headers = new Headers(init?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      return pngResponse();
    });

    await expect(downloadEvidenceMedia("https://images.example/a.png", {
      resolveHost: async (hostname) => {
        expect(calls).toHaveLength(0);
        expect(hostname).toBe("images.example");
        return [PUBLIC_ADDRESS];
      },
      fetcher,
    })).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-parses and revalidates DNS for every redirect", async () => {
    const resolveHost = vi.fn(async () => [PUBLIC_ADDRESS]);
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.hostname === "images.example"
        ? new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/final.png" },
        })
        : pngResponse();
    });

    await expect(downloadEvidenceMedia("https://images.example/start", {
      resolveHost,
      fetcher,
    })).resolves.toMatchObject({ ok: true, mimeType: "image/png" });
    expect(resolveHost).toHaveBeenNthCalledWith(1, "images.example", expect.any(AbortSignal));
    expect(resolveHost).toHaveBeenNthCalledWith(2, "cdn.example", expect.any(AbortSignal));
  });

  it("blocks private or credential-bearing redirect targets before another request", async () => {
    for (const location of [
      "https://127.0.0.1/private.png",
      "https://user:pass@cdn.example/private.png",
      "http://cdn.example/private.png",
    ]) {
      const fetcher = vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location },
      }));

      await expect(downloadEvidenceMedia("https://images.example/start", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher,
      }), location).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_URL_BLOCKED",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("caps redirect hops and blocks redirects without a valid Location", async () => {
    const redirectingFetcher = vi.fn(async (input: URL | RequestInfo) => {
      const current = new URL(String(input));
      const hop = Number(current.searchParams.get("hop") ?? "0");
      return new Response(null, {
        status: 302,
        headers: { location: `/again?hop=${hop + 1}` },
      });
    });

    await expect(downloadEvidenceMedia("https://images.example/start", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: redirectingFetcher,
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" });
    expect(redirectingFetcher.mock.calls.length).toBeLessThanOrEqual(4);

    await expect(downloadEvidenceMedia("https://images.example/start", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(null, { status: 302 })),
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" });
  });

  it("bounds a resolver that never settles with the operation deadline", async () => {
    const outcome = await guardedOutcome(downloadEvidenceMedia("https://images.example/a.png", {
      timeoutMs: 20,
      resolveHost: async () => new Promise<string[]>(() => undefined),
      fetcher: vi.fn(async () => pngResponse()),
    }));

    expect(outcome).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
  });

  it("uses one deadline across DNS and every redirect hop", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return fetcher.mock.calls.length <= 2
        ? new Response(null, {
          status: 302,
          headers: { location: `/hop-${fetcher.mock.calls.length}` },
        })
        : pngResponse();
    });

    await expect(downloadEvidenceMedia("https://images.example/start", {
      timeoutMs: 30,
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher,
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("sanitizes a deadline reached during a stalled response body", async () => {
    const onCancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      pull() {},
      cancel() {
        onCancel();
      },
    }), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
    const outcome = await guardedOutcome(downloadEvidenceMedia("https://images.example/a.png", {
      timeoutMs: 20,
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => response),
    }));
    expect(outcome).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
    expect(onCancel).toHaveBeenCalledOnce();
  }, 500);

  it("bounds redirect body cancellation with the same deadline", async () => {
    const onCancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        onCancel();
        return new Promise<void>(() => undefined);
      },
    }), {
      status: 302,
      headers: { location: "https://cdn.example/final.png" },
    });
    const outcome = await guardedOutcome(downloadEvidenceMedia("https://images.example/start", {
      timeoutMs: 20,
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => response),
    }));
    expect(outcome).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
    expect(onCancel).toHaveBeenCalledOnce();
  }, 500);

  it("sanitizes timeouts and transport errors and does not log URLs or errors", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];

    try {
      await expect(downloadEvidenceMedia("https://secret.example/private.png", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher: vi.fn(async () => {
          throw new Error("transport leaked secret.example/private.png");
        }),
      })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_FETCH_FAILED" });
      expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("downloadEvidenceMedia decoder resource bounds", () => {
  const request = (
    label: string,
    decodeImageForTest: () => Promise<boolean>,
    timeoutMs = 1_000,
  ) => downloadEvidenceMedia(`https://${label}.example/valid.png`, {
    resolveHost: async () => [PUBLIC_ADDRESS],
    fetcher: vi.fn(async () => pngResponse()),
    decodeImageForTest,
    timeoutMs,
  });

  it("allows at most two active decodes and queues the third", async () => {
    const gates = {
      a: deferred<boolean>(),
      b: deferred<boolean>(),
      c: deferred<boolean>(),
    };
    const starts: string[] = [];
    let active = 0;
    let maxActive = 0;
    const decoderFor = (label: keyof typeof gates) => async () => {
      starts.push(label);
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await gates[label].promise;
      } finally {
        active -= 1;
      }
    };

    const outcomes = [
      request("active-a", decoderFor("a")),
      request("active-b", decoderFor("b")),
      request("queued-c", decoderFor("c")),
    ];

    await vi.waitFor(() => expect(starts).toEqual(["a", "b"]));
    expect(maxActive).toBe(2);

    gates.a.resolve(true);
    await vi.waitFor(() => expect(starts).toEqual(["a", "b", "c"]));
    gates.b.resolve(true);
    gates.c.resolve(true);

    const results = await Promise.all(outcomes);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("holds an aborted active lease until native settlement then hands off FIFO", async () => {
    const gates = {
      a: deferred<boolean>(),
      b: deferred<boolean>(),
      c: deferred<boolean>(),
      d: deferred<boolean>(),
    };
    const starts: string[] = [];
    const decoderFor = (label: keyof typeof gates) => async () => {
      starts.push(label);
      return gates[label].promise;
    };

    const a = request("timeout-a", decoderFor("a"), 200);
    const b = request("active-b", decoderFor("b"));
    const c = request("queued-c", decoderFor("c"));
    const d = request("queued-d", decoderFor("d"));

    await vi.waitFor(() => expect(starts).toEqual(["a", "b"]));
    await expect(a).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
    await nextTurn();
    expect(starts).toEqual(["a", "b"]);

    gates.a.reject(new Error("late native decode failure"));
    await vi.waitFor(() => expect(starts).toEqual(["a", "b", "c"]));
    gates.b.resolve(true);
    await vi.waitFor(() => expect(starts).toEqual(["a", "b", "c", "d"]));
    gates.c.resolve(true);
    gates.d.resolve(true);

    const remaining = await Promise.all([b, c, d]);
    expect(remaining.every((result) => result.ok)).toBe(true);
  });

  it("caps the queue at eight and removes an aborted queued waiter", async () => {
    const activeA = deferred<boolean>();
    const activeB = deferred<boolean>();
    const starts: string[] = [];
    const active = [
      request("active-a", async () => {
        starts.push("active-a");
        return activeA.promise;
      }),
      request("active-b", async () => {
        starts.push("active-b");
        return activeB.promise;
      }),
    ];
    await vi.waitFor(() => expect(starts).toEqual(["active-a", "active-b"]));

    const queuedDecoders = Array.from({ length: 8 }, (_, index) => vi.fn(async () => {
      starts.push(`queued-${index}`);
      return true;
    }));
    const queued: Array<Promise<Awaited<ReturnType<typeof downloadEvidenceMedia>>>> = [];
    for (let index = 0; index < queuedDecoders.length; index += 1) {
      queued.push(request(
        `queued-${index}`,
        queuedDecoders[index]!,
        index === 0 ? 150 : 1_000,
      ));
      await nextTurn();
    }
    expect(starts).toEqual(["active-a", "active-b"]);

    const overflowDecoder = vi.fn(async () => true);
    await expect(guardedOutcome(request(
      "overflow",
      overflowDecoder,
    ))).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
    });
    expect(overflowDecoder).not.toHaveBeenCalled();

    await expect(queued[0]).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_FETCH_FAILED",
    });
    expect(queuedDecoders[0]).not.toHaveBeenCalled();

    const replacementDecoder = vi.fn(async () => {
      starts.push("replacement");
      return true;
    });
    const replacement = request("replacement", replacementDecoder);
    const replacementEarly = await Promise.race([
      replacement.then(() => "settled" as const),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    expect(replacementEarly).toBe("pending");

    activeA.resolve(true);
    await vi.waitFor(() => expect(replacementDecoder).toHaveBeenCalledOnce());
    activeB.resolve(true);

    const completed = await Promise.all([
      ...active,
      ...queued.slice(1),
      replacement,
    ]);
    expect(completed.every((result) => result.ok)).toBe(true);
  });

  it("releases exactly one lease after native resolve or reject", async () => {
    const gates = {
      a: deferred<boolean>(),
      b: deferred<boolean>(),
      c: deferred<boolean>(),
      d: deferred<boolean>(),
      e: deferred<boolean>(),
      f: deferred<boolean>(),
      g: deferred<boolean>(),
    };
    const starts: string[] = [];
    const decoderFor = (label: keyof typeof gates) => async () => {
      starts.push(label);
      return gates[label].promise;
    };

    const a = request("resolve-a", decoderFor("a"));
    const b = request("reject-b", decoderFor("b"));
    const c = request("queued-c", decoderFor("c"));
    const d = request("queued-d", decoderFor("d"));
    await vi.waitFor(() => expect(starts).toEqual(["a", "b"]));

    gates.a.resolve(true);
    await vi.waitFor(() => expect(starts).toEqual(["a", "b", "c"]));
    gates.b.reject(new Error("native decode failed"));
    await vi.waitFor(() => expect(starts).toEqual(["a", "b", "c", "d"]));
    await expect(a).resolves.toMatchObject({ ok: true });
    await expect(b).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
    });
    gates.c.resolve(true);
    gates.d.resolve(true);
    await Promise.all([c, d]);

    const e = request("active-e", decoderFor("e"));
    const f = request("active-f", decoderFor("f"));
    const g = request("queued-g", decoderFor("g"));
    await vi.waitFor(() => expect(starts.slice(-2)).toEqual(["e", "f"]));
    expect(starts).not.toContain("g");

    gates.e.resolve(true);
    await vi.waitFor(() => expect(starts.slice(-3)).toEqual(["e", "f", "g"]));
    gates.f.resolve(true);
    gates.g.resolve(true);
    const final = await Promise.all([e, f, g]);
    expect(final.every((result) => result.ok)).toBe(true);
  });
});

describe("downloadEvidenceMedia content validation", () => {
  it("uses the injected decoder only after structural validation in tests", async () => {
    const decodeImageForTest = vi.fn(async () => true);

    await expect(downloadEvidenceMedia("https://images.example/invalid.png", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response("<svg/>", {
        headers: { "content-type": "image/png" },
      })),
      decodeImageForTest,
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "sniff_failed",
    });
    expect(decodeImageForTest).not.toHaveBeenCalled();

    await expect(downloadEvidenceMedia("https://images.example/valid.png", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => pngResponse()),
      decodeImageForTest,
    })).resolves.toMatchObject({
      ok: true,
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    expect(decodeImageForTest).toHaveBeenCalledOnce();
  });

  it("rejects oversized Content-Length before reading the body", async () => {
    let cancelled = false;
    const response = streamingResponse(
      [Uint8Array.of(0xff, 0xd8, 0xff)],
      { "content-type": "image/jpeg", "content-length": String(MAX_BYTES + 1) },
      () => {
        cancelled = true;
      },
    );

    await expect(downloadEvidenceMedia("https://images.example/large.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => response),
    })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("stops and cancels a stream that exceeds the limit when length is absent or lying", async () => {
    for (const contentLength of [undefined, "1"]) {
      let cancelled = false;
      const headers: Record<string, string> = { "content-type": "image/jpeg" };
      if (contentLength) headers["content-length"] = contentLength;
      const response = streamingResponse(
        [new Uint8Array(MAX_BYTES), Uint8Array.of(1), Uint8Array.of(2)],
        headers,
        () => {
          cancelled = true;
        },
      );

      await expect(downloadEvidenceMedia("https://images.example/large.jpg", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher: vi.fn(async () => response),
      })).resolves.toEqual({ ok: false, code: "EVIDENCE_MEDIA_TOO_LARGE" });
      expect(cancelled).toBe(true);
    }
  });

  it("allows only JPEG, PNG, or WebP magic bytes with a consistent declared MIME type", async () => {
    const cases: Array<[Response, MediaRejectionDetail]> = [
      [new Response("<svg><script>alert(1)</script></svg>", {
        headers: { "content-type": "image/svg+xml" },
      }), "missing_content_type"],
      [new Response("<svg/>", { headers: { "content-type": "image/png" } }), "sniff_failed"],
      [
        new Response(onePixelPng, { headers: { "content-type": "image/jpeg" } }),
        "sniff_declared_mismatch",
      ],
      [new Response(Uint8Array.of(0xff, 0xd8, 0xff, 0x3c, 0x73, 0x76, 0x67), {
        headers: { "content-type": "image/jpeg" },
      }), "container_boundary"],
      [new Response(onePixelPng), "missing_content_type"],
    ];

    for (const [response, detail] of cases) {
      await expect(downloadEvidenceMedia("https://images.example/file", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher: vi.fn(async () => response),
      }), detail).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
        detail,
      });
    }
  });

  it("accepts a valid lossy WebP", async () => {
    await expect(downloadEvidenceMedia("https://images.example/file.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(onePixelWebp, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toMatchObject({
      ok: true,
      mimeType: "image/webp",
      width: 1,
      height: 1,
    });
  });

  it("accepts a valid lossless WebP", async () => {
    await expect(downloadEvidenceMedia("https://images.example/lossless.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(onePixelLosslessWebp, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toMatchObject({
      ok: true,
      mimeType: "image/webp",
      width: 1,
      height: 1,
    });
  });

  it("rejects a VP8X container whose only image chunk is an empty ANMF", async () => {
    await expect(downloadEvidenceMedia("https://images.example/empty-animation.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(emptyAnimatedWebp, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects an invalid ALPH control byte even when VP8 is structurally valid", async () => {
    const invalid = new Uint8Array(onePixelAlphaWebp);
    invalid[findWebpChunk(invalid, "ALPH") + 8] = 0xc0;
    await expect(downloadEvidenceMedia("https://images.example/invalid-alpha.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(invalid, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
    });
  });

  it("rejects a truncated VP8 frame with a valid key-frame header", async () => {
    const truncated = truncateWebpFrame(onePixelWebp, "VP8 ", 10);
    await expect(downloadEvidenceMedia("https://images.example/truncated-vp8.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(truncated, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects a corrupt VP8L payload with a valid header and container", async () => {
    const corrupt = new Uint8Array(onePixelLosslessWebp);
    corrupt.fill(0xff, findWebpChunk(corrupt, "VP8L") + 13, corrupt.length - 1);
    await expect(downloadEvidenceMedia("https://images.example/corrupt-vp8l.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(corrupt, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
    });
  });

  it("rejects malformed WebP chunk lengths", async () => {
    const malformed = new Uint8Array(onePixelWebp);
    new DataView(malformed.buffer).setUint32(16, 0, true);

    await expect(downloadEvidenceMedia("https://images.example/malformed.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(malformed, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects WebP trailing bytes even when the RIFF size is forged", async () => {
    const trailing = new Uint8Array(onePixelWebp.length + 4);
    trailing.set(onePixelWebp);
    trailing.set([0x3c, 0x73, 0x76, 0x67], onePixelWebp.length);
    new DataView(trailing.buffer).setUint32(4, trailing.length - 8, true);

    await expect(downloadEvidenceMedia("https://images.example/trailing.webp", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(trailing, {
        headers: { "content-type": "image/webp" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("accepts a structurally valid JPEG", async () => {
    await expect(downloadEvidenceMedia("https://images.example/file.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(onePixelJpeg, {
        headers: { "content-type": "image/jpeg" },
      })),
    })).resolves.toMatchObject({
      ok: true,
      mimeType: "image/jpeg",
      width: 1,
      height: 1,
    });
  });

  it("rejects a header-only JPEG with no tables or entropy-coded data", async () => {
    await expect(downloadEvidenceMedia("https://images.example/header-only.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(headerOnlyJpeg, {
        headers: { "content-type": "image/jpeg" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects a table-valid JPEG with insufficient entropy-coded data", async () => {
    const invalid = jpegWithInsufficientEntropy(onePixelJpeg);
    await expect(downloadEvidenceMedia("https://images.example/invalid-entropy.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(invalid, {
        headers: { "content-type": "image/jpeg" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
    });
  });

  it("rejects a valid JPEG followed by payload and a forged final EOI", async () => {
    const payload = new TextEncoder().encode("<svg/>");
    const polyglot = new Uint8Array(onePixelJpeg.length + payload.length + 2);
    polyglot.set(onePixelJpeg);
    polyglot.set(payload, onePixelJpeg.length);
    polyglot.set([0xff, 0xd9], onePixelJpeg.length + payload.length);

    await expect(downloadEvidenceMedia("https://images.example/polyglot.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(polyglot, {
        headers: { "content-type": "image/jpeg" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects invalid JPEG marker segment lengths", async () => {
    const malformed = new Uint8Array(onePixelJpeg.length + 4);
    malformed.set(onePixelJpeg.subarray(0, -2));
    malformed.set([0xff, 0xe1, 0x00, 0x01], onePixelJpeg.length - 2);
    malformed.set([0xff, 0xd9], onePixelJpeg.length + 2);

    await expect(downloadEvidenceMedia("https://images.example/malformed.jpg", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(malformed, {
        headers: { "content-type": "image/jpeg" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("blocks a valid image with appended SVG polyglot markup", async () => {
    const svg = new TextEncoder().encode("<svg/>");
    const polyglot = new Uint8Array(onePixelPng.byteLength + svg.byteLength);
    polyglot.set(onePixelPng);
    polyglot.set(svg, onePixelPng.byteLength);

    await expect(downloadEvidenceMedia("https://images.example/polyglot.png", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => new Response(polyglot, {
        headers: { "content-type": "image/png" },
      })),
    })).resolves.toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("rejects zero or over-limit dimensions", async () => {
    for (const [width, height] of [[0, 1], [1, 0], [4_801, 1], [1, 4_801]]) {
      await expect(downloadEvidenceMedia("https://images.example/file.png", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher: vi.fn(async () => new Response(pngWithDimensions(width, height), {
          headers: { "content-type": "image/png" },
        })),
      }), `${width}x${height}`).resolves.toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
        detail: "dimensions_rejected",
      });
    }
  });

  it("returns validated bytes, MIME, dimensions, size, and SHA-256", async () => {
    const result = await downloadEvidenceMedia("https://images.example/a.png", {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => pngResponse({
        "content-type": "image/png; charset=binary",
      })),
    });

    expect(result).toEqual({
      ok: true,
      bytes: onePixelPng,
      mimeType: "image/png",
      sha256: createHash("sha256").update(onePixelPng).digest("hex"),
      byteSize: onePixelPng.byteLength,
      width: 1,
      height: 1,
    });
  });
});

/**
 * Inserts a spec-legal metadata chunk ahead of the frame. The container check
 * skips unknown chunks, so the file passes structural validation, but the
 * measurement library only recognises WebP when a frame chunk follows the RIFF
 * header — so measurement throws instead of returning dimensions.
 */
function webpWithLeadingMetadataChunk(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const inserted = new Uint8Array(bytes.length + 12);
  inserted.set(bytes.subarray(0, 12));
  inserted.set(new TextEncoder().encode("ICCP"), 12);
  const view = new DataView(inserted.buffer);
  view.setUint32(16, 4, true);
  inserted.set(bytes.subarray(12), 24);
  view.setUint32(4, inserted.length - 8, true);
  return inserted;
}

function rejectionRecorder(): {
  logger: MediaDownloadLogger;
  events: MediaRejectionEvent[];
} {
  const events: MediaRejectionEvent[] = [];
  return {
    logger: {
      warn(event) {
        events.push(event);
      },
    },
    events,
  };
}

describe("downloadEvidenceMedia rejection observability", () => {
  async function rejectionFor(
    url: string,
    response: () => Response,
    extra: Record<string, unknown> = {},
  ): Promise<MediaRejectionEvent | undefined> {
    const { logger, events } = rejectionRecorder();
    const result = await downloadEvidenceMedia(url, {
      resolveHost: async () => [PUBLIC_ADDRESS],
      fetcher: vi.fn(async () => response()),
      logger,
      ...extra,
    });
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_MEDIA_TYPE_BLOCKED" });
    expect(events).toHaveLength(1);
    return events[0];
  }

  it("discriminates a missing or unsupported Content-Type", async () => {
    await expect(rejectionFor(
      "https://images.example/no-type.png",
      () => new Response(onePixelPng),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "missing_content_type",
      declaredType: null,
      sniffedType: null,
      byteSize: null,
      width: null,
      height: null,
    });

    await expect(rejectionFor(
      "https://images.example/vector.svg",
      () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    )).resolves.toMatchObject({ detail: "missing_content_type", declaredType: null });
  });

  it("discriminates bytes that match no allowed image signature", async () => {
    const body = "<svg/>";
    await expect(rejectionFor(
      "https://images.example/fake.png",
      () => new Response(body, { headers: { "content-type": "image/png" } }),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "sniff_failed",
      declaredType: "image/png",
      sniffedType: null,
      byteSize: body.length,
      width: null,
      height: null,
    });
  });

  it("discriminates a sniffed type that contradicts the declared type", async () => {
    await expect(rejectionFor(
      "https://images.example/mislabelled.jpg",
      () => new Response(onePixelPng, { headers: { "content-type": "image/jpeg" } }),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "sniff_declared_mismatch",
      declaredType: "image/jpeg",
      sniffedType: "image/png",
      byteSize: onePixelPng.byteLength,
      width: null,
      height: null,
    });
  });

  it("discriminates a container that does not end exactly at the image boundary", async () => {
    const svg = new TextEncoder().encode("<svg/>");
    const polyglot = new Uint8Array(onePixelPng.byteLength + svg.byteLength);
    polyglot.set(onePixelPng);
    polyglot.set(svg, onePixelPng.byteLength);

    await expect(rejectionFor(
      "https://images.example/polyglot.png",
      () => new Response(polyglot, { headers: { "content-type": "image/png" } }),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
      declaredType: "image/png",
      sniffedType: "image/png",
      byteSize: polyglot.byteLength,
      width: null,
      height: null,
    });
  });

  it("discriminates dimensions outside the decode budget and reports them", async () => {
    const oversized = pngWithDimensions(4_801, 2);
    await expect(rejectionFor(
      "https://images.example/oversized.png",
      () => new Response(oversized, { headers: { "content-type": "image/png" } }),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "dimensions_rejected",
      declaredType: "image/png",
      sniffedType: "image/png",
      byteSize: oversized.byteLength,
      width: 4_801,
      height: 2,
    });
  });

  it("discriminates a full decode that reports the image as undecodable", async () => {
    await expect(rejectionFor(
      "https://images.example/undecodable.png",
      () => pngResponse(),
      { decodeImageForTest: vi.fn(async () => false) },
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_failed",
      declaredType: "image/png",
      sniffedType: "image/png",
      byteSize: onePixelPng.byteLength,
      width: 1,
      height: 1,
    });
  });

  it("discriminates a measurement or decode that throws", async () => {
    const unmeasurable = webpWithLeadingMetadataChunk(onePixelWebp);
    await expect(rejectionFor(
      "https://images.example/unmeasurable.webp",
      () => new Response(unmeasurable, { headers: { "content-type": "image/webp" } }),
    )).resolves.toEqual({
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "decode_threw",
      declaredType: "image/webp",
      sniffedType: "image/webp",
      byteSize: unmeasurable.byteLength,
      width: null,
      height: null,
    });
  });

  it("never records the URL, host, or path of the rejected media", async () => {
    const event = await rejectionFor(
      "https://cdn.merchant.example/private/shop-slug/photo.png?token=secret",
      () => new Response("<svg/>", { headers: { "content-type": "image/png" } }),
    );

    const serialized = JSON.stringify(event);
    for (const leak of ["cdn.merchant.example", "shop-slug", "photo.png", "token", "secret", "https://"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("writes rejections to the console under the evidence media prefix by default", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await downloadEvidenceMedia("https://images.example/fake.png", {
        resolveHost: async () => [PUBLIC_ADDRESS],
        fetcher: vi.fn(async () => new Response("<svg/>", {
          headers: { "content-type": "image/png" },
        })),
      });

      expect(warn).toHaveBeenCalledWith(
        "[evidence/media] rejected",
        expect.objectContaining({
          code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
          detail: "sniff_failed",
        }),
      );
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * 64x48 progressive (SOF2) JPEG produced by sharp/libjpeg-turbo. It exercises
 * everything baseline never does: an interleaved DC scan, single-component AC
 * band scans, DC and AC successive-approximation refinement scans, components
 * revisited across ten scans, and AC Huffman tables carrying EOBn symbols
 * (size 0, run 1..14).
 */
const progressiveJpeg = Uint8Array.from(Buffer.from(
  "/9j/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoP"
  + "Dxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wgARCAAwAEADASIAAhEBAxEB/8QAFgABAQEA"
  + "AAAAAAAAAAAAAAAABwAG/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAByazExLMTEsxMSzExLMTEsxMSzExLMTEsxMSzExLMTEsx"
  + "Mf/EABQQAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQEAAQUCQ//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQMBAT8BT//EABQRAQAAAAAAAAAAAAAA"
  + "AAAAADD/2gAIAQIBAT8BT//EABQQAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQEABj8CQ//EABQQAQAAAAAAAAAAAAAAAAAAAFD/2gAIAQEAAT8hQ//a"
  + "AAwDAQACAAMAAAAQ888888888888/8QAFBEBAAAAAAAAAAAAAAAAAAAAMP/aAAgBAwEBPxBP/8QAFBEBAAAAAAAAAAAAAAAAAAAAMP/aAAgBAgEB"
  + "PxBP/8QAFBABAAAAAAAAAAAAAAAAAAAAUP/aAAgBAQABPxBD/9k=",
  "base64",
));

function jpegSegmentOffsets(bytes: Uint8Array): Array<{ marker: number; offset: number }> {
  const segments: Array<{ marker: number; offset: number }> = [];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Misaligned JPEG test fixture");
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9) break;
    segments.push({ marker, offset });
    const segmentEnd = offset + 2 + ((bytes[offset + 2]! << 8) | bytes[offset + 3]!);
    if (marker === 0xda) break;
    offset = segmentEnd;
  }
  return segments;
}

function withFrameMarker(bytes: Uint8Array, marker: number): Uint8Array<ArrayBuffer> {
  const patched = new Uint8Array(bytes);
  const frame = jpegSegmentOffsets(patched).find(
    (segment) => segment.marker >= 0xc0 && segment.marker <= 0xcf
      && segment.marker !== 0xc4 && segment.marker !== 0xc8 && segment.marker !== 0xcc,
  );
  if (!frame) throw new Error("Missing SOF test marker");
  patched[frame.offset + 1] = marker;
  return patched;
}

function withScanSelection(
  bytes: Uint8Array,
  spectralStart: number,
  spectralEnd: number,
  approximation: number,
): Uint8Array<ArrayBuffer> {
  const patched = new Uint8Array(bytes);
  const scan = jpegSegmentOffsets(patched).find((segment) => segment.marker === 0xda);
  if (!scan) throw new Error("Missing SOS test marker");
  const segmentEnd = scan.offset + 2 + ((patched[scan.offset + 2]! << 8) | patched[scan.offset + 3]!);
  patched[segmentEnd - 3] = spectralStart;
  patched[segmentEnd - 2] = spectralEnd;
  patched[segmentEnd - 1] = approximation;
  return patched;
}

/** Rewrites the first AC Huffman symbol to EOB1 (run 1, size 0). */
function withEobnAcSymbol(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const patched = new Uint8Array(bytes);
  for (const segment of jpegSegmentOffsets(patched)) {
    if (segment.marker !== 0xc4) continue;
    const segmentEnd = segment.offset + 2
      + ((patched[segment.offset + 2]! << 8) | patched[segment.offset + 3]!);
    let cursor = segment.offset + 4;
    while (cursor < segmentEnd) {
      const tableClass = patched[cursor]! >>> 4;
      let symbolCount = 0;
      for (let length = 0; length < 16; length += 1) symbolCount += patched[cursor + 1 + length]!;
      if (tableClass === 1) {
        patched[cursor + 17] = 0x10;
        return patched;
      }
      cursor += 17 + symbolCount;
    }
  }
  throw new Error("Missing AC DHT test table");
}

function withTrailingBytes(bytes: Uint8Array, trailer: Uint8Array): Uint8Array<ArrayBuffer> {
  const extended = new Uint8Array(bytes.length + trailer.length);
  extended.set(bytes);
  extended.set(trailer, bytes.length);
  return extended;
}

function jpegResponse(bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
}

async function downloadJpeg(bytes: Uint8Array<ArrayBuffer>): Promise<{
  result: Awaited<ReturnType<typeof downloadEvidenceMedia>>;
  events: MediaRejectionEvent[];
}> {
  const { logger, events } = rejectionRecorder();
  const result = await downloadEvidenceMedia("https://images.example/photo.jpg", {
    resolveHost: async () => [PUBLIC_ADDRESS],
    fetcher: vi.fn(async () => jpegResponse(bytes)),
    logger,
  });
  return { result, events };
}

describe("downloadEvidenceMedia progressive and extended-sequential JPEG", () => {
  it("accepts a progressive (SOF2) JPEG that Sharp fully decodes", async () => {
    const { result, events } = await downloadJpeg(progressiveJpeg);
    expect(events).toEqual([]);
    expect(result).toMatchObject({
      ok: true,
      mimeType: "image/jpeg",
      width: 64,
      height: 48,
      byteSize: progressiveJpeg.byteLength,
    });
  });

  it("accepts an extended-sequential (SOF1) JPEG", async () => {
    const { result, events } = await downloadJpeg(withFrameMarker(onePixelJpeg, 0xc1));
    expect(events).toEqual([]);
    expect(result).toMatchObject({ ok: true, mimeType: "image/jpeg", width: 1, height: 1 });
  });

  it("still rejects a progressive JPEG carrying an appended payload", async () => {
    const payload = new TextEncoder().encode("<?php system($_GET[0]); ?>");
    const { result, events } = await downloadJpeg(withTrailingBytes(progressiveJpeg, payload));
    expect(result).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
    expect(events[0]).toMatchObject({ detail: "container_boundary" });
  });

  it("still rejects a progressive JPEG padded with trailing NUL bytes", async () => {
    const { result } = await downloadJpeg(
      withTrailingBytes(progressiveJpeg, new Uint8Array(16)),
    );
    expect(result).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("still rejects a truncated progressive JPEG", async () => {
    const { result } = await downloadJpeg(progressiveJpeg.subarray(0, progressiveJpeg.length - 40));
    expect(result).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });

  it("still rejects frame types outside baseline, extended sequential and progressive", async () => {
    for (const marker of [0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      const { result } = await downloadJpeg(withFrameMarker(onePixelJpeg, marker));
      expect(result).toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
        detail: "container_boundary",
      });
    }
  });

  it("keeps sequential scans pinned to the full spectral band with no approximation", async () => {
    for (const [start, end, approximation] of [
      [1, 63, 0],
      [0, 5, 0],
      [0, 63, 0x10],
      [0, 63, 0x01],
    ] as const) {
      const { result, events } = await downloadJpeg(
        withScanSelection(onePixelJpeg, start, end, approximation),
      );
      expect(result).toEqual({
        ok: false,
        code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
        detail: "container_boundary",
      });
      expect(events[0]).toMatchObject({ detail: "container_boundary" });
    }
  });

  it("keeps EOBn AC Huffman symbols out of sequential frames", async () => {
    const { result, events } = await downloadJpeg(withEobnAcSymbol(onePixelJpeg));
    expect(result).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
    expect(events[0]).toMatchObject({ detail: "container_boundary" });
  });

  it("still rejects a progressive frame larger than the decode budget", async () => {
    const oversized = new Uint8Array(progressiveJpeg);
    const frame = jpegSegmentOffsets(oversized).find((segment) => segment.marker === 0xc2)!;
    const view = new DataView(oversized.buffer, oversized.byteOffset, oversized.byteLength);
    view.setUint16(frame.offset + 5, 5_000);
    view.setUint16(frame.offset + 7, 5_000);
    const { result } = await downloadJpeg(oversized);
    expect(result).toEqual({
      ok: false,
      code: "EVIDENCE_MEDIA_TYPE_BLOCKED",
      detail: "container_boundary",
    });
  });
});

/**
 * The progressive support relaxes four baseline rules — several scans per
 * component, per-band spectral selection, successive approximation, and EOBn AC
 * symbols. Each is supposed to be gated on the frame actually being SOF2, so a
 * file that merely CLAIMS baseline cannot reach them.
 *
 * Reading the gating off the source is the part of this change a reviewer
 * cannot easily verify by eye, so these tests prove it by construction: take a
 * genuinely progressive JPEG and rewrite ONLY the frame marker byte. The scans,
 * spectral parameters and Huffman tables are left untouched, so the bytes still
 * contain every progressive-only structure while declaring a sequential frame.
 * If any relaxation were ungated, these would be accepted.
 */
describe("progressive relaxations are gated on the declared frame type", () => {
  function withFrameMarker(marker: number): Uint8Array<ArrayBuffer> {
    const forged = new Uint8Array(progressiveJpeg) as Uint8Array<ArrayBuffer>;
    const frame = jpegSegmentOffsets(forged).find((segment) => segment.marker === 0xc2)!;
    // FF <marker> <len:2> <precision> <height:2> <width:2>
    forged[frame.offset + 1] = marker;
    return forged;
  }

  it("rejects progressive scan structure declared as a baseline (SOF0) frame", async () => {
    const { result } = await downloadJpeg(withFrameMarker(0xc0));
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_MEDIA_TYPE_BLOCKED" });
  });

  it("rejects progressive scan structure declared as extended sequential (SOF1)", async () => {
    // SOF1 is accepted as a frame type but is NOT progressive, so it must take
    // the strict path exactly as SOF0 does.
    const { result } = await downloadJpeg(withFrameMarker(0xc1));
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_MEDIA_TYPE_BLOCKED" });
  });

  it("accepts the same bytes when the frame is honestly declared progressive", async () => {
    // Control: proves the two rejections above come from the gating and not
    // from some unrelated defect in the fixture.
    const { result } = await downloadJpeg(withFrameMarker(0xc2));
    expect(result).toMatchObject({ ok: true, mimeType: "image/jpeg" });
  });
});
