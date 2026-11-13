import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const passed = { expectedStatus: "passed", status: "expected", results: [{ status: "passed" }] };
function check(tests: unknown[], errors: unknown[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "kinnso-gate-"));
  try {
    const report = join(directory, "report.json");
    writeFileSync(report, JSON.stringify({ suites: [{ suites: [{ specs: [{ tests }] }] }], errors }));
    return spawnSync(process.execPath, ["scripts/check-kinnso-acceptance.mjs", report], { stdio: "ignore" }).status;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
describe("enabled Kinnso report gate", () => {
  it("accepts executed passing tests including a successful configured retry", () => {
    expect(check([passed, { ...passed, status: "flaky", results: [{ status: "failed" }, { status: "passed" }] }])).toBe(0);
  });
  it.each([
    [],
    [{ ...passed, status: "skipped", results: [{ status: "skipped" }] }],
    [{ ...passed, expectedStatus: "failed" }],
    [{ ...passed, status: "unexpected", results: [{ status: "failed" }] }],
    [{ ...passed, results: [] }],
    [passed, { ...passed, results: [{ status: "skipped" }] }],
  ].map(tests => ({ tests })))("rejects missing or incomplete coverage: $tests", ({ tests }) => {
    expect(check(tests)).not.toBe(0);
  });
  it("rejects a report with global errors even when individual tests passed", () => {
    expect(check([passed], [{ message: "worker failure" }])).not.toBe(0);
  });
});
