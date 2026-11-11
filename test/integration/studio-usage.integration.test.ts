import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { buildStudioUsageReport } from "../../lib/operations/studio-usage";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";

/**
 * Read-only Studio usage report against an owned PostgreSQL fixture. The report
 * must count persisted rows only, exclude other workspaces, measure adjacent
 * user→assistant latency and never need message text.
 */
describe.runIf(process.env.NEON_INTEGRATION === "1")("Studio usage report", () => {
  let fixture: NeonDatabaseFixture;
  let pool: Pool;
  const now = new Date("2026-11-09T12:00:00.000Z");
  const since = new Date("2026-11-09T00:00:00.000Z");

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    pool = new Pool({ connectionString: fixture.databaseUrl });
    await pool.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(pool);
  });

  afterAll(async () => {
    await pool?.end();
    fixture?.stop();
  });

  async function seedWorkspace(): Promise<{ workspaceId: string; userId: string; conversationId: string }> {
    const workspaceId = (await pool.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id as string;
    const userId = (await pool.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@usage.test`])).rows[0].id as string;
    const conversationId = (
      await pool.query(
        "INSERT INTO studio_conversations(workspace_id,created_by,title) VALUES($1,$2,'Usage test') RETURNING id",
        [workspaceId, userId],
      )
    ).rows[0].id as string;
    return { workspaceId, userId, conversationId };
  }

  async function message(
    scope: { workspaceId: string; conversationId: string },
    seq: number,
    role: "user" | "assistant",
    createdAt: string,
    options: { parts?: unknown[]; intent?: string | null; model?: string | null; inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null } = {},
  ): Promise<void> {
    await pool.query(
      `INSERT INTO studio_messages(conversation_id,workspace_id,seq,role,content,parts,intent,model,input_tokens,output_tokens,cost_usd,created_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
      [
        scope.conversationId,
        scope.workspaceId,
        seq,
        role,
        "ignored content",
        JSON.stringify(options.parts ?? []),
        options.intent ?? null,
        options.model ?? null,
        options.inputTokens ?? null,
        options.outputTokens ?? null,
        options.costUsd ?? null,
        createdAt,
      ],
    );
  }

  it("counts only the scoped workspace and computes latency/tokens/cost without content", async () => {
    const first = await seedWorkspace();
    await message(first, 1, "user", "2026-11-09T10:00:00.000Z");
    await message(first, 2, "assistant", "2026-11-09T10:00:01.000Z", { intent: "answer", model: "model-a", inputTokens: 10, outputTokens: 20, costUsd: 0.001 });
    await message(first, 3, "user", "2026-11-09T11:00:00.000Z");
    await message(first, 4, "assistant", "2026-11-09T11:00:00.500Z", { parts: [{ kind: "warning", code: "ai_unavailable", text: "nope" }], model: "model-a", inputTokens: 5, outputTokens: 10, costUsd: 0.002 });

    const other = await seedWorkspace();
    await message(other, 1, "user", "2026-11-09T10:30:00.000Z");
    await message(other, 2, "assistant", "2026-11-09T10:30:02.000Z", { model: "model-b", costUsd: 99 });

    const report = await buildStudioUsageReport(pool, { since, workspaceId: first.workspaceId }, now);
    expect(report.window).toMatchObject({ workspaceId: first.workspaceId, until: now.toISOString() });
    expect(report.totals).toMatchObject({
      conversations: 1,
      owners: 1,
      userMessages: 2,
      assistantMessages: 2,
      failedTurns: 1,
      inputTokens: 15,
      outputTokens: 30,
      costUsd: 0.003,
      unknownCostMessages: 0,
    });
    expect(report.latencyMs.samples).toBe(2);
    expect(report.latencyMs.average).toBe(750);
    expect(report.byIntent).toEqual(expect.arrayContaining([{ intent: "chat", count: 1 }, { intent: "answer", count: 1 }]));
    expect(report.byModel).toEqual(expect.arrayContaining([{ model: "model-a", count: 2 }]));
    expect(report.byDay).toEqual([{ day: "2026-11-09", userMessages: 2, assistantMessages: 2, costUsd: 0.003 }]);
    expect(report.budgets).toEqual({ maxCostUsd: null, maxP95LatencyMs: null, breaches: [] });
    expect(JSON.stringify(report)).not.toContain("ignored content");
    expect(JSON.stringify(report)).not.toContain("nope");

    const budgeted = await buildStudioUsageReport(
      pool,
      { since, workspaceId: first.workspaceId, maxCostUsd: 0.002, maxP95LatencyMs: 1000 },
      now,
    );
    expect(budgeted.budgets).toEqual({ maxCostUsd: 0.002, maxP95LatencyMs: 1000, breaches: ["cost"] });
  });

  it("reports a null latency when there are no adjacent pairs and keeps unreported costs visible", async () => {
    const scoped = await seedWorkspace();
    await message(scoped, 1, "assistant", "2026-11-09T10:00:00.000Z", { model: null, inputTokens: null, outputTokens: null, costUsd: null });
    const report = await buildStudioUsageReport(pool, { since, workspaceId: scoped.workspaceId }, now);
    expect(report.latencyMs).toEqual({ samples: 0, average: null, p50: null, p95: null });
    expect(report.totals.unknownCostMessages).toBe(1);
    expect(report.totals.costUsd).toBe(0);
    expect(report.byModel).toEqual([{ model: "unknown", count: 1 }]);
  });
});
