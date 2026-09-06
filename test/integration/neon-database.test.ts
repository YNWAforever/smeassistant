import { describe, expect, it } from "vitest";

import { assertOwnedPostgresFixture } from "./neon-database";

const ownedFixture = {
  databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54321/sme_neon_it_abc",
  databaseName: "sme_neon_it_abc",
  containerLabels: {
    "com.sme-scanner.integration": "neon-postgres",
    "com.sme-scanner.integration.database": "sme_neon_it_abc",
  },
  nodeEnv: "test",
};

describe("assertOwnedPostgresFixture", () => {
  it("accepts an owned, explicitly named loopback test database", () => {
    expect(() => assertOwnedPostgresFixture(ownedFixture)).not.toThrow();
  });

  it.each([
    ["non-test environment", { nodeEnv: "production" }],
    ["non-loopback host", { databaseUrl: "postgresql://postgres:postgres@db.example/sme_neon_it_abc" }],
    ["default database", { databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54321/postgres", databaseName: "postgres" }],
    ["mismatched database identity", { databaseName: "sme_neon_it_other" }],
    ["missing ownership label", { containerLabels: {} }],
  ])("rejects %s", (_name, changes) => {
    expect(() => assertOwnedPostgresFixture({ ...ownedFixture, ...changes })).toThrow(
      "unsafe_postgres_fixture",
    );
  });
});
