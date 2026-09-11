import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import {
  startNeonDatabaseFixture,
  type NeonDatabaseFixture,
} from "./neon-database";
import { applyMigrations } from "../../scripts/neon/migrations";
import { readiness } from "../../scripts/neon/readiness";
let fixture: NeonDatabaseFixture, db: Pool;
const env: Record<string, string> = {
  NEON_AUTH_BASE_URL: "https://auth.example.test/auth",
  NEON_AUTH_COOKIE_SECRET: "readiness-fixture-cookie-secret-at-least-32",
  APP_ORIGIN: "https://app.example.test",
  NEXT_PUBLIC_SITE_URL: "https://app.example.test",
  NEON_READINESS_HOST: "127.0.0.1",
};
function loginUrl(name: string, password = "fixture-only") {
  const url = new URL(fixture.databaseUrl);
  url.username = name;
  url.password = password;
  return url.href;
}
beforeAll(async () => {
  fixture = await startNeonDatabaseFixture("test");
  db = new Pool({ connectionString: fixture.databaseUrl });
  await db.query("CREATE ROLE sme_app_runtime NOLOGIN");
  await applyMigrations(db);
  await db.query(
    "CREATE ROLE readiness_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime; CREATE ROLE readiness_denied LOGIN PASSWORD 'fixture-only'; CREATE ROLE readiness_bypass LOGIN PASSWORD 'fixture-only' BYPASSRLS IN ROLE sme_app_runtime; CREATE ROLE readiness_owner NOLOGIN; GRANT readiness_owner TO readiness_login",
  );
  // Inspect the actual fixture authentication policy before enforcing password proof.
  const rules = (
    await db.query(
      "SELECT auth_method FROM pg_hba_file_rules WHERE error IS NULL",
    )
  ).rows;
  expect(rules.length).toBeGreaterThan(0);
  execFileSync("docker", [
    "exec",
    fixture.containerName,
    "sh",
    "-c",
    'printf "host all all 127.0.0.1/32 scram-sha-256\\nlocal all all trust\\n" > "$PGDATA/pg_hba.conf"',
  ]);
  await db.query("SELECT pg_reload_conf()");
  await expect(
    (async () => {
      const probe = new Pool({
        connectionString: loginUrl("readiness_login", "wrong-password"),
        connectionTimeoutMillis: 5000,
      });
      try {
        await probe.query("SELECT 1");
        return "accepted";
      } catch (error) {
        return (error as { code: string }).code;
      } finally {
        await probe.end();
      }
    })(),
  ).resolves.toBe("28P01");
  Object.assign(env, {
    DATABASE_URL: loginUrl("readiness_login"),
    DATABASE_URL_UNPOOLED: fixture.databaseUrl,
    NEON_READINESS_DATABASE: fixture.databaseName,
  });
}, 60000);
afterAll(async () => {
  await db?.end();
  fixture?.stop();
});
it("verifies an owned migrated schema without modifying its journal", async () => {
  const urls: string[] = [];
  const statements: string[] = [];
  const result = await readiness(env, async (url) => {
    urls.push(url);
    const pool = new Pool({ connectionString: url, max: 1 });
    return {
      query: async (sql, values) => {
        statements.push(sql);
        return pool.query(sql, values);
      },
      end: () => pool.end(),
    };
  });
  expect(result).toMatchObject({
    status: "ready",
    target: { database: fixture.databaseName },
  });
  expect(urls).toEqual([env.DATABASE_URL_UNPOOLED, env.DATABASE_URL]);
  expect(statements.filter((sql) => sql === "BEGIN READ ONLY")).toHaveLength(2);
  expect(statements.filter((sql) => sql === "ROLLBACK")).toHaveLength(2);
  expect(
    statements.every((sql) =>
      /^(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(sql.trim()),
    ),
  ).toBe(true);
  // Counted from the corpus rather than hardcoded: a hardcoded number went
  // stale the moment 0005 was appended, and nothing could catch it locally.
  expect(
    (await db.query("SELECT count(*)::int AS n FROM neon_migrations.journal"))
      .rows[0].n,
  ).toBe(
    readdirSync(fileURLToPath(new URL("../../neon/migrations", import.meta.url)))
      .filter((name) => name.endsWith(".sql")).length,
  );
});
it("refuses a different expected target before transport", async () =>
  expect(
    (await readiness({ ...env, NEON_READINESS_DATABASE: "other" })).category,
  ).toBe("target"));
it("rejects missing journal", async () => {
  await db.query(
    "ALTER TABLE neon_migrations.journal RENAME TO hidden_journal",
  );
  try {
    expect((await readiness(env)).category).toBe("schema");
  } finally {
    await db.query(
      "ALTER TABLE neon_migrations.hidden_journal RENAME TO journal",
    );
  }
});
it("rejects checksum mismatch", async () => {
  const checksum = (
    await db.query(
      "SELECT checksum FROM neon_migrations.journal WHERE ordinal=1",
    )
  ).rows[0].checksum;
  await db.query(
    "UPDATE neon_migrations.journal SET checksum=repeat('0',64) WHERE ordinal=1",
  );
  try {
    expect((await readiness(env)).category).toBe("schema");
  } finally {
    await db.query(
      "UPDATE neon_migrations.journal SET checksum=$1 WHERE ordinal=1",
      [checksum],
    );
  }
});
it("rejects a missing expected table", async () => {
  await db.query("ALTER TABLE public.app_users RENAME TO hidden_app_users");
  try {
    expect((await readiness(env)).category).toBe("schema");
  } finally {
    await db.query("ALTER TABLE public.hidden_app_users RENAME TO app_users");
  }
});
it("rejects a missing expected function", async () => {
  await db.query(
    "ALTER FUNCTION public.touch_actions_updated_at() RENAME TO hidden_touch",
  );
  try {
    expect((await readiness(env)).category).toBe("schema");
  } finally {
    await db.query(
      "ALTER FUNCTION public.hidden_touch() RENAME TO touch_actions_updated_at",
    );
  }
});
it("returns only sanitized categories when the listener is unavailable", async () => {
  const bad = new URL(fixture.databaseUrl);
  bad.port = "1";
  const result = await readiness({
    ...env,
    DATABASE_URL: bad.href,
    DATABASE_URL_UNPOOLED: bad.href,
  });
  expect(result.category).toBe("connection");
  expect(JSON.stringify(result)).not.toContain("postgresql:");
});

it.each(["no_such_login", "readiness_denied", "readiness_bypass"])(
  "rejects unusable or privileged app login %s",
  async (name) => {
    expect(
      (await readiness({ ...env, DATABASE_URL: loginUrl(name) })).status,
    ).toBe("not_ready");
  },
);
it("rejects invalid app password with valid direct credentials", async () => {
  expect(
    await readiness({
      ...env,
      DATABASE_URL: loginUrl("readiness_login", "wrong-password"),
    }),
  ).toMatchObject({ status: "not_ready", category: "connection" });
});
it("rejects migration owner as app credentials", async () => {
  expect(
    (await readiness({ ...env, DATABASE_URL: fixture.databaseUrl })).status,
  ).toBe("not_ready");
});
it("rejects reachable non-superuser object ownership", async () => {
  await db.query("ALTER TABLE public.app_users OWNER TO readiness_owner");
  try {
    expect((await readiness(env)).status).toBe("not_ready");
  } finally {
    await db.query("ALTER TABLE public.app_users OWNER TO postgres");
  }
});
it("rejects missing effective runtime membership", async () => {
  await db.query("REVOKE sme_app_runtime FROM readiness_login");
  try {
    expect((await readiness(env)).status).toBe("not_ready");
  } finally {
    await db.query("GRANT sme_app_runtime TO readiness_login");
  }
});

it("rejects one missing required table privilege despite runtime membership", async () => {
  await db.query("REVOKE UPDATE ON public.app_users FROM sme_app_runtime");
  try {
    expect((await readiness(env)).category).toBe("privileges");
  } finally {
    await db.query("GRANT UPDATE ON public.app_users TO sme_app_runtime");
  }
});
it("requires inherited runtime privileges rather than membership alone", async () => {
  await db.query("GRANT sme_app_runtime TO readiness_login WITH INHERIT FALSE");
  try {
    expect((await readiness(env)).category).toBe("privileges");
  } finally {
    await db.query(
      "GRANT sme_app_runtime TO readiness_login WITH INHERIT TRUE",
    );
  }
});

it("rejects a privileged session login even when its default current role is restricted", async () => {
  await db.query("ALTER ROLE readiness_bypass SET role = 'sme_app_runtime'");
  try {
    expect(
      (await readiness({ ...env, DATABASE_URL: loginUrl("readiness_bypass") }))
        .category,
    ).toBe("privileges");
  } finally {
    await db.query("ALTER ROLE readiness_bypass RESET role");
  }
});
