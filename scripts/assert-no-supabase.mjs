import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Only immutable SQL and explicitly recorded migration evidence are historical.
const historical = new Set(['docs/integration/neon-dependency-map.json','test/integration/fixtures/legacy-final-catalog.json']);
const ignoredDirectories = new Set(['node_modules','.git','.next','.superpowers','test-results','playwright-report']);
const retired = 'supa' + 'base';
const forbidden = new RegExp('@'+retired+'(?:/|\\b)|'+retired+'(?:Client|Server)|'+retired+'\\.(?:co|in)|(?:NEXT_PUBLIC_)?'+retired+'_\\w+|(?:from|import|require\\s*\\()[^\\n]*(?:lib/|\\.\\.?/)'+retired+'|post'+'grest|/rest/'+'v1', 'i');
// User-approved exception: runtime-reachable Neon error helpers, not a service client.
// Deliberately accept only canonical PNPM 9 records; unknown YAML forms fail closed.
/** @param {string} text @param {string} root */
async function withoutApprovedTransitiveLibrary(text, root) {
 const normalized = text.replaceAll('\r\n', '\n');
 const library = '@' + retired + '/auth-js';
 const sdk = '@neondatabase/auth';
 const pin = '0.5.0-beta';
 if (!normalized.startsWith("lockfileVersion: '9.0'\n") || /(?:^|\s)[&*!][\w-]+|^\s*<<:/m.test(normalized)) return text;
 try {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.dependencies?.[sdk] !== pin) return text;
 } catch { return text; }
 const sections = [...normalized.matchAll(/^([a-zA-Z]+):[^\n]*\n/gm)];
 /** @param {string} name */
 function section(name) {
  const found = sections.filter(match => match[1] === name);
  if (found.length !== 1) return null;
  const start = found[0].index + found[0][0].length;
  return normalized.slice(start, sections.find(match => match.index >= start)?.index ?? normalized.length);
 }
 const packages = section('packages'), snapshots = section('snapshots'), importers = section('importers');
 if (!packages || !snapshots || !importers) return text;
 const rootImporter = importers.match(/^  \.:\n([\s\S]*?)(?=^  \S|$(?![\s\S]))/m)?.[1];
 if (!rootImporter?.includes("      '" + sdk + "':\n        specifier: " + pin + "\n        version: " + pin + "(")) return text;
 /** @param {string} sectionText */
 const records = sectionText => [...sectionText.matchAll(/^  (\S[^\n]*):\n([\s\S]*?)(?=^  \S|$(?![\s\S]))/gm)];
 const packageRecords = records(packages), snapshotRecords = records(snapshots);
 const expectedPackage = "  '" + library + "@2.79.0':\n    resolution: {integrity: sha512-p2GKvdbF9d/6C+dtS6iNcSicPr6eUfkvovD60HWlWsD+oOjC483DzFWrzGjNpBwnswhfMRP8Qn3rYA0VWaOfjw==}\n    engines: {node: '>=20.0.0'}";
 const expectedSnapshot = "  '" + library + "@2.79.0':\n    dependencies:\n      tslib: 2.8.1";
 const packageRecord = packageRecords.filter(record => record[0].trimEnd() === expectedPackage);
 const snapshotRecord = snapshotRecords.filter(record => record[0].trimEnd() === expectedSnapshot);
 const introducers = snapshotRecords.filter(record => record[1].startsWith("'" + sdk + '@' + pin + '(') && record[1].endsWith(")'"));
 const edge = "      '" + library + "': 2.79.0\n";
 if (packageRecord.length !== 1 || snapshotRecord.length !== 1 || introducers.length !== 1) return text;
 const introducerPackages = packageRecords.filter(record => record[1] === "'" + sdk + '@' + pin + "'");
 const resolution = introducers[0][1].slice(sdk.length + 2, -1);
 if (introducerPackages.length !== 1 || !rootImporter.includes("      '" + sdk + "':\n        specifier: " + pin + "\n        version: " + resolution + '\n')) return text;
 const dependencies = introducers[0][2].match(/^    dependencies:\n((?:      [^\n]*\n)*)/m)?.[1];
 if (!dependencies?.includes(edge)) return text;
 // Remove three approved occurrences only, then apply the ordinary forbidden scan
 // to everything left: extra introducers/importers, endpoints and credentials fail.
 return normalized.replace(packageRecord[0][0], '').replace(snapshotRecord[0][0], '').replace(introducers[0][0], introducers[0][0].replace(edge, ''));
}
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
   const text = await readFile(path,'utf8');
   const checked = name === 'pnpm-lock.yaml' ? await withoutApprovedTransitiveLibrary(text, root) : text;
   if(forbidden.test(checked))violations.push(name);
  }
 }
 await visit(root); return violations.sort();
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const failures=await scan(resolve(import.meta.dirname,'..'));
 for(const path of failures) console.error('Retired transport reference: '+path);
 console.log(failures.length ? `${failures.length} active reference files` : 'No forbidden retired transport references; only the approved pinned Neon transitive library is permitted');
 process.exitCode=failures.length?1:0;
}
