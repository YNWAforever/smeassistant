import { afterEach, describe, expect, it } from "vitest";
import { assertLocalOrigin, isolatedEnv, roleToken } from "./safety";
describe("acceptance isolation", () => {
  it.each(["https://project.supabase.co", "http://localhost.example:3000", "http://127.0.0.1", "http://user:secret@127.0.0.1:3000", "http://127.0.0.1:3000/path", "http://127.0.0.1:3000?key=secret"]) ("rejects unsafe target %s", (url) => expect(() => assertLocalOrigin(url)).toThrow());
  it("accepts only explicit loopback origins", () => expect(assertLocalOrigin("http://127.0.0.1:1234")).toBe("http://127.0.0.1:1234"));
  it("accepts the Next local redirect hostname", () => expect(assertLocalOrigin("http://localhost:1234")).toBe("http://localhost:1234"));
  it("separates browser anon from privileged server roles", () => {
    const secret = "acceptance-only-secret-at-least-32-characters";
    const tokens = [roleToken(secret, "anon"), roleToken(secret, "service_role")];
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(tokens.map((token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role)).toEqual(["anon", "service_role"]);
  });
  const original = process.env.SERPAPI_API_KEY;
  afterEach(() => { if (original === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = original; });
  it("does not inherit paid keys or production fixture conversion", () => {
    process.env.SERPAPI_API_KEY = "must-not-escape";
    const env = isolatedEnv({ app: "http://127.0.0.1:1", api: "http://127.0.0.1:2", llm: "http://127.0.0.1:3", anon: "anon", service: "server" });
    expect(env.SERPAPI_API_KEY).toBeUndefined(); expect(env.VERCEL_ENV).toBeUndefined(); expect(env.SCAN_SOURCES).toBe("fixture"); expect(env.SCAN_FIXTURE).toBe("unavailable-ig"); expect(env.OWNER_SELF_SERVICE_CLAIM).toBeUndefined();
  });
});
