import { describe, expect, it, vi } from "vitest";
import { parseGoogleMapsUrl, resolveGoogleMapsUrl } from "./maps-url";

const KAM_MAN_URL = "https://www.google.com/maps/place/Kam+Man+Kitchen/@22.2690553,114.1843662,17z/data=!4m6!3m5!1s0x340401bcb5d5f711:0xa198ba4096fa2e8c!8m2!3d22.2690553!4d114.1843662";

const publicLookup = vi.fn(async () => [{ address: "142.250.72.36", family: 4 }]);

describe("Google Maps URL parsing", () => {
  it("parses the supplied Kam Man Kitchen fixture", () => {
    expect(parseGoogleMapsUrl(KAM_MAN_URL)).toEqual({
      ok: true,
      value: {
        name: "Kam Man Kitchen",
        latitude: 22.2690553,
        longitude: 114.1843662,
        zoom: 17,
        dataId: "0x340401bcb5d5f711:0xa198ba4096fa2e8c",
        resolvedUrl: KAM_MAN_URL,
      },
    });
  });

  it("decodes names and accepts supported identity variants", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/%E9%87%91%E8%90%AC%E9%A4%90%E5%BB%B3/?place_id=ChIJ123")).toEqual(
      expect.objectContaining({ ok: true, value: expect.objectContaining({ name: "金萬餐廳", placeId: "ChIJ123" }) }),
    );
    expect(parseGoogleMapsUrl("https://maps.google.com/maps?q=x&data_id=abc&data_cid=123")).toEqual(
      expect.objectContaining({ ok: true, value: expect.objectContaining({ dataId: "abc", dataCid: "123" }) }),
    );
  });

  it("accepts coordinates without an identity", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/@25.033,121.5654,12z")).toEqual(
      expect.objectContaining({ ok: true, value: expect.objectContaining({ latitude: 25.033, longitude: 121.5654, zoom: 12 }) }),
    );
  });

  it("rejects non-Google and malformed Maps URLs safely", () => {
    expect(parseGoogleMapsUrl("https://example.com/maps/place/Test")).toEqual({ ok: false, error: "INVALID_MAPS_URL" });
    expect(parseGoogleMapsUrl("not a url")).toEqual({ ok: false, error: "INVALID_MAPS_URL" });
    expect(parseGoogleMapsUrl("http://www.google.com/maps/place/Test")).toEqual({ ok: false, error: "INVALID_MAPS_URL" });
  });
});

describe("Google Maps short-link resolution", () => {
  it("resolves a validated Google redirect chain without reading response bodies", async () => {
    const body = vi.fn();
    const fetcher = vi.fn(async (url: string) => url.includes("maps.app.goo.gl")
      ? { status: 302, headers: new Headers({ location: KAM_MAN_URL }), text: body }
      : { status: 200, headers: new Headers(), text: body });

    await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher, lookup: publicLookup }))
      .resolves.toEqual(parseGoogleMapsUrl(KAM_MAN_URL));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(body).not.toHaveBeenCalled();
  });

  it("rejects redirect overflow, downgrade, and non-Google targets", async () => {
    const loop = vi.fn(async () => ({ status: 302, headers: new Headers({ location: "https://maps.app.goo.gl/again" }) }));
    await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher: loop, lookup: publicLookup, maxRedirects: 1 }))
      .resolves.toEqual({ ok: false, error: "INVALID_MAPS_URL" });

    for (const location of ["http://www.google.com/maps/place/Test", "https://example.com/maps/place/Test"]) {
      const fetcher = vi.fn(async () => ({ status: 302, headers: new Headers({ location }) }));
      await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher, lookup: publicLookup }))
        .resolves.toEqual({ ok: false, error: "INVALID_MAPS_URL" });
    }
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
  ])("rejects non-public destination %s", async (address) => {
    const lookup = vi.fn(async () => [{ address, family: address.includes(":") ? 6 : 4 }]);
    const fetcher = vi.fn();
    await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher, lookup }))
      .resolves.toEqual({ ok: false, error: "INVALID_MAPS_URL" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects mixed public/private DNS answers to resist rebinding", async () => {
    const lookup = vi.fn(async () => [
      { address: "142.250.72.36", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const fetcher = vi.fn();
    await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher, lookup }))
      .resolves.toEqual({ ok: false, error: "INVALID_MAPS_URL" });
  });

  it("passes an eight-second abort signal to fetch", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("timed out", "AbortError");
    });
    await expect(resolveGoogleMapsUrl("https://maps.app.goo.gl/abc", { fetcher, lookup: publicLookup }))
      .resolves.toEqual({ ok: false, error: "INVALID_MAPS_URL" });
  });
});
