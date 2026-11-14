import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Membership } from "@/lib/auth";
import type { LLMChatMessage, LLMOptions, LLMOutcome } from "@/lib/llm";
import type { StudioBriefingResult } from "@/lib/studio/context";
import type { StudioDeadline } from "@/lib/studio/deadline";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
type Gate = ReturnType<typeof deferred<void>>;
type Script = { classification: Record<string, unknown>; entered: Gate; release: Gate; calls: string[]; text: string; usage: { inputTokens: number; outputTokens: number } };
const state = vi.hoisted(() => ({
  url: "", offset: 0,
  memberships: new Map<string, Membership>(),
  briefings: new Map<string, StudioBriefingResult>(),
  scripts: new Map<string, Script>(),
  deadlines: new Map<string, StudioDeadline>(),
  retained: [] as Promise<unknown>[],
  pools: [] as Pool[],
  observation: undefined as { entered: Gate; release: Gate; finished: Gate; pid: number; uncommitted?: { status: string; audits: number }; lateQuery: Promise<unknown> | undefined } | undefined,
  draftEntered: undefined as ReturnType<typeof deferred<string>> | undefined,
  settlements: [] as Promise<unknown>[],
  draftDispatches: [] as string[],
}));

// Fixture identity/preflight only: production authorization has separate local Auth acceptance.
vi.mock("@/lib/auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),
  authorizeWorkspaceRequest: async ({ id }: { id: string }) => {
    const membership = state.memberships.get(id);
    return membership ? { ok: true, membership, user: { id: membership.userId, email: membership.email, verified: true } }
      : { ok: false, status: 404, code: "not_found" };
  },
}));
vi.mock("@/lib/security/rate-limit", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/security/rate-limit")>(),
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
vi.mock("@/lib/studio/deadline", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/studio/deadline")>();
  return { ...actual, createStudioDeadline: () => actual.createStudioDeadline({ now: () => performance.now() + state.offset }) };
});
vi.mock("@/lib/studio/turn-session", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/studio/turn-session")>();
  return { ...actual, acquireStudioTurnSession: async (id: string, deadline: StudioDeadline) => {
    // Each session owns and closes its own pool. The implementation, SQL and fencing are real.
    const pool = new Pool({ connectionString: state.url, max: 1, application_name: "studio-resilience-session" });
    state.pools.push(pool);
    const session = await actual.acquireStudioTurnSession(id, deadline, { pool });
    if (session) state.deadlines.set(id, deadline);
    return session;
  } };
});
vi.mock("@/lib/repositories/artifacts", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/repositories/artifacts")>();
  return { ...actual, actionRunRepository: (...args: Parameters<typeof actual.actionRunRepository>) => {
    const repository = actual.actionRunRepository(...args);
    return { ...repository, observeProviderAttempt: async (input: Parameters<typeof repository.observeProviderAttempt>[0]) => {
      const gate = state.observation;
      const transaction = args[0];
      if (!gate || !transaction) return repository.observeProviderAttempt(input);
      // Hold a real admitted session transaction, not a fake query/lock result.
      const held = actual.actionRunRepository(run => transaction(async client => {
        gate.pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        const result = await run(client);
        gate.uncommitted = (await client.query<{ status: string; audits: number }>(`SELECT input #>> '{provider_usage,status}' AS status,
          (SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event='run.usage_observed') AS audits
          FROM action_runs WHERE id=$1`, [input.runId])).rows[0];
        // Usage and audit SQL have executed, but this callback holds the actual COMMIT.
        gate.entered.resolve();
        await gate.release.promise;
        // Keep the attempted late query observable, including its rejection.
        gate.lateQuery = client.query("SELECT 1 AS must_not_run");
        await gate.lateQuery;
        return result;
      }));
      try { await held.observeProviderAttempt(input); } finally { gate.finished.resolve(); }
    } };
  } };
});
vi.mock("@/lib/llm", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  function scriptFor(messages: LLMChatMessage[]) {
    // The latest owner message is fenced; previous conversation turns may contain other keys.
    const latest = messages.filter(message => message.role === "user").at(-1)?.content ?? "";
    const matches = [...state.scripts].filter(([key]) => latest.includes(key));
    if (matches.length !== 1) throw new Error("fixture_script_not_correlated");
    return matches[0][1];
  }
  return { ...actual,
    llmConfigured: () => true,
    llmChatDetailed: async (messages: LLMChatMessage[]): Promise<LLMOutcome> => {
      const script = scriptFor(messages); script.calls.push("classify");
      return { ok: true, result: { text: JSON.stringify(script.classification), usage: { inputTokens: 3, outputTokens: 2 } } };
    },
    llmChatStreamDetailed: async (messages: LLMChatMessage[], _options: LLMOptions, onDelta: (text: string) => void) => {
      const script = scriptFor(messages); script.calls.push("answer");
      onDelta("Fixture partial. "); script.entered.resolve();
      await script.release.promise;
      onDelta(script.text.slice("Fixture partial. ".length));
      return { ok: true as const, streamed: true, result: { text: script.text, usage: script.usage } };
    },
    llmCompleteDetailed: async (_prompt: string, options: LLMOptions): Promise<LLMOutcome> => {
      if (!options.executionBudget || !options.onUsageObservation || !options.deferUsageSettlement || !options.sessionId) throw new Error("fixture_tracking_missing");
      state.draftDispatches.push(options.sessionId);
      state.draftEntered!.resolve(options.sessionId);
      await new Promise<void>(resolve => {
        if (options.executionBudget!.signal.aborted) resolve();
        else options.executionBudget!.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      const settlement = options.onUsageObservation({ state: "unknown", usage: { inputTokens: null, outputTokens: null }, reason: "timeout" });
      // Model the transport's retained accounting contract; transport timeout details have their own regressions.
      state.settlements.push(settlement);
      void settlement.catch(() => {});
      options.deferUsageSettlement(settlement);
      return { ok: false, code: "timeout", retryable: false, usagePending: true, usage: { inputTokens: null, outputTokens: null } };
    },
  };
});

import { POST } from "@/app/api/studio/conversations/[conversationId]/messages/route";
import { studioRepository } from "@/lib/repositories/studio";
import { actionRunRepository } from "@/lib/repositories/artifacts";
import { withTransaction } from "@/lib/db/transaction";
import { STUDIO_TURN_LOCK_NAMESPACE } from "@/lib/studio/turn-lock";

/** Two controlled schedules, not a throughput benchmark or hosted Auth acceptance. */
describe.runIf(process.env.NEON_INTEGRATION === "1")("Studio real-session resilience", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    // The node_modules junction may resolve dependencies elsewhere; application source must remain this worktree.
    expect(realpathSync(fileURLToPath(new URL("../../", import.meta.url))).toLowerCase()).toBe(realpathSync(process.cwd()).toLowerCase());
    const aliased = await vi.importActual<typeof import("@/lib/studio/turn-session")>("@/lib/studio/turn-session");
    const relative = await vi.importActual<typeof import("../../lib/studio/turn-session")>("../../lib/studio/turn-session");
    expect(aliased.acquireStudioTurnSession).toBe(relative.acquireStudioTurnSession);
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
    await owner.query("CREATE ROLE studio_resilience LOGIN PASSWORD 'fixture' IN ROLE sme_app_runtime");
    const url = new URL(fixture.databaseUrl); url.username = "studio_resilience"; url.password = "fixture";
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
  });
  afterEach(async () => {
    for (const script of state.scripts.values()) script.release.resolve();
    state.observation?.release.resolve();
    for (const deadline of state.deadlines.values()) {
      state.offset += 60_000;
      deadline.work.remainingMs(); deadline.finalization.remainingMs();
    }
    await Promise.allSettled([...state.retained, ...state.settlements]);
    state.retained.length = 0; state.settlements.length = 0;
    state.scripts.clear(); state.deadlines.clear(); state.offset = 0; state.observation = undefined;
  });
  afterAll(async () => {
    await Promise.allSettled(state.pools.map(pool => pool.end()));
    await Promise.allSettled([runtime?.end(), owner?.end()]);
    fixture?.stop(); vi.unstubAllEnvs();
  });

  async function seed() {
    const workspaceId = randomUUID(), actorId = randomUUID(), locationId = randomUUID();
    await runtime.query("INSERT INTO workspaces(id,business_name,tier) VALUES($1,'Fixture shop','paid')", [workspaceId]);
    await runtime.query("INSERT INTO app_users(id,email) VALUES($1,$2)", [actorId, `${actorId}@example.test`]);
    await runtime.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())", [workspaceId, actorId, `${actorId}@example.test`]);
    await runtime.query("INSERT INTO locations(id,workspace_id,slug,name,is_primary) VALUES($1,$2,'fixture','Fixture shop',true)", [locationId, workspaceId]);
    const membership: Membership = { workspaceId, userId: actorId, email: `${actorId}@example.test`, workspaceSlug: "fixture", role: "owner", locationScope: null };
    state.memberships.set(workspaceId, membership);
    state.briefings.set(workspaceId, {
      briefing: {
        workspace: { id: workspaceId, name: "Fixture shop", slug: "fixture", market: "hk", timezone: "Asia/Hong_Kong", tier: "paid", role: "owner", locationScope: null },
        location: { id: locationId, name: "Fixture shop", slug: "fixture" }, latestScan: null, change: null,
        openActions: [], openActionCount: 0, waitingVersions: [], google: null,
        brand: { revisionId: null, voice: null, approvedClaims: [], prohibitedTerms: [], languages: [], facts: [] },
        usage: { period: "2026-11", approvedDeliveries: 0, allowance: 20 }, evidenceCatalogue: [],
      },
      systemBriefing: "Synthetic fixture: no measured evidence.", contextSummary: { locationName: "Fixture shop", latestScan: null, openActions: [], waitingVersions: 0, google: "Unavailable", brandFactCount: 0, pendingInputs: 0 },
      promptChips: [], evidenceCatalogue: [], chips: [],
    });
    const repo = studioRepository(runtime, run => withTransaction(run, runtime));
    const conversation = await repo.createConversation({ workspaceId, actorId, locationId });
    return { workspaceId, actorId, locationId, conversationId: conversation.id };
  }
  function script(key: string, classification: Record<string, unknown> = { intent: "answer" }, hold = false) {
    const value: Script = { classification, entered: deferred(), release: deferred(), calls: [],
      text: `Fixture partial. Fixture complete. ${key}`,
      usage: { inputTokens: 10 + state.scripts.size, outputTokens: 4 + state.scripts.size } };
    if (!hold) value.release.resolve();
    state.scripts.set(key, value); return value;
  }
  function send(scope: Awaited<ReturnType<typeof seed>>, text: string) {
    return POST(new Request("http://localhost/api/studio/conversations/messages?locale=en", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: scope.workspaceId, text }),
    }), { params: Promise.resolve({ conversationId: scope.conversationId }) });
  }
  async function lockAvailable(client: PoolClient, conversationId: string) {
    const args = [STUDIO_TURN_LOCK_NAMESPACE, conversationId];
    const locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1::int,hashtext($2)::int) AS locked", args)).rows[0].locked;
    if (locked) await client.query("SELECT pg_advisory_unlock($1::int,hashtext($2)::int)", args);
    return locked;
  }

  it("retains a disconnected answer's real lock while an independent conversation completes, then recovers", async () => {
    const a = await seed(), foreign = await seed();
    const repository = studioRepository(runtime, run => withTransaction(run, runtime));
    const c = { ...a, conversationId: (await repository.createConversation({ workspaceId: a.workspaceId, actorId: a.actorId, locationId: a.locationId })).id };
    const held = script("turn-A", { intent: "answer" }, true);
    const refused = script("turn-B"); const independent = script("turn-C"); const recovery = script("turn-D");
    const foreignScript = script("turn-E");
    const response = await send(a, "turn-A");
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let received = "";
    while (!received.includes("Fixture partial.")) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      received += new TextDecoder().decode(chunk.value);
    }
    await held.entered.promise;
    await reader.cancel();
    const busy = await send(a, "turn-B");
    expect(busy.status).toBe(409);
    expect(await busy.json()).toEqual({ error: "conversation_busy" });
    expect(refused.calls).toEqual([]);
    expect((await runtime.query("SELECT seq,role,content FROM studio_messages WHERE conversation_id=$1 ORDER BY seq", [a.conversationId])).rows).toEqual([{ seq: 1, role: "user", content: "turn-A" }]);
    const other = await send(c, "turn-C");
    expect(other.status).toBe(200);
    expect(await other.text()).toContain("Fixture complete.");
    // C shares A's workspace: an erroneous workspace-wide lock would fail here.
    // Also exercise a separate workspace while A remains held to detect scope mixing.
    const foreignResponse = await send(foreign, "turn-E");
    expect(foreignResponse.status).toBe(200);
    expect(await foreignResponse.text()).toContain(foreignScript.text.slice("Fixture partial. ".length));
    expect(held.calls).toEqual(["classify", "answer"]);
    expect(independent.calls).toEqual(["classify", "answer"]);
    expect(foreignScript.calls).toEqual(["classify", "answer"]);
    expect((await runtime.query("SELECT count(*)::int AS n FROM studio_messages WHERE conversation_id=$1", [a.conversationId])).rows[0].n).toBe(1);
    held.release.resolve();
    await Promise.all(state.retained);
    const next = await send(a, "turn-D");
    expect(next.status).toBe(200); await next.text(); await Promise.all(state.retained);
    expect(recovery.calls).toEqual(["classify", "answer"]);
    for (const [scope, expected] of [[a, [held, recovery]], [c, [independent]], [foreign, [foreignScript]]] as const) {
      const turns = expected.length;
      const rows = (await runtime.query("SELECT seq,role,content,workspace_id,author_id,input_tokens,output_tokens FROM studio_messages WHERE conversation_id=$1 ORDER BY seq", [scope.conversationId])).rows;
      expect(rows.map(row => row.seq)).toEqual(Array.from({ length: turns * 2 }, (_, index) => index + 1));
      expect(rows.map(row => row.role)).toEqual(Array.from({ length: turns }, () => ["user", "assistant"]).flat());
      expect(rows.every(row => row.workspace_id === scope.workspaceId)).toBe(true);
      expect(rows.filter(row => row.role === "user").every(row => row.author_id === scope.actorId)).toBe(true);
      expect(rows.filter(row => row.role === "assistant").map(row => [row.content, row.input_tokens, row.output_tokens, row.author_id]))
        .toEqual(expected.map(value => [value.text, value.usage.inputTokens, value.usage.outputTokens, null]));
      expect((await runtime.query("SELECT workspace_id,actor_id FROM audit_events WHERE event='assistant.run' AND entity_id=$1", [scope.conversationId])).rows).toEqual(Array.from({ length: turns }, () => ({ workspace_id: scope.workspaceId, actor_id: scope.actorId })));
    }
  });

  it("destroys the real session at final cutoff and fences a held accounting transaction without converting unknown usage to zero", async () => {
    const scope = await seed(), actionId = randomUUID();
    await runtime.query(`INSERT INTO actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,provided_inputs)
      VALUES($1,$2,$3,'social-post','{"en":"Fixture social post"}','{}','[]','low',1,'{}',5,'Live',$4,'{"text_only":true}')`, [actionId, scope.workspaceId, scope.locationId, actionId]);
    const briefing = state.briefings.get(scope.workspaceId)!;
    briefing.briefing.openActions = [{ id: actionId, title: "Fixture social post", state: "recommended", priority: "low", missingInputs: [] }];
    briefing.briefing.openActionCount = 1;
    const classification = script("turn-draft", { intent: "draft", intentId: "generate_social", actionId });
    state.draftEntered = deferred<string>();
    const gate = { entered: deferred(), release: deferred(), finished: deferred(), pid: 0, lateQuery: undefined as Promise<unknown> | undefined };
    state.observation = gate;
    const response = await send(scope, "turn-draft");
    expect(response.status).toBe(200);
    const delivered = response.text();
    const runId = await state.draftEntered.promise;
    const runSql = "SELECT state,output,input,input_tokens,output_tokens,cost_usd FROM action_runs WHERE id=$1";
    const before = (await runtime.query(runSql, [runId])).rows[0];
    expect(before).toMatchObject({ state: "running", output: null, input: { provider_usage: { status: "pending" } }, input_tokens: null, output_tokens: null, cost_usd: null });
    expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND event='run.provider_reserved'", [runId])).rows[0].n).toBe(1);
    const deadline = state.deadlines.get(scope.conversationId)!;
    const probe = await runtime.connect();
    try {
      expect(await lockAvailable(probe, scope.conversationId)).toBe(false);
      // Logical clock transition only. No fake timers intercept pg sockets or connection cleanup.
      state.offset += deadline.work.remainingMs() + 1;
      expect(deadline.work.remainingMs()).toBe(0);
      await gate.entered.promise;
      expect(state.observation?.uncommitted).toEqual({ status: "unknown", audits: 1 });
      // Independent connection sees only the committed reservation while usage+audit are held.
      expect((await probe.query(runSql, [runId])).rows[0]).toEqual(before);
      expect((await probe.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND event='run.usage_observed'", [runId])).rows[0].n).toBe(0);
      expect(deadline.finalization.remainingMs()).toBeGreaterThan(0);
      expect(await lockAvailable(probe, scope.conversationId)).toBe(false);
      expect((await owner.query("SELECT state FROM pg_stat_activity WHERE pid=$1", [gate.pid])).rows[0].state).toBe("idle in transaction");
      state.offset += deadline.finalization.remainingMs() + 1;
      expect(deadline.finalization.remainingMs()).toBe(0);
      await Promise.all(state.retained);
      const delivery = await delivered;
      expect(delivery).toContain('"type":"error","code":"unavailable"');
      expect(delivery).not.toContain('"type":"message"');
      expect(delivery.match(/"type":"done"/g)).toHaveLength(1);
      // Bounded observation of local server cleanup; no assertion about remote partitions.
      await expect.poll(async () => (await owner.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1", [gate.pid])).rows[0].n).toBe(0);
      expect(await lockAvailable(probe, scope.conversationId)).toBe(true);
      gate.release.resolve();
      await gate.finished.promise;
      await expect(gate.lateQuery).rejects.toThrow("execution_budget_exhausted");
      await Promise.allSettled(state.settlements);
      expect(classification.calls).toEqual(["classify"]);
      expect((await runtime.query(runSql, [runId])).rows[0]).toEqual(before);
      expect((await runtime.query("SELECT count(*)::int AS n FROM output_versions WHERE action_id=$1", [actionId])).rows[0].n).toBe(0);
      expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND event='run.usage_observed'", [runId])).rows[0].n).toBe(0);
      expect((await runtime.query("SELECT role FROM studio_messages WHERE conversation_id=$1", [scope.conversationId])).rows).toEqual([{ role: "user" }]);
      // This stranded run is still running+pending: the in-flight action fence applies.
      // The global unknown-usage guard covers unknown/partial and terminal pending runs.
      const runs = actionRunRepository(run => withTransaction(run, runtime));
      await expect(runs.queue({ actionId, actorId: scope.actorId, agentKey: "social_post", input: {}, promptVersion: "fixture", model: "fixture", now: new Date() })).rejects.toThrow("action_run_in_flight");
      expect(state.draftDispatches).toEqual([runId]);
      expect(classification.calls).toEqual(["classify"]);
    } finally { probe.release(); gate.release.resolve(); }
  });
});
