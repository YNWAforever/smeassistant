import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it,expect } from 'vitest';
it('refuses arbitrary demo target arguments without exposing ambient credentials',()=>{
 const secret='postgresql://owner:seed-credential-sentinel@remote.example.test/shared';
 const result=spawnSync(process.execPath,['--import','tsx',fileURLToPath(new URL('../scripts/seed-demo.ts',import.meta.url)),'--url',secret],{encoding:'utf8',env:{...process.env,DATABASE_URL:secret,DATABASE_URL_UNPOOLED:secret},timeout:15000});
 expect(result.status).toBe(1);expect(result.stderr).toContain('seed_requires_owned_test_or_fixture_unavailable');expect(result.stdout+result.stderr).not.toContain('seed-credential-sentinel');
});
