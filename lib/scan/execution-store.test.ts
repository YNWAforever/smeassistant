import { describe, expect, it, vi } from "vitest";
import { createScanExecutionStore } from "./execution-store";
import { createScanExecution, asClaimedJob } from "@sme-scanner/scan-engine";
import { BUDGETED_CLAIM_SQL, SCAN_BUDGET_LOCK_SQL } from "@/lib/budgets/scan";
describe("terminal analytics lifetime", () => {
  it("tracks the PostHog tail on a failed scan and never inserts from recordTerminal", async () => {
    let captureDone!: () => void;
    const capture = new Promise<void>((resolve) => {
      captureDone = resolve;
    });
    const insert = vi.fn(async () => ({ inserted: true }));
    const waited: Promise<unknown>[] = [];
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: () => capture,
        reportError: vi.fn(),
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    store.claimJob = async () =>
      asClaimedJob({ id: "job", business_name: "fixture" });
    store.setStage = async () => {};
    store.persist = async () => {};
    const unavailable = {
      status: "unavailable",
      limitationCode: "NOT_MEASURED",
    } as const;
    expect(
      await createScanExecution({
        store,
        collect: async () => ({
          ig: unavailable,
          gbp: unavailable,
          aeo: unavailable,
        }),
        persistEvidence: async () => {},
      })("job"),
    ).toEqual({ status: "failed", failurePersistence: "persisted" });
    // persist() is stubbed here, so this cannot prove where the row is
    // written. What it proves: recordTerminal registers exactly one host
    // lifetime promise, that promise is the PostHog tail, and recordTerminal
    // never calls analytics.insert.
    expect(waited).toHaveLength(1);
    let settled = false;
    void waited[0].then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    captureDone();
    await waited[0];
    expect(insert).not.toHaveBeenCalled();
  });
  it("keeps the registered lifetime promise resolved when PostHog fails", async () => {
    const waited: Promise<unknown>[] = [];
    const report = vi.fn();
    const insert = vi.fn();
    const store = createScanExecutionStore("session", {
      analytics: {
        insert,
        capturePostHog: async () => {
          throw new Error("down");
        },
        reportError: report,
      },
      waitUntil: (p) => {
        waited.push(p);
      },
    });
    await store.recordTerminal({ jobId: "job", status: "failed", coverage: 0 });
    await expect(waited[0]).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith("provider_unavailable");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("budgeted claim", () => {
  function pool(respond: (sql: string) => { rows: unknown[] } | Error) {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      const answer = respond(sql);
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { statements, value: { query, connect: async () => ({ query, release: () => {} }) } as never };
  }

  it("claims in its own transaction: BEGIN, the budget lock, one claim statement, COMMIT", async () => {
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? { rows: [{ budget_allowed: true, budget_global_used: 0, budget_workspace_used: 0, id: "job", business_name: "Fixture" }] } : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {} });
    expect(await store.claimJob("job")).toMatchObject({ id: "job", business_name: "Fixture" });
    expect(p.statements).toEqual(["BEGIN", SCAN_BUDGET_LOCK_SQL, BUDGETED_CLAIM_SQL, "COMMIT"]);
  });

  it("tells the host that a retry was refused on budget, and returns no job", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onBudgetRefused = vi.fn();
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? { rows: [{ budget_allowed: false, budget_global_used: 200, budget_workspace_used: 0, id: null }] } : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {}, onBudgetRefused });
    expect(await store.claimJob("job")).toBeNull();
    expect(onBudgetRefused).toHaveBeenCalledWith("scan_global");
    vi.restoreAllMocks();
  });

  it("keeps claim_failed, and reports no budget refusal, when the claim statement fails", async () => {
    const onBudgetRefused = vi.fn();
    const p = pool((sql) => (sql === BUDGETED_CLAIM_SQL ? new Error("db down") : { rows: [] }));
    const store = createScanExecutionStore("session", { pool: p.value, env: {}, onBudgetRefused });
    await expect(store.claimJob("job")).rejects.toThrow("claim_failed");
    expect(onBudgetRefused).not.toHaveBeenCalled();
    expect(p.statements).toContain("ROLLBACK");
  });
});
