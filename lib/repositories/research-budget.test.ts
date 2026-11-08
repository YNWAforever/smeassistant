import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { researchBudgetRepository, type ResearchBudgetInput } from "./research-budget";

type Entry = { id: string; workspace_id: string; location_id: string | null; provider: string; account_key: string; month: string; reserved_microusd: number; charged_microusd: number; outcome: string };
/** In-memory PostgreSQL boundary double. The repository still owns locking, sums and charging. */
function ledgerDatabase() {
  const entries: Entry[] = [], blocked = new Set<string>(), waiting = new Map<string, Promise<void>>();
  const statements: { sql: string; values: unknown[] }[] = [];
  const pool = { connect: async () => {
    const releaseLocks: (() => void)[] = [];
    return {
      release: vi.fn(),
      query: async (sql: string, values: unknown[] = []) => {
        statements.push({ sql, values });
        if (sql.includes("pg_advisory_xact_lock")) {
          const key = String(values[0]);
          const previous = waiting.get(key) ?? Promise.resolve();
          let release!: () => void;
          const next = new Promise<void>(resolve => { release = resolve; });
          waiting.set(key, previous.then(() => next));
          await previous; releaseLocks.push(release);
        } else if (sql === "COMMIT" || sql === "ROLLBACK") {
          releaseLocks.reverse().forEach(release => release());
        } else if (sql.includes("SUM(charged_microusd)")) {
          const [workspace, month, provider, account] = values;
          return { rows: [{
            workspace_used: String(entries.filter(row => row.workspace_id === workspace && row.month === month).reduce((sum, row) => sum + row.charged_microusd, 0)),
            account_used: String(entries.filter(row => row.provider === provider && row.account_key === account && row.month === month).reduce((sum, row) => sum + row.charged_microusd, 0)),
          }] };
        } else if (sql.includes("SELECT blocked_at")) {
          return { rows: blocked.has(`${values[0]}:${values[1]}`) ? [{ blocked_at: "2026-10-28" }] : [] };
        } else if (sql.includes("SELECT EXISTS") && sql.includes("outcome='reserved'")) {
          return { rows: [{ pending: entries.some(row => row.provider === values[0] && row.account_key === values[1] && row.outcome === "reserved") }] };
        } else if (sql.includes("INSERT INTO conversation_research_ledger")) {
          const [id, workspace, location, provider, account, month, reserved] = values;
          entries.push({ id: String(id), workspace_id: String(workspace), location_id: location === null ? null : String(location), provider: String(provider), account_key: String(account), month: String(month), reserved_microusd: Number(reserved), charged_microusd: Number(reserved), outcome: "reserved" });
        } else if (sql.includes("FROM conversation_research_ledger") && sql.includes("FOR UPDATE")) {
          return { rows: entries.filter(row => row.id === values[0] && row.workspace_id === values[1] && row.provider === values[2] && row.account_key === values[3] && row.location_id === values[4]).map(row => ({ ...row, reserved_microusd: String(row.reserved_microusd), charged_microusd: String(row.charged_microusd) })) };
        } else if (sql.includes("UPDATE conversation_research_ledger")) {
          const entry = entries.find(row => row.id === values[0]);
          if (!entry) throw new Error("fixture reservation missing");
          entry.charged_microusd = Number(values[1]); entry.outcome = String(values[3]);
        } else if (sql.includes("UPDATE conversation_research_accounts")) {
          blocked.add(`${values[0]}:${values[1]}`);
        } else if (!["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) && !sql.includes("INSERT INTO conversation_research_accounts")) {
          throw new Error(`Unhandled fixture SQL: ${sql}`);
        }
        return { rows: [], command: sql === "COMMIT" ? "COMMIT" : "SELECT" };
      },
    };
  } };
  return { pool: pool as unknown as Pick<Pool, "connect">, entries, blocked, statements };
}
const input: ResearchBudgetInput = {
  workspaceId: "workspace-a", locationId: "location-a", provider: "firecrawl", accountId: "shared-account", ceilingUsd: 0.6,
  workspaceLimitUsd: 1, accountLimitUsd: 1, now: new Date("2026-10-28T12:00:00.000Z"),
};

describe("atomic persistent research budget", () => {
  it("serializes two workspaces against one account and never reserves beyond its monthly ceiling", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const results = await Promise.all([repo.reserve(input), repo.reserve({ ...input, workspaceId: "workspace-b" })]);
    expect(results.filter(result => result.allowed)).toHaveLength(1);
    expect(results.find(result => !result.allowed)).toMatchObject({ allowed: false, reason: "account_budget_exhausted", budget: { accountRemainingUsd: 0.4 } });
    expect(db.entries).toHaveLength(1); expect(db.entries[0].charged_microusd).toBe(600000);
    const lockKeys = db.statements.filter(row => row.sql.includes("pg_advisory_xact_lock")).map(row => row.values[0]);
    expect(lockKeys.filter(key => key === "conversation-research:account:firecrawl:shared-account")).toHaveLength(2);
    expect(lockKeys).toContain("conversation-research:workspace:workspace-a");
  });
  it("charges a workspace across providers and accounts, separately from any delivery quota", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    await repo.settle({ ...input, reservationId: first.reservationId, outcome: "failed" });
    expect(await repo.reserve({ ...input, provider: "dataforseo", accountId: "other-account" })).toMatchObject({ allowed: false, reason: "workspace_budget_exhausted", budget: { workspaceRemainingUsd: 0.4, accountRemainingUsd: 1 } });
    expect(db.entries).toHaveLength(1);
  });
  it("retains the entire ceiling on failed/unknown calls without refunds", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    const settled = await repo.settle({ ...input, reservationId: first.reservationId, outcome: "failed", reportedUsd: 0.01 });
    expect(settled.budget).toEqual({ workspaceRemainingUsd: 0.4, accountRemainingUsd: 0.4, reservedUsd: 0.6 });
    expect(db.entries[0]).toMatchObject({ reserved_microusd: 600000, charged_microusd: 600000, outcome: "failed" });
  });
  it("persists upward reconciliation and blocks the provider account across workspaces and later months", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    expect(await repo.settle({ ...input, reservationId: first.reservationId, outcome: "ready", reportedUsd: 0.8 })).toMatchObject({ allowed: false, reason: "pricing_ceiling_exceeded", budget: { workspaceRemainingUsd: 0.2, accountRemainingUsd: 0.2, reservedUsd: 0.8 } });
    expect(db.entries[0].charged_microusd).toBe(800000);
    expect(await repo.reserve({ ...input, workspaceId: "workspace-b", now: new Date("2026-11-01T00:00:00Z") })).toMatchObject({ allowed: false, reason: "pricing_ceiling_exceeded" });
    expect(db.entries).toHaveLength(1);
  });
  it("never decreases an already reconciled charge on repeated settlement", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    await repo.settle({ ...input, reservationId: first.reservationId, outcome: "ready", reportedUsd: 0.8 });
    await repo.settle({ ...input, reservationId: first.reservationId, outcome: "failed", reportedUsd: 0.1 });
    expect(db.entries[0].charged_microusd).toBe(800000);
  });
  it("blocks an unsettled account reservation even if it has plenty of remaining funds", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    await repo.reserve({ ...input, accountLimitUsd: 10 });
    expect(await repo.reserve({ ...input, workspaceId: "workspace-b", accountLimitUsd: 10 })).toMatchObject({ allowed: false, reason: "account_reconciliation_pending" });
    expect(db.entries).toHaveLength(1);
  });
  it("settles against the original UTC month when a request crosses a month boundary", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    expect((await repo.settle({ ...input, now: new Date("2026-11-01T00:00:00Z"), reservationId: first.reservationId, outcome: "failed" })).budget).toMatchObject({ accountRemainingUsd: 0.4 });
    expect((await repo.status({ ...input, now: new Date("2026-11-01T00:00:00Z") })).budget).toEqual({ workspaceRemainingUsd: 1, accountRemainingUsd: 1, reservedUsd: 0 });
  });
  it("rejects substituted reservation scope and invalid amounts before they can change the ledger", async () => {
    const db = ledgerDatabase(), repo = researchBudgetRepository(db.pool);
    const first = await repo.reserve(input);
    if (!first.allowed) throw new Error("fixture first reservation failed");
    await expect(repo.settle({ ...input, workspaceId: "workspace-b", reservationId: first.reservationId, outcome: "ready", reportedUsd: 0.8 })).rejects.toThrow("research_reservation_missing");
    await expect(repo.settle({ ...input, locationId: "location-b", reservationId: first.reservationId, outcome: "ready", reportedUsd: 0.8 })).rejects.toThrow("research_reservation_missing");
    expect(db.entries[0].charged_microusd).toBe(600000);
    for (const ceilingUsd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(repo.reserve({ ...input, ceilingUsd })).rejects.toThrow("research_budget_invalid");
    }
    expect(db.entries).toHaveLength(1);
  });
});

it("never rounds a configured limit up across a micro-USD boundary",async()=>{
  const db=ledgerDatabase(),repo=researchBudgetRepository(db.pool);
  expect(await repo.reserve({...input,ceilingUsd:.000124,workspaceLimitUsd:.000123,accountLimitUsd:1})).toMatchObject({allowed:false,reason:"workspace_budget_exhausted"});
  expect(db.entries).toEqual([]);
});
