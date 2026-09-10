import { Pool } from "pg";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import {
  startNeonDatabaseFixture,
  type NeonDatabaseFixture,
} from "./neon-database";
import { artifactRepository } from "../../lib/repositories/artifacts";
import { downloadText } from "../../lib/download";
import { runAgentForAction } from "../../lib/workspace/runs";
import type { Membership } from "../../lib/auth";
const state = vi.hoisted(() => ({
  pool: null as Pool | null,
  membership: null as Membership | null,
  llm: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../../lib/db/client", () => ({
  getPool: () => {
    if (!state.pool) throw new Error("fixture_missing");
    return state.pool;
  },
}));
vi.mock("../../lib/auth", async (original) => ({
  ...(await original<typeof import("../../lib/auth")>()),
  authorizeWorkspaceRequest: async () => ({
    ok: true,
    user: {
      id: state.membership!.userId,
      email: "fixture@example.test",
      verified: true,
    },
    membership: state.membership,
  }),
}));
vi.mock("../../lib/llm", () => ({
  llmComplete: (...args: unknown[]) => state.llm(...args),
}));
vi.mock("../../lib/security/rate-limit", async (original) => ({
  ...(await original<typeof import("../../lib/security/rate-limit")>()),
  enforceRateLimit: (...args: unknown[]) => state.limit(...args),
}));
const output = {
  title: "Fixture",
  body: "Thank you for your visit.",
  acceptance_criteria: [],
  warnings: [],
  facts_used: [],
  facts_needed: [],
};
describe.runIf(process.env.NEON_INTEGRATION === "1")(
  "Neon actual artifact runtime and routes",
  () => {
    let fixture: NeonDatabaseFixture,
      owner: Pool,
      runtime: Pool,
      actor: string,
      workspace: string,
      locA: string,
      locB: string,
      action: string,
      job: string,
      snapshot: string;
    beforeAll(async () => {
      fixture = await startNeonDatabaseFixture("test");
      owner = new Pool({ connectionString: fixture.databaseUrl });
      await owner.query(
        "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS",
      );
      await applyMigrations(owner);
      await owner.query(
        "CREATE ROLE runtime_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
      );
      const url = new URL(fixture.databaseUrl);
      url.username = "runtime_login";
      url.password = "fixture-only";
      runtime = new Pool({ connectionString: url.href });
      state.pool = runtime;
      actor = (
        await runtime.query(
          "INSERT INTO app_users(email) VALUES('runtime@example.test') RETURNING id",
        )
      ).rows[0].id;
    });
    afterAll(async () => {
      state.pool = null;
      await Promise.all([owner?.end(), runtime?.end()]);
      fixture?.stop();
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      state.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
      state.llm.mockResolvedValue({
        text: JSON.stringify(output),
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      workspace = (
        await runtime.query(
          "INSERT INTO workspaces(business_name,market,slug) VALUES('Fixture','hk',gen_random_uuid()::text) RETURNING id",
        )
      ).rows[0].id;
      locA = (
        await runtime.query(
          "INSERT INTO locations(workspace_id,slug,name) VALUES($1,'a','Location A') RETURNING id",
          [workspace],
        )
      ).rows[0].id;
      locB = (
        await runtime.query(
          "INSERT INTO locations(workspace_id,slug,name) VALUES($1,'b','Location B') RETURNING id",
          [workspace],
        )
      ).rows[0].id;
      job = (
        await runtime.query(
          "INSERT INTO audit_jobs(workspace_id,location_id,business_name,status,raw_data) VALUES($1,$2,'Fixture','done','{}') RETURNING id",
          [workspace, locB],
        )
      ).rows[0].id;
      snapshot = (
        await runtime.query(
          "INSERT INTO scan_snapshots(workspace_id,location_id,job_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',now(),1,'{}','{}') RETURNING id",
          [workspace, locB, job],
        )
      ).rows[0].id;
      action = (
        await runtime.query(
          `INSERT INTO actions(workspace_id,source_snapshot_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,provided_inputs) VALUES($1,$2,'review-response','{"en":"Reply","zh-HK":"Reply","zh-TW":"Reply"}','{}','{}','high',50,'[]',5,'Live',gen_random_uuid()::text,'{"brand_voice":"warm"}') RETURNING id`,
          [workspace, snapshot],
        )
      ).rows[0].id;
      state.membership = {
        workspaceId: workspace,
        workspaceSlug: "fixture",
        userId: actor,
        email: "runtime@example.test",
        role: "owner",
        locationScope: null,
      };
      await runtime.query(
        "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,'runtime@example.test','owner',now())",
        [workspace, actor],
      );
    });
    const run = () =>
      runAgentForAction(artifactRepository(runtime), {
        actionId: action,
        actorId: actor,
        membership: state.membership!,
        locale: "en",
        inputs: { channel: "fixture" },
      });
    async function route(kind: "run" | "edit" | "patch", body: unknown = {}) {
      const req = new Request("https://fixture.test", {
          method: kind === "patch" ? "PATCH" : "POST",
          body: JSON.stringify(body),
        }),
        params = { params: Promise.resolve({ actionId: action }) };
      if (kind === "run")
        return (
          await import("../../app/api/actions/[actionId]/run/route")
        ).POST(req, params);
      if (kind === "edit")
        return (
          await import("../../app/api/actions/[actionId]/versions/route")
        ).POST(req, params);
      return (await import("../../app/api/actions/[actionId]/route")).PATCH(
        req,
        params,
      );
    }
    async function noEffects() {
      expect(state.llm).not.toHaveBeenCalled();
      for (const table of [
        "action_runs",
        "output_versions",
        "audit_events",
        "workspace_usage",
      ])
        expect(
          (
            await runtime.query(
              `SELECT id FROM ${table === "workspace_usage" ? "(SELECT workspace_id AS id,workspace_id FROM workspace_usage) AS u" : table} WHERE workspace_id=$1`,
              [workspace],
            )
          ).rows,
        ).toHaveLength(0);
      expect(
        (
          await runtime.query(
            "SELECT provided_inputs FROM actions WHERE id=$1",
            [action],
          )
        ).rows[0].provided_inputs,
      ).toEqual({ brand_voice: "warm" });
    }
    it.each(["viewer", "manager"] as const)(
      "denies %s actual run/edit/patch before effects even with spoofed input context",
      async (role) => {
        state.membership = {
          ...state.membership!,
          role,
          locationScope: [locA],
        };
        for (const kind of ["run", "edit", "patch"] as const)
          expect(
            (
              await route(kind, {
                inputs: { location_id: locA },
                provided_inputs: { spoof: true },
                body: "unsafe",
                location_id: locA,
                workspace_id: workspace,
              })
            ).status,
          ).toBe(403);
        expect(state.limit).not.toHaveBeenCalled();
        await noEffects();
      },
    );
    it.each(["owner", "manager"] as const)(
      "allows %s workspace-wide action with in-scope evidence and sums retries",
      async (role) => {
        state.membership = {
          ...state.membership!,
          role,
          locationScope: [locB],
        };
        state.llm.mockResolvedValueOnce({
          text: "invalid",
          usage: { inputTokens: 10, outputTokens: 2 },
        });
        const res = await route("run", { inputs: { channel: "fixture" } });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ state: "succeeded" });
        expect(state.llm).toHaveBeenCalledTimes(2);
        expect(
          (
            await runtime.query(
              "SELECT input_tokens,output_tokens,state,requested_by FROM action_runs WHERE action_id=$1",
              [action],
            )
          ).rows,
        ).toEqual([
          {
            input_tokens: 110,
            output_tokens: 52,
            state: "succeeded",
            requested_by: actor,
          },
        ]);
        expect(
          (
            await runtime.query(
              "SELECT body,author_user_id FROM output_versions WHERE action_id=$1",
              [action],
            )
          ).rows,
        ).toEqual([{ body: output.body, author_user_id: null }]);
        expect(
          (
            await runtime.query(
              "SELECT workspace_id FROM workspace_usage WHERE workspace_id=$1",
              [workspace],
            )
          ).rows,
        ).toHaveLength(0);
      },
    );
    it.each([
      "job_location",
      "job_workspace",
      "action_workspace",
      "omitted_membership",
    ])("rejects %s before writes", async (kind) => {
      if (kind === "job_location")
        await runtime.query(
          "UPDATE audit_jobs SET location_id=$1 WHERE id=$2",
          [locA, job],
        );
      if (kind === "job_workspace") {
        const foreign = (
          await runtime.query(
            "INSERT INTO workspaces DEFAULT VALUES RETURNING id",
          )
        ).rows[0].id;
        await runtime.query(
          "UPDATE audit_jobs SET workspace_id=$1 WHERE id=$2",
          [foreign, job],
        );
      }
      if (kind === "action_workspace")
        state.membership = { ...state.membership!, workspaceId: locA };
      if (kind === "omitted_membership") state.membership = null;
      await expect(run()).rejects.toBeInstanceOf(Error);
      await noEffects();
    });
    it("facts-needed with nonempty body produces needs_input without usage/version", async () => {
      state.llm.mockResolvedValue({
        text: JSON.stringify({ ...output, facts_needed: ["capacity"] }),
        usage: { inputTokens: 2, outputTokens: 3 },
      });
      expect(await run()).toMatchObject({
        state: "succeeded",
        factsNeeded: ["capacity"],
      });
      expect(
        (
          await runtime.query("SELECT action_state FROM actions WHERE id=$1", [
            action,
          ])
        ).rows[0].action_state,
      ).toBe("needs_input");
      expect(
        (
          await runtime.query(
            "SELECT id FROM output_versions WHERE action_id=$1",
            [action],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await runtime.query(
            "SELECT workspace_id FROM workspace_usage WHERE workspace_id=$1",
            [workspace],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it.each([true, false])(
      "rolls back terminal audit failure after actual writes with valid output=%s",
      async (valid) => {
        await owner.query(
          `CREATE OR REPLACE FUNCTION fixture_terminal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event IN ('run.succeeded','run.failed') THEN RAISE EXCEPTION 'fixture fault'; END IF; RETURN NEW; END $$`,
        );
        await owner.query(
          "CREATE TRIGGER fixture_terminal_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fixture_terminal_failure()",
        );
        if (!valid) state.llm.mockResolvedValue(null);
        try {
          await expect(run()).rejects.toThrow("artifact_run_operation_failed");
          expect(
            (
              await runtime.query(
                "SELECT state,output,error FROM action_runs WHERE action_id=$1",
                [action],
              )
            ).rows,
          ).toEqual([{ state: "running", output: null, error: null }]);
          expect(
            (
              await runtime.query(
                "SELECT id FROM output_versions WHERE action_id=$1",
                [action],
              )
            ).rows,
          ).toHaveLength(0);
          expect(
            (
              await runtime.query(
                "SELECT action_state FROM actions WHERE id=$1",
                [action],
              )
            ).rows[0].action_state,
          ).toBe("recommended");
          expect(
            (
              await runtime.query(
                "SELECT event FROM audit_events WHERE workspace_id=$1",
                [workspace],
              )
            ).rows,
          ).toEqual([{ event: "run.started" }]);
        } finally {
          await owner.query(
            "DROP TRIGGER fixture_terminal_failure ON audit_events",
          );
        }
      },
    );
    it("runs two edits, selected approval, retries and in-app notices through actual routes", async () => {
      const first = await run();
      const secondResponse = await route("edit", {
        body: "First edit",
        base_version_id: first.versionId,
      });
      expect(secondResponse.status).toBe(201);
      const second = await secondResponse.json();
      const thirdResponse = await route("edit", {
        body: "Second edit",
        base_version_id: second.versionId,
      });
      expect(thirdResponse.status).toBe(201);
      const third = await thirdResponse.json();
      const params = {
        params: Promise.resolve({ versionId: third.versionId }),
      };
      const approval =
        await import("../../app/api/versions/[versionId]/approve/route");
      expect(
        (
          await approval.POST(
            new Request("https://fixture.test", { method: "POST", body: "{}" }),
            params,
          )
        ).status,
      ).toBe(200);
      expect(
        await (
          await approval.POST(
            new Request("https://fixture.test", { method: "POST", body: "{}" }),
            params,
          )
        ).json(),
      ).toMatchObject({ idempotent: true });
      const exporter =
        await import("../../app/api/versions/[versionId]/export/route");
      const req = () =>
        new Request("https://fixture.test", {
          method: "POST",
          body: JSON.stringify({
            mode: "export",
            idempotency_key: "fixture_retry_12345678",
          }),
        });
      expect(await (await exporter.POST(req(), params)).json()).toMatchObject({
        counted: true,
      });
      expect(await (await exporter.POST(req(), params)).json()).toMatchObject({
        counted: false,
      });
      const history = (
        await runtime.query(
          "SELECT body,version_no FROM output_versions WHERE action_id=$1 ORDER BY version_no",
          [action],
        )
      ).rows;
      expect(history).toEqual(
        [output.body, "First edit", "Second edit"].map((body, i) => ({
          body,
          version_no: i + 1,
        })),
      );
      const blobs: Blob[] = [];
      const create = vi
        .spyOn(URL, "createObjectURL")
        .mockImplementation((blob) => {
          blobs.push(blob as Blob);
          return "blob:fixture";
        });
      const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      const click = vi.fn();
      const anchor = { href: "", download: "", click };
      vi.stubGlobal("document", { createElement: () => anchor });
      try {
        downloadText(
          "review-response-v3.md",
          history[2].body,
          "text/markdown;charset=utf-8",
        );
        expect(await blobs[0].text()).toBe("Second edit");
        expect(blobs[0].type).toBe("text/markdown;charset=utf-8");
        expect(anchor.download).toBe("review-response-v3.md");
        expect(click).toHaveBeenCalledOnce();
      } finally {
        create.mockRestore();
        revoke.mockRestore();
        vi.unstubAllGlobals();
      }
      expect(
        (
          await runtime.query(
            "SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1",
            [workspace],
          )
        ).rows[0].approved_deliveries,
      ).toBe(1);
      expect(
        (
          await runtime.query(
            "SELECT event,count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event IN ('version.approved','delivery.exported') GROUP BY event ORDER BY event",
            [workspace],
          )
        ).rows,
      ).toEqual([
        { event: "delivery.exported", n: 1 },
        { event: "version.approved", n: 1 },
      ]);
      expect(
        (
          await runtime.query(
            "SELECT kind FROM workspace_notifications WHERE workspace_id=$1 ORDER BY kind",
            [workspace],
          )
        ).rows,
      ).toEqual([{ kind: "delivery.exported" }, { kind: "version.approved" }]);
    });
    it("denies workspace-wide optional run against out-of-scope latest evidence before objective input insert", async () => {
      state.membership = {
        ...state.membership!,
        role: "manager",
        locationScope: [locA],
      };
      const post = await import("../../app/api/actions/route");
      const res = await post.POST(
        new Request("https://fixture.test", {
          method: "POST",
          body: JSON.stringify({
            workspace_id: workspace,
            template_key: "review-response",
            objective: "Unsafe wide objective",
            inputs: { brand_voice: "warm" },
            run: true,
          }),
        }),
      );
      expect(res.status).toBe(403);
      expect(
        (
          await runtime.query(
            "SELECT id FROM actions WHERE workspace_id=$1 AND source='owner_objective'",
            [workspace],
          )
        ).rows,
      ).toHaveLength(0);
      await noEffects();
    });
    it("optional objective run uses UUID attribution and current evidence", async () => {
      const post = await import("../../app/api/actions/route");
      const res = await post.POST(
        new Request("https://fixture.test", {
          method: "POST",
          body: JSON.stringify({
            workspace_id: workspace,
            location_id: locB,
            template_key: "review-response",
            objective: "Run this fixture objective",
            inputs: { brand_voice: "warm" },
            run: true,
          }),
        }),
      );
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({
        state: "succeeded",
        versionId: expect.any(String),
      });
      expect(state.llm).toHaveBeenCalledOnce();
    });
    it("version mutations also enforce workspace-wide action evidence location", async () => {
      const version = (
        await runtime.query(
          "INSERT INTO output_versions(workspace_id,action_id,version_no,body,author_type) VALUES($1,$2,1,'Fixture','user') RETURNING id",
          [workspace, action],
        )
      ).rows[0].id;
      state.membership = {
        ...state.membership!,
        role: "manager",
        locationScope: [locA],
      };
      const approval =
        await import("../../app/api/versions/[versionId]/approve/route");
      expect(
        (
          await approval.POST(
            new Request("https://fixture.test", { method: "POST", body: "{}" }),
            { params: Promise.resolve({ versionId: version }) },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await runtime.query(
            "SELECT approval_state FROM output_versions WHERE id=$1",
            [version],
          )
        ).rows[0].approval_state,
      ).toBe("draft");
      expect(
        (
          await runtime.query(
            "SELECT id FROM audit_events WHERE workspace_id=$1",
            [workspace],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("creates and deduplicates objectives then merges inputs via PATCH", async () => {
      const post = await import("../../app/api/actions/route");
      const body = {
        workspace_id: workspace,
        location_id: locB,
        template_key: "review-response",
        objective: "Fixture objective",
        inputs: { brand_voice: "warm" },
      };
      const req = () =>
        new Request("https://fixture.test", {
          method: "POST",
          body: JSON.stringify(body),
        });
      const one = await post.POST(req());
      expect(one.status).toBe(201);
      const created = await one.json();
      expect(await (await post.POST(req())).json()).toEqual(created);
      action = created.actionId;
      expect(
        (await route("patch", { provided_inputs: { channel: "fixture" } }))
          .status,
      ).toBe(200);
      expect(
        (
          await runtime.query(
            "SELECT provided_inputs FROM actions WHERE id=$1",
            [action],
          )
        ).rows[0].provided_inputs,
      ).toEqual({ brand_voice: "warm", channel: "fixture" });
    });

    describe("stranded action run reaping", () => {
      /** Seed a run directly so the strand is reproduced without a killed handler. */
      const strand = async (
        runState: "running" | "queued",
        age: string,
        actionId = action,
      ) =>
        (
          await runtime.query<{ id: string }>(
            `INSERT INTO action_runs(workspace_id,action_id,agent_key,state,prompt_version,requested_by,created_at,started_at)
             VALUES($1,$2,'review_reply',$3,'v1',$4, now() - $5::interval, CASE WHEN $3='running' THEN now() - $5::interval ELSE NULL END)
             RETURNING id`,
            [workspace, actionId, runState, actor, age],
          )
        ).rows[0].id;
      const runRow = async (id: string) =>
        (
          await runtime.query(
            "SELECT state,finished_at,error FROM action_runs WHERE id=$1",
            [id],
          )
        ).rows[0];
      const timeoutEvents = async (runId: string) =>
        (
          await runtime.query(
            "SELECT actor_type,actor_id,entity_type,payload FROM audit_events WHERE event='run.timed_out' AND entity_id=$1",
            [runId],
          )
        ).rows;

      it("releases a run abandoned in 'running' and records one system audit row", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("running", "30 minutes");
        expect(await reapStrandedRuns(workspace, [action])).toEqual([runId]);
        const row = await runRow(runId);
        expect(row.state).toBe("timed_out");
        expect(row.finished_at).not.toBeNull();
        // The reaper has no request locale, so it must not invent owner-facing
        // text; `error` stays NULL and the UI supplies the localized sentence.
        expect(row.error).toBeNull();
        const events = await timeoutEvents(runId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actor_type: "system",
          actor_id: null,
          entity_type: "action_run",
        });
        expect(events[0].payload).toMatchObject({
          previous_state: "running",
          action_id: action,
          agent_key: "review_reply",
          reason: "action_run_reaped",
          locale: null,
        });
      });

      it("leaves a fresh run alone", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("running", "0 seconds");
        expect(await reapStrandedRuns(workspace, [action])).toEqual([]);
        expect((await runRow(runId)).state).toBe("running");
        expect(await timeoutEvents(runId)).toHaveLength(0);
      });

      it("covers the kill between queue() and start(), where started_at is still NULL", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("queued", "30 minutes");
        expect(await reapStrandedRuns(workspace, [action])).toEqual([runId]);
        const events = await timeoutEvents(runId);
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({ previous_state: "queued" });
      });

      it("lets two concurrent reapers take disjoint rows, so the row is audited once", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("running", "30 minutes");
        const results = await Promise.all([
          reapStrandedRuns(workspace, [action]),
          reapStrandedRuns(workspace, [action]),
        ]);
        expect(results.flat()).toEqual([runId]);
        expect((await runRow(runId)).state).toBe("timed_out");
        expect(await timeoutEvents(runId)).toHaveLength(1);
      });

      it("fences a late worker: finish() on a reaped run writes nothing", async () => {
        const { actionRunRepository } = await import(
          "../../lib/repositories/artifacts"
        );
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("running", "30 minutes");
        await reapStrandedRuns(workspace, [action]);
        await expect(
          actionRunRepository().finish({
            runId,
            actorId: actor,
            locale: "en",
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsd: 0,
            output,
            finishedAt: new Date(),
          }),
        ).rejects.toThrow("artifact_run_operation_failed");
        expect((await runRow(runId)).state).toBe("timed_out");
        expect(
          (
            await runtime.query(
              "SELECT id FROM output_versions WHERE action_id=$1",
              [action],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await runtime.query(
              "SELECT id FROM audit_events WHERE event='run.succeeded' AND entity_id=$1",
              [runId],
            )
          ).rows,
        ).toHaveLength(0);
      });

      it("never moves the action lifecycle, including from needs_input", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        // needs_input is the case the list page cannot show: displayPhaseKey
        // short-circuits on it before it ever consults runState.
        await runtime.query(
          "UPDATE actions SET action_state='needs_input' WHERE id=$1",
          [action],
        );
        const before = (
          await runtime.query(
            "SELECT action_state,updated_at FROM actions WHERE id=$1",
            [action],
          )
        ).rows[0];
        const runId = await strand("running", "30 minutes");
        expect(await reapStrandedRuns(workspace, [action])).toEqual([runId]);
        expect(
          (
            await runtime.query(
              "SELECT action_state,updated_at FROM actions WHERE id=$1",
              [action],
            )
          ).rows[0],
        ).toEqual(before);
      });

      it("reaps nothing for a workspace that does not own the action", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const other = (
          await runtime.query(
            "INSERT INTO workspaces(business_name,market,slug) VALUES('Other','hk',gen_random_uuid()::text) RETURNING id",
          )
        ).rows[0].id;
        const runId = await strand("running", "30 minutes");
        expect(await reapStrandedRuns(other, [action])).toEqual([]);
        expect((await runRow(runId)).state).toBe("running");
        expect(await timeoutEvents(runId)).toHaveLength(0);
      });

      it("recovers through a fresh explicit run, never an automatic resume", async () => {
        const { reapStrandedRuns } = await import(
          "../../lib/workspace/run-reaper"
        );
        const runId = await strand("running", "30 minutes");
        await reapStrandedRuns(workspace, [action]);
        // Idempotent: a second pass finds nothing and writes no second audit row.
        expect(await reapStrandedRuns(workspace, [action])).toEqual([]);
        expect(await timeoutEvents(runId)).toHaveLength(1);
        const result = await run();
        expect(result.state).toBe("succeeded");
        expect(
          (
            await runtime.query(
              "SELECT version_no FROM output_versions WHERE action_id=$1",
              [action],
            )
          ).rows,
        ).toEqual([{ version_no: 1 }]);
        expect(
          (
            await runtime.query(
              "SELECT id FROM action_runs WHERE action_id=$1 AND id<>$2",
              [action, runId],
            )
          ).rows,
        ).toHaveLength(1);
      });
    });
  },
);
