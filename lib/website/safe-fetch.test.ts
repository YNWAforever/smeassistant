import { describe, expect, it, vi } from "vitest";
import { fetchWebsiteSafely } from "./safe-fetch";

const html = () => new Response("<title>Public shop</title>", { headers: { "content-type": "text/html" } });
const publicDns = async () => ["93.184.216.34"];

describe("application website transport", () => {
  it.each([
    ["10.0.0.1"], ["127.0.0.1"], ["169.254.169.254"], ["192.168.1.1"],
    ["::1"], ["fd00::1"], ["fe80::1"], ["::ffff:127.0.0.1"],
    ["93.184.216.34", "10.0.0.1"], [],
  ])("refuses private or mixed DNS answers: %j", async (...answers) => {
    const request = vi.fn(async () => html());
    const result = await fetchWebsiteSafely("https://shop.example", {
      resolveHost: async () => answers,
      requestPinned: request,
    });
    expect(result).toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(request).not.toHaveBeenCalled();
  });

  it("pins each request to the address validated for that redirect hop", async () => {
    const lookups: string[] = [];
    const pins: Array<[string, string]> = [];
    const result = await fetchWebsiteSafely("https://shop.example", {
      resolveHost: async host => {
        lookups.push(host);
        return [host === "shop.example" ? "93.184.216.34" : "1.1.1.1"];
      },
      requestPinned: async (url, address) => {
        pins.push([url.href, address]);
        return pins.length === 1
          ? new Response(null, { status: 302, headers: { location: "https://www.shop.example/menu" } })
          : html();
      },
    });
    expect(lookups).toEqual(["shop.example", "www.shop.example"]);
    expect(pins).toEqual([["https://shop.example/", "93.184.216.34"], ["https://www.shop.example/menu", "1.1.1.1"]]);
    expect(result).toEqual({ ok: true, html: "<title>Public shop</title>", finalUrl: "https://www.shop.example/menu" });
  });

  it("refuses a hostname which rebinds to a private address on redirect", async () => {
    const resolver = vi.fn().mockResolvedValueOnce(["93.184.216.34"]).mockResolvedValueOnce(["10.0.0.1"]);
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/admin" } }));
    expect(await fetchWebsiteSafely("https://shop.example", { resolveHost: resolver, requestPinned: request }))
      .toEqual({ ok: false, code: "WEBSITE_URL_BLOCKED" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("stops redirect loops after three hops", async () => {
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    expect(await fetchWebsiteSafely("https://shop.example", { resolveHost: publicDns, requestPinned: request }))
      .toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("preserves inspectable public HTTP sites", async () => {
    const result = await fetchWebsiteSafely("http://shop.example", { resolveHost: publicDns, requestPinned: async () => html() });
    expect(result).toMatchObject({ ok: true, finalUrl: "http://shop.example/" });
  });

  it("rejects oversized Content-Length before reading the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const result = await fetchWebsiteSafely("https://shop.example", {
      resolveHost: publicDns,
      requestPinned: async () => new Response(body, { headers: { "content-type": "text/html", "content-length": "524289" } }),
    });
    expect(result).toEqual({ ok: false, code: "WEBSITE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("refuses unexpected compressed bytes instead of treating them as measured HTML", async () => {
    const result = await fetchWebsiteSafely("https://shop.example", {
      resolveHost: publicDns,
      requestPinned: async () => new Response(new Uint8Array([31, 139, 8, 0]), {
        headers: { "content-type": "text/html", "content-encoding": "gzip" },
      }),
    });
    expect(result).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
  });

  it("honours the enclosing execution budget even if the DNS dependency stalls", async () => {
    const budget = new AbortController();
    const request = vi.fn(async () => html());
    const work = fetchWebsiteSafely("https://shop.example", {
      signal: budget.signal, resolveHost: () => new Promise(() => {}), requestPinned: request,
    });
    budget.abort();
    expect(await work).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
    expect(request).not.toHaveBeenCalled();
  });

  it("settles an already-expired budget without leaking a rejected DNS promise", async () => {
    const budget = new AbortController();
    budget.abort();
    expect(await fetchWebsiteSafely("https://shop.example", {
      signal: budget.signal, resolveHost: async () => { throw budget.signal.reason; },
    })).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
    // Vitest also fails this run if the started dependency rejects unobserved.
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it("bounds stalled streams and cancels them on deadline", async () => {
    const cancel = vi.fn();
    const result = await fetchWebsiteSafely("https://shop.example", {
      timeoutMs: 20, resolveHost: publicDns,
      requestPinned: async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": "text/html" } }),
    });
    expect(result).toEqual({ ok: false, code: "WEBSITE_FETCH_FAILED" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
