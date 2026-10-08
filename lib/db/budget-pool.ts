import "server-only";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { assertExecutionBudget, currentExecutionBudget, type ExecutionBudget } from "@/lib/jobs/execution-budget";
type PromiseQuery = (...args: unknown[]) => Promise<QueryResult<QueryResultRow>>;
/** Private request pool: real server statement/lock cancellation plus socket destruction at the same deadline. */
export function createBudgetPool(config: PoolConfig, workBudget: ExecutionBudget): Pool {
  const pool = new Pool({ ...config, connectionTimeoutMillis: Math.max(1,workBudget.remainingMs()), statement_timeout: Math.max(1,workBudget.remainingMs()) });
  pool.on("error",()=>{}); // No raw connection/provider details in background logs.
  const nativeConnect = pool.connect.bind(pool), nativeEnd = pool.end.bind(pool);
  const active = new Set<PoolClient>();
  pool.connect = (async () => {
    const budget = currentExecutionBudget() ?? workBudget;
    assertExecutionBudget(budget);
    // pg 8.23 snapshots these public options synchronously for BOTH queue and connection timers.
    // This is a private pool, so concurrent app requests cannot change each other's timeouts.
    pool.options.connectionTimeoutMillis = Math.max(1,budget.remainingMs());
    pool.options.statement_timeout = Math.max(1,budget.remainingMs());
    const client = await nativeConnect();
    try { assertExecutionBudget(budget); } catch(error) { client.release(true); throw error; }
    const originalQuery=client.query, originalRelease=client.release;
    const query=originalQuery.bind(client) as PromiseQuery, release=originalRelease.bind(client);
    let released=false;
    const finish = (destroy = false) => { if(released)return; released=true; budget.signal.removeEventListener("abort",abort); active.delete(client); client.query=originalQuery; release(destroy); };
    const abort=()=>finish(true);
    client.release=finish;
    client.query=(async(...args:unknown[])=>{
      assertExecutionBudget(budget);
      if (released || args.some(arg=>typeof arg==="function")) throw new Error("budget_query_unavailable");
      const text=typeof args[0]==="string"?args[0]:(args[0] as {text?:string})?.text ?? "";
      // ROLLBACK must remain possible after a server statement error aborted a transaction.
      if(!/^\s*ROLLBACK\b/i.test(text)) {
        const remaining=Math.max(1,budget.remainingMs());
        const statementLimit = typeof config.statement_timeout === "number" && config.statement_timeout > 0 ? config.statement_timeout : remaining;
        const lockLimit = typeof config.lock_timeout === "number" && config.lock_timeout > 0 ? config.lock_timeout : 1000;
        await query("SELECT set_config('statement_timeout',$1,false),set_config('lock_timeout',$2,false)",[String(Math.min(remaining,statementLimit)),String(Math.min(remaining,lockLimit))]);
        assertExecutionBudget(budget);
      }
      return query(...args);
    }) as typeof client.query;
    active.add(client); budget.signal.addEventListener("abort",abort,{once:true});
    return client;
  }) as typeof pool.connect;
  pool.query=(async(...args:unknown[])=>{const client=await pool.connect();try{return await (client.query as PromiseQuery)(...args);}finally{client.release();}}) as typeof pool.query;
  pool.end=(async()=>{for(const client of [...active])client.release(true);await nativeEnd();}) as typeof pool.end;
  return pool;
}
