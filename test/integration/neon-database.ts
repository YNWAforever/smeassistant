import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";

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
  let relay: ReturnType<typeof createServer> | undefined;
  const sockets=new Set<Socket>();
  const children=new Set<ChildProcess>();
  const stop = () => {
    assertOwnedPostgresFixture(identity);
    for(const socket of sockets)socket.destroy();
    for(const child of children){child.stdin?.end();child.kill();}
    relay?.close();relay=undefined;
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
    containerId = run(["run", "--pull=never", "-d", "--name", containerName, "--label", `${OWNERSHIP_LABEL}=neon-postgres`, "--label", `${DATABASE_LABEL}=${databaseName}`, "-e", "POSTGRES_PASSWORD=postgres", "-e", `POSTGRES_DB=${databaseName}`, "--network", "none", PG_IMAGE]);
    await waitForPostgres(containerName, databaseName);
    // Docker Desktop cannot publish ports from an internal-only network.
    // Carry the PostgreSQL byte stream over owned Docker exec pipes instead:
    // the DB has network=none; only this explicit host loopback listener exists.
    relay=createServer(socket=>{
      sockets.add(socket);
      const relayProgram = `use IO::Socket::INET; use IO::Select;
        my $socket=IO::Socket::INET->new(PeerAddr=>"127.0.0.1",PeerPort=>5432,Proto=>"tcp") or die "local_socket_failed";
        binmode STDIN; binmode STDOUT; binmode $socket;
        my $select=IO::Select->new(\*STDIN,$socket);
        while(1){for my $source($select->can_read){my $bytes=sysread($source,my $buffer,65536); exit unless defined($bytes) && $bytes;
          my $target=fileno($source)==fileno(STDIN)?$socket:\*STDOUT;
          while(length($buffer)){my $written=syswrite($target,$buffer);exit unless defined($written) && $written;substr($buffer,0,$written,"");}
        }}`;
      const child=spawn("docker",["exec","-i",containerName,"perl","-e",relayProgram],{stdio:["pipe","pipe","ignore"],windowsHide:true});
      children.add(child);socket.pipe(child.stdin!);child.stdout!.pipe(socket);
      child.stdin!.on("error",()=>socket.destroy());child.on("error",()=>socket.destroy());
      child.once("exit",()=>{children.delete(child);socket.destroy();});
      socket.once("close",()=>{
        sockets.delete(socket);
        // EOF must reach Docker's attached stdin before its CLI exits. Killing
        // the CLI here can strand the remote shell/PG transaction and its locks.
        child.stdin?.end();
      });
      socket.on("error",()=>socket.destroy());
    });
    await new Promise<void>((resolve,reject)=>{relay!.once("error",reject);relay!.listen(port,"127.0.0.1",resolve);});
    return { databaseUrl, databaseName, containerName, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
