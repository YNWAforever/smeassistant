import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { applyMigrations } from '../../scripts/neon/migrations';
import { reportsRepository } from '../../lib/repositories/reports';
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from './neon-database';

describe.runIf(process.env.NEON_INTEGRATION === '1')('Neon report comparison history', () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture('test');
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = 'fixture_runtime';
    url.password = 'fixture-only';
    runtime = new Pool({ connectionString: url.href });
  });

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  it('selects only earlier finished jobs at the anchored workspace and location in stable pages', async () => {
    const workspace = (await runtime.query("INSERT INTO workspaces(slug) VALUES('comparison-main') RETURNING id")).rows[0].id;
    const foreignWorkspace = (await runtime.query("INSERT INTO workspaces(slug) VALUES('comparison-foreign') RETURNING id")).rows[0].id;
    const location = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Identical Name') RETURNING id", [workspace])).rows[0].id;
    const otherLocation = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'other','Identical Name') RETURNING id", [workspace])).rows[0].id;
    const foreignLocation = (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,'main','Identical Name') RETURNING id", [foreignWorkspace])).rows[0].id;
    const current = (await runtime.query("INSERT INTO audit_jobs(id,workspace_id,location_id,business_name,status,completed_at) VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff',$1,$2,'Identical Name','done','2026-09-08T12:00:00Z') RETURNING id", [workspace, location])).rows[0].id;

    const eligibleIds: string[] = [];
    for (let index = 0; index < 27; index += 1) {
      const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const status = index === 3 ? 'partial' : 'done';
      const completedAt = new Date(Date.parse('2026-09-08T11:00:00Z') - Math.floor(index / 2) * 60_000).toISOString();
      await runtime.query('INSERT INTO audit_jobs(id,workspace_id,location_id,business_name,status,completed_at) VALUES($1,$2,$3,$4,$5,$6)',
        [id, workspace, location, 'Identical Name', status, completedAt]);
      eligibleIds.push(id);
    }

    await runtime.query("INSERT INTO audit_jobs(workspace_id,location_id,business_name,status,completed_at) VALUES ($1,$2,'Identical Name','done','2026-09-08T11:59:00Z'),($3,$4,'Identical Name','done','2026-09-08T11:58:00Z'),($1,$4,'Identical Name','done','2026-09-08T11:57:00Z'),($1,$2,'Identical Name','collecting','2026-09-08T11:56:00Z'),($1,$2,'Identical Name','failed','2026-09-08T11:55:00Z'),($1,$2,'Identical Name','done','2026-09-08T13:00:00Z')",
      [workspace, otherLocation, foreignWorkspace, foreignLocation]);

    const repo = reportsRepository(runtime);
    const first = await repo.readEarlierReportJobs(current, 0);
    const second = await repo.readEarlierReportJobs(current, 25);

    expect(first).toHaveLength(25);
    expect(second).toHaveLength(2);
    expect(new Set([...first, ...second].map(row => row.id))).toEqual(new Set(eligibleIds));
    expect([...first, ...second].some(row => row.status === 'partial')).toBe(true);
    expect([...first, ...second].every(row => row.workspace_id === workspace && row.location_id === location)).toBe(true);
    expect(first[0].completed_at).toBe('2026-09-08 11:00:00+00');
    expect(first[0].id > first[1].id).toBe(true);
    expect(first[0]).not.toHaveProperty('raw_data');
  });

  it('returns no history when the displayed job has no owned location anchor', async () => {
    const current = (await runtime.query("INSERT INTO audit_jobs(business_name,status,completed_at) VALUES('Unanchored','done','2026-09-08T12:00:00Z') RETURNING id")).rows[0].id;
    expect(await reportsRepository(runtime).readEarlierReportJobs(current, 0)).toEqual([]);
  });
});