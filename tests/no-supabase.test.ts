import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../scripts/assert-no-supabase.mjs";
describe("retired transport exit gate", () => {
 it.each(["import { x } from '../supa" + "base/admin'","import x from '@" + "supabase/supabase-js'", "process.env.NEXT_PUBLIC_" + "SUPA\u0042ASE_URL", "fetch('https://project." + "supa\u0062ase.co/rest/" + "v1/jobs')", "Post" + "grestClient"])('rejects an active temporary source: %s', async source => {
  const root = await mkdtemp(join(tmpdir(), 'exit-gate-'));
  try { await mkdir(join(root,'lib')); await writeFile(join(root,'lib','active.ts'),source); expect(await scan(root)).toEqual(['lib/active.ts']); } finally { await rm(root,{recursive:true,force:true}); }
 });
 it.each(["const db = require('../lib/supa" + "base/admin')", 'const db = require("./supa' + 'base/client")'])('rejects a CommonJS retired local client: %s', async source => {
  const root = await mkdtemp(join(tmpdir(), 'exit-gate-'));
  try { await mkdir(join(root,'scripts')); await writeFile(join(root,'scripts','active.cjs'),source); expect(await scan(root)).toEqual(['scripts/active.cjs']); } finally { await rm(root,{recursive:true,force:true}); }
 });
 it('allows only historical migration evidence while still inspecting nested source', async () => {
  const root=await mkdtemp(join(tmpdir(),'exit-gate-'));
  try { await mkdir(join(root,'sup'+'abase','migrations'),{recursive:true}); await writeFile(join(root,'sup'+'abase','migrations','0001.sql'),'-- historical'); await mkdir(join(root,'lib','historical'),{recursive:true}); await writeFile(join(root,'lib','historical','x.ts'),'const x = "SUP'+'ABASE_URL"'); expect(await scan(root)).toEqual(['lib/historical/x.ts']); } finally {await rm(root,{recursive:true,force:true});}
 });
});
import { readFile } from "node:fs/promises";
const legacy = '@' + 'supa' + 'base/auth-js';
const fixtureLock = () => readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
async function scanFixture(lock: string, manifest: object = { dependencies: { '@neondatabase/auth': '0.5.0-beta' } }, source?: string) {
 const root = await mkdtemp(join(tmpdir(), 'exit-lock-'));
 try {
  await writeFile(join(root, 'pnpm-lock.yaml'), lock);
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  if (source) { await mkdir(join(root, 'lib')); await writeFile(join(root, 'lib/active.ts'), source); }
  return await scan(root);
 } finally { await rm(root, { recursive: true, force: true }); }
}
describe('approved pinned transitive library exception', () => {
 it('accepts the exact real lock and pinned manifest', async () => { expect(await scanFixture(await fixtureLock())).toEqual([]); });
 it.each([
  ['library version', (s: string) => s.replaceAll('2.79.0', '2.80.0')],
  ['introducer version', (s: string) => s.replaceAll('0.5.0-beta', '0.5.1-beta')],
  ['different introducer', (s: string) => s.replace("      '" + legacy + "': 2.79.0", "      '" + legacy + "': 2.79.0\n  'other-sdk@1.0.0':\n    dependencies:\n      '" + legacy + "': 2.79.0")],
  ['missing introducer package', (s: string) => s.replace("  '@neondatabase/auth@0.5.0-beta':", "  'other@0.5.0-beta':")],
  ['importer resolution drift', (s: string) => s.replace('version: 0.5.0-beta(3yijzogyy2vckgrzzkan4ao7yi)', 'version: 0.5.0-beta(wrong)')],
  ['missing package record', (s: string) => s.replace("  '" + legacy + "@2.79.0':", "  'unrelated@2.79.0':")],
  ['integrity drift', (s: string) => s.replace('sha512-p2GKvdbF9d/', 'sha512-altered/')],
  ['lock importer drift', (s: string) => s.replace('specifier: 0.5.0-beta', 'specifier: ^0.5.0-beta')],
  ['direct lock importer', (s: string) => s.replace('    dependencies:', "    dependencies:\n      '" + legacy + "':\n        specifier: 2.79.0\n        version: 2.79.0")],
  ['endpoint elsewhere', (s: string) => s + '\nextra: https://project.' + 'supa' + 'base.co\n'],
 ] as const)('rejects %s', async (_name, mutate) => { expect(await scanFixture(mutate(await fixtureLock()))).toContain('pnpm-lock.yaml'); });
 it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])('rejects a direct manifest %s addition', async field => {
  expect(await scanFixture(await fixtureLock(), { dependencies: { '@neondatabase/auth': '0.5.0-beta' }, [field]: { [legacy]: '2.79.0' } })).toContain('package.json');
 });
 it('rejects an unpinned root SDK even with the valid lock', async () => { expect(await scanFixture(await fixtureLock(), { dependencies: { '@neondatabase/auth': '^0.5.0-beta' } })).toContain('pnpm-lock.yaml'); });
 it.each(['import { AuthError } from "' + legacy + '"', 'const key = process.env.' + 'SUPA' + 'BASE_SERVICE_ROLE_KEY', 'fetch("https://project.' + 'supa' + 'base.co")'])('still rejects active source: %s', async source => { expect(await scanFixture(await fixtureLock(), undefined, source)).toContain('lib/active.ts'); });
});
