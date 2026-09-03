import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { mintServiceRoleJwt } from "./jwt";

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("mintServiceRoleJwt", () => {
  it("produces a three-segment HS256 token carrying the service_role claim", () => {
    const token = mintServiceRoleJwt("a".repeat(32));
    const [header, payload, signature] = token.split(".");

    expect(decodeSegment(header)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodeSegment(payload)).toMatchObject({ role: "service_role" });
    expect(signature.length).toBeGreaterThan(0);
  });

  it("signs with the given secret so PostgREST can verify it", () => {
    const secret = "b".repeat(32);
    const token = mintServiceRoleJwt(secret);
    const [header, payload, signature] = token.split(".");

    const expected = createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    expect(signature).toBe(expected);
  });

  it("rejects a secret shorter than 32 bytes, which PostgREST refuses to boot on", () => {
    expect(() => mintServiceRoleJwt("tooshort")).toThrow(/32/);
  });
});
