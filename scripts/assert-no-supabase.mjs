import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Only immutable SQL and explicitly recorded migration evidence are historical.
const historical = new Set(['docs/integration/neon-dependency-map.json','test/integration/fixtures/legacy-final-catalog.json']);
const ignoredDirectories = new Set(['node_modules','.git','.next','.superpowers','test-results','playwright-report']);
const retired = 'supa' + 'base';
const forbidden = new RegExp('@'+retired+'(?:/|\\b)|'+retired+'(?:Client|Server)|'+retired+'\\.(?:co|in)|(?:NEXT_PUBLIC_)?'+retired+'_\\w+|(?:from|import)[^\\n]*(?:lib/|\\.\\.?/)'+retired+'|post'+'grest|/rest/'+'v1', 'i');
/** Includes untracked active source so temporary regressions cannot evade the gate. */
/** @param {string} root */
export async function scan(root) {
 const violations=[];
 async function visit(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
   const path=join(directory,entry.name), name=relative(root,path).replaceAll('\\','/');
   if(entry.isDirectory()) { if(!ignoredDirectories.has(entry.name) && name !== retired+'/migrations') await visit(path); continue; }
   if(entry.isSymbolicLink()) continue;
   if(historical.has(name) || (name.startsWith(retired+'/') && /\.sql$/.test(name))) continue;
   if(!/\.(?:[cm]?[jt]sx?|json|ya?ml|sh|css|html|sql)$/.test(name) && name!=='.env.example')continue;
   if(forbidden.test(await readFile(path,'utf8')))violations.push(name);
  }
 }
 await visit(root); return violations.sort();
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const failures=await scan(resolve(import.meta.dirname,'..'));
 for(const path of failures) console.error('Retired transport reference: '+path);
 console.log(failures.length ? `${failures.length} active reference files` : 'No active retired transport references');
 process.exitCode=failures.length?1:0;
}
