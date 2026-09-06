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
