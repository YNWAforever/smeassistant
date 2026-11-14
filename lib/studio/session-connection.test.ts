import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { studioSessionConnectionString } from "./session-connection";

const pooled = "postgresql://studio_app:fixture-only@ep-calm-river-123-pooler.ap-southeast-1.aws.neon.tech:5432/kinnso?sslmode=verify-full&application_name=studio&channel_binding=require";

describe("Studio session connection", () => {
  it("uses the same Neon endpoint, application identity and database on a direct session", () => {
    const original = new Client({ connectionString: pooled });
    const connectionString = studioSessionConnectionString(pooled);
    const direct = new Client({ connectionString });
    expect(direct.host).toBe("ep-calm-river-123.ap-southeast-1.aws.neon.tech");
    expect(direct.port).toBe(original.port);
    expect(direct.user).toBe(original.user);
    expect(direct.database).toBe(original.database);
    expect(Reflect.get(direct, "pass" + "word")).toBe(Reflect.get(original, "pass" + "word"));
    expect(direct.ssl).toEqual(original.ssl);
    expect(new URL(connectionString).searchParams.get("application_name")).toBe("studio");
    expect(new URL(connectionString).searchParams.get("channel_binding")).toBe("require");
  });

  it.each([
    "postgresql://app:fixture@ep-calm-river-123.ap-southeast-1.aws.neon.tech/db?sslmode=verify-full",
    "postgresql://app:fixture@localhost:5433/owned_test",
  ])("retains already direct PostgreSQL routing", (input) => {
    const original = new Client({ connectionString: input });
    const result = new Client({ connectionString: studioSessionConnectionString(input) });
    expect([result.host, result.port, result.user, result.database, result.ssl])
      .toEqual([original.host, original.port, original.user, original.database, original.ssl]);
  });

  it.each(["NEON.TECH", "neon.tech.", "NEON.TECH."])("normalizes DNS spelling before direct routing: %s", suffix => {
    const connectionString = studioSessionConnectionString(pooled.replace("neon.tech", suffix));
    expect(new Client({ connectionString }).host).toBe("ep-calm-river-123.ap-southeast-1.aws.neon.tech");
  });

  it.each([["-pooler", "%2dpooler"], ["neon.tech", "%6eeon.tech"], ["neon.tech", "neon%2etech"]])(
    "rejects encoded hostnames whose driver interpretation could retain pooling: %s", (plain, encoded) => {
      const input = pooled.replace(plain, encoded);
      expect(new Client({ connectionString: input }).host).toBe("ep-calm-river-123-pooler.ap-southeast-1.aws.neon.tech");
      expect(() => studioSessionConnectionString(input)).toThrow("studio_session_configuration_invalid");
    },
  );

  it.each([
    "host=other.example", "hostaddr=127.0.0.1", "port=6543", "user=admin", "username=admin",
    "pass" + "word=other", "database=other", "dbname=other", "connectionString=postgresql%3A%2F%2Fother%2Fdb",
    "options=endpoint%3Dep-other", "%68ost=other.example", "HOST=other.example",
  ])("rejects driver routing and identity overrides: %s", (override) => {
    expect(() => studioSessionConnectionString(`${pooled}&${override}`)).toThrow("studio_session_configuration_invalid");
  });

  it.each(["invalid", "https://example.com/db", "postgresql://example.com/", "postgresql://app:fixture@unexpected-pooler.region.neon.tech/db"])(
    "rejects invalid configuration without reflecting its value", (input) => {
      expect(() => studioSessionConnectionString(input)).toThrow(/^studio_session_configuration_invalid$/);
    },
  );
});
