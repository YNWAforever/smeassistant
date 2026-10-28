import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { applyMigrations } from "../../scripts/neon/migrations";
import { researchBudgetRepository } from "../../lib/repositories/research-budget";
describe("Stage 2 research reservations on owned PostgreSQL",()=>{
  let fixture:NeonDatabaseFixture,owner:Pool,runtime:Pool;
  beforeAll(async()=>{
    fixture=await startNeonDatabaseFixture("test");owner=new Pool({connectionString:fixture.databaseUrl});
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");await applyMigrations(owner);
    await owner.query("CREATE ROLE research_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const url=new URL(fixture.databaseUrl);url.username="research_runtime";url.password="fixture-only";runtime=new Pool({connectionString:url.href});
  });
  afterAll(async()=>{await Promise.allSettled([owner?.end(),runtime?.end()]);fixture?.stop();});
  async function input(accountId=crypto.randomUUID()){
    const workspaceId=(await runtime.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id as string;
    return {workspaceId,locationId:null,provider:"firecrawl" as const,accountId,ceilingUsd:.01,workspaceLimitUsd:.02,accountLimitUsd:.02,now:new Date("2026-10-27T00:00:00Z")};
  }
  it("serializes cross-workspace requests and retains failed/timeout charges",async()=>{
    const a=await input(),b=await input(a.accountId),repo=researchBudgetRepository(runtime);
    const reservations=await Promise.all([repo.reserve(a),repo.reserve(b)]);
    expect(reservations.filter(r=>r.allowed)).toHaveLength(1);
    const index=reservations.findIndex(r=>r.allowed),reservation=reservations[index];if(!reservation.allowed)throw new Error("expected reservation");
    const scope=index===0?a:b,other=index===0?b:a;
    expect(reservations[1-index]).toMatchObject({allowed:false,reason:"account_reconciliation_pending"});
    await repo.settle({...scope,reservationId:reservation.reservationId,outcome:"failed"});
    const second=await repo.reserve(other);expect(second.allowed).toBe(true);if(!second.allowed)throw new Error("expected second reservation");
    await repo.settle({...other,reservationId:second.reservationId,outcome:"failed"});
    expect(await repo.reserve(a)).toMatchObject({allowed:false,reason:"account_budget_exhausted",budget:{accountRemainingUsd:0}});
    expect((await runtime.query("SELECT count(*)::int AS n,sum(charged_microusd)::int AS charged FROM conversation_research_ledger WHERE account_key=$1",[a.accountId])).rows[0]).toEqual({n:2,charged:20000});
    expect((await runtime.query("SELECT * FROM workspace_usage WHERE workspace_id=ANY($1::uuid[])",[[a.workspaceId,b.workspaceId]])).rows).toEqual([]);
  });
  it("blocks upward price breaches, rejects refunds and retains account spend after workspace deletion",async()=>{
    const a=await input(),repo=researchBudgetRepository(runtime),reservation=await repo.reserve(a);if(!reservation.allowed)throw new Error("expected reservation");
    const outcome=await repo.settle({...a,reservationId:reservation.reservationId,outcome:"partial",reportedUsd:.03});
    expect(outcome).toMatchObject({allowed:false,reason:"pricing_ceiling_exceeded"});
    await expect(runtime.query("UPDATE conversation_research_ledger SET charged_microusd=1 WHERE id=$1",[reservation.reservationId])).rejects.toThrow();
    await expect(runtime.query("DELETE FROM conversation_research_ledger WHERE id=$1",[reservation.reservationId])).rejects.toMatchObject({code:"42501"});
    await runtime.query("DELETE FROM workspaces WHERE id=$1",[a.workspaceId]);
    const b=await input(a.accountId);expect(await repo.reserve(b)).toMatchObject({allowed:false,reason:"pricing_ceiling_exceeded"});
    expect((await runtime.query("SELECT charged_microusd::int AS cost FROM conversation_research_ledger WHERE id=$1",[reservation.reservationId])).rows[0].cost).toBe(30000);
  });
});
