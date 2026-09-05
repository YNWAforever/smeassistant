import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { completionClient } from "@/lib/workspace/completion-client";
import { loadSnapshotForJob, type ScanDiffRow } from "@/lib/workspace/snapshots";
import { recordMeasurements } from "@/lib/workspace/measurements";
import { postProcessWorkspaceScan } from "@/lib/workspace/post-process";
import { integrationClient, seedQueuedJob } from "./fixtures";
import { execSql } from "./docker";

// Actual Postgres + PostgREST only. The global setup fails when Docker is absent;
// there are no skips or fixture substitutes for the database assertions below.
function sql(statement: string): void {
  const suffix = process.env.INTEGRATION_DB_SUFFIX;
  if (!suffix) throw new Error("isolated database setup did not run");
  execSql(suffix, statement);
}
function withHeaders(headers: Record<string, string>, key = process.env.SUPABASE_SERVICE_ROLE_KEY!): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false }, global: { headers } });
}
function anonKey(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url");
  const signature = createHmac("sha256", "sme-scanner-integration-jwt-secret-32b").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("workspace completion real database recovery and fences", () => {
  const db = integrationClient();
  let workspace: string;
  let job: string;
  let user: string;
  let token: string;

  beforeEach(async () => {
    workspace = randomUUID(); user = randomUUID();
    sql(`insert into auth.users(id,email) values ('${user}','${user}@example.test');
      insert into public.workspaces(id,business_name,market,tier,slug) values ('${workspace}','Fixture completion cafe','hk','lite','completion-${workspace}');
      insert into public.workspace_members(workspace_id,user_id,email,role,accepted_at) values ('${workspace}','${user}','${user}@example.test','owner',now());`);
    ({ jobId: job } = await seedQueuedJob({ workspace_id: workspace, status: "done", website_url: null, input_snapshot: {}, raw_data: {}, completed_at: "2026-09-05T00:00:00Z" }));
    const claimed = await db.rpc("claim_workspace_completion", { p_job_id: job });
    expect(claimed.error).toBeNull();
    expect(claimed.data.status).toBe("claimed");
    token = claimed.data.token;
  });

  function notification(target = workspace) {
    return { workspace_id: target, user_id: user, kind: "scan.completed", title: { en: "Fixture completed" } };
  }
  async function count(table: string): Promise<number> {
    const result = await db.from(table).select("*", { count: "exact", head: true }).eq("workspace_id", workspace);
    expect(result.error).toBeNull();
    return result.count!;
  }

  it("recovers after snapshot persistence and after notification acknowledgement loss without duplicates", async () => {
    // One isolated fault after the snapshot write but before its audit insert.
    sql(`create function public.it_completion_audit_fault() returns trigger language plpgsql as $$ begin
      if new.workspace_id = '${workspace}'::uuid and new.event = 'snapshot.created' then raise exception 'injected audit failure'; end if;
      return new; end; $$;
      create trigger it_completion_audit_fault before insert on public.audit_events for each row execute function public.it_completion_audit_fault();`);
    try {
      const failed = await postProcessWorkspaceScan(completionClient(job, token), job);
      expect(failed.error).not.toBeNull();
      expect(await count("scan_snapshots")).toBe(1);
      expect(await count("workspace_notifications")).toBe(0);
    } finally {
      sql("drop trigger it_completion_audit_fault on public.audit_events; drop function public.it_completion_audit_fault();");
    }
    expect((await postProcessWorkspaceScan(completionClient(job, token), job)).error).toBeNull();
    const readAt = "2026-09-05T01:00:00+00:00";
    expect((await db.from("workspace_notifications").update({ read_at: readAt }).eq("workspace_id", workspace)).error).toBeNull();
    // Simulate lost checkpoint acknowledgement: a fresh client repeats all helpers.
    expect((await postProcessWorkspaceScan(completionClient(job, token), job)).error).toBeNull();
    expect(await count("scan_snapshots")).toBe(1);
    expect(await count("actions")).toBe(1); // missing Google connection only
    expect(await count("audit_events")).toBe(2); // snapshot.created + action.derived
    expect(await count("workspace_notifications")).toBe(1);
    const notice = await db.from("workspace_notifications").select("read_at").eq("workspace_id", workspace).single();
    expect(Date.parse(notice.data!.read_at)).toBe(Date.parse(readAt));
    const saved = await db.from("audit_jobs").select("status").eq("id", job).single();
    expect(saved.data!.status).toBe("done");
  });

  it.each([
    { "x-workspace-completion-job": "not-a-uuid", "x-workspace-completion-token": "not-a-uuid" },
    { "x-workspace-completion-job": randomUUID() },
    { "x-workspace-completion-token": randomUUID() },
  ])("rejects malformed or partial private completion context: %j", async (headers) => {
    const result = await withHeaders(headers as Record<string, string>).from("workspace_notifications").insert(notification());
    expect(result.error).not.toBeNull();
    expect(await count("workspace_notifications")).toBe(0);
  });

  it("rejects expired and replaced worker writes and stale acknowledgement; fresh worker succeeds", async () => {
    sql(`update public.workspace_scan_completions set lease_until=now()-interval '1 second' where job_id='${job}';`);
    expect((await completionClient(job, token).from("workspace_notifications").insert(notification())).error).not.toBeNull();
    const next = await db.rpc("claim_workspace_completion", { p_job_id: job });
    expect(next.error).toBeNull(); expect(next.data.status).toBe("claimed"); expect(next.data.token).not.toBe(token);
    expect((await completionClient(job, token).from("workspace_notifications").insert(notification())).error).not.toBeNull();
    const ack = await db.rpc("finish_workspace_completion", { p_job_id: job, p_token: token, p_succeeded: true, p_error: null });
    expect(ack.error).toBeNull(); expect(ack.data).toBe(false);
    expect((await completionClient(job, next.data.token).from("workspace_notifications").insert(notification())).error).toBeNull();
    expect(await count("workspace_notifications")).toBe(1);
  });

  it("rejects cross-workspace writes and anonymous RPC access while preserving no-header service writes", async () => {
    const other = randomUUID();
    sql(`insert into public.workspaces(id,business_name,market,tier) values ('${other}','Other fixture','hk','lite');`);
    expect((await completionClient(job, token).from("workspace_notifications").insert(notification(other))).error).not.toBeNull();
    const anon = withHeaders({ "x-workspace-completion-job": job, "x-workspace-completion-token": token }, anonKey());
    expect((await anon.rpc("claim_workspace_completion", { p_job_id: job })).error).not.toBeNull();
    expect((await anon.from("workspace_notifications").insert(notification())).error).not.toBeNull();
    expect((await db.from("workspace_notifications").insert(notification())).error).toBeNull();
  });

  it("persists retry state independently of terminal scan status and rejects premature lease reuse", async () => {
    const finished = await db.rpc("finish_workspace_completion", { p_job_id: job, p_token: token, p_succeeded: false, p_error: "fixture failure" });
    expect(finished.error).toBeNull(); expect(finished.data).toBe(true);
    const state = await db.from("workspace_scan_completions").select("state,last_error,lease_token").eq("job_id", job).single();
    expect(state.data).toMatchObject({ state: "retry", last_error: "workspace_post_process_failed", lease_token: null });
    expect((await db.rpc("claim_workspace_completion", { p_job_id: job })).data.status).toBe("busy");
    expect((await completionClient(job, token).from("workspace_notifications").insert(notification())).error).not.toBeNull();
    expect((await db.from("audit_jobs").select("status").eq("id", job).single()).data!.status).toBe("done");
  });

  it("rejects missing lease expiry instead of treating NULL as active", async () => {
    sql(`update public.workspace_scan_completions set lease_until=null where job_id='${job}';`);
    expect((await completionClient(job, token).from("workspace_notifications").insert(notification())).error).not.toBeNull();
  });

  it("allows only measurement-state repair on workspace-wide actions for a location-scoped completion", async () => {
    const location = randomUUID(); const anotherLocation = randomUUID(); const globalAction = randomUUID(); const foreignAction = randomUUID();
    sql(`insert into public.locations(id,workspace_id,slug,name) values ('${location}','${workspace}','one','One'),('${anotherLocation}','${workspace}','two','Two');
      update public.audit_jobs set location_id='${location}' where id='${job}';
      insert into public.actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key)
      values ('${globalAction}','${workspace}',null,'review-response','{}','{}','{}','high',50,'{}',5,'Beta','${globalAction}'),
      ('${foreignAction}','${workspace}','${anotherLocation}','review-response','{}','{}','{}','high',50,'{}',5,'Beta','${foreignAction}');`);
    const worker = completionClient(job, token);
    expect((await worker.from("actions").update({ measurement_state: "measured" }).eq("id", globalAction)).error).toBeNull();
    expect((await worker.from("actions").update({ title: { en: "spoofed" } }).eq("id", globalAction)).error).not.toBeNull();
    expect((await worker.from("actions").update({ measurement_state: "measured" }).eq("id", foreignAction)).error).not.toBeNull();
  });

  it("fences older action writes after a newer snapshot and lets historical helper replay converge", async () => {
    expect((await postProcessWorkspaceScan(completionClient(job, token), job)).error).toBeNull();
    const newer = await seedQueuedJob({ workspace_id: workspace, status: "done", website_url: null, input_snapshot: {}, raw_data: {}, completed_at: "2026-09-06T00:00:00Z" });
    // Interactive no-header write models a newer immutable snapshot arriving.
    sql(`insert into public.scan_snapshots(job_id,workspace_id,market,observed_at,coverage,module_states,metrics)
      values ('${newer.jobId}','${workspace}','hk','2026-09-06T00:00:00Z',0,'{}','{}');`);
    expect((await completionClient(job, token).from("actions").update({ priority_score: 1 }).eq("workspace_id", workspace)).error).not.toBeNull();
    // Application preflight now skips historical action mutation and the
    // trigger remains the authority if the state changes after that read.
    expect((await postProcessWorkspaceScan(completionClient(job, token), job)).error).toBeNull();
    expect(await count("workspace_notifications")).toBe(1);
  });

  it("links a comparable second scan once and repairs state after measurement persistence", async () => {
    const base = await seedQueuedJob({ workspace_id: workspace, status: "done", website_url: null, completed_at: "2026-08-05T00:00:00Z" });
    const baseSnapshot = randomUUID(); const headSnapshot = randomUUID(); const action = randomUUID();
    sql(`insert into public.scan_snapshots(id,job_id,workspace_id,market,observed_at,coverage,module_states,metrics,comparable_to)
      values ('${baseSnapshot}','${base.jobId}','${workspace}','hk','2026-08-05T00:00:00Z',1,'{}','{"gbp.response_rate_pct":20}',null),
      ('${headSnapshot}','${job}','${workspace}','hk','2026-09-05T00:00:00Z',1,'{}','{"gbp.response_rate_pct":60}','${baseSnapshot}');
      insert into public.actions(id,workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,source_snapshot_id)
      values ('${action}','${workspace}','review-response','{}','{}','{}','high',50,'{}',5,'Beta','${action}','${headSnapshot}');
      create function public.it_completion_measurement_fault() returns trigger language plpgsql as $$ begin
      if new.workspace_id = '${workspace}'::uuid and new.measurement_state = 'measured' then raise exception 'injected state failure'; end if;
      return new; end; $$;
      create trigger it_completion_measurement_fault before update on public.actions for each row execute function public.it_completion_measurement_fault();`);
    const head = await loadSnapshotForJob(db, job);
    expect(head!.comparableTo).toBe(baseSnapshot);
    const diff: ScanDiffRow = { id: randomUUID(), base_job_id: base.jobId, head_job_id: job, comparable: true,
      incomparable_reason: null, composite_withheld_reason: null, intersection_modules: ["gbp"],
      composite_base: 20, composite_head: 60, composite_delta: 40, resolved_findings: [], regressed_findings: [],
      decayed_findings: [], lost_coverage: [], gained_coverage: [], created_at: "2026-09-05T00:00:00Z" };
    try {
      await expect(recordMeasurements(completionClient(job, token), { headSnapshot: head!, diff })).rejects.toThrow("measurement state update failed");
      expect(await count("action_measurements")).toBe(1);
    } finally {
      sql("drop trigger it_completion_measurement_fault on public.actions; drop function public.it_completion_measurement_fault();");
    }
    expect(await recordMeasurements(completionClient(job, token), { headSnapshot: head!, diff })).toEqual({ comparable: true, recorded: 0, skipped: 1 });
    const measurement = await db.from("action_measurements").select("before_snapshot_id,after_snapshot_id,delta,fact_type").eq("workspace_id", workspace).single();
    expect(measurement.data).toMatchObject({ before_snapshot_id: baseSnapshot, after_snapshot_id: headSnapshot, delta: 40, fact_type: "Observed" });
    expect((await db.from("actions").select("measurement_state").eq("id", action).single()).data!.measurement_state).toBe("measured");
    expect(await count("action_measurements")).toBe(1);
    // An incomparable pair does not invent another measurement or trend.
    expect(await recordMeasurements(completionClient(job, token), { headSnapshot: head!, diff: { ...diff, comparable: false, incomparable_reason: "SCORING_VERSION_MISMATCH" } })).toEqual({ comparable: false, recorded: 0, skipped: 0 });
    expect(await count("action_measurements")).toBe(1);
  });
});
