import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

type NativeRequest = (url: URL, options: RequestOptions, receive: (response: IncomingMessage) => void) => ClientRequest;
const mocks = vi.hoisted(() => ({ http: vi.fn<NativeRequest>(), https: vi.fn<NativeRequest>() }));
vi.mock("node:http", () => ({ request: mocks.http }));
vi.mock("node:https", () => ({ request: mocks.https }));

import { fetchWebsiteSafely } from "./safe-fetch";

beforeEach(() => {
  vi.resetAllMocks();
  const respond: NativeRequest = (_url, _options, receive) => {
    const incoming = Object.assign(Readable.from([Buffer.from("<title>Shop</title>")]), {
      statusCode: 200, statusMessage: "OK", headers: { "content-type": "text/html" },
    }) as IncomingMessage;
    return Object.assign(new EventEmitter(), { end: () => receive(incoming) }) as ClientRequest;
  };
  mocks.http.mockImplementation(respond);
  mocks.https.mockImplementation(respond);
});

describe("native website request", () => {
  it.each([
    ["https", "93.184.216.34", 4],
    ["http", "2606:4700:4700::1111", 6],
  ] as const)("pins the %s socket while preserving the validated hostname", async (scheme, address, family) => {
    const result = await fetchWebsiteSafely(`${scheme}://shop.example/menu`, {
      resolveHost: async () => [address],
    });
    expect(result).toEqual({ ok: true, html: "<title>Shop</title>", finalUrl: `${scheme}://shop.example/menu` });
    const request = scheme === "https" ? mocks.https : mocks.http;
    const other = scheme === "https" ? mocks.http : mocks.https;
    expect(request).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
    const [url, options] = request.mock.calls[0];
    expect(url.href).toBe(`${scheme}://shop.example/menu`);
    expect(options).toMatchObject({
      method: "GET", agent: false, family, signal: expect.any(AbortSignal),
      headers: {
        accept: "text/html,application/xhtml+xml", "accept-encoding": "identity",
        "user-agent": "SMEScannerWorkspace/1.0 (+website-checks)",
      },
    });
    if (scheme === "https") {
      expect(options).toHaveProperty("servername", "shop.example");
      expect(options).not.toHaveProperty("rejectUnauthorized", false);
    }
    const connected = vi.fn();
    (options.lookup as LookupFunction)("shop.example", { family }, connected);
    expect(connected).toHaveBeenCalledWith(null, address, family);
  });
});
