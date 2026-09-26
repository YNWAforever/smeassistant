/** A named block of docs/implementation/owner-platform-v1/rollout/incident-queries.sql. */
export interface IncidentQuery {
  name: string;
  mode: "read" | "write";
  sql: string;
}

/**
 * Parses `-- name:` / `-- mode:` blocks. Other `--` lines are comments. Each
 * block must be exactly one statement, so it can be pasted into the SQL
 * Editor on its own and a test can run it on its own.
 */
export function parseIncidentQueries(text: string): IncidentQuery[] {
  const blocks: IncidentQuery[] = [];
  let current: { name: string; mode: IncidentQuery["mode"] | null; lines: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    if (!current.mode) throw new Error(`incident_query_mode_missing: ${current.name}`);
    const sql = current.lines.join("\n").trim();
    if ((sql.match(/;/g) ?? []).length !== 1 || !sql.endsWith(";")) throw new Error(`incident_query_multiple_statements: ${current.name}`);
    if (blocks.some((b) => b.name === current!.name)) throw new Error(`incident_query_duplicate: ${current.name}`);
    blocks.push({ name: current.name, mode: current.mode, sql });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const name = /^-- name: ([a-z0-9_]+)$/.exec(line);
    if (name) {
      finish();
      current = { name: name[1], mode: null, lines: [] };
      continue;
    }
    const mode = /^-- mode: (read|write)$/.exec(line);
    if (mode && current) {
      current.mode = mode[1] as IncidentQuery["mode"];
      continue;
    }
    if (line.startsWith("--") || !current) continue;
    current.lines.push(line);
  }
  finish();
  return blocks;
}
