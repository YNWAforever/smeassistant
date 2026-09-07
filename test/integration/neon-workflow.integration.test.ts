import { Pool, type PoolClient } from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applyMigrations } from '../../scripts/neon/migrations';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';
const state = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock('../../lib/db/client', () => ({ getPool: () => state.pool }));
import { withCompletionContext } from '../../lib/db/transaction';
import { workflowRepository, type UnlockInput } from '../../lib/repositories/workflow';
describe.runIf(process.env.NEON_INTEGRATION === '1')('atomic workflows', () => {
    let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool, denied: Pool, user: string, workspace: string, action: string, job: string;
    beforeAll(async () => {
        fixture = await startNeonDatabaseFixture('test');
        owner = new Pool({ connectionString: fixture.databaseUrl });
        await owner.query('CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS');
        await applyMigrations(owner);
        await owner.query("CREATE ROLE workflow_login LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime; CREATE ROLE workflow_denied LOGIN PASSWORD 'fixture-only'");
        const url = new URL(fixture.databaseUrl);
        url.username = 'workflow_login';
        url.password = 'fixture-only';
        runtime = new Pool({ connectionString: url.href, max: 4 });
        state.pool = runtime;
        url.username = 'workflow_denied';
        denied = new Pool({ connectionString: url.href });
        user = (await runtime.query("INSERT INTO app_users(email) VALUES ('fixture@example.test') RETURNING id")).rows[0].id;
        workspace = (await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
        action = (await runtime.query(`INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,'fixture','{}','{}','[]','low',1,'{}',5,'Live','fixture') RETURNING id`, [workspace])).rows[0].id;
        job = (await runtime.query("INSERT INTO audit_jobs(workspace_id,status,business_name) VALUES($1,'done','https://fixture.test') RETURNING id", [workspace])).rows[0].id;
    });
    afterAll(async () => { await Promise.all([owner?.end(), runtime?.end(), denied?.end()]); fixture?.stop(); });
    it('installs every final workflow with restricted execution', async () => {
        expect((await runtime.query('SELECT current_user AS name')).rows[0].name).toBe('workflow_login');
        await expect(denied.query('SELECT public.claim_workspace_completion($1)', [job])).rejects.toMatchObject({ code: '42501' });
        expect((await owner.query("SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('claim_workspace_completion','create_output_version','complete_report_unlock')")).rows[0].n).toBe(3);
    });
    const draft = (body = "body'; DROP TABLE public.actions;--") => ({ actionId: action, actor: user, authorType: 'user', actionRunId: null, body, alt: null, meta: { sentinel: body }, baseVersionId: null });
    async function blocked(client: PoolClient) {
        const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        return pid as number;
    }
    async function waitBlocked(pid: number) {
        for (let n = 0; n < 100; n++) {
            if ((await owner.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid])).rows[0].n > 0)
                return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        throw new Error('expected_distinct_connection_lock_wait');
    }
    it('serializes concurrent version numbers and retains conflict and approval contracts', async () => {
        const a = await runtime.connect(), b = await runtime.connect();
        try {
            expect((await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).not.toBe(await blocked(b));
            const pid = await blocked(b);
            await a.query('BEGIN');
            const first = await workflowRepository(a).createOutputVersion(draft());
            const pending = workflowRepository(b).createOutputVersion(draft('second'));
            await waitBlocked(pid);
            await a.query('COMMIT');
            const second = await pending;
            expect([first.version_no, second.version_no]).toEqual([1, 2]);
            expect((await runtime.query('SELECT body,meta FROM output_versions WHERE id=$1', [first.version_id])).rows[0]).toEqual({ body: draft().body, meta: draft().meta });
            await expect(workflowRepository().createOutputVersion({ ...draft(), baseVersionId: first.version_id })).rejects.toThrow('version_conflict');
            await expect(workflowRepository().approveOutputVersion(first.version_id, user, null)).rejects.toThrow('version_closed');
            expect(await workflowRepository().approveOutputVersion(second.version_id, user, 'approved')).toMatchObject({ kind: 'approved' });
            expect(await workflowRepository().approveOutputVersion(second.version_id, user, null)).toMatchObject({ kind: 'already-approved' });
        }
        finally {
            await a.query('ROLLBACK');
            a.release();
            b.release();
        }
    });
    it('preserves racing export uniqueness error and idempotent retry with one durable charge', async () => {
        const version = (await runtime.query("SELECT id FROM output_versions WHERE approval_state='approved'")).rows[0].id;
        const a = await runtime.connect(), b = await runtime.connect(), key = "export'; SELECT 1;--";
        try {
            const pid = await blocked(b);
            await a.query('BEGIN');
            const first = await workflowRepository(a).exportOutputVersion(version, user, 'export', key);
            const pending = workflowRepository(b).exportOutputVersion(version, user, 'export', key).then(v => ({ v, code: '' }), e => ({ v: null, code: e.code }));
            await waitBlocked(pid);
            await a.query('COMMIT');
            expect((await pending).code).toBe('23505');
            expect(await workflowRepository().exportOutputVersion(version, user, 'export', key)).toMatchObject({ kind: 'existing', delivery_id: first.delivery_id, counted: false });
            expect((await runtime.query('SELECT count(*)::int AS n FROM deliveries WHERE idempotency_key=$1', [key])).rows[0].n).toBe(1);
            expect((await runtime.query('SELECT approved_deliveries FROM workspace_usage WHERE workspace_id=$1', [workspace])).rows[0].approved_deliveries).toBe(1);
            expect((await runtime.query("SELECT count(*)::int AS n FROM audit_events WHERE event='delivery.exported'")).rows[0].n).toBe(1);
        }
        finally {
            await a.query('ROLLBACK');
            a.release();
            b.release();
        }
    });
    it('serializes report entitlement and analytics event retries without duplicate effects', async () => {
        const input: UnlockInput = { jobId: job, whatsapp: null, email: 'FIXTURE@example.test', recoveryEmail: 'FIXTURE@example.test', preferredContactChannel: 'email', contactIdentifier: 'fixture@example.test', businessObjective: 'grow', reportDeliveryConsent: true, scanDiscussionConsent: false, marketingConsent: false, policyVersion: 'fixture', locale: 'en', tokenHash: 'a'.repeat(64), idempotencyKey: "unlock'; DROP TABLE leads;--", purpose: 'report', expiresAt: new Date(Date.now() + 60000), anonymousSessionId: 'fixture-session', eventProperties: { market: 'HK', channel: 'email', objective: 'grow' } };
        const a = await runtime.connect(), b = await runtime.connect();
        try {
            const pid = await blocked(b);
            await a.query('BEGIN');
            const first = await workflowRepository(a).completeReportUnlock(input);
            const pending = workflowRepository(b).completeReportUnlock(input);
            await waitBlocked(pid);
            await a.query('COMMIT');
            expect(first.event_created).toBe(true);
            expect(await pending).toEqual({ ...first, event_created: false });
            for (const table of ['leads', 'report_access_grants', 'scan_events'])
                expect((await runtime.query('SELECT count(*)::int AS n FROM public.' + table + ' WHERE job_id=$1', [job])).rows[0].n).toBe(1);
            expect((await runtime.query('SELECT count(*)::int AS n FROM consent_records WHERE job_id=$1', [job])).rows[0].n).toBe(3);
            const expected = (await runtime.query("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS digest", [job + ':' + input.idempotencyKey])).rows[0].digest;
            expect((await runtime.query('SELECT dedupe_key FROM scan_events WHERE job_id=$1', [job])).rows[0].dedupe_key).toBe(expected);
        }
        finally {
            await a.query('ROLLBACK');
            a.release();
            b.release();
        }
    });
    it('retains claim, pending, rate-limit and decision result/error contracts', async () => {
        const repo = workflowRepository();
        expect(await repo.claimAuditJob(randomUUID())).toBeNull();
        const queued = (await runtime.query("INSERT INTO audit_jobs(business_name) VALUES('queued') RETURNING id")).rows[0].id;
        expect(await repo.claimAuditJob(queued)).toMatchObject({ id: queued, status: 'collecting', attempt_count: 1 });
        expect(await repo.claimAuditJob(queued)).toBeNull();
        expect(await repo.pendingWorkspaceCompletions()).toContainEqual({ job_id: job });
        expect(await repo.claimWorkspaceCompletion(queued)).toEqual({ status: 'skipped' });
        const key = "rate'; DROP TABLE rate_limit_buckets;--";
        expect(await repo.consumeRateLimit(key, 1, 60)).toEqual({ allowed: true, retry_after_seconds: 0 });
        expect(await repo.consumeRateLimit(key, 1, 60)).toMatchObject({ allowed: false });
        await expect(repo.consumeRateLimit(key, 0, 60)).rejects.toMatchObject({ code: '22023' });
        const version = await repo.createOutputVersion(draft('review'));
        expect(await repo.decideOutputVersion(version.version_id, user, 'changes_requested', key)).toMatchObject({ kind: 'decided', decision: 'changes_requested' });
        expect(await repo.decideOutputVersion(version.version_id, user, 'changes_requested', key)).toMatchObject({ kind: 'already-decided' });
        await expect(repo.decideOutputVersion(version.version_id, user, 'invalid', null)).rejects.toThrow('invalid_decision');
    });
    it('fences nested atomic writes using actual runtime identity and rejects partial/stale/spoofed contexts', async () => {
        const claim = await workflowRepository().claimWorkspaceCompletion(job);
        expect(claim.status).toBe('claimed');
        if (claim.status !== 'claimed')
            throw new Error('claim_failed');
        expect(await workflowRepository().claimWorkspaceCompletion(job)).toEqual({ status: 'busy' });
        const token = claim.token;
        const write = () => withCompletionContext(job, token, client => workflowRepository(client).createOutputVersion(draft('fenced')));
        expect(await write()).toMatchObject({ kind: 'created' });
        await expect(withCompletionContext(job, randomUUID(), client => workflowRepository(client).createOutputVersion(draft()))).rejects.toThrow('completion_lease_lost');
        await expect(withCompletionContext(randomUUID(), token, client => workflowRepository(client).createOutputVersion(draft()))).rejects.toThrow('completion_lease_lost');
        for (const [j, t] of [[job, ''], ['', token]])
            await expect(withCompletionContext(j, t, client => workflowRepository(client).createOutputVersion(draft()))).rejects.toThrow('completion_context_missing');
        await expect(withCompletionContext(job, "bad'; SELECT 1;--", client => workflowRepository(client).createOutputVersion(draft()))).rejects.toMatchObject({ code: '22P02' });
        await runtime.query("UPDATE workspace_scan_completions SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1", [job]);
        await expect(write()).rejects.toThrow('completion_lease_lost');
        expect(await workflowRepository().finishWorkspaceCompletion(job, token, true, null)).toBe(false);
        await runtime.query("UPDATE workspace_scan_completions SET lease_until=clock_timestamp()+interval '5 minutes' WHERE job_id=$1", [job]);
        await runtime.query("UPDATE audit_jobs SET status='collecting' WHERE id=$1", [job]);
        await expect(write()).rejects.toThrow('completion_job_changed');
        await runtime.query("UPDATE audit_jobs SET status='done' WHERE id=$1", [job]);
        expect(await workflowRepository().finishWorkspaceCompletion(job, randomUUID(), true, null)).toBe(false);
        // No-context interactive operations retain their original behavior; pooled settings never leak.
        expect(await workflowRepository().createOutputVersion(draft('interactive'))).toMatchObject({ kind: 'created' });
        const clients = await Promise.all([runtime.connect(), runtime.connect(), runtime.connect(), runtime.connect()]);
        try {
            for (const client of clients)
                expect((await client.query("SELECT nullif(current_setting('app.completion_job',true),'') AS job,nullif(current_setting('app.completion_token',true),'') AS token")).rows[0]).toEqual({ job: null, token: null });
        }
        finally {
            clients.forEach(client => client.release());
        }
        expect(await workflowRepository().finishWorkspaceCompletion(job, token, true, 'ignored')).toBe(true);
        expect(await workflowRepository().claimWorkspaceCompletion(job)).toEqual({ status: 'completed' });
    });
    it('enforces workspace, location, snapshot and measurement scope and the newer-snapshot fence', async () => {
        const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'scope','Scope') RETURNING id", [workspace])).rows[0].id;
        const scopedJob = (await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'scoped','done') RETURNING id", [workspace, location])).rows[0].id;
        const claim = await workflowRepository().claimWorkspaceCompletion(scopedJob);
        if (claim.status !== 'claimed')
            throw new Error('claim_failed');
        const context = <T>(run: (client: PoolClient) => Promise<T>) => withCompletionContext(scopedJob, claim.token, run);
        const snapshotSql = "INSERT INTO scan_snapshots(workspace_id,job_id,location_id,market,observed_at,coverage,module_states,metrics) VALUES($1,$2,$3,'hk',$4,1,'{}','{}') RETURNING id";
        await expect(context(c => c.query(snapshotSql, [workspace, scopedJob, null, '2026-01-01']))).rejects.toThrow('completion_snapshot_scope');
        await expect(context(c => c.query(snapshotSql, [workspace, job, location, '2026-01-01']))).rejects.toThrow('completion_snapshot_scope');
        const snapshot = (await context(c => c.query(snapshotSql, [workspace, scopedJob, location, '2026-01-01']))).rows[0].id;
        await expect(context(c => c.query("UPDATE actions SET due_at=now() WHERE id=$1", [action]))).rejects.toThrow('completion_action_scope');
        // The original exception allows workspace-wide measurement-state-only updates.
        await context(c => c.query('UPDATE actions SET measurement_state=measurement_state WHERE id=$1', [action]));
        const otherWorkspace = (await runtime.query('INSERT INTO workspaces DEFAULT VALUES RETURNING id')).rows[0].id;
        await expect(context(c => c.query("INSERT INTO workspace_notifications(workspace_id,kind,title) VALUES($1,'fixture','{}')", [otherWorkspace]))).rejects.toThrow('completion_lease_lost');
        await context(c => c.query("INSERT INTO workspace_notifications(workspace_id,kind,title) VALUES($1,'fixture','{}')", [workspace]));
        const measurement = "INSERT INTO action_measurements(workspace_id,action_id,after_snapshot_id,metric_key,fact_type) VALUES($1,$2,$3,'fixture','Observed')";
        await expect(context(c => c.query(measurement, [workspace, action, null]))).rejects.toThrow('completion_measurement_scope');
        await context(c => c.query(measurement, [workspace, action, snapshot]));
        const newer = (await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status) VALUES($1,$2,'newer','done') RETURNING id", [workspace, location])).rows[0].id;
        await runtime.query(snapshotSql, [workspace, newer, location, '2026-01-02']);
        await expect(context(c => c.query('UPDATE actions SET measurement_state=measurement_state WHERE id=$1', [action]))).rejects.toThrow('completion_newer_snapshot');
        expect(await workflowRepository().finishWorkspaceCompletion(scopedJob, claim.token, false, 'private failure detail')).toBe(true);
        expect((await runtime.query('SELECT state,last_error FROM workspace_scan_completions WHERE job_id=$1', [scopedJob])).rows[0]).toEqual({ state: 'retry', last_error: 'workspace_post_process_failed' });
    });
    it('retains effective role guard even if unrelated-role DML and execute are accidentally granted', async () => {
        await owner.query("GRANT USAGE ON SCHEMA public TO workflow_denied; GRANT INSERT ON workspace_notifications TO workflow_denied; GRANT EXECUTE ON FUNCTION public.fence_workspace_completion_write() TO workflow_denied; CREATE POLICY fixture_accidental_grant ON workspace_notifications FOR INSERT TO workflow_denied WITH CHECK (true)");
        const client = await denied.connect();
        try {
            await client.query('BEGIN');
            await client.query("SELECT set_config('app.completion_job',$1,true),set_config('app.completion_token',$2,true)", [job, randomUUID()]);
            await expect(client.query("INSERT INTO workspace_notifications(workspace_id,kind,title) VALUES($1,'fixture','{}')", [workspace])).rejects.toThrow('completion_role_denied');
        }
        finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });
    it('binds every JSONB value shape without PostgreSQL array coercion', async () => {
        for (const meta of [["literal", "'; DROP TABLE actions;--"], "string value", 5, true, null]) {
            const version = await workflowRepository().createOutputVersion({ ...draft('JSON'), meta });
            expect((await runtime.query('SELECT meta FROM output_versions WHERE id=$1', [version.version_id])).rows[0].meta).toEqual(meta ?? {});
        }
    });
});
