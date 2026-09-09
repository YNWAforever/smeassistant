import { describe, expect, it, vi } from "vitest";
import { fetchWebsiteSafely } from "./safe-website-fetch";

const PUBLIC_ADDRESS = "93.184.216.34";
const html = (body = "<html><body>hi</body></html>") =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

describe("fetchWebsiteSafely", () => {
  it("rejects a non-HTTPS scheme without any DNS/network call", async () => {
    const resolveHost = vi.fn();
    const requestPinned = vi.fn();
    expect(await fetchWebsiteSafely("http://example.test", { resolveHost, requestPinned })).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("rejects localhost and *.localhost without any DNS/network call", async () => {
    const resolveHost = vi.fn();
    const requestPinned = vi.fn();
    expect(await fetchWebsiteSafely("https://localhost/", { resolveHost, requestPinned })).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(await fetchWebsiteSafely("https://foo.localhost/", { resolveHost, requestPinned })).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["private 10/8", "10.1.2.3"],
    ["private 172.16/12", "172.16.5.6"],
    ["private 192.168/16", "192.168.1.1"],
    ["link-local", "169.254.1.1"],
    ["CGNAT 100.64/10", "100.64.0.1"],
    ["broadcast/multicast", "224.0.0.1"],
  ])("rejects a resolved private IPv4 address (%s)", async (_label, address) => {
    const requestPinned = vi.fn();
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [address], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it.each([
    ["IPv6 loopback", "::1"],
    ["IPv6 unique-local", "fc00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv4-mapped private", "::ffff:10.0.0.1"],
    ["NAT64-embedded private", "64:ff9b::7f00:1"],
  ])("rejects a resolved private IPv6 address (%s)", async (_label, address) => {
    const requestPinned = vi.fn();
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [address], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("blocks a public-then-private multi-address DNS answer (any non-global address refuses the whole resolution)", async () => {
    const requestPinned = vi.fn();
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS, "10.0.0.1"], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("treats a DNS-literal private IP hostname as blocked without a resolver call", async () => {
    const resolveHost = vi.fn();
    const result = await fetchWebsiteSafely("https://127.0.0.1/", { resolveHost, requestPinned: vi.fn() });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("resolves and fetches a public address, requesting the pinned address rather than the hostname", async () => {
    const requestPinned = vi.fn(async () => html());
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: true, html: "<html><body>hi</body></html>" });
    expect(requestPinned).toHaveBeenCalledWith(expect.any(URL), PUBLIC_ADDRESS, expect.any(AbortSignal));
  });

  it("re-resolves and re-validates a redirect target, blocking a redirect to a private address", async () => {
    let call = 0;
    const resolveHost = vi.fn(async () => (call++ === 0 ? [PUBLIC_ADDRESS] : ["10.0.0.9"]));
    const requestPinned = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://internal.merchant-site.test/admin" } }));
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost, requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(resolveHost).toHaveBeenCalledTimes(2);
  });

  it("follows a redirect to a public target and returns its HTML", async () => {
    let call = 0;
    const requestPinned = vi.fn(async () =>
      call++ === 0 ? new Response(null, { status: 301, headers: { location: "https://merchant-site.test/home" } }) : html("<html>home</html>"),
    );
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: true, html: "<html>home</html>" });
    expect(requestPinned).toHaveBeenCalledTimes(2);
  });

  it("gives up after too many redirects rather than following indefinitely", async () => {
    const requestPinned = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://merchant-site.test/next" } }));
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
    expect(requestPinned.mock.calls.length).toBeLessThanOrEqual(4); // MAX_REDIRECTS(3) + 1
  });

  it("rejects a non-HTML content type without reading the body as a page", async () => {
    const requestPinned = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_INVALID_CONTENT_TYPE" });
  });

  it("rejects a response with no content-type header", async () => {
    const requestPinned = vi.fn(async () => new Response("<html/>"));
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_INVALID_CONTENT_TYPE" });
  });

  it("rejects a body whose declared Content-Length exceeds the cap", async () => {
    const requestPinned = vi.fn(
      async () => new Response("<html/>", { headers: { "content-type": "text/html", "content-length": String(6_000_000) } }),
    );
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_TOO_LARGE" });
  });

  it("rejects a streamed body that exceeds the cap even without a declared Content-Length", async () => {
    const oversized = new Uint8Array(6_000_000).fill(97);
    const requestPinned = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(oversized);
              controller.close();
            },
          }),
          { headers: { "content-type": "text/html" } },
        ),
    );
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_TOO_LARGE" });
  });

  it("reports a non-2xx status as an unavailable fetch, not a URL block", async () => {
    const requestPinned = vi.fn(async () => new Response("nope", { status: 500, headers: { "content-type": "text/html" } }));
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [PUBLIC_ADDRESS], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
  });

  it("reports empty DNS resolution as a URL block", async () => {
    const requestPinned = vi.fn();
    const result = await fetchWebsiteSafely("https://merchant-site.test/", { resolveHost: async () => [], requestPinned });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(requestPinned).not.toHaveBeenCalled();
  });

  it("reports a DNS failure as fetch-failed, not silently as blocked", async () => {
    const requestPinned = vi.fn();
    const result = await fetchWebsiteSafely("https://merchant-site.test/", {
      resolveHost: async () => {
        throw new Error("ENOTFOUND");
      },
      requestPinned,
    });
    expect(result).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
  });
});
