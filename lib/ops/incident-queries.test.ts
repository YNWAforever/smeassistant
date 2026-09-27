import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseIncidentQueries } from "./incident-queries";

const FILE = fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/rollout/incident-queries.sql", import.meta.url));
const RUNBOOK = fileURLToPath(new URL("../../docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md", import.meta.url));

describe("parseIncidentQueries", () => {
  it("parses named blocks with their mode and one statement each", () => {
    const blocks = parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1;\n\n-- name: b\n-- mode: write\n-- note\nUPDATE t SET x=1;\n");
    expect(blocks).toEqual([{ name: "a", mode: "read", sql: "SELECT 1;" }, { name: "b", mode: "write", sql: "UPDATE t SET x=1;" }]);
  });

  it("rejects a block without a mode, a duplicate name, or two statements", () => {
    expect(() => parseIncidentQueries("-- name: a\nSELECT 1;")).toThrow("incident_query_mode_missing: a");
    expect(() => parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1;\n-- name: a\n-- mode: read\nSELECT 2;")).toThrow("incident_query_duplicate: a");
    expect(() => parseIncidentQueries("-- name: a\n-- mode: read\nSELECT 1; SELECT 2;")).toThrow("incident_query_multiple_statements: a");
  });

  it("keeps the real file and the runbook in step: every block is referenced, every reference exists", () => {
    const names = parseIncidentQueries(readFileSync(FILE, "utf8")).map((b) => b.name);
    const referenced = [...readFileSync(RUNBOOK, "utf8").matchAll(/`query:([a-z0-9_]+)`/g)].map((m) => m[1]);
    expect(new Set(referenced)).toEqual(new Set(names));
  });
});
