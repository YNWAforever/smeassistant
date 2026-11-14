import "server-only";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { readDatabaseConfig } from "@/lib/db/config";
import { assertExecutionBudget, BudgetExhausted, currentExecutionBudget, type ExecutionBudget } from "@/lib/jobs/execution-budget";
import type { StudioDeadline } from "./deadline";
import { studioSessionConnectionString } from "./session-connection";
import { STUDIO_TURN_LOCK_NAMESPACE } from "./turn-lock";

type SessionPool = Pick<Pool, "connect" | "end"> & Partial<Pick<Pool, "on">>;
type PromiseQuery = <R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<R>>;

/** Only use this race when the underlying resource has its own cancellation. */
function untilAbort<T>(budget: ExecutionBudget, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new BudgetExhausted());
    budget.signal.addEventListener("abort", abort, { once: true });
    if (budget.signal.aborted) abort();
    work.then(value => {
      budget.signal.removeEventListener("abort", abort);
      try { assertExecutionBudget(budget); resolve(value); } catch (error) { reject(error); }
    }, error => {
      budget.signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

/**
 * A private, session-affine connection owns both the advisory lock and durable
 * writes. Whole short transactions are serialized; none encloses provider work.
 * Work queries expire at50s but the connection survives finalization until55s.
 * Closing the session fences writes even when a COMMIT acknowledgement is lost.
 * Remote lock release timing under a network partition is not a local guarantee.
 */
export async function acquireStudioTurnSession(
  conversationId: string,
  deadline: StudioDeadline,
  deps: { pool?: SessionPool } = {},
) {
  assertExecutionBudget(deadline.work);
  const pool: SessionPool = deps.pool ?? new Pool({
    connectionString: studioSessionConnectionString(readDatabaseConfig(process.env).applicationUrl),
    max: 1,
    connectionTimeoutMillis: Math.max(1, deadline.work.remainingMs()),
    statement_timeout: Math.max(1, deadline.work.remainingMs()),
  });
  let client: PoolClient | undefined;
  let destroyed = false;
  let closing = false;
  let locked = false;
  let tail: Promise<void> = Promise.resolve();
  let ending: Promise<void> | undefined;
  let releasePromise: Promise<void> | undefined;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    try { client?.release(true); } catch { /* A dead session cannot be reused. */ }
    ending = pool.end().catch(() => {});
  };
  pool.on?.("error", destroy);
  deadline.finalization.signal.addEventListener("abort", destroy, { once: true });

  try {
    const connection = pool.connect().then(value => {
      if (destroyed || deadline.work.signal.aborted) {
        value.release(true);
        throw new BudgetExhausted();
      }
      client = value;
      return value;
    });
    client = await untilAbort(deadline.work, connection);
    client.on?.("error", destroy);
    const nativeQuery = client.query.bind(client) as PromiseQuery;
    const query = async <R extends QueryResultRow = QueryResultRow>(budget: ExecutionBudget, text: string, values?: unknown[]): Promise<QueryResult<R>> => {
      if (destroyed) throw new BudgetExhausted();
      assertExecutionBudget(budget);
      if (!/^\s*ROLLBACK\b/i.test(text)) {
        const remaining = Math.max(1, Math.min(budget.remainingMs(), deadline.finalization.remainingMs()));
        await untilAbort(deadline.finalization, nativeQuery("SELECT set_config('statement_timeout',$1,false), set_config('lock_timeout',$2,false)", [String(remaining), String(Math.min(1000, remaining))]));
        assertExecutionBudget(budget);
      }
      return untilAbort(deadline.finalization, nativeQuery<R>(text, values));
    };
    const acquisition = await untilAbort(deadline.work, query(deadline.work, "SELECT pg_try_advisory_lock($1::int, hashtext($2)::int) AS locked", [STUDIO_TURN_LOCK_NAMESPACE, conversationId]));
    locked = acquisition.rows[0]?.locked === true;
    if (!locked) {
      destroy();
      await untilAbort(deadline.finalization, ending!);
      deadline.finalization.signal.removeEventListener("abort", destroy);
      return null;
    }

    const admit = <T>(run: () => Promise<T>): Promise<T> => {
      if (closing || destroyed) return Promise.reject(new BudgetExhausted());
      const result = tail.then(run);
      tail = result.then(() => {}, () => {});
      return result;
    };
    const selectedBudget = () => currentExecutionBudget() ?? deadline.work;
    const executor = {
      query: ((text: string, values?: unknown[]) => {
        const budget = selectedBudget();
        return admit(() => query(budget, text, values));
      }) as PoolClient["query"],
    };
    const transaction = <T>(run: (connection: PoolClient) => Promise<T>): Promise<T> => {
      const budget = selectedBudget();
      return admit(async () => {
        let active = true;
        const scopedClient = new Proxy(client!, {
          get(target, property) {
            if (property === "query") return (text: string, values?: unknown[]) => {
              if (!active) return Promise.reject(new Error("studio_transaction_closed"));
              return query(budget, text, values);
            };
            if (property === "release") return () => { throw new Error("studio_session_owned_by_turn"); };
            return Reflect.get(target, property);
          },
        });
        try {
          await query(budget, "BEGIN");
          const value = await run(scopedClient);
          active = false;
          const result = await query(budget, "COMMIT");
          if (result.command === "ROLLBACK") throw new Error("transaction_rolled_back");
          return value;
        } catch (error) {
          active = false;
          try { await query(deadline.finalization, "ROLLBACK"); }
          catch { destroy(); }
          throw error;
        }
      });
    };
    const release = (): Promise<void> => {
      if (releasePromise) return releasePromise;
      closing = true;
      releasePromise = (async () => {
        try {
          await untilAbort(deadline.finalization, tail);
          if (!destroyed && locked) {
            await query(deadline.finalization, "SELECT pg_advisory_unlock($1::int, hashtext($2)::int) AS released", [STUDIO_TURN_LOCK_NAMESPACE, conversationId]);
            locked = false;
          }
        } finally {
          destroy();
          deadline.finalization.signal.removeEventListener("abort", destroy);
          await untilAbort(deadline.finalization, ending!);
        }
      })();
      return releasePromise;
    };
    return { executor, transaction, release };
  } catch (error) {
    destroy();
    deadline.finalization.signal.removeEventListener("abort", destroy);
    try { await untilAbort(deadline.finalization, ending!); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

export type StudioTurnSession = NonNullable<Awaited<ReturnType<typeof acquireStudioTurnSession>>>;
