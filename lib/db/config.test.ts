import { describe, expect, it } from "vitest";

import { readDatabaseConfig } from "./config";

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
});
