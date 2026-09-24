import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// F-34: scan_events rows used to be written on a fresh connection under a
// 250 ms budget with a NULL dedupe key, so events were silently lost and never
// deduplicated. Every write now goes through lib/analytics/scan-events.ts,
// inside the transaction of the business write it describes. This guard keeps
// a second writer from coming back.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["lib", "app", "scripts"];
const SOLE_WRITER = "lib/analytics/scan-events.ts";
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const TEST = /\.test\.[cm]?[jt]sx?$/;
// Whitespace- and case-tolerant; also catches a schema-qualified or quoted name.
const INSERT_SCAN_EVENTS = /insert\s+into\s+(?:"?public"?\s*\.\s*)?"?scan_events"?(?![\w])/i;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "__snapshots__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) files.push(full);
  }
  return files;
}

async function scanEventWriters(root = repoRoot): Promise<string[]> {
  const writers: string[] = [];
  for (const dir of ROOTS) {
    for (const file of await sourceFiles(path.join(root, dir))) {
      if (INSERT_SCAN_EVENTS.test(await readFile(file, "utf8"))) {
        writers.push(path.relative(root, file).split(path.sep).join("/"));
      }
    }
  }
  return writers.sort();
}

describe("scan_events single writer", () => {
  it("only lib/analytics/scan-events.ts inserts into scan_events", async () => {
    expect(await scanEventWriters()).toEqual([SOLE_WRITER]);
  });

  it("matches the statement across whitespace, case and schema qualification", () => {
    for (const sql of [
      "INSERT INTO scan_events(job_id)",
      "insert\n   into\tscan_events (job_id)",
      'INSERT INTO public."scan_events"(job_id)',
    ]) {
      expect(INSERT_SCAN_EVENTS.test(sql)).toBe(true);
    }
  });

  it("does not flag read-only SQL or other tables", () => {
    for (const sql of [
      "SELECT count(*) FROM scan_events WHERE event_name='scan_started'",
      "LEFT JOIN scan_events e ON e.job_id = j.id",
      "INSERT INTO scan_events_archive(job_id)",
    ]) {
      expect(INSERT_SCAN_EVENTS.test(sql)).toBe(false);
    }
  });
});
