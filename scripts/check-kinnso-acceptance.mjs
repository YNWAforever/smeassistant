import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const tests = [];
function collect(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) tests.push(...spec.tests);
    collect(suite.suites ?? []);
  }
}
collect(report.suites ?? []);
if (!tests.length || report.errors?.length || tests.some(test =>
  test.expectedStatus !== "passed" ||
  !["expected", "flaky"].includes(test.status) ||
  !test.results?.some(result => result.status === "passed") ||
  test.results.some(result => result.status === "skipped")
)) {
  throw new Error("Enabled Kinnso acceptance must run a nonempty suite with every test passing and none skipped.");
}
console.log(`Enabled Kinnso acceptance: ${tests.length} tests passed, none skipped.`);
