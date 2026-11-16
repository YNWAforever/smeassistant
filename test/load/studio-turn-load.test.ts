import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Membership } from "@/lib/auth";
import type { LLMChatMessage, LLMOptions, LLMOutcome } from "@/lib/llm";
import type { StudioBriefingResult } from "@/lib/studio/context";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "../integration/neon-database";

/**
 * Phase 19 P19.1 — opt-in Studio turn load harness.
 *
 * Runs the real messages POST, request lifetime, orchestrator, turn session and
 * persistence against an owned PostgreSQL fixture with typed local fixtures for
 * identity, briefing and the LLM interface. It records a bounded concurrency
 * ladder and one same-conversation contention schedule, then writes JSON.
 *
 * This is NOT a production capacity claim: the provider transport, hosted Neon,
 * Auth and network conditions are fixtures or local, and the fixture delays are
 * synthetic. Run with `pnpm load:studio`; it is excluded from `pnpm test` and CI.
 */

type Gate = { promise: Promise<void>; resolve: () => void };
function gate(): Gate {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

type Script = {
  classification: Record<string, unknown>;
  calls: string[];
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  answerEntered: Gate;
  release: Gate | null;
};

const state = vi.hoisted(() => ({
  url: "",
  memberships: new Map<string, Membership>(),
  briefings: new Map<string, StudioBriefingResult>(),
  scripts: new Map<string, Script>(),
  retained: [] as Promise<unknown>[],
  answerDelayMs: 15,
}));

vi.mock("@/lib/auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  authorizeWorkspaceRequest: async ({ id }: { id: string }) => {
    const membership = state.memberships.get(id);
    return membership
      ? { ok: true, membership, user: { id: membership.userId, email: membership.email, verified: true } }
      : { ok: false, status: 404, code: "not_found" };
  },
}));
vi.mock("@/lib/security/rate-limit", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/security/rate-limit")>(),
  // The limiter's own policy is covered elsewhere; this harness isolates the turn path.
  enforceRateLimit: async () => ({ allowed: true, retryAfterSeconds: 1 }),
}));
vi.mock("@/lib/studio/context", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/studio/context")>(),
  buildStudioBriefing: async ({ membership }: { membership: Membership }) => {
    const value = state.briefings.get(membership.workspaceId);
    if (!value) throw new Error("fixture_briefing_missing");
    return value;
  },
}));
vi.mock("@vercel/functions", async importOriginal => ({
  ...await importOriginal<typeof import("@vercel/functions")>(),
  waitUntil: (promise: Promise<unknown>) => { state.retained.push(promise); },
}));
vi.mock("@/lib/llm", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  function scriptFor(messages: LLMChatMessage[]) {
    // The latest owner message is fenced; earlier turns may contain other keys.
    const latest = messages.filter(message => message.role === "user").at(-1)?.content ?? "";
    const matches = [...state.scripts].filter(([key]) => latest.includes(key));
    if (matches.length !== 1) throw new Error("fixture_script_not_correlated");
    return matches[0][1];
  }
  return {
    ...actual,
    llmConfigured: () => true,
    llmChatDetailed: async (messages: LLMChatMessage[]): Promise<LLMOutcome> => {
      const script = scriptFor(messages); script.calls.push("classify");
      return { ok: true, result: { text: JSON.stringify(script.classification), usage: { inputTokens: 3, outputTokens: 2 } } };
    },
    llmChatStreamDetailed: async (messages: LLMChatMessage[], _options: LLMOptions, onDelta: (text: string) => void) => {
      const script = scriptFor(messages); script.calls.push("answer");
      onDelta("Fixture partial. "); script.answerEntered.resolve();
      // A small fixed fixture delay creates steady-state overlap without ordering assumptions.
      await new Promise<void>(resolve => setTimeout(resolve, state.answerDelayMs));
      if (script.release) await script.release.promise;
      onDelta(script.text.slice("Fixture partial. ".length));
      return { ok: true as const, streamed: true, result: { text: script.text, usage: script.usage } };
    },
  };
});

import { POST } from "@/app/api/studio/conversations/[conversationId]/messages/route";
import { studioRepository } from "@/lib/repositories/studio";
import { withTransaction } from "@/lib/db/transaction";

const CONTENDERS = 8;
const PARTIAL = "Fixture partial. ";
/** Statuses the turn path uses for a deliberate pre-stream refusal (not corruption). */
const REFUSAL_STATUSES = new Set([409, 429, 503]);
const MAX_LEVEL = 64;

/** `LOAD_LEVELS=1,2,4,8,16` overrides the ladder; `LOAD_REPEATS=1..3` repeats each level. */
function parseLevels(raw: string): number[] {
  const levels = raw.split(",").map(value => Number(value.trim()));
  if (!levels.length || levels.length > 8) throw new Error("invalid_load_levels");
  if (levels.some(value => !Number.isInteger(value) || value < 1 || value > MAX_LEVEL)) throw new Error("invalid_load_levels");
  if (new Set(levels).size !== levels.length) throw new Error("duplicate_load_level");
  return levels;
}
const LEVELS = parseLevels(process.env.LOAD_LEVELS ?? "1,2,4,8");
const REPEATS = (() => {
  const value = Number(process.env.LOAD_REPEATS ?? "1");
  if (!Number.isInteger(value) || value < 1 || value > 3) throw new Error("invalid_load_repeats");
  return value;
})();
const STOP_ON_FAILURE = (process.env.LOAD_STOP_ON_FAILURE ?? "1") !== "0";

type InvariantFailure = { phase: string; detail: string };
type Latency = { firstChunkMs: number; completionMs: number };

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function latencySummary(samples: Latency[]) {
  return {
    samples: samples.length,
    firstChunkMs: { p50: percentile(samples.map(s => s.firstChunkMs), 0.5), p95: percentile(samples.map(s => s.firstChunkMs), 0.95) },
    completionMs: { p50: percentile(samples.map(s => s.completionMs), 0.5), p95: percentile(samples.map(s => s.completionMs), 0.95) },
  };
}

describe("Studio turn load harness (opt-in, owned fixture)", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  let workspaceId: string;
  let actorId: string;
  let locationId: string;
  const failures: InvariantFailure[] = [];
  const ladder: Array<Record<string, unknown>> = [];
  let contention: Record<string, unknown> = {};
  let boundary: { firstNonAdmittedLevel: number | null; reason: string | null; capReached: boolean } = { firstNonAdmittedLevel: null, reason: null, capReached: false };
  let maxConnections: number | null = null;
  let reportPath = "";
  let startedAt = "";

  const check = (condition: boolean, phase: string, detail: string) => {
    if (!condition) failures.push({ phase, detail });
  };

  beforeAll(async () => {
    startedAt = new Date().toISOString();
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    maxConnections = Number((await owner.query("SHOW max_connections")).rows[0].max_connections);
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
    await owner.query("CREATE ROLE studio_load LOGIN PASSWORD 'fixture' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl);
    url.username = "studio_load"; url.password = "fixture";
    state.url = url.href;
    runtime = new Pool({ connectionString: state.url });
    vi.stubEnv("DATABASE_URL", state.url);
    vi.stubEnv("DATABASE_URL_UNPOOLED", undefined);
    vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
    vi.stubEnv("LLM_MODEL", "fixture");
    vi.stubEnv("BUDGET_AI_USD_GLOBAL_24H", "20");
    vi.stubEnv("BUDGET_AI_USD_WORKSPACE_24H", "off");
    for (const key of ["BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "BUDGET_SCAN_ATTEMPTS_WORKSPACE_24H"]) vi.stubEnv(key, "off");
    for (const key of ["SCANS_PAUSED", "AI_DRAFTS_PAUSED", "MAIL_PAUSED"]) vi.stubEnv(key, undefined);

    workspaceId = randomUUID(); actorId = randomUUID(); locationId = randomUUID();
    await runtime.query("INSERT INTO workspaces(id,business_name,tier) VALUES($1,'Fixture shop','paid')", [workspaceId]);
    await runtime.query("INSERT INTO app_users(id,email) VALUES($1,$2)", [actorId, `${actorId}@example.test`]);
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())", [workspaceId, actorId, `${actorId}@example.test`]);
    await runtime.query("INSERT INTO locations(id,workspace_id,slug,name,is_primary) VALUES($1,$2,'fixture','Fixture shop',true)", [locationId, workspaceId]);
    state.memberships.set(workspaceId, { workspaceId, userId: actorId, email: `${actorId}@example.test`, workspaceSlug: "fixture", role: "owner", locationScope: null });
    state.briefings.set(workspaceId, {
      briefing: {
        workspace: { id: workspaceId, name: "Fixture shop", slug: "fixture", market: "hk", timezone: "Asia/Hong_Kong", tier: "paid", role: "owner", locationScope: null },
        location: { id: locationId, name: "Fixture shop", slug: "fixture" }, latestScan: null, change: null,
        openActions: [], openActionCount: 0, waitingVersions: [], google: null,
        brand: { revisionId: null, voice: null, approvedClaims: [], prohibitedTerms: [], languages: [], facts: [] },
        usage: { period: "2026-11", approvedDeliveries: 0, allowance: 20 }, evidenceCatalogue: [],
      },
      systemBriefing: "Synthetic fixture: no measured evidence.",
      contextSummary: { locationName: "Fixture shop", latestScan: null, openActions: [], waitingVersions: 0, google: "Unavailable", brandFactCount: 0, pendingInputs: 0 },
      promptChips: [], evidenceCatalogue: [], chips: [],
    });
  });

  afterAll(async () => {
    try {
      if (failures.length || ladder.length || Object.keys(contention).length) writeReport();
    } finally {
      for (const script of state.scripts.values()) script.release?.resolve();
      await Promise.allSettled([...state.retained]);
      await Promise.allSettled([runtime?.end(), owner?.end()]);
      fixture?.stop();
      vi.unstubAllEnvs();
    }
  });

  function writeReport() {
    const directory = path.resolve("work/phase-19/load");
    fs.mkdirSync(directory, { recursive: true });
    reportPath = path.join(directory, `studio-load-${startedAt.replaceAll(":", "-")}.json`);
    const report = {
      harness: "Phase 19 Studio turn load harness",
      startedAt,
      finishedAt: new Date().toISOString(),
      claim: "Environment-scoped fixture record only. Not production capacity, throughput or latency evidence.",
      config: { levels: LEVELS, repeats: REPEATS, stopOnFailure: STOP_ON_FAILURE, maxLevel: MAX_LEVEL, contenders: CONTENDERS },
      environment: {
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        cpus: os.cpus().length,
        totalMemoryGb: Math.round(os.totalmem() / 1024 ** 3),
        postgres: "owned postgres:16 fixture on loopback",
        postgresMaxConnections: maxConnections,
        provider: "typed local LLM fixture (remote transport replaced)",
        auth: "typed local membership fixture (no HTTP Auth)",
        answerDelayMs: state.answerDelayMs,
      },
      boundary,
      ladder,
      contention,
      invariantsPassed: failures.length === 0,
      failures,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(directory, "studio-load-latest.json"), JSON.stringify(report, null, 2));
  }

  async function seedConversation() {
    const repo = studioRepository(runtime, run => withTransaction(run, runtime));
    return (await repo.createConversation({ workspaceId, actorId, locationId })).id;
  }

  function script(key: string, hold = false) {
    const value: Script = {
      classification: { intent: "answer" }, calls: [],
      text: `Fixture partial. Fixture complete. ${key}`,
      usage: { inputTokens: 10 + state.scripts.size, outputTokens: 4 + state.scripts.size },
      answerEntered: gate(), release: hold ? gate() : null,
    };
    state.scripts.set(key, value);
    return value;
  }

  function send(conversationId: string, text: string) {
    return POST(new Request("http://localhost/api/studio/conversations/messages?locale=en", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, text }),
    }), { params: Promise.resolve({ conversationId }) });
  }

  async function readStream(response: Response, startedAtMs: number): Promise<{ text: string; latency: Latency }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "", firstChunkMs: number | null = null;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (firstChunkMs === null) firstChunkMs = performance.now() - startedAtMs;
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { text, latency: { firstChunkMs: firstChunkMs ?? 0, completionMs: performance.now() - startedAtMs } };
  }

  async function runTurn(key: string, hold = false) {
    const conversationId = await seedConversation();
    const value = script(key, hold);
    const start = performance.now();
    const response = await send(conversationId, key);
    const status = response.status;
    const delivery = status === 200
      ? await readStream(response, start)
      : { text: "", latency: { firstChunkMs: performance.now() - start, completionMs: performance.now() - start } };
    const refusalBody = status === 200 ? undefined : (await response.text()).replace(/\s+/g, " ").slice(0, 200);
    return { conversationId, script: value, status, delivery, refusalBody };
  }

  async function conversationWrites(conversationId: string) {
    const messages = (await runtime.query("SELECT count(*)::int AS n FROM studio_messages WHERE conversation_id=$1", [conversationId])).rows[0].n;
    const audits = (await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE event='assistant.run' AND entity_id=$1", [conversationId])).rows[0].n;
    return { messages, audits };
  }

  async function assertConversation(phase: string, conversationId: string, expected: Script[]) {
    const rows = (await runtime.query("SELECT seq,role,content,workspace_id,author_id FROM studio_messages WHERE conversation_id=$1 ORDER BY seq", [conversationId])).rows;
    check(rows.length === expected.length * 2, phase, `expected ${expected.length * 2} messages, got ${rows.length}`);
    check(rows.every(row => row.workspace_id === workspaceId), phase, "message workspace mismatch");
    check(rows.filter(row => row.role === "user").every(row => row.author_id === actorId), phase, "user author mismatch");
    if (rows.length === expected.length * 2) {
      check(rows.map(row => row.seq).join(",") === Array.from({ length: expected.length * 2 }, (_, index) => index + 1).join(","), phase, "message seq mismatch");
      check(rows.filter(row => row.role === "assistant").map(row => row.content).join("|") === expected.map(value => value.text).join("|"), phase, "assistant content mismatch");
    }
    const audits = (await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE event='assistant.run' AND entity_id=$1", [conversationId])).rows[0].n;
    check(audits === expected.length, phase, `expected ${expected.length} assistant.run audits, got ${audits}`);
  }

  it("records a bounded concurrency ladder and one contention schedule", async () => {
    // Warm-up: one unmeasured turn proves the fixture wiring before the ladder.
    const warmup = await runTurn("warmup");
    check(warmup.status === 200, "warmup", `status ${warmup.status}`);
    check(warmup.delivery.text.includes(warmup.script.text.slice(PARTIAL.length)), "warmup", "answer text missing");
    check(warmup.script.calls.join(",") === "classify,answer", "warmup", `dispatches ${warmup.script.calls.join(",")}`);
    await assertConversation("warmup", warmup.conversationId, [warmup.script]);
    await Promise.allSettled(state.retained); state.retained.length = 0;

    let firstNonAdmitted: number | null = null;
    let boundaryReason: string | null = null;
    for (const concurrency of LEVELS) {
      const levelSamples: Latency[] = [];
      const refusals: Array<{ repeat: number; index: number; status: number; body?: string }> = [];
      const levelFailures: string[] = [];
      const failuresBeforeLevel = failures.length;
      let admitted = 0, refused = 0;
      for (let repeat = 0; repeat < REPEATS; repeat += 1) {
        const turns = await Promise.all(Array.from({ length: concurrency }, (_, index) => runTurn(`ladder-${concurrency}-${repeat}-${String(index).padStart(3, "0")}`)));
        for (const [index, turn] of turns.entries()) {
          if (turn.status === 200) {
            admitted += 1;
            if (!turn.delivery.text.includes(turn.script.text.slice(PARTIAL.length))) levelFailures.push(`turn ${index} answer missing`);
            if (turn.script.calls.join(",") !== "classify,answer") levelFailures.push(`turn ${index} dispatches ${turn.script.calls.join(",")}`);
            levelSamples.push(turn.delivery.latency);
          } else if (REFUSAL_STATUSES.has(turn.status)) {
            refused += 1;
            refusals.push({ repeat, index, status: turn.status, body: turn.refusalBody });
            // A deliberate pre-stream refusal must leave no message or audit row.
            const writes = await conversationWrites(turn.conversationId);
            if (writes.messages !== 0 || writes.audits !== 0) levelFailures.push(`refused turn ${index} wrote messages=${writes.messages} audits=${writes.audits}`);
            if (turn.script.calls.length !== 0) levelFailures.push(`refused turn ${index} dispatched ${turn.script.calls.join(",")}`);
          } else {
            levelFailures.push(`turn ${index} unexpected status ${turn.status} ${turn.refusalBody ?? ""}`.trim());
          }
        }
        await Promise.allSettled(state.retained).then(results => {
          const rejected = results.filter(result => result.status === "rejected").length;
          if (rejected) levelFailures.push(`repeat ${repeat} retained finalization rejected ${rejected}`);
        }); state.retained.length = 0;
        for (const [index, turn] of turns.entries()) {
          if (turn.status === 200) await assertConversation(`level ${concurrency} repeat ${repeat} turn ${index}`, turn.conversationId, [turn.script]);
        }
        if (levelFailures.length && STOP_ON_FAILURE) break;
      }
      for (const detail of levelFailures) check(false, `level ${concurrency}`, detail);
      const refusalCounts: Record<string, number> = {};
      for (const refusal of refusals) refusalCounts[String(refusal.status)] = (refusalCounts[String(refusal.status)] ?? 0) + 1;
      let dbConnectionsAfter: number | null = null;
      try {
        dbConnectionsAfter = Number((await runtime.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()")).rows[0].n);
      } catch { dbConnectionsAfter = null; }
      ladder.push({ concurrency, repeats: REPEATS, admitted, refused, refusalStatuses: [...new Set(refusals.map(refusal => refusal.status))], refusalCounts, dbConnectionsAfter, refusalSamples: refusals.slice(0, 3), ...latencySummary(levelSamples), failures: levelFailures });
      if (firstNonAdmitted === null && (refused > 0 || failures.length > failuresBeforeLevel)) {
        firstNonAdmitted = concurrency;
        boundaryReason = refused > 0 ? `pre-stream refusal ${[...new Set(refusals.map(refusal => refusal.status))].join(",")}` : "invariant failure";
      }
      if (STOP_ON_FAILURE && (refused > 0 || failures.length > failuresBeforeLevel)) break;
    }
    boundary = { firstNonAdmittedLevel: firstNonAdmitted, reason: boundaryReason, capReached: firstNonAdmitted === null && LEVELS.at(-1) === MAX_LEVEL };

    // Same-conversation contention: exactly one turn may own the session; every
    // contender is refused before dispatch, and the lock is reusable afterwards.
    const heldConversation = await seedConversation();
    const heldScript = script("contention-held", true);
    const admittedStart = performance.now();
    const admitted = await send(heldConversation, "contention-held");
    check(admitted.status === 200, "contention", `admitted status ${admitted.status}`);
    const admittedReader = admitted.body!.getReader();
    const admittedDecoder = new TextDecoder();
    let admittedText = "";
    while (!admittedText.includes(PARTIAL)) {
      const chunk = await admittedReader.read();
      if (chunk.done) break;
      admittedText += admittedDecoder.decode(chunk.value, { stream: true });
    }
    check(admittedText.includes(PARTIAL), "contention", "admitted answer never started");
    await heldScript.answerEntered.promise;
    const contenderKeys = Array.from({ length: CONTENDERS - 1 }, (_, index) => `contention-refused-${index}`);
    for (const key of contenderKeys) script(key);
    const refused = await Promise.all(contenderKeys.map(key => send(heldConversation, key)));
    for (const [index, response] of refused.entries()) {
      check(response.status === 409, "contention", `contender ${index} status ${response.status}`);
      if (response.status === 409) {
        const body = await response.json() as { error?: string };
        check(body.error === "conversation_busy", "contention", `contender ${index} error ${body.error}`);
      }
    }
    for (const key of contenderKeys) check(state.scripts.get(key)!.calls.length === 0, "contention", `${key} dispatched`);
    heldScript.release!.resolve();
    for (;;) {
      const chunk = await admittedReader.read();
      if (chunk.done) break;
      admittedText += admittedDecoder.decode(chunk.value, { stream: true });
    }
    check(admittedText.includes(heldScript.text.slice(PARTIAL.length)), "contention", "admitted answer missing");
    const admittedCompletionMs = performance.now() - admittedStart;
    await Promise.allSettled(state.retained); state.retained.length = 0;
    await assertConversation("contention", heldConversation, [heldScript]);
    const recovery = script("contention-recovery");
    const recoveryStart = await send(heldConversation, "contention-recovery");
    check(recoveryStart.status === 200, "contention", `recovery status ${recoveryStart.status}`);
    if (recoveryStart.status === 200) await readStream(recoveryStart, performance.now());
    await Promise.allSettled(state.retained); state.retained.length = 0;
    await assertConversation("contention recovery", heldConversation, [heldScript, recovery]);
    check(heldScript.calls.join(",") === "classify,answer", "contention", `held dispatches ${heldScript.calls.join(",")}`);
    check(recovery.calls.join(",") === "classify,answer", "contention", `recovery dispatches ${recovery.calls.join(",")}`);
    contention = { contenders: CONTENDERS, admitted: 1, refused: refused.filter(response => response.status === 409).length, dispatchesForAdmittedTurn: heldScript.calls.length, refusedDispatches: contenderKeys.reduce((sum, key) => sum + state.scripts.get(key)!.calls.length, 0), admittedCompletionMs: Math.round(admittedCompletionMs) };

    writeReport();
    console.log(JSON.stringify({ report: reportPath, config: { levels: LEVELS, repeats: REPEATS }, boundary, invariantsPassed: failures.length === 0, failures, ladder: ladder.map(level => ({ concurrency: level.concurrency, admitted: level.admitted, refused: level.refused })) }));
    expect(failures).toEqual([]);
  });
});
