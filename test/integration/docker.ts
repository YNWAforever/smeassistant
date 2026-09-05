import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface IntegrationContainers {
  postgrestUrl: string;
  postgresUri: string;
  stop: () => void;
}

const PG_IMAGE = "postgres:16";
const PGRST_IMAGE = "postgrest/postgrest:v12.2.3";
const NETWORK = "sme-scanner-integration";

function run(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function dockerAvailable(): boolean {
  try {
    run(["info"]);
    return true;
  } catch {
    return false;
  }
}

/** Ask the OS for a free port so parallel runs and local dev servers never collide. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        reject(new Error("could not resolve an ephemeral port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      run(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("postgres did not become ready within 30s");
}

async function waitForPostgrest(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      // Any HTTP response (even 404 for an unknown table) means the server is
      // accepting connections, which is all this needs to confirm.
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("postgrest did not become ready within 30s");
}

const REST_PREFIX = "/rest/v1";

/**
 * `createClient(url, key)` hardcodes every REST request under `${url}/rest/v1`
 * (see `SupabaseClient`'s `this.rest = new PostgrestClient(new URL("rest/v1",
 * baseUrl)...)`) — that prefix is normally stripped by the Kong gateway that
 * fronts PostgREST in a real Supabase stack. Bare PostgREST serves its API at
 * `/`, so `supabase.from(...)` against a raw container 404s on `/rest/v1/<table>`
 * with an empty body, which postgrest-js then reports as `error: {}` — no
 * message, because there was no PostgREST response to parse. This tiny
 * in-process proxy strips the prefix so the real `supabaseServer()` client
 * works completely unmodified, matching Task 1's premise.
 */
function startRestProxy(targetBaseUrl: string, port: number): Promise<{ url: string; stop: () => void }> {
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const incomingUrl = req.url ?? "/";
      const rewrittenPath = incomingUrl === REST_PREFIX
        ? "/"
        : incomingUrl.startsWith(`${REST_PREFIX}/`) || incomingUrl.startsWith(`${REST_PREFIX}?`)
          ? incomingUrl.slice(REST_PREFIX.length)
          : incomingUrl;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        // These describe the inbound connection, not the proxied one; letting
        // them through would send a stale content-length or the wrong host.
        if (["host", "connection", "content-length", "transfer-encoding"].includes(key.toLowerCase())) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }

      const method = req.method ?? "GET";
      let body: Buffer | undefined;
      if (method !== "GET" && method !== "HEAD") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        body = Buffer.concat(chunks);
      }

      const upstream = await fetch(`${targetBaseUrl}${rewrittenPath}`, {
        method,
        headers,
        body: body as BodyInit | undefined,
      });
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      res.writeHead(upstream.status, responseHeaders);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
    }
  };

  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      void handler(req, res);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${port}`, stop: () => server.close() });
    });
  });
}

export async function startContainers(jwtSecret: string): Promise<IntegrationContainers> {
  const suffix = process.pid.toString(36);
  const dbName = `sme-it-db-${suffix}`;
  const apiName = `sme-it-api-${suffix}`;
  const network = `${NETWORK}-${suffix}`;
  const pgPort = await freePort();
  const apiPort = await freePort();
  const proxyPort = await freePort();

  let proxy: { url: string; stop: () => void } | undefined;
  const stop = () => {
    proxy?.stop();
    for (const args of [["rm", "-f", apiName], ["rm", "-f", dbName], ["network", "rm", network]]) {
      try {
        run(args);
      } catch {
        // Best-effort teardown: a container that never started is not an error.
      }
    }
  };

  try {
    run(["network", "create", network]);
    run([
      "run", "-d", "--name", dbName, "--network", network,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-p", `127.0.0.1:${pgPort}:5432`, PG_IMAGE,
    ]);
    await waitForPostgres(dbName);
    run([
      "run", "-d", "--name", apiName, "--network", network,
      "-e", `PGRST_DB_URI=postgres://postgres:postgres@${dbName}:5432/postgres`,
      "-e", "PGRST_DB_SCHEMAS=public",
      "-e", "PGRST_DB_ANON_ROLE=anon",
      "-e", `PGRST_JWT_SECRET=${jwtSecret}`,
      "-p", `127.0.0.1:${apiPort}:3000`, PGRST_IMAGE,
    ]);
    const rawPostgrestUrl = `http://127.0.0.1:${apiPort}`;
    await waitForPostgrest(rawPostgrestUrl);
    proxy = await startRestProxy(rawPostgrestUrl, proxyPort);
    return {
      postgrestUrl: proxy.url,
      postgresUri: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`,
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

/** Run SQL inside the database container, so no local psql is required. */
export function execSql(containerSuffix: string, sql: string): void {
  execFileSync("docker", ["exec", "-i", `sme-it-db-${containerSuffix}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}
