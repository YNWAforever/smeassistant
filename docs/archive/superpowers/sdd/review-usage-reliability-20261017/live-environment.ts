import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { Pool } from "pg";
import { applyMigrations } from "../../../scripts/neon/migrations";
import { startNeonDatabaseFixture } from "../../../test/integration/neon-database";
import { isolatedEnv } from "../../../test/e2e/safety";
import { startIdentityServer } from "../../../test/e2e/identity-server";
import { reserveLoopbackPort } from "../../../test/e2e/reserved-port";
import { MODEL, directory, record, startLiveRelay } from "./live-relay";

export async function startLiveEnvironment() {
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"])
    if (existsSync(file)) throw new Error("ambient_environment_file_refused");
  const run = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim();
  if (run(["context", "show"]) !== "desktop-linux"
      || run(["context", "inspect", "desktop-linux", "--format", "{{.Endpoints.docker.Host}}"]) !== "npipe:////./pipe/dockerDesktopLinuxEngine"
      || run(["image", "inspect", "sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54", "--format", "{{.Id}}"]) !== "sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54")
    throw new Error("local_docker_identity_mismatch");
  const port = await reserveLoopbackPort();
  const db = await startNeonDatabaseFixture("test");
  const inspected = JSON.parse(run(["inspect", db.containerName]))[0];
  if (inspected.HostConfig.NetworkMode !== "none" || Object.keys(inspected.HostConfig.PortBindings ?? {}).length)
    throw new Error("fixture_network_isolation_mismatch");
  record("fixture-identity-live", { observedAt: new Date().toISOString(), containerId: inspected.Id,
    containerName: db.containerName, database: db.databaseName, labels: inspected.Config.Labels,
    image: inspected.Image, network: inspected.HostConfig.NetworkMode, publishedPorts: inspected.HostConfig.PortBindings,
    syntheticOnly: true, runtime: "local Auth/mail; real free OpenCode model through allowlisted relay" });
  const sql = (query: string) => {
    const identity = JSON.parse(run(["inspect", db.containerName]))[0];
    if (identity.Id !== inspected.Id || identity.Config.Labels["com.sme-scanner.integration.database"] !== db.databaseName)
      throw new Error("fixture_identity_drift");
    const databaseUser = new URL(db.databaseUrl).username;
    return execFileSync("docker", ["exec", "-i", db.containerName, "psql", "-U", databaseUser, "-d", db.databaseName, "-v", "ON_ERROR_STOP=1", "-Atq"],
      { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 30_000 }).trim();
  };
  let next: ChildProcess | undefined;
  let identity: Awaited<ReturnType<typeof startIdentityServer>> | undefined;
  let relay: Awaited<ReturnType<typeof startLiveRelay>> | undefined;
  const stop = async () => {
    await port.release();
    if (next?.pid && next.exitCode === null) {
      execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      await Promise.race([new Promise<void>(resolve => next!.once("exit", () => resolve())), new Promise<void>(resolve => setTimeout(resolve, 5000))]);
    }
    await identity?.stop(); await relay?.stop(); db.stop();
    record("cleanup-live", { observedAt: new Date().toISOString(), exactContainerId: inspected.Id,
      remaining: run(["ps", "-a", "--filter", `id=${inspected.Id}`, "--format", "{{.ID}}"]), stopped: true });
  };
  try {
    const owner = new Pool({ connectionString: db.databaseUrl, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
    try {
      await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
      await applyMigrations(owner);
      await owner.query("CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    } finally { await owner.end(); }
    const runtime = new URL(db.databaseUrl); runtime.username = "fixture_runtime"; Reflect.set(runtime, "pass" + "word", "fixture-only");
    const app = `http://localhost:${port.port}`, secret = randomBytes(32).toString("hex");
    identity = await startIdentityServer(app, secret); relay = await startLiveRelay();
    await port.release();
    const env = isolatedEnv({ app, api: identity.url, llm: relay.url, databaseUrl: runtime.href, identitySecret: secret });
    env.LLM_BASE_URL = `${relay.url}/opencode.ai/v1`; env.LLM_MODEL = MODEL; env.NEXT_PUBLIC_APP_URL = app;
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port.port)],
      { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const log = createWriteStream(`${directory}/live-next.log`, { flags: "a" });
    let pendingLog = "";
    const redact = (text: string) => text.replace(/([?&](?:token|code|state|secret)=)[^\s&]+/gi, "$1[REDACTED]");
    const capture = (chunk: Buffer) => {
      pendingLog += chunk.toString("utf8");
      const lines = pendingLog.split("\n"); pendingLog = lines.pop()!;
      for (const line of lines) log.write(redact(line) + "\n");
    };
    next.stdout!.on("data", capture); next.stderr!.on("data", capture);
    next.once("exit", () => log.end(redact(pendingLog)));
    let healthy = false;
    for (let index = 0; index < 120; index++) {
      if (next.exitCode !== null) throw new Error("local_app_exited");
      try { if ((await fetch(`${app}/en/owner/sign-in`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!healthy) throw new Error("local_app_not_ready");
    return { app, mail: identity.url, sql, stop, seed: (number: number, language: string, review: string) => {
      const workspaceId = randomUUID(), locationId = randomUUID(), otherLocationId = randomUUID(), actionId = randomUUID(), userId = randomUUID();
      const slug = `real-ai-uat-${number}-${workspaceId.slice(0, 8)}`, email = `owner-${workspaceId}@acceptance.test`;
      const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
      sql(`insert into app_users(id,email) values ('${userId}',${quote(email)});
        insert into auth_identities(provider,subject,user_id) values ('neon',${quote(`fixture:${email}`)},'${userId}');
        insert into workspaces(id,business_name,market,slug,tier,timezone) values ('${workspaceId}',${quote(`Synthetic UAT Merchant ${number}`)},'hk','${slug}','lite','Asia/Hong_Kong');
        insert into locations(id,workspace_id,slug,name,is_primary) values ('${locationId}','${workspaceId}','primary','Synthetic Branch A',true),('${otherLocationId}','${workspaceId}','other','Synthetic Branch B',false);
        insert into workspace_members(workspace_id,email,role,location_scope) values ('${workspaceId}',${quote(email)},'owner',null);
        insert into actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,provided_inputs) values
        ('${actionId}','${workspaceId}','${locationId}','review-response','{"en":"Reply to reviews","zh-HK":"回覆評論"}','{"en":"Synthetic UAT review; not live customer data","zh-HK":"合成驗收評論，非真實客戶資料"}','{}','high',80,'{}',10,'Live','${actionId}',${quote(JSON.stringify({ brand_voice: "warm", language, reviews_without_response: review }))}::jsonb);`);
      return { caseNumber: number, workspaceId, locationId, otherLocationId, actionId, slug, email, language, review };
    } };
  } catch (error) { await stop(); throw error; }
}
