import { Pool } from "pg";
import { startNeonDatabaseFixture } from "../../test/integration/neon-database";
import { applyMigrations } from "./migrations";
import { verifyCatalog } from "./catalog";

// Always creates and destroys its own labeled loopback fixture. Ambient URLs are ignored.
const fixture = await startNeonDatabaseFixture("test");
const owner = new Pool({ connectionString: fixture.databaseUrl });
try {
  await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
  const applied = await applyMigrations(owner);
  const catalog = await verifyCatalog(owner);
  const replay = await applyMigrations(owner);
  console.log(JSON.stringify({ applied, replay, ...catalog }, null, 2));
} finally { await owner.end(); fixture.stop(); }
