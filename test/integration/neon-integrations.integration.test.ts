import { Pool } from "pg";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import {
  startNeonDatabaseFixture,
  type NeonDatabaseFixture,
} from "./neon-database";
import { POST } from "../../app/api/webhooks/stripe/route";
import { recordEvent } from "../../lib/analytics/record-event";
import { notifyWithRepository } from "../../lib/workspace/notify";
import { notificationRepository } from "../../lib/repositories/notifications";
const state = vi.hoisted(() => ({
  pool: null as Pool | null,
  subscription: {} as Record<string, unknown>,
}));
vi.mock("../../lib/db/client", () => ({ getPool: () => state.pool }));
vi.mock("../../lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripeClient: () => {
    const stripe = new Stripe("sk_test_fixture");
    stripe.subscriptions.retrieve = vi.fn(
      async () => state.subscription,
    ) as never;
    return stripe;
  },
}));
const secret = "whsec_local_fixture_only";
function request(
  id: string,
  type = "customer.subscription.updated",
  object: Record<string, unknown> = { id: "sub_fixture", status: "active" },
) {
  const payload = JSON.stringify({ id, type, data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature },
  });
}
describe.runIf(process.env.NEON_INTEGRATION === "1")(
  "Neon integration state and lifecycle",
  () => {
    let fixture: NeonDatabaseFixture,
      owner: Pool,
      runtime: Pool,
      workspaceId: string;
    beforeAll(async () => {
      fixture = await startNeonDatabaseFixture("test");
      owner = new Pool({ connectionString: fixture.databaseUrl });
      await owner.query(
        "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
      );
      await applyMigrations(owner);
      const url = new URL(fixture.databaseUrl);
      url.username = "fixture_runtime";
      url.password = "fixture-only";
      runtime = new Pool({ connectionString: url.href });
      state.pool = runtime;
    });
    beforeEach(async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
      vi.stubEnv("POSTHOG_KEY", "");
      await runtime.query(
        "DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users",
      );
      workspaceId = (
        await runtime.query(
          "INSERT INTO workspaces(stripe_customer_id) VALUES('cus_fixture') RETURNING id",
        )
      ).rows[0].id;
      state.subscription = {
        id: "sub_fixture",
        customer: "cus_fixture",
        status: "active",
      };
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await Promise.all([owner?.end(), runtime?.end()]);
      fixture?.stop();
    });
    it("rejects unsigned and tampered events without entitlement effects", async () => {
      expect(
        (
          await POST(
            new Request("http://localhost", { method: "POST", body: "{}" }),
          )
        ).status,
      ).toBe(400);
      const signed = request("evt_bad");
      expect(
        (
          await POST(
            new Request("http://localhost", {
              method: "POST",
              body: "{}",
              headers: signed.headers,
            }),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await runtime.query("SELECT tier FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows[0].tier,
      ).toBe("lite");
    });
    it("applies signed concurrent replay exactly once and re-reads authoritative out-of-order state", async () => {
      expect(
        await Promise.all([
          POST(request("evt_1")),
          POST(request("evt_1")),
        ]).then((rows) => rows.map((r) => r.status)),
      ).toEqual([200, 200]);
      expect(
        (
          await runtime.query("SELECT tier FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows[0].tier,
      ).toBe("paid");
      expect(
        (
          await runtime.query(
            "SELECT id FROM workspace_tier_events WHERE stripe_event_id='evt_1'",
          )
        ).rows,
      ).toHaveLength(1);
      state.subscription.status = "canceled";
      expect((await POST(request("evt_old"))).status).toBe(200);
      expect(
        (
          await runtime.query("SELECT tier FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows[0].tier,
      ).toBe("lite");
      expect((await POST(request("evt_1"))).status).toBe(200);
      expect(
        (
          await runtime.query("SELECT tier FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows[0].tier,
      ).toBe("lite");
    });
    it("rolls event insertion back with a failed tier write and permits clean retry", async () => {
      await owner.query(
        "CREATE FUNCTION fixture_fail_tier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture tier failure'; END $$; CREATE TRIGGER fixture_fail_tier BEFORE UPDATE OF tier ON workspaces FOR EACH ROW EXECUTE FUNCTION fixture_fail_tier()",
      );
      try {
        expect((await POST(request("evt_retry"))).status).toBe(500);
        expect(
          (
            await runtime.query(
              "SELECT id FROM workspace_tier_events WHERE stripe_event_id='evt_retry'",
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await owner.query(
          "DROP TRIGGER fixture_fail_tier ON workspaces; DROP FUNCTION fixture_fail_tier()",
        );
      }
      expect((await POST(request("evt_retry"))).status).toBe(200);
    });
    it("never resolves unknown legacy customers using email and rejects unknown checkout targets", async () => {
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('same@example.test') RETURNING id",
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'same@example.test','owner',now())",
        [workspaceId, user],
      );
      state.subscription = {
        id: "sub_fixture",
        customer: "cus_unknown",
        status: "active",
        customer_email: "same@example.test",
      };
      expect((await POST(request("evt_unknown"))).status).toBe(200);
      expect(
        (
          await POST(
            request("evt_checkout", "checkout.session.completed", {
              subscription: "sub_fixture",
              metadata: { workspace_id: randomUUID() },
            }),
          )
        ).status,
      ).toBe(500);
      expect(
        (
          await runtime.query("SELECT tier FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows[0].tier,
      ).toBe("lite");
    });
    it("cancels locked analytics, frees its connection and never inserts after unlock", async () => {
      const locker = await owner.connect();
      const session = randomUUID();
      const initial = runtime.totalCount;
      const capture = vi.fn();
      const reportError = vi.fn();
      await locker.query(
        "BEGIN; LOCK TABLE scan_events IN ACCESS EXCLUSIVE MODE",
      );
      try {
        const started = Date.now();
        const { eventRepository } =
          await import("../../lib/repositories/events");
        const pending = recordEvent(
          { name: "full_report_viewed", properties: { access: "viewer" } },
          { anonymousSessionId: session, timeoutMs: 500 },
          {
            insert: eventRepository(runtime).insert,
            capturePostHog: capture,
            reportError,
          },
        );
        await expect
          .poll(
            async () =>
              Number(
                (
                  await owner.query(
                    "SELECT count(*) FROM pg_stat_activity WHERE usename='fixture_runtime' AND wait_event_type='Lock' AND query LIKE '%INSERT INTO scan_events%'",
                  )
                ).rows[0].count,
              ),
            { timeout: 400, interval: 10 },
          )
          .toBe(1);
        expect(await pending).toEqual({
          recorded: false,
          category: "backend_unavailable",
        });
        expect(Date.now() - started).toBeLessThan(750);
        await expect
          .poll(() => runtime.totalCount - runtime.idleCount, { timeout: 750 })
          .toBe(0);
        await expect
          .poll(
            async () =>
              Number(
                (
                  await owner.query(
                    "SELECT count(*) FROM pg_stat_activity WHERE usename='fixture_runtime' AND state <> 'idle' AND query LIKE '%INSERT INTO scan_events%'",
                  )
                ).rows[0].count,
              ),
            { timeout: 2000 },
          )
          .toBe(0);
        expect(runtime.totalCount).toBeLessThanOrEqual(initial);
        expect(capture).not.toHaveBeenCalled();
      } finally {
        await locker.query("ROLLBACK");
        locker.release();
      }
      expect(
        (
          await runtime.query(
            "SELECT id FROM scan_events WHERE anonymous_session_id=$1",
            [session],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        await recordEvent(
          { name: "full_report_viewed", properties: { access: "viewer" } },
          { anonymousSessionId: session },
        ),
      ).toEqual({ recorded: true });
    });
    it("records analytics through Neon and suppresses duplicate provider effects", async () => {
      const job = (
        await runtime.query(
          "INSERT INTO audit_jobs(business_name,status) VALUES('fixture','done') RETURNING id",
        )
      ).rows[0].id;
      const input = {
        name: "full_report_viewed",
        properties: { access: "viewer" },
      };
      const context = {
        jobId: job,
        anonymousSessionId: randomUUID(),
        dedupeKey: "view",
      };
      expect(await recordEvent(input, context)).toMatchObject({
        recorded: true,
      });
      expect(await recordEvent(input, context)).toEqual({
        recorded: false,
        deduplicated: true,
      });
      expect(
        (
          await runtime.query("SELECT id FROM scan_events WHERE job_id=$1", [
            job,
          ])
        ).rows,
      ).toHaveLength(1);
    });
    it("retains shared notification dedupe on retried completion without any email transport", async () => {
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('notify@example.test') RETURNING id",
        )
      ).rows[0].id;
      const input = {
        workspaceId,
        userIds: [user, user],
        completionJobId: randomUUID(),
        kind: "scan.completed" as const,
        title: { en: "Complete", "zh-HK": "完成", "zh-TW": "完成" },
      };
      expect(
        await notifyWithRepository(notificationRepository(runtime), input),
      ).toEqual({ inserted: 1, error: null });
      expect(
        await notifyWithRepository(notificationRepository(runtime), input),
      ).toEqual({ inserted: 0, error: null });
    });
    it("deletes an app identity and memberships while nulling artifact actors in a surviving workspace", async () => {
      const { lifecycleRepository } =
        await import("../../lib/repositories/lifecycle");
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('erase@example.test') RETURNING id",
        )
      ).rows[0].id;
      const other = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('keep@example.test') RETURNING id",
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO auth_identities(provider,subject,user_id) VALUES('neon','erase-subject',$1)",
        [user],
      );
      await runtime.query(
        "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'erase@example.test','owner',now()),($1,$3,'keep@example.test','manager',now())",
        [workspaceId, user, other],
      );
      const action = (
        await runtime.query(
          "INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'fixture','{}','{}','[]','low',1,'{}',5,'Live','erase') RETURNING id",
          [workspaceId],
        )
      ).rows[0].id;
      const version = (
        await runtime.query(
          "INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type,author_user_id,approved_by) VALUES($1,$2,1,'preserved artifact','user',$3,$3) RETURNING id",
          [workspaceId, action, user],
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO audit_events(workspace_id,actor_type,actor_id,event) VALUES($1,'user',$2,'fixture')",
        [workspaceId, user],
      );
      expect(await lifecycleRepository(runtime).deleteAppUser(user)).toBe(true);
      expect(
        (
          await runtime.query(
            "SELECT user_id FROM auth_identities WHERE user_id=$1",
            [user],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query(
            "SELECT id FROM workspace_members WHERE user_id=$1",
            [user],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query(
            "SELECT author_user_id,approved_by,body FROM output_versions WHERE id=$1",
            [version],
          )
        ).rows[0],
      ).toEqual({
        author_user_id: null,
        approved_by: null,
        body: "preserved artifact",
      });
      // audit_events.actor_id intentionally has no FK: retain original audit identity semantics.
      expect(
        (
          await runtime.query(
            "SELECT actor_id FROM audit_events WHERE workspace_id=$1",
            [workspaceId],
          )
        ).rows[0].actor_id,
      ).toBe(user);
      expect(await lifecycleRepository(runtime).deleteAppUser(user)).toBe(
        false,
      );
      expect(await lifecycleRepository(runtime).deleteAppUser(other)).toBe(
        true,
      );
      expect(
        (
          await runtime.query("SELECT id FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query("SELECT id FROM output_versions WHERE id=$1", [
            version,
          ])
        ).rows,
      ).toEqual([]);
    });
    it("keeps a workspace-deleted report unowned then cascades explicit report erasure and retains audit references", async () => {
      const { lifecycleRepository } =
        await import("../../lib/repositories/lifecycle");
      const job = (
        await runtime.query(
          "INSERT INTO audit_jobs(workspace_id,business_name,status,raw_data) VALUES($1,'fixture','done','{\"private\":true}') RETURNING id",
          [workspaceId],
        )
      ).rows[0].id;
      const child = (
        await runtime.query(
          "INSERT INTO audit_jobs(parent_job_id,business_name,status) VALUES($1,'child','done') RETURNING id",
          [job],
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO leads(job_id,email) VALUES($1,'subject@example.test')",
        [child],
      );
      await runtime.query(
        "INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties) VALUES($1,$2,'full_report_viewed','{\"access\":\"viewer\"}')",
        [job, randomUUID()],
      );
      await runtime.query(
        "INSERT INTO staff_report_events(staff_user_id,staff_email_normalized,job_id,action) VALUES($1,'staff@example.test',$2,'fixture')",
        [randomUUID(), job],
      );
      expect(
        await lifecycleRepository(runtime).deleteWorkspace(workspaceId),
      ).toBe(true);
      expect(
        (
          await runtime.query(
            "SELECT workspace_id FROM audit_jobs WHERE id=$1",
            [job],
          )
        ).rows[0].workspace_id,
      ).toBeNull();
      expect(await lifecycleRepository(runtime).deleteReportData(job)).toBe(
        true,
      );
      expect(
        (
          await runtime.query(
            "SELECT id FROM audit_jobs WHERE id=ANY($1::uuid[])",
            [[job, child]],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await runtime.query("SELECT id FROM leads WHERE job_id=$1", [child]))
          .rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query("SELECT id FROM scan_events WHERE job_id=$1", [
            job,
          ])
        ).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query(
            "SELECT job_id FROM staff_report_events WHERE action='fixture'",
          )
        ).rows.every((row) => row.job_id === null),
      ).toBe(true);
    });
    it("preserves restrict-on-delete billing actor semantics and rolls identity removal back", async () => {
      const { lifecycleRepository } =
        await import("../../lib/repositories/lifecycle");
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('staff@example.test') RETURNING id",
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO auth_identities(provider,subject,user_id) VALUES('neon','staff-subject',$1)",
        [user],
      );
      await runtime.query(
        "INSERT INTO workspace_tier_events(workspace_id,tier,source,staff_user_id) VALUES($1,'paid','staff_grant',$2)",
        [workspaceId, user],
      );
      await expect(
        lifecycleRepository(runtime).deleteAppUser(user),
      ).rejects.toThrow();
      expect(
        (
          await runtime.query(
            "SELECT user_id FROM auth_identities WHERE user_id=$1",
            [user],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("updates only supplied notification preference booleans and rejects unknown keys", async () => {
      const repository = notificationRepository(runtime);
      await repository.updatePreferences(workspaceId, {
        notify_rescan_complete: false,
      });
      expect(
        (
          await runtime.query(
            "SELECT notify_rescan_complete,notify_regression_alert,notify_monthly_digest FROM workspaces WHERE id=$1",
            [workspaceId],
          )
        ).rows[0],
      ).toEqual({
        notify_rescan_complete: false,
        notify_regression_alert: true,
        notify_monthly_digest: true,
      });
      await expect(
        repository.updatePreferences(workspaceId, { tier: true } as never),
      ).rejects.toThrow();
    });

    it("retains pending membership workspaces and unrelated reports during identity erasure", async () => {
      const { lifecycleRepository } =
        await import("../../lib/repositories/lifecycle");
      const user = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('active@example.test') RETURNING id",
        )
      ).rows[0].id;
      await runtime.query(
        "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'active@example.test','owner',now()),($1,null,'pending@example.test','viewer',null)",
        [workspaceId, user],
      );
      const job = (
        await runtime.query(
          "INSERT INTO audit_jobs(workspace_id,business_name,status) VALUES($1,'retained','done') RETURNING id",
          [workspaceId],
        )
      ).rows[0].id;
      await lifecycleRepository(runtime).deleteAppUser(user);
      expect(
        (
          await runtime.query("SELECT id FROM workspaces WHERE id=$1", [
            workspaceId,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await runtime.query(
            "SELECT workspace_id FROM audit_jobs WHERE id=$1",
            [job],
          )
        ).rows[0].workspace_id,
      ).toBe(workspaceId);
    });
    it("reuses customer mappings, rejects replacement races, and scopes billing history and usage", async () => {
      const { billingRepository } =
        await import("../../lib/repositories/billing");
      const repository = billingRepository(runtime);
      const other = (
        await runtime.query(
          "INSERT INTO workspaces DEFAULT VALUES RETURNING id",
        )
      ).rows[0].id;
      await Promise.all([
        repository.saveCustomer(other, "cus_new"),
        repository.saveCustomer(other, "cus_new"),
      ]);
      await expect(
        repository.saveCustomer(other, "cus_replace"),
      ).rejects.toThrow("stripe_customer_conflict");
      await expect(
        repository.saveCustomer(randomUUID(), "cus_missing"),
      ).rejects.toThrow("stripe_customer_conflict");
      expect((await repository.workspace(other))?.stripe_customer_id).toBe(
        "cus_new",
      );
      await repository.applyTier(workspaceId, "paid", "evt_history");
      expect(await repository.tierEvents(other)).toEqual([]);
      expect(await repository.tierEvents(workspaceId)).toMatchObject([
        { tier: "paid", stripe_event_id: "evt_history" },
      ]);
      await expect(
        repository.applyTier(other, "paid", "evt_history"),
      ).rejects.toThrow("stripe_event_workspace_conflict");
      expect((await repository.workspace(other))?.tier).toBe("lite");
      expect(
        await repository.usage(workspaceId, "2026-09", null),
      ).toMatchObject({ approved_deliveries: 0, allowance: null });
    });
    it("lifts and restores the current period's allowance when the tier changes mid-period", async () => {
      const { billingRepository } = await import("../../lib/repositories/billing");
      const repository = billingRepository(runtime);
      const period = (
        await runtime.query<{ p: string }>(
          "SELECT to_char(now() at time zone coalesce(timezone,'Asia/Hong_Kong'),'YYYY-MM') AS p FROM workspaces WHERE id=$1",
          [workspaceId],
        )
      ).rows[0].p;
      const allowanceNow = async () =>
        (
          await runtime.query<{ allowance: number | null }>(
            "SELECT allowance FROM workspace_usage WHERE workspace_id=$1 AND period=$2",
            [workspaceId, period],
          )
        ).rows[0]?.allowance;

      // The owner opens the workspace on lite, which creates the period row --
      // that always happens before checkout, so every upgrade hits this case.
      await runtime.query("UPDATE workspaces SET tier='lite' WHERE id=$1", [workspaceId]);
      await runtime.query(
        "INSERT INTO workspace_usage(workspace_id,period,approved_deliveries,allowance) VALUES($1,$2,3,3) ON CONFLICT (workspace_id,period) DO UPDATE SET approved_deliveries=3, allowance=3",
        [workspaceId, period],
      );
      expect(await allowanceNow()).toBe(3);

      // Upgrading must lift the cap the export gate actually reads, not just the
      // tier the billing card advertises.
      await repository.applyTier(workspaceId, "paid", "evt_upgrade_midperiod");
      expect(await allowanceNow()).toBeNull();

      // ... and downgrading must restore it, or the workspace keeps unlimited
      // exports until the period rolls over.
      await repository.applyTier(workspaceId, "lite", "evt_downgrade_midperiod");
      expect(await allowanceNow()).toBe(3);
      // Deliveries already counted are history and must survive both moves.
      expect(
        (await runtime.query("SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1 AND period=$2", [workspaceId, period])).rows[0].approved_deliveries,
      ).toBe(3);
    });
    it("captures analytics once after persistence and fails open without capturing on database failure", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}"));
      vi.stubEnv("POSTHOG_KEY", "fixture-only");
      try {
        const job = (
          await runtime.query(
            "INSERT INTO audit_jobs(business_name,status) VALUES('analytics','done') RETURNING id",
          )
        ).rows[0].id;
        const input = {
          name: "full_report_viewed",
          properties: { access: "viewer" },
        };
        const context = {
          jobId: job,
          anonymousSessionId: randomUUID(),
          dedupeKey: "capture",
        };
        expect(await recordEvent(input, context)).toEqual({ recorded: true });
        expect(await recordEvent(input, context)).toEqual({
          recorded: false,
          deduplicated: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        state.pool = null;
        expect(
          await recordEvent(input, { ...context, dedupeKey: "failure" }),
        ).toEqual({ recorded: false, category: "backend_unavailable" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        state.pool = runtime;
        fetchMock.mockRestore();
      }
    });
  },
);
