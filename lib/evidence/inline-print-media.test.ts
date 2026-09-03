// apps/web/lib/evidence/inline-print-media.test.ts
import { describe, expect, it, vi } from "vitest";
import { inlinePrintMedia } from "./inline-print-media";

// `server-only` throws when imported outside a Server Component, which includes
// the Vitest node environment. Same stub as load-authorized.test.ts.
vi.mock("server-only", () => ({}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageResponse(bytes: Uint8Array<ArrayBuffer>, contentType = "image/png"): Response {
  return new Response(bytes, { status: 200, headers: { "content-type": contentType } });
}

describe("inlinePrintMedia", () => {
  it("returns a data URI keyed by evidence id", async () => {
    const fetcher = vi.fn(async () => imageResponse(PNG));
    const result = await inlinePrintMedia(
      [{ id: "e1", mediaUrl: "https://project.supabase.co/storage/v1/object/sign/report-evidence/a.png?token=t" }],
      fetcher as unknown as typeof fetch,
    );
    expect(result.e1).toBe(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  });

  it("skips an item with no media URL without fetching", async () => {
    const fetcher = vi.fn();
    const result = await inlinePrintMedia([{ id: "e1", mediaUrl: null }], fetcher as unknown as typeof fetch);
    expect(result).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips a non-OK response", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 403 }));
    const result = await inlinePrintMedia([{ id: "e1", mediaUrl: "https://s.example/a.png" }], fetcher as unknown as typeof fetch);
    expect(result).toEqual({});
  });

  it("skips a disallowed content type", async () => {
    const fetcher = vi.fn(async () => imageResponse(PNG, "image/svg+xml"));
    const result = await inlinePrintMedia([{ id: "e1", mediaUrl: "https://s.example/a.svg" }], fetcher as unknown as typeof fetch);
    expect(result).toEqual({});
  });

  it("skips a payload over the size cap", async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
    const fetcher = vi.fn(async () => imageResponse(oversized));
    const result = await inlinePrintMedia([{ id: "e1", mediaUrl: "https://s.example/big.png" }], fetcher as unknown as typeof fetch);
    expect(result).toEqual({});
  });

  it("keeps the good item when a sibling throws, and never leaks the URL", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("bad")) throw new Error("https://s.example/bad.png?token=SECRET");
      return imageResponse(PNG);
    });
    const result = await inlinePrintMedia([
      { id: "bad", mediaUrl: "https://s.example/bad.png?token=SECRET" },
      { id: "good", mediaUrl: "https://s.example/good.png" },
    ], fetcher as unknown as typeof fetch);
    expect(Object.keys(result)).toEqual(["good"]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
