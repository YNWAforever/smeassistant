import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CONSUMER_PATTERN = /@supabase(?:\/|\b)|\bSupabaseClient\b|\bsupabaseServer\b|\bcreateServiceClient\b|\.rpc\s*\(/;
const SOURCE_PATTERN = /(?:\.[cm]?[jt]sx?|\.json|\.ya?ml)$/i;
const SENSITIVE_SEGMENT = /(?:^|\/)(?:\.env(?:\.|$)|credentials?(?:\/|$)|secrets?(?:\/|$)|[^/]+\.(?:pem|key|p12|pfx)$)/i;
const REQUIRED_KEYS = ["path", "kind", "task", "replacements", "status", "evidence"];

function slash(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

async function gitTrackedFiles(root) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  return stdout.toString("utf8").split("\0").filter(Boolean).map(slash);
}

export function extractSqlObjects(sql) {
  const source = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").replace(/'(?:''|[^'])*'/g, "''");
  const objects = new Set();
  const addMatches = (pattern, kind, nameIndex = 1) => {
    for (const match of source.matchAll(pattern)) objects.add(`${kind}:${match[nameIndex].replaceAll('"', "").toLowerCase()}`);
  };
  addMatches(/\bcreate\s+(?:or\s+replace\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."-]+)/gi, "table");
  addMatches(/\bcreate\s+(?:or\s+replace\s+)?function\s+([\w."-]+)/gi, "function");
  addMatches(/\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([\w."-]+)/gi, "view");
  addMatches(/\bcreate\s+type\s+([\w."-]+)/gi, "type");
  addMatches(/\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([\w."-]+)/gi, "index");
  addMatches(/\bdrop\s+index\s+(?:if\s+exists\s+)?([\w."-]+)/gi, "index");
  for (const match of source.matchAll(/\bcreate\s+(?:unique\s+)?index\s+on\s+([\w."-]+)/gi)) {
    objects.delete("index:on");
    objects.add(`index:auto@${match[1].replaceAll('"', "").toLowerCase()}`);
  }
  addMatches(/\bcreate\s+trigger\s+([\w."-]+)/gi, "trigger");
  for (const match of source.matchAll(/\bcreate\s+policy\s+(?:"([^"]+)"|([\w.-]+))/gi)) objects.add(`policy:${(match[1] ?? match[2]).toLowerCase()}`);
  for (const match of source.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."-]+)([\s\S]*?);/gi)) {
    const table = match[1].replaceAll('"', "").toLowerCase();
    objects.add(`table:${table}`);
    for (const column of match[2].matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w"-]+)/gi)) {
      objects.add(`column:${table}.${column[1].replaceAll('"', "").toLowerCase()}`);
    }
    for (const constraint of match[2].matchAll(/\bdrop\s+constraint\s+(?:if\s+exists\s+)?([\w"-]+)/gi)) {
      objects.add(`constraint:${constraint[1].replaceAll('"', "").toLowerCase()}`);
    }
  }
  addMatches(/\bcreate\s+(?:user|role)\s+([\w"-]+)/gi, "role");
  addMatches(/\b(?:add\s+)?constraint\s+(?!if\b)([\w"-]+)/gi, "constraint");
  for (const match of source.matchAll(/\b(grant|revoke)\s+[\s\S]*?;/gi)) {
    const action = match[1].toLowerCase();
    const statement = match[0].replace(/\s+/g, " ").replaceAll('"', "").trim().toLowerCase();
    objects.add(`${action}-statement:${statement}`);
  }
  if (/\bauth\.[a-z_]+/i.test(source)) for (const match of source.matchAll(/\bauth\.([a-z_]+)/gi)) objects.add(`external:auth.${match[1].toLowerCase()}`);
  if (/\bstorage\.[a-z_]+/i.test(source)) for (const match of source.matchAll(/\bstorage\.([a-z_]+)/gi)) objects.add(`external:storage.${match[1].toLowerCase()}`);
  if (/request\.headers/i.test(source)) objects.add("runtime-setting:request.headers");
  return [...objects].sort();
}

/** @param {{ root?: string, inventoryPath?: string, trackedFiles?: string[] }} options */
export async function checkInventory(options = {}) {
  const { root = process.cwd(), inventoryPath = "docs/integration/neon-dependency-map.json", trackedFiles } = options;
  const inventory = JSON.parse(await readFile(resolve(root, inventoryPath), "utf8"));
  const errors = [];
  if (!Array.isArray(inventory)) return { ok: false, errors: ["inventory must be a JSON array"] };
  const byPath = new Map();
  for (const [index, record] of inventory.entries()) {
    for (const key of REQUIRED_KEYS) if (!(key in record)) errors.push(`record ${index} missing ${key}`);
    if (typeof record.path !== "string" || record.path.length === 0) errors.push(`record ${index} has invalid path`);
    if (!/^(runtime|schema|test|operation)$/.test(record.kind)) errors.push(`record ${index} has invalid kind`);
    if (!Number.isInteger(record.task) || record.task < 1 || record.task > 17) errors.push(`record ${index} has invalid task`);
    if (!/^(pending|replaced)$/.test(record.status)) errors.push(`record ${index} has invalid status`);
    if (!Array.isArray(record.replacements) || record.replacements.length === 0) errors.push(`record ${index} needs replacements`);
    else if (!record.replacements.every((value) => typeof value === "string")) errors.push(`record ${index} has invalid replacements`);
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) errors.push(`record ${index} needs evidence`);
    else if (!record.evidence.every((value) => typeof value === "string")) errors.push(`record ${index} has invalid evidence`);
    if (typeof record.path === "string") {
      if (byPath.has(record.path)) errors.push(`duplicate inventory path: ${record.path}`);
      byPath.set(record.path, record);
    }
  }

  const files = (trackedFiles ?? await gitTrackedFiles(root)).map(slash);
  for (const path of files) {
    if (SENSITIVE_SEGMENT.test(path)) continue;
    const absolute = resolve(root, path);
    if (path.startsWith("supabase/migrations/") && path.endsWith(".sql")) {
      const record = byPath.get(path);
      if (!record) {
        errors.push(`unlisted migration: ${path}`);
        continue;
      }
      const evidence = new Set(record.evidence);
      for (const object of extractSqlObjects(await readFile(absolute, "utf8"))) {
        if (!evidence.has(`sql-object:${object}`)) errors.push(`unlisted SQL object in ${path}: ${object}`);
      }
      continue;
    }
    if (!SOURCE_PATTERN.test(path) || path === slash(inventoryPath) || path === "scripts/neon/check-inventory.mjs") continue;
    const content = await readFile(absolute, "utf8");
    if (CONSUMER_PATTERN.test(content) && !byPath.has(path)) errors.push(`unlisted Supabase consumer: ${path}`);
  }
  return { ok: errors.length === 0, errors };
}

export async function main(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf("--root");
  const inventoryIndex = argv.indexOf("--inventory");
  const root = rootIndex >= 0 ? resolve(argv[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const inventoryPath = inventoryIndex >= 0 ? argv[inventoryIndex + 1] : "docs/integration/neon-dependency-map.json";
  const result = await checkInventory({ root, inventoryPath });
  if (!result.ok) for (const error of result.errors) console.error(error);
  else console.log("Neon inventory complete: all tracked Supabase consumers and migration objects are owned.");
  return result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
