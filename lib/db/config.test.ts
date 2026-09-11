import { afterEach, describe, expect, it, vi } from "vitest";

import { readDatabaseConfig } from "./config";

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

  it("rejects a secure application URL paired with an insecure migration URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      readDatabaseConfig({
        DATABASE_URL: "postgresql://app:password@db.example/app?sslmode=require",
        DATABASE_URL_UNPOOLED: "postgresql://owner:password@db.example/app",
      }),
    ).toThrow("database_configuration_insecure");
  });
});
