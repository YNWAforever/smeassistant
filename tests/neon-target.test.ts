import { describe, expect, it } from "vitest";
import { assertDatabaseUrl, assertTarget, canonicalHost, safeName } from "../scripts/neon/target";

const message = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : "not an Error";
  }
  return "did not throw";
};

describe("canonicalHost", () => {
  it("strips -pooler from the endpoint label", () => {
    expect(canonicalHost("ep-cool-name-pooler.ap-southeast-1.aws.neon.tech")).toBe("ep-cool-name.ap-southeast-1.aws.neon.tech");
  });

  it("leaves a host without -pooler unchanged", () => {
    expect(canonicalHost("ep-cool-name.ap-southeast-1.aws.neon.tech")).toBe("ep-cool-name.ap-southeast-1.aws.neon.tech");
  });

  it("strips -pooler from the first label only", () => {
    expect(canonicalHost("ep-a.region-pooler.neon.tech")).toBe("ep-a.region-pooler.neon.tech");
    expect(canonicalHost("ep-a-pooler.region-pooler.neon.tech")).toBe("ep-a.region-pooler.neon.tech");
  });

  it("does not strip -pooler that is not at the end of the label", () => {
    expect(canonicalHost("ep-pooler-a.neon.tech")).toBe("ep-pooler-a.neon.tech");
    expect(canonicalHost("ep-a-pooler")).toBe("ep-a-pooler");
  });

  it("lowercases, because postgres: URLs keep the host's case and DNS ignores it", () => {
    expect(new URL("postgresql://u:p@EP-A-Pooler.Neon.Tech/db").hostname).toBe("EP-A-Pooler.Neon.Tech");
    expect(canonicalHost("EP-A-Pooler.Neon.Tech")).toBe("ep-a.neon.tech");
  });
});

describe("safeName", () => {
  it.each(["smeassistant", "ep-cool-name.ap-southeast-1.aws.neon.tech", "owned_test", "127.0.0.1"])("accepts %j", (name) => {
    expect(safeName(name)).toBe(true);
  });

  it.each(["", " ", "sme assistant", "db;drop", "u:p@host", "host/db", "db%20", "db'", "數據庫", "db\n"])("rejects %j", (name) => {
    expect(safeName(name)).toBe(false);
  });
});

describe("assertDatabaseUrl", () => {
  const ok = "postgresql://app:pw@ep-a.neon.tech/smeassistant";

  it.each([
    ok,
    "postgres://app:pw@ep-a.neon.tech/smeassistant",
    `${ok}?sslmode=require`,
    `${ok}?sslmode=verify-ca`,
    `${ok}?sslmode=verify-full&channel_binding=require`,
    `${ok}?channel_binding=prefer`,
  ])("accepts %s", (url) => {
    expect(() => assertDatabaseUrl(new URL(url))).not.toThrow();
  });

  it.each([
    ["another protocol", "mysql://app:pw@ep-a.neon.tech/smeassistant"],
    ["an https URL", "https://app:pw@ep-a.neon.tech/smeassistant"],
    ["no username", "postgresql://:pw@ep-a.neon.tech/smeassistant"],
    ["no password", "postgresql://app@ep-a.neon.tech/smeassistant"],
    ["no database path", "postgresql://app:pw@ep-a.neon.tech"],
    ["an empty database path", "postgresql://app:pw@ep-a.neon.tech/"],
    ["a fragment", `${ok}#x`],
    ["sslmode=disable", `${ok}?sslmode=disable`],
    ["sslmode=prefer", `${ok}?sslmode=prefer`],
    ["channel_binding=disable", `${ok}?channel_binding=disable`],
    ["an unknown parameter", `${ok}?host=elsewhere`],
    ["an unknown parameter after accepted ones", `${ok}?sslmode=require&options=-c`],
    ["no host and no credentials", "postgresql:///smeassistant"],
  ])("rejects %s as configuration", (_, url) => {
    expect(message(() => assertDatabaseUrl(new URL(url)))).toBe("configuration");
  });

  it("rejects an empty hostname even with credentials", () => {
    // WHATWG URL refuses to parse credentials without a host, so the branch is
    // exercised with a URL-shaped object.
    const url = { protocol: "postgresql:", username: "app", password: "pw", hostname: "", pathname: "/smeassistant", hash: "", searchParams: new URLSearchParams() };
    expect(message(() => assertDatabaseUrl(url as unknown as URL))).toBe("configuration");
  });
});

describe("assertTarget", () => {
  const url = (value: string) => new URL(value);
  const pooled = url("postgresql://app:pw@ep-a-pooler.neon.tech/smeassistant");
  const direct = url("postgresql://owner:pw@ep-a.neon.tech:5432/smeassistant");

  it("accepts pooled and direct URLs on one host, database and default port", () => {
    expect(() => assertTarget([pooled, direct], "ep-a.neon.tech", "smeassistant")).not.toThrow();
    expect(() => assertTarget([pooled], "ep-a-pooler.neon.tech", "smeassistant")).not.toThrow();
  });

  it("decodes the database name before comparing", () => {
    expect(() => assertTarget([url("postgresql://app:pw@ep-a.neon.tech/sme%61ssistant")], "ep-a.neon.tech", "smeassistant")).not.toThrow();
  });

  it("throws target on a host mismatch", () => {
    expect(message(() => assertTarget([pooled], "ep-b.neon.tech", "smeassistant"))).toBe("target");
  });

  it("throws target when any one URL points elsewhere", () => {
    const elsewhere = url("postgresql://owner:pw@ep-b.neon.tech/smeassistant");
    expect(message(() => assertTarget([pooled, elsewhere], "ep-a.neon.tech", "smeassistant"))).toBe("target");
  });

  it("throws target on a database mismatch", () => {
    expect(message(() => assertTarget([pooled], "ep-a.neon.tech", "other"))).toBe("target");
  });

  it("throws target when the URLs disagree on port", () => {
    const otherPort = url("postgresql://owner:pw@ep-a.neon.tech:7777/smeassistant");
    expect(message(() => assertTarget([pooled, otherPort], "ep-a.neon.tech", "smeassistant"))).toBe("target");
  });

  it("throws target for an empty URL list rather than accepting nothing", () => {
    expect(message(() => assertTarget([], "ep-a.neon.tech", "smeassistant"))).toBe("target");
  });

  it.each([
    ["an unsafe host", "ep-a.neon.tech/x", "smeassistant"],
    ["an empty host", "", "smeassistant"],
    ["an unsafe database", "ep-a.neon.tech", "sme assistant"],
    ["an empty database", "ep-a.neon.tech", ""],
  ])("throws configuration for %s, before comparing any URL", (_, host, database) => {
    expect(message(() => assertTarget([pooled], host, database))).toBe("configuration");
    expect(message(() => assertTarget([], host, database))).toBe("configuration");
  });
});
