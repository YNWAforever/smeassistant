import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readDatabaseConfig } from "./config";

// Exercise the pinned driver's effective TLS options without opening a socket.
const require = createRequire(import.meta.url);
const ConnectionParameters = require("pg/lib/connection-parameters") as new (url: string) => {
  ssl: boolean | { rejectUnauthorized?: boolean; checkServerIdentity?: unknown };
};

afterEach(() => vi.unstubAllEnvs());

describe("readDatabaseConfig", () => {
  it.each([{}, { DATABASE_URL: "" }, { DATABASE_URL: " " }])(
    "rejects an absent or blank application URL",
    (env) => {
      expect(() => readDatabaseConfig(env)).toThrow("database_configuration_missing");
    },
  );

  it.each([
    "https://invalid.example",
    "postgresql://",
    "postgres://user:secret@",
  ])("rejects malformed or non-PostgreSQL URLs without exposing them", (databaseUrl) => {
    let thrown: unknown;
    try {
      readDatabaseConfig({ DATABASE_URL: databaseUrl });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("database_configuration_invalid");
    expect((thrown as Error).message).not.toContain(databaseUrl);
    expect((thrown as Error).message).not.toContain("secret");
  });

  it("keeps the pooled application URL separate from the optional migration URL", () => {
    expect(
      readDatabaseConfig({
        DATABASE_URL: "postgresql://app:password@db.example/app",
        DATABASE_URL_UNPOOLED: "postgresql://owner:password@db.example/app",
      }),
    ).toEqual({
      applicationUrl: "postgresql://app:password@db.example/app",
      migrationUrl: "postgresql://owner:password@db.example/app",
    });
  });

  it("rejects an invalid optional migration URL without exposing it", () => {
    const migrationUrl = "https://owner:secret@invalid.example";
    expect(() =>
      readDatabaseConfig({
        DATABASE_URL: "postgresql://app:password@db.example/app",
        DATABASE_URL_UNPOOLED: migrationUrl,
      }),
    ).toThrow("database_configuration_invalid");

    try {
      readDatabaseConfig({
        DATABASE_URL: "postgresql://app:password@db.example/app",
        DATABASE_URL_UNPOOLED: migrationUrl,
      });
    } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain(migrationUrl);
    }
  });

  it("allows an application URL with no sslmode outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(() => readDatabaseConfig({ DATABASE_URL: "postgresql://app:password@db.example/app" })).not.toThrow();
  });

  it.each(["require", "verify-ca", "verify-full"])(
    "accepts sslmode=%s on both URLs in production",
    (sslmode) => {
      vi.stubEnv("NODE_ENV", "production");
      expect(() =>
        readDatabaseConfig({
          DATABASE_URL: `postgresql://app:password@db.example/app?sslmode=${sslmode}`,
          DATABASE_URL_UNPOOLED: `postgresql://owner:password@db.example/app?sslmode=${sslmode}`,
        }),
      ).not.toThrow();
    },
  );

  it("rejects an application URL with no sslmode in production, without exposing it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const databaseUrl = "postgresql://app:password@db.example/app";
    expect(() => readDatabaseConfig({ DATABASE_URL: databaseUrl })).toThrow("database_configuration_insecure");
    try {
      readDatabaseConfig({ DATABASE_URL: databaseUrl });
    } catch (error) {
      expect(String(error)).not.toContain(databaseUrl);
      expect(String(error)).not.toContain("password");
    }
  });

  it.each(["disable", "allow", "prefer"])("rejects a weak sslmode=%s in production", (sslmode) => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => readDatabaseConfig({ DATABASE_URL: `postgresql://app:password@db.example/app?sslmode=${sslmode}` })).toThrow(
      "database_configuration_insecure",
    );
  });

  it.each(["require", "verify-ca"])("spells sslmode=%s as the verify-full pg already applies, keeping other parameters", (sslmode) => {
    vi.stubEnv("NODE_ENV", "production");
    const config = readDatabaseConfig({
      DATABASE_URL: `postgresql://app:password@db.example/app?sslmode=${sslmode}&channel_binding=require`,
      DATABASE_URL_UNPOOLED: `postgresql://owner:password@db.example/app?sslmode=${sslmode}`,
    });
    expect(config.applicationUrl).toBe("postgresql://app:password@db.example/app?sslmode=verify-full&channel_binding=require");
    expect(config.migrationUrl).toBe("postgresql://owner:password@db.example/app?sslmode=verify-full");
  });

  it("leaves an explicit libpq-compatible sslmode untouched", () => {
    const url = "postgresql://app:password@db.example/app?uselibpqcompat=true&sslmode=require";
    expect(readDatabaseConfig({ DATABASE_URL: url }).applicationUrl).toBe(url);
  });

  it("rejects a secure application URL paired with an insecure migration URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      readDatabaseConfig({
        DATABASE_URL: "postgresql://app:password@db.example/app?sslmode=require",
        DATABASE_URL_UNPOOLED: "postgresql://owner:password@db.example/app",
      }),
    ).toThrow("database_configuration_insecure");
  });

  describe("effective production transport", () => {
    const secureUrl = "postgresql://app:synthetic@db.example/app?sslmode=verify-full";
    const nested = encodeURIComponent("postgresql://app:synthetic@db.example/app?sslmode=disable");
    const insecureQueries = [
      "sslmode=verify-full&sslmode=disable",
      "sslmode=verify-full&%73slmode=no-verify",
      "sslmode=verify-full&sslmode=verify-full",
      "sslmode=require&uselibpqcompat=true",
      "sslmode=verify-ca&uselibpqcompat=true",
      "sslmode=require&uselibpqcompat=false&uselibpqcompat=true",
      `sslmode=verify-full&connectionString=${nested}`,
      `sslmode=verify-full&%63onnectionString=${nested}`,
    ];

    it.each(insecureQueries)("rejects app and migration TLS overrides: %s", query => {
      vi.stubEnv("NODE_ENV", "production");
      const unsafeUrl = `postgresql://app:synthetic@db.example/app?${query}`;
      for (const env of [
        { DATABASE_URL: unsafeUrl },
        { DATABASE_URL: secureUrl, DATABASE_URL_UNPOOLED: unsafeUrl },
      ]) {
        expect(() => readDatabaseConfig(env)).toThrow("database_configuration_insecure");
      }
    });

    it.each([
      "sslmode=require&channel_binding=require",
      "%73slmode=%72equire&channel_binding=require",
      "sslmode=verify-ca&uselibpqcompat=false",
      "sslmode=verify-full&uselibpqcompat=true",
      "ssl%6dode=verify-full&x=%zz",
      "ssl%6dode=verify-full&x=two words",
    ])("retains certificate and hostname verification with %s", query => {
      vi.stubEnv("NODE_ENV", "production");
      const url = `postgresql://app:synthetic@db.example/app?${query}`;
      const config = readDatabaseConfig({ DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
      for (const connectionUrl of [config.applicationUrl, config.migrationUrl!]) {
        expect(new URL(connectionUrl).searchParams.get("sslmode")).toBe("verify-full");
        const { ssl } = new ConnectionParameters(connectionUrl);
        expect(ssl).toBeTruthy();
        expect(ssl).not.toBe(false);
        expect(ssl).not.toHaveProperty("rejectUnauthorized", false);
        expect(ssl).not.toHaveProperty("checkServerIdentity");
      }
    });

    it("preserves plaintext disposable local fixtures outside production", () => {
      vi.stubEnv("NODE_ENV", "test");
      const config = readDatabaseConfig({ DATABASE_URL: "postgresql://fixture:synthetic@127.0.0.1/fixture?sslmode=disable" });
      expect(new ConnectionParameters(config.applicationUrl).ssl).toBe(false);
    });
  });
});
