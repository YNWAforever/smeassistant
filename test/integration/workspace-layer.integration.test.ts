import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { execSql } from "./docker";
import { integrationClient } from "./fixtures";

/**
 * The workspace layer (20260903000000_workspace_layer.sql) and its RPCs
 * (20260903000001_workspace_rpcs.sql) against a real Postgres + PostgREST.
 *
 * lib/security/*.test.ts already prove the static properties (RLS, grants,
 * delete graph). This proves what text parsing cannot:
 *
 *  1. The slug backfill expression produces the documented shape, and the
 *     migration really is re-runnable (it is applied a second time here).
 *  2. create_output_version numbers versions from max+1 under the
 *     (action_id, version_no) unique constraint and raises `version_conflict`
 *     on a stale base.
 *  3. approve_output_version is idempotent: the second call reports
 *     `already-approved` and writes no second audit row.
 *  4. export_output_version counts usage exactly once per version, replays an
 *     idempotency key without counting, and raises `allowance_exceeded` once
 *     the period allowance is reached.
 */
const MIGRATION = new URL("../../supabase/migrations/20260903000000_workspace_layer.sql", import.meta.url);

function suffix(): string {
  const value = process.env.INTEGRATION_DB_SUFFIX;
  if (!value) throw new Error("INTEGRATION_DB_SUFFIX is unset; global-setup did not run");
  return value;
}

type Rpc = { kind?: string; version_id?: string; version_no?: number; delivery_id?: string; counted?: boolean };

describe("workspace layer against a real database", () => {
  const supabase = integrationClient();
  const workspaceId = randomUUID();
  const actorId = randomUUID();
  let locationId: string;
  let jobId: string;
  let snapshotId: string;
  let actionId: string;
  let v1: string;
  let v2: string;

  beforeAll(async () => {
    // auth.users is not exposed through PostgREST; the actor row has to exist
    // for output_versions.author_user_id / approved_by.
    execSql(suffix(), `insert into auth.users (id, email) values ('${actorId}', 'owner-${actorId.slice(0, 8)}@example.test');`);
    // A workspace inserted WITHOUT a slug, as every row predating the column
    // was, so re-applying the migration below exercises the backfill.
    execSql(
      suffix(),
      `insert into public.workspaces (id, business_name, market, tier) values ('${workspaceId}', '錦汶館 Kam Man House!', 'hk', 'lite');`,
    );
    execSql(suffix(), readFileSync(MIGRATION, "utf8"));

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .insert({ workspace_id: workspaceId, slug: "yik-yam-street", name: "Yik Yam Street", is_primary: true })
      .select("id")
      .single();
    if (locationError) throw new Error(locationError.message);
    locationId = (location as { id: string }).id;

    const { data: job, error: jobError } = await supabase
      .from("audit_jobs")
      .insert({
        business_name: "錦汶館",
        region: "hk",
        status: "done",
        share_slug: `it-ws-${randomUUID().slice(0, 8)}`,
        workspace_id: workspaceId,
        location_id: locationId,
        overall_score: 62,
        score_coverage: 78,
        scoring_version: "2026-08-16",
        module_results: { ig: { status: "measured", score: 60 }, gbp: { status: "measured", score: 70 } },
      })
      .select("id")
      .single();
    if (jobError) throw new Error(jobError.message);
    jobId = (job as { id: string }).id;

    const { data: snapshot, error: snapshotError } = await supabase
      .from("scan_snapshots")
      .insert({
        job_id: jobId,
        workspace_id: workspaceId,
        location_id: locationId,
        market: "hk",
        observed_at: new Date().toISOString(),
        scoring_version: "2026-08-16",
        overall_score: 62,
        coverage: 78,
        module_states: { ig: { status: "measured" }, gbp: { status: "measured" } },
        metrics: {},
      })
      .select("id")
      .single();
    if (snapshotError) throw new Error(snapshotError.message);
    snapshotId = (snapshot as { id: string }).id;

    const { data: action, error: actionError } = await supabase
      .from("actions")
      .insert({
        workspace_id: workspaceId,
        location_id: locationId,
        template_key: "review_response",
        source_finding_keys: ["gbp.no_recent_reviews"],
        source_snapshot_id: snapshotId,
        title: { en: "Reply to 7 unanswered Google reviews" },
        summary: { en: "Seven recent customer reviews still need an owner response." },
        evidence: { en: "Response rate fell from 31% to 18%." },
        priority: "urgent",
        priority_score: 91,
        priority_factors: { regression: true },
        effort_minutes: 10,
        capability: "Demo",
        dedupe_key: `it-${workspaceId}-review_response`,
      })
      .select("id")
      .single();
    if (actionError) throw new Error(actionError.message);
    actionId = (action as { id: string }).id;
  });

  it("backfilled the slug from business_name and the id, and the migration re-applies cleanly", async () => {
    const { data, error } = await supabase.from("workspaces").select("slug, timezone, is_demo").eq("id", workspaceId).single();
    if (error) throw new Error(error.message);
    const row = data as { slug: string; timezone: string; is_demo: boolean };
    // CJK collapses with the punctuation into one hyphen run and is trimmed away.
    expect(row.slug).toBe(`kam-man-house-${workspaceId.slice(0, 8)}`);
    expect(row.timezone).toBe("Asia/Hong_Kong");
    expect(row.is_demo).toBe(false);
  });

  it("sets audit_jobs.location_id set null when the location goes away, keeping the job", async () => {
    // A throwaway location on the same workspace; deleting it must not touch the job.
    const { data: extra, error } = await supabase
      .from("locations")
      .insert({ workspace_id: workspaceId, slug: "tin-hau", name: "Tin Hau" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const extraId = (extra as { id: string }).id;
    const { error: moveError } = await supabase.from("audit_jobs").update({ location_id: extraId }).eq("id", jobId);
    if (moveError) throw new Error(moveError.message);
    const { error: deleteError } = await supabase.from("locations").delete().eq("id", extraId);
    if (deleteError) throw new Error(deleteError.message);

    const { data: job } = await supabase.from("audit_jobs").select("id, location_id").eq("id", jobId).single();
    expect(job).toEqual({ id: jobId, location_id: null });
  });

  it("numbers versions from max+1 and raises version_conflict on a stale base", async () => {
    const first = await supabase.rpc("create_output_version", {
      p_action_id: actionId,
      p_actor: actorId,
      p_author_type: "agent",
      p_action_run_id: null,
      p_body: "多謝你的寶貴意見。",
      p_alt: null,
      p_meta: { agent_key: "review_reply_agent" },
      p_base_version_id: null,
    });
    if (first.error) throw new Error(first.error.message);
    expect(first.data as Rpc).toMatchObject({ kind: "created", version_no: 1 });
    v1 = (first.data as Rpc).version_id!;

    const second = await supabase.rpc("create_output_version", {
      p_action_id: actionId,
      p_actor: actorId,
      p_author_type: "user",
      p_action_run_id: null,
      p_body: "多謝你再次到訪錦汶館。",
      p_alt: null,
      p_meta: {},
      p_base_version_id: v1,
    });
    if (second.error) throw new Error(second.error.message);
    expect(second.data as Rpc).toMatchObject({ kind: "created", version_no: 2 });
    v2 = (second.data as Rpc).version_id!;

    // The first draft is superseded by the second, never left as a live draft.
    const { data: v1Row } = await supabase.from("output_versions").select("approval_state, author_user_id").eq("id", v1).single();
    expect(v1Row).toEqual({ approval_state: "superseded", author_user_id: null });

    const stale = await supabase.rpc("create_output_version", {
      p_action_id: actionId,
      p_actor: actorId,
      p_author_type: "user",
      p_action_run_id: null,
      p_body: "stale edit",
      p_alt: null,
      p_meta: {},
      p_base_version_id: v1,
    });
    expect(stale.error?.message).toBe("version_conflict");

    const { data: events } = await supabase
      .from("audit_events")
      .select("event, actor_type, actor_id")
      .eq("workspace_id", workspaceId)
      .eq("event", "version.created");
    expect(events).toHaveLength(2);
    expect(events![0]).toMatchObject({ actor_type: "user", actor_id: actorId });
  });

  it("approves once and reports already-approved on the second call", async () => {
    const approved = await supabase.rpc("approve_output_version", { p_version_id: v2, p_actor: actorId, p_comment: "ship it" });
    if (approved.error) throw new Error(approved.error.message);
    expect(approved.data as Rpc).toMatchObject({ kind: "approved", version_no: 2 });

    const again = await supabase.rpc("approve_output_version", { p_version_id: v2, p_actor: actorId, p_comment: null });
    if (again.error) throw new Error(again.error.message);
    expect(again.data as Rpc).toMatchObject({ kind: "already-approved", version_no: 2 });

    const { data: version } = await supabase
      .from("output_versions")
      .select("approval_state, delivery_state, approved_by, reviewer_comment")
      .eq("id", v2)
      .single();
    expect(version).toEqual({ approval_state: "approved", delivery_state: "export_ready", approved_by: actorId, reviewer_comment: "ship it" });

    const { data: action } = await supabase.from("actions").select("action_state").eq("id", actionId).single();
    expect(action).toEqual({ action_state: "in_progress" });

    const { data: events } = await supabase
      .from("audit_events")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("event", "version.approved");
    expect(events).toHaveLength(1);

    const closed = await supabase.rpc("approve_output_version", { p_version_id: v1, p_actor: actorId, p_comment: null });
    expect(closed.error?.message).toBe("version_closed");
  });

  it("refuses to export a version that is not approved", async () => {
    const result = await supabase.rpc("export_output_version", {
      p_version_id: v1,
      p_actor: actorId,
      p_mode: "export",
      p_idempotency_key: `it-${randomUUID()}`,
    });
    expect(result.error?.message).toBe("not_approved");
  });

  it("counts usage once per version, replays an idempotency key without counting, then stops at the allowance", async () => {
    const key = `it-${randomUUID()}`;
    const first = await supabase.rpc("export_output_version", { p_version_id: v2, p_actor: actorId, p_mode: "export", p_idempotency_key: key });
    if (first.error) throw new Error(first.error.message);
    expect(first.data as Rpc).toMatchObject({ kind: "exported", counted: true });

    const replay = await supabase.rpc("export_output_version", { p_version_id: v2, p_actor: actorId, p_mode: "export", p_idempotency_key: key });
    if (replay.error) throw new Error(replay.error.message);
    expect(replay.data as Rpc).toMatchObject({ kind: "existing", counted: false, delivery_id: (first.data as Rpc).delivery_id });

    const copy = await supabase.rpc("export_output_version", {
      p_version_id: v2,
      p_actor: actorId,
      p_mode: "copy",
      p_idempotency_key: `it-${randomUUID()}`,
    });
    if (copy.error) throw new Error(copy.error.message);
    expect(copy.data as Rpc).toMatchObject({ kind: "exported", counted: false });

    // lite tier: the RPC created the period row lazily with allowance 3.
    const { data: usage } = await supabase
      .from("workspace_usage")
      .select("period, approved_deliveries, allowance")
      .eq("workspace_id", workspaceId);
    expect(usage).toHaveLength(1);
    expect(usage![0]).toMatchObject({ approved_deliveries: 1, allowance: 3 });
    expect((usage![0] as { period: string }).period).toMatch(/^\d{4}-\d{2}$/);

    const { data: version } = await supabase.from("output_versions").select("delivery_state, first_exported_at").eq("id", v2).single();
    expect((version as { delivery_state: string }).delivery_state).toBe("exported");
    expect((version as { first_exported_at: string | null }).first_exported_at).not.toBeNull();

    const { data: deliveries } = await supabase.from("deliveries").select("mode, counted").eq("version_id", v2).order("created_at");
    expect(deliveries).toEqual([
      { mode: "export", counted: true },
      { mode: "copy", counted: false },
    ]);

    // Spend the rest of the allowance, then a fresh approved version must be refused.
    const { error: spendError } = await supabase
      .from("workspace_usage")
      .update({ approved_deliveries: 3 })
      .eq("workspace_id", workspaceId);
    if (spendError) throw new Error(spendError.message);

    const third = await supabase.rpc("create_output_version", {
      p_action_id: actionId,
      p_actor: actorId,
      p_author_type: "user",
      p_action_run_id: null,
      p_body: "third",
      p_alt: null,
      p_meta: {},
      p_base_version_id: v2,
    });
    if (third.error) throw new Error(third.error.message);
    const v3 = (third.data as Rpc).version_id!;
    const approve = await supabase.rpc("approve_output_version", { p_version_id: v3, p_actor: actorId, p_comment: null });
    if (approve.error) throw new Error(approve.error.message);

    // Approving v3 superseded v2, the previously approved version.
    const { data: v2Row } = await supabase.from("output_versions").select("approval_state").eq("id", v2).single();
    expect(v2Row).toEqual({ approval_state: "superseded" });

    const blocked = await supabase.rpc("export_output_version", {
      p_version_id: v3,
      p_actor: actorId,
      p_mode: "export",
      p_idempotency_key: `it-${randomUUID()}`,
    });
    expect(blocked.error?.message).toBe("allowance_exceeded");

    const { data: after } = await supabase.from("workspace_usage").select("approved_deliveries").eq("workspace_id", workspaceId).single();
    expect(after).toEqual({ approved_deliveries: 3 });

    const { data: events } = await supabase
      .from("audit_events")
      .select("event")
      .eq("workspace_id", workspaceId)
      .in("event", ["delivery.exported", "delivery.copied"])
      .order("id");
    expect(events!.map((row) => (row as { event: string }).event)).toEqual(["delivery.exported", "delivery.copied"]);
  });

  it("cascades the whole layer when the workspace is deleted", async () => {
    const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
    if (error) throw new Error(error.message);

    for (const table of ["locations", "scan_snapshots", "actions", "output_versions", "deliveries", "workspace_usage", "audit_events"]) {
      const { data } = await supabase.from(table).select("workspace_id").eq("workspace_id", workspaceId);
      expect(data, `${table} rows survived the workspace delete`).toEqual([]);
    }
    // The scan itself is not the workspace's to destroy (audit_jobs.workspace_id set null).
    const { data: job } = await supabase.from("audit_jobs").select("id, workspace_id").eq("id", jobId).single();
    expect(job).toEqual({ id: jobId, workspace_id: null });
  });
});
