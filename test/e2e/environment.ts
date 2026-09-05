import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as netServer } from "node:net";
import { migrationFiles } from "../integration/schema";
import { isolatedEnv, listen, roleToken } from "./safety";
import { startLlmServer } from "./llm-server";

export interface AcceptanceEnvironment { app: string; api: string; mail: string; llm: string; service: string; anon: string; db: string; stop(): Promise<void> }
function docker(args: string[], input?: string) { return execFileSync("docker", args, { input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "pipe"], timeout: 120000 }).trim(); }
export function sql(db: string, query: string): string {
  if (!/^sme-accept-[a-f0-9-]+-db$/.test(db)) throw new Error("Refusing SQL outside owned acceptance database");
  return docker(["exec", "-i", db, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], query);
}
async function port(): Promise<number> { const s = netServer(); await new Promise<void>((r) => s.listen(0, "127.0.0.1", r)); const p = (s.address() as { port: number }).port; await new Promise<void>((r) => s.close(() => r())); return p; }
async function healthy(url: string, child?: ChildProcess) {
  for (let i = 0; i < 120; i++) { if (child?.exitCode != null) throw new Error("Acceptance Next process exited before readiness"); try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`Acceptance service not healthy: ${new URL(url).origin}`);
}
export async function startEnvironment(): Promise<AcceptanceEnvironment> {
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) if (existsSync(file)) throw new Error(`Acceptance refuses ${file}; use a clean checkout so Next cannot load shared credentials`);
  try { docker(["info"]); } catch { throw new Error("Acceptance requires a running Docker Linux engine. No tests were run or skipped."); }
  const name = `sme-accept-${randomUUID()}`;
  const names: string[] = []; let next: ChildProcess | undefined; let gateway: ReturnType<typeof createServer> | undefined;
  let llm: Awaited<ReturnType<typeof startLlmServer>> | undefined;
  let networkCreated = false;
  const stop = async () => {
    if (next && next.exitCode === null) { if (process.platform === "win32" && next.pid) { try { execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {} } else if (next.pid) { try { process.kill(-next.pid, "SIGTERM"); } catch { next.kill(); } } await Promise.race([new Promise<void>((r) => next!.once("exit", () => r())), new Promise<void>((r) => setTimeout(r, 5000))]); if (next.exitCode === null && next.signalCode === null && next.pid) { if (process.platform !== "win32") { try { process.kill(-next.pid, "SIGKILL"); } catch {} } await Promise.race([new Promise<void>((r) => next!.once("exit", () => r())), new Promise<void>((r) => setTimeout(r, 1000))]); } }
    if (gateway) { gateway.closeAllConnections(); await new Promise<void>((r) => gateway!.close(() => r())); }
    await llm?.stop();
    for (const container of names.reverse()) { try { docker(["rm", "-f", container]); } catch {} }
    if (networkCreated) { try { docker(["network", "rm", name]); } catch {} }
    if (next && next.exitCode === null && next.signalCode === null) throw new Error("Acceptance cleanup could not confirm owned Next process exit");
  };
  try {
    docker(["network", "create", name]); networkCreated = true;
    const start = (suffix: string, image: string, args: string[]) => { const container = `${name}-${suffix}`; names.push(container); docker(["run", "-d", "--name", container, "--network", name, ...args, image]); return container; };
    const db = start("db", "postgres:16", ["-e", "POSTGRES_PASSWORD=postgres"]);
    let ready = false;
    for (let i = 0; i < 60; i++) { try { docker(["exec", db, "pg_isready", "-U", "postgres"]); ready = true; break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
    if (!ready) throw new Error("Acceptance Postgres startup failed");
    sql(db, `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant anon, authenticated, service_role to postgres; create schema auth; create schema extensions; create extension pgcrypto with schema extensions; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);`);
    const appPort = await port(), apiPort = await port(), authPort = await port(), mailPort = await port();
    const app = `http://localhost:${appPort}`, auth = `http://127.0.0.1:${authPort}`, mail = `http://127.0.0.1:${mailPort}`;
    const inbox = start("mail", "axllent/mailpit:v1.20.5", ["-p", `127.0.0.1:${mailPort}:8025`]);
    await healthy(`${mail}/livez`);
    const secret = randomBytes(32).toString("hex"), anon = roleToken(secret, "anon"), service = roleToken(secret, "service_role");
    const rawRest = `http://127.0.0.1:${apiPort}`;
    gateway = createServer(async (req, res) => {
      try {
        const prefix = req.url?.startsWith("/auth/v1/") ? "/auth/v1" : req.url?.startsWith("/rest/v1/") ? "/rest/v1" : null;
        if (!prefix) { res.writeHead(404).end(); return; }
        const target = prefix === "/auth/v1" ? auth : rawRest;
        const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value && !["host", "connection", "content-length", "transfer-encoding"].includes(key)) headers.set(key, Array.isArray(value) ? value.join(",") : value);
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const response = await fetch(`${target}${req.url!.slice(prefix.length)}`, { method: req.method, headers, redirect: "manual", body: chunks.length ? Buffer.concat(chunks) : undefined });
        const outgoing = Object.fromEntries(response.headers); delete outgoing["content-encoding"]; delete outgoing["content-length"]; delete outgoing["transfer-encoding"];
        res.writeHead(response.status, outgoing); res.end(Buffer.from(await response.arrayBuffer()));
      } catch { res.writeHead(502).end("Local gateway unavailable"); }
    });
    const api = await listen(gateway);
    const authEnv: Record<string, string> = { GOTRUE_API_HOST: "0.0.0.0", GOTRUE_API_PORT: "9999", API_EXTERNAL_URL: api, GOTRUE_DB_DRIVER: "postgres", GOTRUE_DB_DATABASE_URL: `postgres://postgres:postgres@${db}:5432/postgres?search_path=auth`, GOTRUE_SITE_URL: app, GOTRUE_URI_ALLOW_LIST: `${app}/**`, GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_AUD: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role", GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_MAILER_AUTOCONFIRM: "false", GOTRUE_MAILER_OTP_EXP: "3600", GOTRUE_SMTP_HOST: inbox, GOTRUE_SMTP_PORT: "1025", GOTRUE_SMTP_ADMIN_EMAIL: "auth@acceptance.test", GOTRUE_SMTP_SENDER_NAME: "Acceptance", GOTRUE_SMTP_MAX_FREQUENCY: "1s", GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000", GOTRUE_MAILER_URLPATHS_CONFIRMATION: "/auth/v1/verify", GOTRUE_MAILER_URLPATHS_INVITE: "/auth/v1/verify", GOTRUE_MAILER_URLPATHS_RECOVERY: "/auth/v1/verify", GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: "/auth/v1/verify" };
    start("auth", "supabase/gotrue:v2.189.0", ["-p", `127.0.0.1:${authPort}:9999`, ...Object.entries(authEnv).flatMap(([k, v]) => ["-e", `${k}=${v}`])]);
    await healthy(`${auth}/health`);
    for (const file of migrationFiles()) sql(db, readFileSync(`supabase/migrations/${file}`, "utf8"));
    sql(db, "grant usage on schema public to anon, authenticated, service_role;");
    start("rest", "postgrest/postgrest:v12.2.3", ["-p", `127.0.0.1:${apiPort}:3000`, "-e", `PGRST_DB_URI=postgres://postgres:postgres@${db}:5432/postgres`, "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", "-e", `PGRST_JWT_SECRET=${secret}`]);
    await healthy(rawRest);
    llm = await startLlmServer();
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], { env: isolatedEnv({ app, api, llm: llm.url, anon, service }), stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" });
    await healthy(`${app}/en/owner/sign-in`, next);
    return { app, api, mail, llm: llm.url, anon, service, db, stop };
  } catch (error) { await stop(); throw error; }
}
