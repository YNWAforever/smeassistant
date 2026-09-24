import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { configure, ReportError, runReport } from "../scripts/report/value";
import { formatText } from "../scripts/report/format";
import type { ValueReport } from "../scripts/report/value-queries";

const URL_ = "postgresql://app:pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/smeassistant?sslmode=require";
const env = { DATABASE_URL: URL_, VALUE_REPORT_HOST: "ep-cool-name.ap-southeast-1.aws.neon.tech", VALUE_REPORT_DATABASE: "smeassistant" };
const NOW = new Date("2026-09-24T04:00:00.000Z");

const category = (run: () => unknown) => {
  try { run(); } catch (error) { return error instanceof ReportError ? error.category : "not a ReportError"; }
  return "did not throw";
};

describe("configure", () => {
  it("accepts a matching target across the -pooler suffix and defaults to the last complete week", () => {
    const config = configure(env, [], NOW);
    expect(config.week.label).toBe("2026-W38");
    expect(config.json).toBe(false);
  });

  it("refuses to run without an explicit target", () => {
    expect(category(() => configure({ DATABASE_URL: URL_ }, [], NOW))).toBe("configuration");
  });

  it("refuses a DATABASE_URL pointing somewhere other than the named target", () => {
    expect(category(() => configure({ ...env, VALUE_REPORT_HOST: "ep-other.aws.neon.tech" }, [], NOW))).toBe("target");
    expect(category(() => configure({ ...env, VALUE_REPORT_DATABASE: "other" }, [], NOW))).toBe("target");
  });

  it("never attaches the unparseable URL as a cause, because it would carry the password", () => {
    try {
      configure({ ...env, DATABASE_URL: "not a url pw=hunter2" }, [], NOW);
    } catch (error) {
      expect(error).toBeInstanceOf(ReportError);
      expect((error as ReportError).cause).toBeUndefined();
      return;
    }
    throw new Error("expected refusal");
  });

  it("parses --week and --json, and ignores the -- pnpm may pass through", () => {
    const config = configure(env, ["--", "--week", "2026-W30", "--json"], NOW);
    expect(config.week.label).toBe("2026-W30");
    expect(config.json).toBe(true);
  });

  it.each([[["--week"]], [["--week", "2026-30"]], [["--unknown"]]])("refuses %j", (argv) => {
    expect(category(() => configure(env, argv, NOW))).toBe("configuration");
  });
});

const REPORT: ValueReport = {
  week: { label: "2026-W38", start: "2026-09-13T16:00:00.000Z", end: "2026-09-20T16:00:00.000Z", timezone: "Asia/Hong_Kong" },
  exclusions: { demoWorkspaces: 1, internalWorkspaces: 1 },
  primary: { locations: 2, eligibleLocations: 3, workspaces: 2, eligibleWorkspaces: 2, deliveriesWithoutLocation: 1 },
  scans: { started: 4, completedFull: 1, completedPartial: 1, failed: 1, inProgress: 1 },
  signIns: { first: 2 },
  claims: { supported: 1, assisted: 1 },
  deliveryFunnel: { firstDraft: 2, firstApprovedExport: 1, repeatWeeklyExport: 1 },
  tasks: { runs: 2, failed: 1, missingInputNow: 1 },
  paidConversion: { measurable: false, reason: "billing unavailable (DEC-09)" },
  reconciliation: { jobsStarted: 5, startedEvents: 3, jobsTerminal: 4, completedEvents: 1 },
  limitations: ["Example limitation."],
};

describe("formatText", () => {
  const text = formatText(REPORT);

  it("leads with the primary metric and its denominator", () => {
    expect(text).toContain("2026-W38");
    expect(text).toMatch(/Locations\s+2 of 3 eligible/);
    expect(text).toMatch(/Workspaces\s+2 of 2 eligible/);
  });

  it("shows the week in Hong Kong time with an exclusive end", () => {
    expect(text).toContain("2026-09-14 00:00 → 2026-09-21 00:00 HKT (end exclusive)");
  });

  it("prints reconciliation gaps as numbers", () => {
    expect(text).toMatch(/scan_started\s+3 of 5 jobs \(gap 2\)/);
    expect(text).toMatch(/scan_completed\s+1 of 4 terminal jobs \(gap 3\)/);
  });

  it("says paid conversion is not measurable instead of printing zero", () => {
    expect(text).toContain("not measurable — billing unavailable (DEC-09)");
  });

  it("prints every limitation", () => {
    expect(text).toContain("Example limitation.");
  });

  it("separates the longest label from its value", () => {
    expect(text).toMatch(/Deliveries with no location\s+1\b/);
  });

  it("keeps label, value and note in separate columns on every row", () => {
    // A row is two-space indented; limitations are "  - …". Columns are split
    // on runs of two or more spaces, which no label, value or note contains.
    const rows = text
      .split("\n")
      .filter((line) => line.startsWith("  ") && !line.startsWith("  - "))
      .map((line) => line.trim().split(/ {2,}/));
    expect(rows).toEqual([
      ["Locations", "2 of 3 eligible", "deliveries.counted: first export of an approved version"],
      ["Workspaces", "2 of 2 eligible", "account metric, reported separately"],
      ["Deliveries with no location", "1", "workspace-wide actions; in the workspace count only"],
      ["Started", "4"],
      ["Completed, full", "1 of 4"],
      ["Completed, partial", "1 of 4"],
      ["Failed", "1 of 4"],
      ["Still in progress", "1 of 4"],
      ["First sign-ins", "2", "app_users"],
      ["Claims, supported", "1", "workspace_claim_events (Google-verified)"],
      ["Claims, assisted", "1", "audit_events workspace.assigned"],
      ["First real draft", "2", "earliest output_versions row falls in the week"],
      ["First approved export", "1", "earliest counted delivery falls in the week"],
      ["Repeat weekly export", "1", "counted this week and in an earlier week"],
      ["Task runs failed", "1 of 2", "action_runs failed or timed out"],
      ["Missing input (now)", "1", "snapshot at report time"],
      ["Paid conversion", "not measurable — billing unavailable (DEC-09)"],
      ["scan_started", "3 of 5 jobs (gap 2)"],
      ["scan_completed", "1 of 4 terminal jobs (gap 3)"],
    ]);
  });

  it("keeps a value wider than its column apart from the note", () => {
    const wide = formatText({ ...REPORT, primary: { ...REPORT.primary, locations: 123456789012, eligibleLocations: 123456789012 } });
    expect(wide).toMatch(/123456789012 of 123456789012 eligible {2,}deliveries\.counted/);
  });
});

type Behaviour = { database?: string; failOn?: RegExp; connectFails?: boolean };

function fakePool({ database = "smeassistant", failOn, connectFails = false }: Behaviour = {}) {
  const queries: string[] = [];
  const urls: string[] = [];
  const calls = { release: 0, end: 0 };
  const failure = new Error("relation does not exist");
  const client = {
    async query(sql: string) {
      queries.push(sql.trim());
      if (failOn?.test(sql)) throw failure;
      if (sql.includes("current_database()")) return { rows: [{ database }] };
      return { rows: [{}] };
    },
    release() {
      calls.release++;
    },
  };
  const pool = {
    async connect() {
      if (connectFails) throw new Error("connect ECONNREFUSED");
      return client;
    },
    async end() {
      calls.end++;
    },
  };
  const connect = (url: string) => {
    urls.push(url);
    return pool as unknown as Pick<Pool, "connect" | "end">;
  };
  return { connect, queries, urls, calls, failure };
}

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected rejection");
};

describe("runReport", () => {
  const config = configure(env, [], NOW);

  it("opens a read-only transaction, checks the database, reports, then rolls back and closes", async () => {
    const fake = fakePool();
    const report = await runReport(config, fake.connect);
    expect(fake.urls).toEqual([URL_]);
    expect(fake.queries[0]).toBe("BEGIN TRANSACTION READ ONLY");
    expect(fake.queries[1]).toContain("current_database()");
    expect(fake.queries.length).toBeGreaterThan(3);
    expect(fake.queries.at(-1)).toBe("ROLLBACK");
    expect(report.week.label).toBe("2026-W38");
    expect(report.primary.locations).toBe(0);
    expect(fake.calls).toEqual({ release: 1, end: 1 });
  });

  it("stops at a different database before any report query", async () => {
    const fake = fakePool({ database: "other" });
    const error = await rejection(runReport(config, fake.connect));
    expect(error).toBeInstanceOf(ReportError);
    expect((error as ReportError).category).toBe("target");
    expect(fake.queries).toEqual(["BEGIN TRANSACTION READ ONLY", "SELECT current_database() AS database", "ROLLBACK"]);
    expect(fake.calls).toEqual({ release: 1, end: 1 });
  });

  it("reports a failed query as query_failed with the original error as cause", async () => {
    const fake = fakePool({ failOn: /FROM workspaces\s*$/ });
    const error = await rejection(runReport(config, fake.connect));
    expect(error).toBeInstanceOf(ReportError);
    expect((error as ReportError).category).toBe("query_failed");
    expect((error as ReportError).cause).toBe(fake.failure);
    expect(fake.queries.at(-1)).toBe("ROLLBACK");
    expect(fake.calls).toEqual({ release: 1, end: 1 });
  });

  it("reports a failed connection as query_failed and still ends the pool", async () => {
    const fake = fakePool({ connectFails: true });
    const error = await rejection(runReport(config, fake.connect));
    expect(error).toBeInstanceOf(ReportError);
    expect((error as ReportError).category).toBe("query_failed");
    expect(fake.queries).toEqual([]);
    expect(fake.calls).toEqual({ release: 0, end: 1 });
  });
});
