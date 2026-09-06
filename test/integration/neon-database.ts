import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

const PG_IMAGE = "postgres:16";
const OWNERSHIP_LABEL = "com.sme-scanner.integration";
const DATABASE_LABEL = "com.sme-scanner.integration.database";
const DATABASE_PREFIX = "sme_neon_it_";

export interface OwnedPostgresFixtureIdentity {
  databaseUrl: string;
  databaseName: string;
  containerLabels: Record<string, string>;
  nodeEnv: string | undefined;
}

export interface InspectedPostgresContainer {
  id: string;
  labels: Record<string, string>;
}

export interface NeonDatabaseFixture {
  databaseUrl: string;
  databaseName: string;
  containerName: string;
  stop: () => void;
}

function run(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        reject(new Error("could_not_allocate_fixture_port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForPostgres(containerName: string, databaseName: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      // The image initialization server accepts sockets before the final TCP server starts.
      run(["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", databaseName]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("postgres_fixture_not_ready");
}

export function assertOwnedPostgresFixture(identity: OwnedPostgresFixtureIdentity): void {
  try {
    const url = new URL(identity.databaseUrl);
    const urlDatabase = decodeURIComponent(url.pathname.slice(1));
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
    const owned = identity.containerLabels[OWNERSHIP_LABEL] === "neon-postgres";
    const labeledDatabase = identity.containerLabels[DATABASE_LABEL] === identity.databaseName;
    const explicitTestDatabase = identity.databaseName.startsWith(DATABASE_PREFIX) && urlDatabase === identity.databaseName;
    if (identity.nodeEnv !== "test" || !loopback || !owned || !labeledDatabase || !explicitTestDatabase) throw new Error("unsafe");
  } catch {
    throw new Error("unsafe_postgres_fixture");
  }
}

export function assertOwnedPostgresContainer(
  expectedContainerId: string,
  actual: InspectedPostgresContainer,
  identity: OwnedPostgresFixtureIdentity,
): void {
  try {
    assertOwnedPostgresFixture(identity);
    const owned = actual.labels[OWNERSHIP_LABEL] === identity.containerLabels[OWNERSHIP_LABEL];
    const sameDatabase = actual.labels[DATABASE_LABEL] === identity.databaseName;
    if (actual.id !== expectedContainerId || !owned || !sameDatabase) throw new Error("unsafe");
  } catch {
    throw new Error("unsafe_postgres_container");
  }
}

export async function startNeonDatabaseFixture(nodeEnv = process.env.NODE_ENV): Promise<NeonDatabaseFixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseName = `${DATABASE_PREFIX}${suffix}`;
  const containerName = `sme-neon-it-db-${suffix}`;
  const port = await freePort();
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`;
  const containerLabels = { [OWNERSHIP_LABEL]: "neon-postgres", [DATABASE_LABEL]: databaseName };
  const identity = { databaseUrl, databaseName, containerLabels, nodeEnv };
  assertOwnedPostgresFixture(identity);

  let containerId: string | undefined;
  const stop = () => {
    assertOwnedPostgresFixture(identity);
    if (!containerId) return;
    const inspect = JSON.parse(run(["inspect", containerName])) as Array<{
      Id?: unknown;
      Config?: { Labels?: unknown };
    }>;
    const actual = inspect[0];
    const inspectedContainer = {
      id: typeof actual?.Id === "string" ? actual.Id : "",
      labels: actual?.Config?.Labels && typeof actual.Config.Labels === "object"
        ? actual.Config.Labels as Record<string, string>
        : {},
    };
    assertOwnedPostgresContainer(containerId, inspectedContainer, identity);
    run(["rm", "-f", containerId]);
    containerId = undefined;
  };

  try {
    containerId = run(["run", "-d", "--name", containerName, "--label", `${OWNERSHIP_LABEL}=neon-postgres`, "--label", `${DATABASE_LABEL}=${databaseName}`, "-e", "POSTGRES_PASSWORD=postgres", "-e", `POSTGRES_DB=${databaseName}`, "-p", `127.0.0.1:${port}:5432`, PG_IMAGE]);
    await waitForPostgres(containerName, databaseName);
    return { databaseUrl, databaseName, containerName, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
