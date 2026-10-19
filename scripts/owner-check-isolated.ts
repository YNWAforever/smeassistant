/**
 * Explicitly approved one-container host. No ambient DATABASE_URL, no second
 * container on failure. "seed" retries custom setup on the retained target;
 * "run [case pattern]" reuses it; "cleanup" removes only the verified exact ID.
 * Test output is numeric/sanitized only.
 */
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { startEnvironment, type AcceptanceEnvironment } from "../test/e2e/environment";
import { seedMerchant } from "../test/e2e/seed";
import { assertOwnerCheckTarget, type FixtureInspection } from "../test/integration/owner-check-target";
import type { NeonDatabaseFixture } from "../test/integration/neon-database";
import type { OwnerCheckTarget } from "../test/integration/owner-check-contract";
import { createOwnerCheckSeedSession } from "../test/integration/owner-check-seed-session";

const safeCategory = (error: unknown) => error instanceof Error ? error.message.split("\n")[0].replace(/(?:https?|postgresql):\/\/\S+/g,"[redacted-url]").slice(0,200) : "unknown";

// A different run ID is only for a separately approved fixture; it never
// clears or replaces the previous creation marker/evidence.
const approvalRun = process.env.OWNER_CHECK_APPROVAL_RUN ?? "initial";
if (!/^[a-z0-9-]{1,40}$/.test(approvalRun)) throw new Error("invalid_approval_run");
const evidencePath = resolve(`test-results/owner-check-real-20261019${approvalRun === "initial" ? "" : `-${approvalRun}`}`);
await mkdir(evidencePath, { recursive: true });
if (existsSync(resolve(evidencePath, "creation-started.json"))) throw new Error("single_fixture_already_attempted; use the existing live host or obtain new approval");
const docker = (args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, windowsHide: true }).trim();
const baseline = docker(["ps", "-a", "--filter", "label=com.sme-scanner.integration", "--format", "{{json .}}"])
  .split("\n").filter(Boolean).map(line => { const row = JSON.parse(line); return { id: row.ID, name: row.Names, state: row.State }; });
const image = JSON.parse(docker(["image", "inspect", "postgres:16"]))[0];
await writeFile(resolve(evidencePath, "preflight.json"), JSON.stringify({ recordedAt: new Date().toISOString(), existing: baseline, imageId: image.Id }, null, 2));
let owned: NeonDatabaseFixture | undefined;
let runtimeUrl = "";
let env: AcceptanceEnvironment | undefined;
let cleaned = false;
const inspect = () => JSON.parse(docker(["inspect", owned!.containerId]))[0] as FixtureInspection;
async function cleanup() {
  if (cleaned) return;
  if (!owned && !env) return;
  const exists = owned && docker(["ps", "-aq", "--filter", `id=${owned.containerId}`]) !== "";
  if (exists && owned) assertOwnerCheckTarget(owned, inspect(), image.Id);
  if (env) await env.stop();
  else if (exists && owned) owned.stop();
  cleaned = true;
  const remaining = docker(["ps", "-a", "--filter", "label=com.sme-scanner.integration", "--format", "{{json .}}"])
    .split("\n").filter(Boolean).map(line => { const row = JSON.parse(line); return { id: row.ID, name: row.Names, state: row.State }; });
  const preserved = baseline.every(old => remaining.some(row => row.id === old.id && row.name === old.name && row.state === old.state));
  const removed = !owned || !remaining.some(row => row.id === owned!.containerId.slice(0, 12));
  await writeFile(resolve(evidencePath, "cleanup.json"), JSON.stringify({ recordedAt: new Date().toISOString(),
    removedExactContainerId: owned?.containerId, exactContainerAbsent: removed, previousResourcesPreserved: preserved,
    createdContainers: owned ? 1 : 0, storage: "tmpfs; no anonymous data volume", remaining }, null, 2));
  console.log(JSON.stringify({ phase: "CLEANUP", exactContainerAbsent: removed, previousResourcesPreserved: preserved }));
}
try {
  // Exclusive durable marker also prevents a second container if this host is
  // restarted after a failure. Retries use this live host, never a fresh DB.
  await writeFile(resolve(evidencePath, "creation-started.json"), JSON.stringify({ startedAt: new Date().toISOString(), maximumContainers: 1 }), { flag: "wx" });
  env = await startEnvironment(undefined, {
    tmpfs: true, quiet: true,
    beforeUse: async fixture => {
      owned = fixture;
      const actual = inspect();
      assertOwnerCheckTarget(fixture, actual, image.Id);
      const pool = new Pool({ connectionString: fixture.databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
      try {
        const meta = (await pool.query("SELECT current_database() AS database, current_setting('server_version_num')::int AS version, current_user AS role")).rows[0];
        if (meta.database !== fixture.databaseName || meta.version < 160000 || meta.version >= 170000) throw new Error("SQL_target_identity_mismatch");
        await writeFile(resolve(evidencePath, "target-before-migrations.json"), JSON.stringify({
          recordedAt: new Date().toISOString(), containerId: actual.Id, containerName: fixture.containerName,
          database: meta.database, version: meta.version, network: actual.HostConfig.NetworkMode,
          labels: actual.Config.Labels, imageId: actual.Image, tmpfs: actual.HostConfig.Tmpfs,
          publishedPorts: actual.NetworkSettings.Ports, host: new URL(fixture.databaseUrl).hostname,
          relayPort: new URL(fixture.databaseUrl).port, verifiedBeforeMigrationClient: true,
        }, null, 2));
      } finally { await pool.end(); }
    },
    runtimeReady: value => { runtimeUrl = value; },
  });
  if (!owned || !runtimeUrl) throw new Error("missing_owned_fixture_identity");
  assertOwnerCheckTarget(owned, inspect(), image.Id);
  const a = await seedMerchant(env, "hk"), b = await seedMerchant(env, "hk");
  const ids = Object.fromEntries(["v1", "v2", "secondAction", "secondVersion", "foreignVersion", "assetA", "assetB", "retractAction", "retractVersion", "staleVersion"].map(key => [key, randomUUID()])) as OwnerCheckTarget["ids"];
  const managerInId = randomUUID(), managerInEmail = `manager-in-${a.workspaceId}@acceptance.test`;
  const plannedTarget: OwnerCheckTarget = { app: env.app, mail: env.mail, ownerUrl: owned.databaseUrl, runtimeUrl,
    containerId: owned.containerId, containerName: owned.containerName, databaseName: owned.databaseName,
    imageId: image.Id, a, b, ids, ownerId: "", managerInId, managerInEmail, evidencePath };
  await writeFile(resolve(evidencePath, "seed-plan.json"), JSON.stringify({ workspaceA: a.workspaceId,
    workspaceB: b.workspaceId, ids, managerInId, maximumRows: 60, reservedLaterDraftRows: 1 }, null, 2));
  let seedAttempt = 0;
  const seedSession = createOwnerCheckSeedSession(async () => {
    assertOwnerCheckTarget(owned!, inspect(), image.Id);
    // A repair can be loaded into the same live fixture, without replacement.
    const moduleUrl = pathToFileURL(resolve("test/integration/owner-check-seed.ts"));
    moduleUrl.searchParams.set("attempt", String(++seedAttempt));
    const { seedOwnerCheckFixture } = await import(moduleUrl.href) as typeof import("../test/integration/owner-check-seed");
    const receipt = await seedOwnerCheckFixture(plannedTarget);
    return { target: { ...plannedTarget, ownerId: receipt.ownerId }, rows: receipt.rows };
  });
  async function attemptSeed() {
    if (seedAttempt >= 3 && !seedSession.target) { console.log("CONTROL: seed attempt limit reached; diagnose or cleanup"); return; }
    const result = await seedSession.attempt();
    if (!result.ok) {
      const failure = { phase: "SEED_FAILED", recordedAt: new Date().toISOString(), attempt: seedAttempt,
        category: safeCategory(result.error), fixtureRetained: true, next: "repair local seed, then seed; or cleanup" };
      console.log(JSON.stringify(failure));
      await writeFile(resolve(evidencePath, `seed-failure-${seedAttempt}.json`), JSON.stringify(failure, null, 2));
      return;
    }
    const { target, rows } = result.target;
    await writeFile(resolve(evidencePath, "seed.json"), JSON.stringify({ rows, reservedLaterDraftRows: 1,
      workspaceA: a.workspaceId, workspaceB: b.workspaceId, ids,
      userIds: { ownerId: target.ownerId, managerInId }, usage: "2/3", period: "2026-10", syntheticIdentityOnly: true }, null, 2));
    console.log(JSON.stringify({ phase: "READY", containerId: owned!.containerId, database: owned!.databaseName,
      appOrigin: env!.app, containersCreated: 1 }));
  }
  await attemptSeed();
  const lines = createInterface({ input: process.stdin });
  let runNumber = 0;
  for await (const raw of lines) {
    const line = raw.trim();
    if (line === "cleanup") { await cleanup(); lines.close(); break; }
    if (line === "seed") { await attemptSeed(); continue; }
    if (!/^run(?: [a-z0-9_-]+)?$/.test(line)) { console.log("CONTROL: use seed, run [case-id] or cleanup"); continue; }
    const target = seedSession.target?.target;
    if (!target) { console.log("CONTROL: seed has not committed; repair then seed, or cleanup"); continue; }
    assertOwnerCheckTarget(owned, inspect(), image.Id);
    runNumber++;
    const childEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const key of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA","ComSpec","PATHEXT"]) if (process.env[key]) childEnv[key] = process.env[key];
    Object.assign(childEnv, { NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1", OWNER_CHECK_APPROVED_TARGET: JSON.stringify(target),
      OWNER_CHECK_RUN_NUMBER: String(runNumber), NODE_OPTIONS: `--require=${resolve("test/e2e/transport-guard.cjs").replaceAll("\\","/")}` });
    const args = [resolve("node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.owner-check.config.ts", "--bail=1"];
    if (line !== "run") args.push("-t", line.slice(4));
    const code = await new Promise<number>(done => {
      const child = spawn(process.execPath, args, { cwd: process.cwd(), env: childEnv, stdio: ["ignore","pipe","pipe"], windowsHide: true });
      const safeOutput = (data: Buffer) => { for (const text of data.toString().split("\n")) if (text.includes("SAFE_CASE:")) console.log(text.slice(text.indexOf("SAFE_CASE:"))); };
      child.stdout.on("data", safeOutput); child.stderr.resume();
      child.on("error", () => done(1)); child.on("exit", value => done(value ?? 1));
    });
    const receipt = await readFile(resolve(evidencePath, `run-${runNumber}.json`), "utf8").then(JSON.parse).catch(() => null);
    console.log(JSON.stringify({ phase: "RUN_COMPLETE", runNumber, exitCode: code, checks: receipt?.checks?.length ?? 0, counters: receipt?.counters ?? null }));
  }
  if (!seedSession.target) process.exitCode = 1;
} catch (error) {
  process.exitCode = 1;
  const failure = { phase: "HOST_FAILED", recordedAt: new Date().toISOString(),
    category: safeCategory(error) };
  console.log(JSON.stringify(failure));
  await writeFile(resolve(evidencePath, "host-failure.json"), JSON.stringify(failure, null, 2));
} finally { await cleanup(); }
