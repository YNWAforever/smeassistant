# P3.5b Failure and Retry View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators a cross-tenant failure queue with a dead-letter release control, auto-close scans stuck after 3 attempts, and show owners localized, location-scoped failure notices with reference IDs.

**Architecture:** A read model over existing tables (`audit_jobs`, `action_runs` + `audit_events`, `oauth_connections`, `workspace_scan_completions`) produces one typed `FailureItem` list. Two readers use it: the operator page (`/[locale]/ops/failures`) and the owner Home/Activity surfaces (membership- and location-scoped, with a server-resolved owner action). Dead-letter handling is two guarded `UPDATE`s on `audit_jobs`: an auto-close step in the existing cron tick and an operator release route. No migration.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `pg` against Neon Postgres, Vitest 4 (unit + Docker-backed integration with `NEON_INTEGRATION=1`), React server components, shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-09-25-failure-retry-view-design.md`

---

## Ground rules for every task

- Work in the worktree `C:\Users\laich\Documents\smeassistant\.claude\worktrees\p35b-failure-view` (branch `p35b-failure-view`, stacked on `p35a-spend-budgets`).
- Commands use `corepack pnpm`. Unit: `corepack pnpm vitest run <path>`. Integration (Docker must be running): `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts <path>` (PowerShell: `$env:NEON_INTEGRATION='1'; corepack pnpm vitest run --config vitest.integration.config.ts <path>`).
- **Never** edit `packages/**`, `neon/migrations/**`, or `docs/implementation/owner-platform-v1/rollout/apply-0009.sql`. No new migration. If a task seems to need one, stop and report.
- **Never** call a paid provider in tests. No `git push`.
- Subagents have left CRLF-only changes to schema snapshot files before. Before each commit run `git status --short` and `git diff --stat`; restore any file you did not intend to change with `git checkout -- <file>`.
- Do not put `grep -n` and `git commit` in one shell command (a git hook misreads `-n`). Run them separately.
- Commit messages end with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Deviations from the spec (decided while planning)

1. **Revoked Google connections are not problems.** `status='revoked'` is written only by the owner's deliberate disconnect (`lib/repositories/claims.ts:100`) and by replacement (`:109`). Only `expired` and `error` count, judged on the workspace's **newest** non-active row, and only while no `active` row exists.
2. **Assistant drafts are excluded** from `draft_failed` (`input->>'source'='assistant'`), consistent with P3.5a M3: they have no action button to retry and are conversational.
3. **One `draft_failed` item per action** (the newest failed run), so three failures of one action show once.
4. **`workspace_processing` uses the `SCAN-` reference** of its job (it is a job-keyed row). There is no `JOB-` prefix.
5. **`ops.scan.released` carries no operator email.** The owner Activity page prints every scalar payload value (`components/workspace/activity-view.tsx:8-16`), so an email there would leak staff identity to merchants. `actor_id` identifies the operator.
6. **All new owner strings, including the scanning-page stuck card, live in the `problems` namespace of `lib/messages/*.json`** (read with `t()` from `lib/i18n.ts`, which is client-safe), not split between that and `lib/copy.ts`.

## File map

| File | Responsibility |
|---|---|
| `lib/scan/claimable.ts` (modify) | Adds `DEAD_LETTERED_JOB_CONDITION_SQL`, the exact complement of the claimable in-flight branch |
| `lib/ops/failure-types.ts` (create) | Client-safe types: `FailureKind`, `FailureItem`, `OwnerAction`, `OwnerProblem`, `OperatorHealth` |
| `lib/ops/references.ts` (create) | `runReference`, `connectionReference`, `referenceFor`, `parseFailureSearch` |
| `lib/repositories/failures.ts` (create) | SQL readers: `list()` and `health()` |
| `lib/ops/owner-actions.ts` (create) | Pure: visibility, location filter, owner-action matrix, `buildOwnerProblems` |
| `lib/ops/problem-copy.ts` (create) | Client-safe label lookups over the `problems` namespace |
| `lib/messages/{en,zh-HK,zh-TW}.json` (modify) | `problems` namespace |
| `lib/workspace/audit.ts`, `lib/workspace/audit-labels.ts` (modify) | `scan.auto_closed`, `ops.scan.released` |
| `lib/repositories/dead-letter.ts` (create) | `closeExhausted(limit)`, `release(jobId, operatorUserId)` |
| `lib/scan/dispatch-process.ts` (create) | `dispatchScanProcess(jobId, onError)`, shared by cron and release |
| `app/api/cron/dispatch/route.ts` (modify) | Auto-close step, uses the dispatch helper |
| `app/api/ops/failures/scans/[jobId]/release/route.ts` (create) | Operator release |
| `lib/repositories/jobs.ts`, `app/api/scan/status/route.ts` (modify) | `deadLettered` flag |
| `lib/funnel/scan-progress.ts`, `components/scanning-page.tsx` (modify), `components/scan-stuck-card.tsx` (create) | Scanning page dead-letter state |
| `components/ops/ops-nav.tsx`, `components/ops/release-button.tsx`, `app/[locale]/ops/failures/page.tsx` (create); `app/[locale]/ops/access-requests/page.tsx` (modify) | Operator page |
| `lib/workspace/problems.ts` (create) | Owner loader that degrades on failure |
| `components/workspace/problem-item.tsx`, `components/workspace/needs-attention-card.tsx`, `components/workspace/problems-list.tsx` (create) | Owner UI |
| `app/[locale]/owner/[workspaceSlug]/page.tsx`, `.../activity/page.tsx`, `components/workspace/activity-view.tsx` (modify) | Wire owner UI |
| `components/workspace/action-detail-client.tsx` (modify) | No raw error code in the fallback toast |
| `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` (modify) | P3.5b record |

---

### Task 1: The dead-letter condition

**Files:**
- Modify: `lib/scan/claimable.ts`
- Create: `lib/scan/claimable.test.ts`
- Create: `test/integration/neon-dead-letter-condition.integration.test.ts`

- [ ] **Step 1: Write the failing unit test**

`lib/scan/claimable.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CLAIMABLE_JOB_CONDITION_SQL, DEAD_LETTERED_JOB_CONDITION_SQL } from "./claimable";

describe("claim conditions", () => {
  it("keeps the claimable condition byte-identical to the lease contract", () => {
    expect(CLAIMABLE_JOB_CONDITION_SQL).toBe(
      "(status='queued' OR (status IN ('collecting','scoring','persisting') AND attempt_count<3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'))",
    );
  });

  it("states dead-lettered as in flight, three or more attempts, and stale", () => {
    expect(DEAD_LETTERED_JOB_CONDITION_SQL).toBe(
      "(status IN ('collecting','scoring','persisting') AND attempt_count>=3 AND last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes')",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `corepack pnpm vitest run lib/scan/claimable.test.ts`
Expected: FAIL. `DEAD_LETTERED_JOB_CONDITION_SQL` is undefined.

- [ ] **Step 3: Implement**

Replace the body of `lib/scan/claimable.ts` with:

```ts
/**
 * The claim lease's own eligibility rule (`lib/scan/execution-store.ts::claimJob`):
 * a fresh queued job, or one stuck mid-collection for over 30 minutes with
 * fewer than 3 total attempts. Shared so a SELECT elsewhere (a scheduler's
 * reclaim query, added in a later task) can never drift from what the claim
 * UPDATE actually allows.
 */
const IN_FLIGHT_SQL = "status IN ('collecting','scoring','persisting')";
const STALE_ATTEMPT_SQL = "last_attempt_at IS NOT NULL AND last_attempt_at<now()-interval '30 minutes'";

export const CLAIMABLE_JOB_CONDITION_SQL = `(status='queued' OR (${IN_FLIGHT_SQL} AND attempt_count<3 AND ${STALE_ATTEMPT_SQL}))`;

/**
 * P3.5b: a stale in-flight job the lease will never claim again, because it
 * has used its three attempts. It is built from the same fragments as the
 * claimable rule, so a stale in-flight job is exactly one of the two: the cron
 * reclaim picks up the claimable ones, and the operator queue, the release
 * control and the auto-close sweep act on these.
 */
export const DEAD_LETTERED_JOB_CONDITION_SQL = `(${IN_FLIGHT_SQL} AND attempt_count>=3 AND ${STALE_ATTEMPT_SQL})`;
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `corepack pnpm vitest run lib/scan/claimable.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the integration guard test (the complement)**

`test/integration/neon-dead-letter-condition.integration.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { CLAIMABLE_JOB_CONDITION_SQL, DEAD_LETTERED_JOB_CONDITION_SQL } from "../../lib/scan/claimable";

describe.runIf(process.env.NEON_INTEGRATION === "1")("dead-letter condition", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    await applyMigrations(owner);
  });
  beforeEach(async () => {
    await owner.query("DELETE FROM audit_jobs");
  });
  afterAll(async () => {
    await owner?.end();
    fixture?.stop();
  });

  it("puts every stale in-flight job in exactly one of claimable and dead-lettered, and nothing else in dead-lettered", async () => {
    const statuses = ["queued", "collecting", "scoring", "persisting", "done", "partial", "failed"];
    const attempts = [0, 1, 2, 3, 4];
    const ages = ["5 minutes", "31 minutes", null];
    for (const status of statuses)
      for (const count of attempts)
        for (const age of ages)
          await owner.query(
            "INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at) VALUES('Grid',$1,$2,CASE WHEN $3::text IS NULL THEN NULL ELSE now()-$3::interval END)",
            [status, count, age],
          );
    const rows = (
      await owner.query<{ status: string; attempt_count: number; stale: boolean; claimable: boolean; dead: boolean }>(
        `SELECT status, attempt_count,
                (last_attempt_at IS NOT NULL AND last_attempt_at < now()-interval '30 minutes') AS stale,
                ${CLAIMABLE_JOB_CONDITION_SQL} AS claimable,
                ${DEAD_LETTERED_JOB_CONDITION_SQL} AS dead
         FROM audit_jobs`,
      )
    ).rows;
    const inFlight = new Set(["collecting", "scoring", "persisting"]);
    for (const row of rows) {
      if (inFlight.has(row.status) && row.stale) expect(Number(row.claimable) + Number(row.dead)).toBe(1);
      else expect(row.dead).toBe(false);
      if (row.dead) expect(row.attempt_count).toBeGreaterThanOrEqual(3);
    }
    expect(rows.filter((row) => row.dead)).toHaveLength(3 * 2); // 3 in-flight statuses x attempts {3,4}, stale only
  });
});
```

- [ ] **Step 6: Run the integration test**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-dead-letter-condition.integration.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Mutation check**

Temporarily change `attempt_count>=3` to `attempt_count>=2` in `DEAD_LETTERED_JOB_CONDITION_SQL`. Re-run both tests: both must FAIL. Revert and re-run: both PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/scan/claimable.ts lib/scan/claimable.test.ts test/integration/neon-dead-letter-condition.integration.test.ts
git commit -m "feat(P3.5b): the dead-lettered job condition, the complement of claimable"
```

---

### Task 2: Failure types and references

**Files:**
- Create: `lib/ops/failure-types.ts`
- Create: `lib/ops/references.ts`
- Create: `lib/ops/references.test.ts`

- [ ] **Step 1: Write the types (no test; types only)**

`lib/ops/failure-types.ts`:

```ts
/**
 * P3.5b failure model. Client-safe: plain types and constants only, so owner
 * and operator components can import them.
 */
export const FAILURE_KINDS = ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection", "workspace_processing"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** Owners never see workspace_processing: nothing about it is theirs to do. */
export const OWNER_FAILURE_KINDS: readonly FailureKind[] = ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection"];

export function isFailureKind(value: unknown): value is FailureKind {
  return typeof value === "string" && (FAILURE_KINDS as readonly string[]).includes(value);
}

export interface FailureItem {
  kind: FailureKind;
  /** Source row id: the job id, run id or connection id. */
  id: string;
  /** SCAN-XXXXXX, RUN-XXXXXX or CONN-XXXXXX. */
  reference: string;
  /** audit_jobs.failure_correlation_id; scans only. */
  correlationId: string | null;
  occurredAt: string;
  workspace: { id: string; slug: string | null; name: string | null } | null;
  locationId: string | null;
  /** draft_failed only. */
  actionId: string | null;
  businessName: string;
  /** An allowlisted code, never provider text. */
  reason: string;
  attempts: number | null;
  operatorAction: "release" | "none";
}

export type OwnerAction = "rescan" | "contact_support" | "open_action" | "reauthorise" | "ask_owner" | "none";

export interface OwnerProblem extends FailureItem {
  ownerAction: OwnerAction;
  /** The market's first configured contact channel; contact_support only. */
  contactHref: string | null;
}

export interface OperatorHealth {
  recent: { scan_failed: { day: number; week: number }; draft_failed: { day: number; week: number } };
  open: { scan_dead_lettered: number; google_connection: number; workspace_processing: number };
  categories: Array<{ category: string; day: number; week: number }>;
}
```

- [ ] **Step 2: Write the failing reference test**

`lib/ops/references.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { connectionReference, parseFailureSearch, referenceFor, runReference } from "./references";

const ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("references", () => {
  it("formats run and connection references like the scan reference", () => {
    expect(runReference(ID)).toBe("RUN-3FA85F");
    expect(connectionReference(ID)).toBe("CONN-3FA85F");
    expect(referenceFor("scan_failed", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("scan_dead_lettered", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("workspace_processing", ID)).toBe("SCAN-3FA85F");
    expect(referenceFor("draft_failed", ID)).toBe("RUN-3FA85F");
    expect(referenceFor("google_connection", ID)).toBe("CONN-3FA85F");
  });
});

describe("parseFailureSearch", () => {
  it("returns null for an empty or missing query", () => {
    expect(parseFailureSearch(undefined)).toBeNull();
    expect(parseFailureSearch("   ")).toBeNull();
  });

  it("maps a reference to its kinds and a lower-case hex prefix", () => {
    expect(parseFailureSearch(" scan-3fa85f ")).toEqual({ kinds: ["scan_failed", "scan_dead_lettered", "workspace_processing"], hexPrefix: "3fa85f", uuid: null });
    expect(parseFailureSearch("RUN-3FA85F")).toEqual({ kinds: ["draft_failed"], hexPrefix: "3fa85f", uuid: null });
    expect(parseFailureSearch("CONN-3FA85F")).toEqual({ kinds: ["google_connection"], hexPrefix: "3fa85f", uuid: null });
  });

  it("matches a full id across every kind", () => {
    expect(parseFailureSearch(ID.toUpperCase())).toEqual({ kinds: null, hexPrefix: null, uuid: ID });
  });

  it("rejects anything else", () => {
    expect(parseFailureSearch("SCAN-3FA85")).toBe("invalid");
    expect(parseFailureSearch("JOB-3FA85F")).toBe("invalid");
    expect(parseFailureSearch("'; DROP TABLE audit_jobs; --")).toBe("invalid");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `corepack pnpm vitest run lib/ops/references.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`lib/ops/references.ts`:

```ts
import { scanReference } from "@/lib/funnel/scan-progress";
import type { FailureKind } from "./failure-types";

/** `PREFIX-` + the first six hex characters of the id, upper-cased: the scan reference's format. */
function shortReference(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export const runReference = (id: string) => shortReference("RUN", id);
export const connectionReference = (id: string) => shortReference("CONN", id);

export function referenceFor(kind: FailureKind, id: string): string {
  if (kind === "draft_failed") return runReference(id);
  if (kind === "google_connection") return connectionReference(id);
  return scanReference(id);
}

export interface FailureSearch {
  /** Null = every kind. */
  kinds: FailureKind[] | null;
  /** Lower-case, six hex characters. */
  hexPrefix: string | null;
  /** A full id, matched against the row id and (scans) the correlation id. */
  uuid: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE_RE = /^(SCAN|RUN|CONN)-([0-9A-F]{6})$/i;
const PREFIX_KINDS: Record<string, FailureKind[]> = {
  SCAN: ["scan_failed", "scan_dead_lettered", "workspace_processing"],
  RUN: ["draft_failed"],
  CONN: ["google_connection"],
};

/** Operator search: a reference, a full id, or nothing. Anything else is "invalid", never passed to SQL. */
export function parseFailureSearch(raw: string | undefined): FailureSearch | null | "invalid" {
  const q = (raw ?? "").trim();
  if (!q) return null;
  if (UUID_RE.test(q)) return { kinds: null, hexPrefix: null, uuid: q.toLowerCase() };
  const match = REFERENCE_RE.exec(q);
  if (!match) return "invalid";
  return { kinds: PREFIX_KINDS[match[1].toUpperCase()], hexPrefix: match[2].toLowerCase(), uuid: null };
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `corepack pnpm vitest run lib/ops/references.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/ops/failure-types.ts lib/ops/references.ts lib/ops/references.test.ts
git commit -m "feat(P3.5b): failure types and reference formatting"
```

---

### Task 3: The failures repository

**Files:**
- Create: `lib/repositories/failures.ts`
- Create: `test/integration/neon-failures.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

`test/integration/neon-failures.integration.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { failuresRepository, type FailureQuery } from "../../lib/repositories/failures";
import { OWNER_FAILURE_KINDS } from "../../lib/ops/failure-types";

const ports = vi.hoisted(() => ({ pool: undefined as Pool | undefined }));
vi.mock("../../lib/db/client", () => ({ getPool: () => ports.pool, getDatabase: () => drizzle(ports.pool!) }));

const ALL: FailureQuery = { kinds: null, hexPrefix: null, uuid: null, workspaceId: null, limit: 200 };

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon failures read model", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
    ports.pool = runtime;
  });
  beforeEach(async () => {
    await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });
  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  const repo = () => failuresRepository(runtime);
  const workspace = async (name = "Kam Man House") =>
    (await runtime.query("INSERT INTO workspaces(slug,business_name,market,tier) VALUES($1,$2,'hk','paid') RETURNING id", [`ws-${randomUUID().slice(0, 8)}`, name])).rows[0].id as string;
  const location = async (ws: string, slug = "tin-hau") =>
    (await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,$3) RETURNING id", [ws, slug, slug])).rows[0].id as string;
  const job = async (opts: { status: string; attempts?: number; lastAttempt?: string | null; completed?: string | null; category?: string | null; ws?: string | null; loc?: string | null }) =>
    (await runtime.query(
      `INSERT INTO audit_jobs(business_name,status,attempt_count,last_attempt_at,completed_at,failure_category,failure_correlation_id,workspace_id,location_id)
       VALUES('Kam Man House',$1,$2,CASE WHEN $3::text IS NULL THEN NULL ELSE now()-$3::interval END,CASE WHEN $4::text IS NULL THEN NULL ELSE now()-$4::interval END,$5,CASE WHEN $5::text IS NULL THEN NULL ELSE gen_random_uuid() END,$6,$7) RETURNING id`,
      [opts.status, opts.attempts ?? 0, opts.lastAttempt ?? null, opts.completed ?? null, opts.category ?? null, opts.ws ?? null, opts.loc ?? null],
    )).rows[0].id as string;
  const action = async (ws: string, loc: string | null = null) =>
    (await runtime.query(
      "INSERT INTO actions(workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key) VALUES($1,$2,'review-response','{}','{}','[]','low',1,'{}',5,'Live',$3) RETURNING id",
      [ws, loc, randomUUID()],
    )).rows[0].id as string;
  const run = async (ws: string, act: string, state: string, age = "1 hour", input: object | null = null, error: string | null = null) =>
    (await runtime.query(
      "INSERT INTO action_runs(workspace_id,action_id,agent_key,state,input,error,created_at,finished_at) VALUES($1,$2,'review_reply',$3,$4,$5,now()-$6::interval,now()-$6::interval) RETURNING id",
      [ws, act, state, input ? JSON.stringify(input) : null, error, age],
    )).rows[0].id as string;
  const runEvent = (ws: string, runId: string, event: string, reason: string) =>
    runtime.query("INSERT INTO audit_events(workspace_id,actor_type,event,entity_type,entity_id,payload) VALUES($1,'system',$2,'action_run',$3,$4)", [ws, event, runId, JSON.stringify({ reason })]);
  const connection = (ws: string, status: string, age = "1 hour") =>
    runtime.query("INSERT INTO oauth_connections(workspace_id,provider,access_token_encrypted,status,updated_at) VALUES($1,'google_gbp','x',$2,now()-$3::interval)", [ws, status, age]);
  const kinds = async (query: Partial<FailureQuery> = {}) => (await repo().list({ ...ALL, ...query })).map((item) => item.kind).sort();

  it("lists failed scans within 30 days, with the category and correlation id", async () => {
    const recent = await job({ status: "failed", completed: "2 days", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "31 days", category: "COLLECTION_FAILED" });
    await job({ status: "done", completed: "1 day" });
    const items = await repo().list(ALL);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "scan_failed", id: recent, reason: "COLLECTION_FAILED", businessName: "Kam Man House", operatorAction: "none" });
    expect(items[0].reference).toMatch(/^SCAN-[0-9A-F]{6}$/);
    expect(items[0].correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("lists dead-lettered scans with the release action, and not claimable ones", async () => {
    const dead = await job({ status: "collecting", attempts: 3, lastAttempt: "40 minutes" });
    await job({ status: "collecting", attempts: 2, lastAttempt: "40 minutes" });
    await job({ status: "collecting", attempts: 3, lastAttempt: "10 minutes" });
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "scan_dead_lettered", id: dead, reason: "ATTEMPTS_EXHAUSTED", attempts: 3, operatorAction: "release" })]);
  });

  it("lists one failed draft per action with its audit reason, drops it after a later success, and ignores assistant drafts", async () => {
    const ws = await workspace();
    const loc = await location(ws);
    const failing = await action(ws, loc);
    await run(ws, failing, "failed", "3 hours");
    const newest = await run(ws, failing, "timed_out", "2 hours");
    await runEvent(ws, newest, "run.timed_out", "action_run_reaped");
    const recovered = await action(ws);
    await run(ws, recovered, "failed", "3 hours");
    await run(ws, recovered, "succeeded", "1 hour");
    const assistant = await action(ws);
    await run(ws, assistant, "failed", "1 hour", { source: "assistant" }, "invalid_output");
    const old = await action(ws);
    await run(ws, old, "failed", "15 days");
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "draft_failed", id: newest, actionId: failing, locationId: loc, reason: "action_run_reaped" })]);
    expect(items[0].reference).toMatch(/^RUN-/);
  });

  it("falls back to action_run_failed when a failed run has no audit reason", async () => {
    const ws = await workspace();
    await run(ws, await action(ws), "failed");
    expect((await repo().list(ALL))[0].reason).toBe("action_run_failed");
  });

  it("lists a broken Google connection only when it is the newest non-active row and no active one exists", async () => {
    const broken = await workspace("Broken");
    await connection(broken, "error");
    const healed = await workspace("Healed");
    await connection(healed, "error", "2 hours");
    await connection(healed, "active");
    const disconnected = await workspace("Disconnected");
    await connection(disconnected, "error", "2 hours");
    await connection(disconnected, "revoked", "1 hour");
    const items = await repo().list(ALL);
    expect(items).toEqual([expect.objectContaining({ kind: "google_connection", reason: "error", businessName: "Broken", locationId: null })]);
    expect(items[0].workspace).toMatchObject({ id: broken, name: "Broken" });
  });

  it("lists post-processing stuck in retry after three attempts", async () => {
    const ws = await workspace();
    const stuck = await job({ status: "done", ws });
    const fresh = await job({ status: "done", ws });
    await runtime.query("INSERT INTO workspace_scan_completions(job_id,workspace_id,state,attempts,last_error) VALUES($1,$3,'retry',3,'workspace_post_process_failed'),($2,$3,'retry',1,'workspace_post_process_failed')", [stuck, fresh, ws]);
    expect(await repo().list(ALL)).toEqual([expect.objectContaining({ kind: "workspace_processing", id: stuck, attempts: 3, reason: "workspace_post_process_failed" })]);
  });

  it("filters by workspace, by kind, by reference prefix and by full id or correlation id", async () => {
    const mine = await workspace("Mine");
    const other = await workspace("Other");
    const failed = await job({ status: "failed", completed: "1 hour", category: "SCORING_FAILED", ws: mine });
    await job({ status: "failed", completed: "1 hour", category: "SCORING_FAILED", ws: other });
    await connection(mine, "expired");
    expect(await kinds({ workspaceId: mine })).toEqual(["google_connection", "scan_failed"]);
    expect(await kinds({ workspaceId: mine, kinds: ["scan_failed"] })).toEqual(["scan_failed"]);
    const prefix = failed.replace(/-/g, "").slice(0, 6);
    expect((await repo().list({ ...ALL, kinds: ["scan_failed"], hexPrefix: prefix })).map((item) => item.id)).toEqual([failed]);
    expect((await repo().list({ ...ALL, uuid: failed })).map((item) => item.id)).toEqual([failed]);
    const correlation = (await runtime.query("SELECT failure_correlation_id::text AS id FROM audit_jobs WHERE id=$1", [failed])).rows[0].id;
    expect((await repo().list({ ...ALL, uuid: correlation })).map((item) => item.id)).toEqual([failed]);
  });

  it("never returns personal fields", async () => {
    const ws = await workspace();
    await runtime.query("INSERT INTO app_users(email) VALUES('secret-owner@example.test')");
    await runtime.query("INSERT INTO workspace_members(workspace_id,email,role) VALUES($1,'secret-member@example.test','owner')", [ws]);
    await run(ws, await action(ws), "failed", "1 hour", { prompt: "SECRET-REVIEW-TEXT" }, "SECRET-ERROR-TEXT");
    await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED", ws });
    const serialized = JSON.stringify(await repo().list(ALL));
    for (const secret of ["secret-owner", "secret-member", "SECRET-REVIEW-TEXT", "SECRET-ERROR-TEXT"]) expect(serialized).not.toContain(secret);
  });

  it("summarizes health: recent counts, open counts and failed scans by category", async () => {
    const ws = await workspace();
    await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "3 days", category: "COLLECTION_FAILED" });
    await job({ status: "failed", completed: "2 hours", category: "SCORING_FAILED" });
    await job({ status: "collecting", attempts: 3, lastAttempt: "2 hours" });
    await connection(ws, "error");
    await run(ws, await action(ws), "failed", "1 hour");
    const health = await repo().health();
    expect(health.recent).toEqual({ scan_failed: { day: 2, week: 3 }, draft_failed: { day: 1, week: 1 } });
    expect(health.open).toEqual({ scan_dead_lettered: 1, google_connection: 1, workspace_processing: 0 });
    expect(health.categories).toEqual([{ category: "COLLECTION_FAILED", day: 1, week: 2 }, { category: "SCORING_FAILED", day: 1, week: 1 }]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-failures.integration.test.ts`
Expected: FAIL (module `lib/repositories/failures` not found).

- [ ] **Step 3: Implement**

`lib/repositories/failures.ts`:

```ts
import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";
import { DEAD_LETTERED_JOB_CONDITION_SQL } from "../scan/claimable";
import { FAILURE_KINDS, type FailureItem, type FailureKind, type OperatorHealth } from "../ops/failure-types";
import { referenceFor } from "../ops/references";

type Db = Pick<Pool, "query">;

export interface FailureQuery {
  /** Null = every kind. */
  kinds: readonly FailureKind[] | null;
  hexPrefix: string | null;
  uuid: string | null;
  /** Null = every workspace (operators only). */
  workspaceId: string | null;
  limit: number;
}

/** Every source SELECT returns exactly these columns, and only these: the allowlist. */
interface FailureRow {
  id: string;
  correlation_id: string | null;
  occurred_at: Date;
  workspace_id: string | null;
  workspace_slug: string | null;
  workspace_name: string | null;
  location_id: string | null;
  action_id: string | null;
  business_name: string | null;
  reason: string | null;
  attempts: number | null;
}

/**
 * $1 workspace id, $2 hex prefix, $3 full id, $4 limit. `idColumn` is the
 * row's own id; `correlationColumn` is also matched by a full id (scans).
 */
function filters(workspaceColumn: string, idColumn: string, correlationColumn?: string): string {
  const uuidMatch = correlationColumn ? `(${idColumn} = $3::uuid OR ${correlationColumn} = $3::uuid)` : `${idColumn} = $3::uuid`;
  return `($1::uuid IS NULL OR ${workspaceColumn} = $1::uuid)
    AND ($2::text IS NULL OR replace(${idColumn}::text,'-','') LIKE $2::text || '%')
    AND ($3::uuid IS NULL OR ${uuidMatch})`;
}

const SOURCES: Record<FailureKind, string> = {
  scan_failed: `
    SELECT j.id, j.failure_correlation_id::text AS correlation_id, coalesce(j.completed_at, j.created_at) AS occurred_at,
           j.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           j.business_name, j.failure_category AS reason, j.attempt_count AS attempts
    FROM audit_jobs j LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE j.status = 'failed' AND coalesce(j.completed_at, j.created_at) > now() - interval '30 days'
      AND ${filters("j.workspace_id", "j.id", "j.failure_correlation_id")}
    ORDER BY occurred_at DESC LIMIT $4`,
  scan_dead_lettered: `
    SELECT j.id, NULL::text AS correlation_id, j.last_attempt_at AS occurred_at,
           j.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           j.business_name, 'ATTEMPTS_EXHAUSTED' AS reason, j.attempt_count AS attempts
    FROM audit_jobs j LEFT JOIN workspaces w ON w.id = j.workspace_id
    WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL}
      AND ${filters("j.workspace_id", "j.id")}
    ORDER BY occurred_at DESC LIMIT $4`,
  draft_failed: `
    SELECT * FROM (
      SELECT DISTINCT ON (r.action_id)
             r.id, NULL::text AS correlation_id, coalesce(r.finished_at, r.created_at) AS occurred_at,
             r.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, a.location_id, r.action_id,
             w.business_name,
             coalesce((SELECT e.payload->>'reason' FROM audit_events e
                       WHERE e.workspace_id = r.workspace_id AND e.entity_type = 'action_run' AND e.entity_id = r.id
                         AND e.event IN ('run.failed','run.timed_out')
                       ORDER BY e.created_at DESC LIMIT 1), 'action_run_failed') AS reason,
             NULL::int AS attempts
      FROM action_runs r
      JOIN actions a ON a.id = r.action_id AND a.workspace_id = r.workspace_id
      JOIN workspaces w ON w.id = r.workspace_id
      WHERE r.state IN ('failed','timed_out')
        AND coalesce(r.finished_at, r.created_at) > now() - interval '14 days'
        AND coalesce(r.input->>'source', '') <> 'assistant'
        AND NOT EXISTS (SELECT 1 FROM action_runs s WHERE s.action_id = r.action_id AND s.state = 'succeeded' AND s.created_at > r.created_at)
        AND ${filters("r.workspace_id", "r.id")}
      ORDER BY r.action_id, r.created_at DESC
    ) d ORDER BY occurred_at DESC LIMIT $4`,
  google_connection: `
    SELECT * FROM (
      SELECT DISTINCT ON (c.workspace_id)
             c.id, NULL::text AS correlation_id, c.updated_at AS occurred_at,
             c.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, NULL::uuid AS location_id, NULL::uuid AS action_id,
             w.business_name, c.status AS reason, NULL::int AS attempts
      FROM oauth_connections c JOIN workspaces w ON w.id = c.workspace_id
      WHERE c.provider = 'google_gbp' AND c.status IN ('expired','revoked','error')
        AND NOT EXISTS (SELECT 1 FROM oauth_connections a WHERE a.workspace_id = c.workspace_id AND a.provider = 'google_gbp' AND a.status = 'active')
        AND ${filters("c.workspace_id", "c.id")}
      ORDER BY c.workspace_id, c.updated_at DESC
    ) g WHERE g.reason IN ('expired','error') ORDER BY occurred_at DESC LIMIT $4`,
  workspace_processing: `
    SELECT c.job_id AS id, NULL::text AS correlation_id, c.updated_at AS occurred_at,
           c.workspace_id, w.slug AS workspace_slug, w.business_name AS workspace_name, j.location_id, NULL::uuid AS action_id,
           coalesce(j.business_name, w.business_name) AS business_name,
           coalesce(c.last_error, 'workspace_post_process_failed') AS reason, c.attempts
    FROM workspace_scan_completions c
    JOIN workspaces w ON w.id = c.workspace_id
    JOIN audit_jobs j ON j.id = c.job_id
    WHERE c.state = 'retry' AND c.attempts >= 3
      AND ${filters("c.workspace_id", "c.job_id")}
    ORDER BY occurred_at DESC LIMIT $4`,
};

function toFailureItem(kind: FailureKind, row: FailureRow): FailureItem {
  return {
    kind,
    id: row.id,
    reference: referenceFor(kind, row.id),
    correlationId: row.correlation_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    workspace: row.workspace_id ? { id: row.workspace_id, slug: row.workspace_slug, name: row.workspace_name } : null,
    locationId: row.location_id,
    actionId: row.action_id,
    businessName: row.business_name?.trim() || "—",
    reason: row.reason ?? "generic",
    attempts: row.attempts,
    operatorAction: kind === "scan_dead_lettered" ? "release" : "none",
  };
}

/**
 * P3.5b read model (spec §1). Derived from the rows that are the actual state,
 * so it can never disagree with them. Every SELECT names its columns: no
 * emails, contact identifiers, review text, draft bodies, action_runs.error or
 * provider messages can reach a caller.
 */
export function failuresRepository(client?: Db) {
  const db = () => client ?? getPool();
  return {
    async list(query: FailureQuery): Promise<FailureItem[]> {
      const kinds = FAILURE_KINDS.filter((kind) => !query.kinds || query.kinds.includes(kind));
      const params = [query.workspaceId, query.hexPrefix, query.uuid, query.limit];
      const results = await Promise.all(
        kinds.map(async (kind) => (await db().query<FailureRow>(SOURCES[kind], params)).rows.map((row) => toFailureItem(kind, row))),
      );
      return results
        .flat()
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
        .slice(0, query.limit);
    },

    async health(): Promise<OperatorHealth> {
      const counts = (
        await db().query<{ scan_day: number; scan_week: number; draft_day: number; draft_week: number; dead: number; processing: number }>(
          `SELECT
             (SELECT count(*) FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '24 hours')::int AS scan_day,
             (SELECT count(*) FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '7 days')::int AS scan_week,
             (SELECT count(*) FROM action_runs WHERE state IN ('failed','timed_out') AND coalesce(input->>'source','') <> 'assistant' AND coalesce(finished_at,created_at) > now()-interval '24 hours')::int AS draft_day,
             (SELECT count(*) FROM action_runs WHERE state IN ('failed','timed_out') AND coalesce(input->>'source','') <> 'assistant' AND coalesce(finished_at,created_at) > now()-interval '7 days')::int AS draft_week,
             (SELECT count(*) FROM audit_jobs WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL})::int AS dead,
             (SELECT count(*) FROM workspace_scan_completions WHERE state='retry' AND attempts >= 3)::int AS processing`,
        )
      ).rows[0];
      const categories = (
        await db().query<{ category: string; day: number; week: number }>(
          `SELECT coalesce(failure_category,'unknown') AS category,
                  count(*) FILTER (WHERE coalesce(completed_at,created_at) > now()-interval '24 hours')::int AS day,
                  count(*)::int AS week
           FROM audit_jobs WHERE status='failed' AND coalesce(completed_at,created_at) > now()-interval '7 days'
           GROUP BY 1 ORDER BY week DESC, category`,
        )
      ).rows;
      const google = await this.list({ kinds: ["google_connection"], hexPrefix: null, uuid: null, workspaceId: null, limit: 200 });
      return {
        recent: { scan_failed: { day: counts.scan_day, week: counts.scan_week }, draft_failed: { day: counts.draft_day, week: counts.draft_week } },
        open: { scan_dead_lettered: counts.dead, google_connection: google.length, workspace_processing: counts.processing },
        categories,
      };
    },
  };
}
```

Note for the implementer: `DEAD_LETTERED_JOB_CONDITION_SQL` uses unqualified column names (`status`, `attempt_count`, `last_attempt_at`). That is safe in the `scan_dead_lettered` query even though it joins `workspaces`, because `workspaces` has none of those columns (`neon/migrations/0002_business.sql:492-508`). Do not add a table that has them to that join.

- [ ] **Step 4: Run it and confirm it passes**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-failures.integration.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Mutation checks**

One at a time, apply, run the file, confirm the named test fails, revert:
1. Remove `AND coalesce(r.input->>'source', '') <> 'assistant'` → "lists one failed draft per action…" fails.
2. Remove the outer `WHERE g.reason IN ('expired','error')` → "lists a broken Google connection…" fails.
3. Change `j.failure_correlation_id::text AS correlation_id` to `j.failure_category AS correlation_id` → "lists failed scans…" fails.
4. In `draft_failed`, add `r.error AS business_name` instead of `w.business_name` → "never returns personal fields" fails.

- [ ] **Step 6: Typecheck and commit**

Run: `corepack pnpm typecheck`
Expected: exit 0.

```bash
git add lib/repositories/failures.ts test/integration/neon-failures.integration.test.ts
git commit -m "feat(P3.5b): failures read model over the existing tables"
```

---

### Task 4: Problem copy and the owner-action matrix

**Files:**
- Modify: `lib/messages/en.json`, `lib/messages/zh-HK.json`, `lib/messages/zh-TW.json`
- Create: `lib/ops/problem-copy.ts`, `lib/ops/problem-copy.test.ts`
- Create: `lib/ops/owner-actions.ts`, `lib/ops/owner-actions.test.ts`

- [ ] **Step 1: Add the `problems` namespace to all three message files**

Insert as a new top-level key right after `"draftFailure": { … },` in each file.

`lib/messages/en.json`:

```json
  "problems": {
    "homeTitle": "Needs attention",
    "homeMore": "See every problem in Activity",
    "activityTitle": "Problems & recovery",
    "activityEmpty": "No open problems.",
    "reference": "Reference {reference}",
    "kind": {
      "scan_failed": "A scan did not finish",
      "scan_dead_lettered": "A scan stopped responding",
      "draft_failed": "A draft could not be generated",
      "google_connection": "The Google connection needs attention"
    },
    "next": {
      "rescan": "Run a new scan for this location.",
      "contact_support": "Contact Fimmick and quote the reference below.",
      "open_action": "Open the action and try the draft again.",
      "reauthorise": "Re-authorise Google to restore the connection.",
      "ask_owner": "Ask the workspace owner to reconnect Google.",
      "dead_lettered": "It closes automatically within 24 hours; you can then rescan.",
      "none": "An owner, or a manager for this location, can act on this."
    },
    "button": {
      "open_action": "Open action",
      "reauthorise": "Re-authorise",
      "contact_support": "Contact Fimmick"
    },
    "reason": {
      "ATTEMPTS_EXHAUSTED": "The scan stopped responding after three attempts.",
      "COLLECTION_FAILED": "Collecting public evidence failed.",
      "SCORING_FAILED": "Scoring the evidence failed.",
      "PERSIST_FAILED": "Saving the results failed.",
      "PROCESSOR_FAILED": "The scan could not be processed.",
      "CLAIM_FAILED": "The scan could not be started.",
      "consent_missing": "The scan had no recorded consent.",
      "consent_policy_stale": "The consent was given under an older policy.",
      "action_run_timeout": "Drafting ran out of time.",
      "action_run_reaped": "Drafting stopped responding.",
      "invalid_output": "The draft could not be read.",
      "action_run_failed": "Drafting failed.",
      "expired": "The Google authorisation expired.",
      "error": "Google reported a connection error.",
      "workspace_post_process_failed": "Updating the workspace after the scan failed.",
      "generic": "Something went wrong."
    },
    "scanStuck": {
      "title": "This scan stopped responding",
      "body": "It will close automatically within 24 hours. You can start a new scan any time.",
      "button": "Start a new scan"
    }
  },
```

`lib/messages/zh-HK.json`:

```json
  "problems": {
    "homeTitle": "需要處理",
    "homeMore": "在活動紀錄查看所有問題",
    "activityTitle": "問題與復原",
    "activityEmpty": "目前沒有未處理的問題。",
    "reference": "參考編號 {reference}",
    "kind": {
      "scan_failed": "一次掃描未能完成",
      "scan_dead_lettered": "一次掃描停止回應",
      "draft_failed": "草稿未能生成",
      "google_connection": "Google 連接需要處理"
    },
    "next": {
      "rescan": "為這個地點重新掃描。",
      "contact_support": "請聯絡 Fimmick，並提供以下參考編號。",
      "open_action": "開啟行動，再次嘗試生成草稿。",
      "reauthorise": "重新授權 Google 以恢復連接。",
      "ask_owner": "請工作台擁有人重新連接 Google。",
      "dead_lettered": "系統會在 24 小時內自動結束這次掃描，之後你可以重新掃描。",
      "none": "擁有人或負責此地點的經理可以處理。"
    },
    "button": {
      "open_action": "開啟行動",
      "reauthorise": "重新授權",
      "contact_support": "聯絡 Fimmick"
    },
    "reason": {
      "ATTEMPTS_EXHAUSTED": "掃描嘗試三次後仍停止回應。",
      "COLLECTION_FAILED": "收集公開證據失敗。",
      "SCORING_FAILED": "評分失敗。",
      "PERSIST_FAILED": "儲存結果失敗。",
      "PROCESSOR_FAILED": "無法處理這次掃描。",
      "CLAIM_FAILED": "無法開始這次掃描。",
      "consent_missing": "這次掃描沒有已記錄的同意。",
      "consent_policy_stale": "同意是按舊版政策作出的。",
      "action_run_timeout": "生成草稿超時。",
      "action_run_reaped": "生成草稿停止回應。",
      "invalid_output": "無法讀取草稿。",
      "action_run_failed": "生成草稿失敗。",
      "expired": "Google 授權已過期。",
      "error": "Google 回報連接錯誤。",
      "workspace_post_process_failed": "掃描後更新工作台失敗。",
      "generic": "出現問題。"
    },
    "scanStuck": {
      "title": "這次掃描停止回應",
      "body": "系統會在 24 小時內自動結束這次掃描。你可以隨時開始新的掃描。",
      "button": "開始新的掃描"
    }
  },
```

`lib/messages/zh-TW.json`:

```json
  "problems": {
    "homeTitle": "需要處理",
    "homeMore": "在活動紀錄查看所有問題",
    "activityTitle": "問題與復原",
    "activityEmpty": "目前沒有待處理的問題。",
    "reference": "參考編號 {reference}",
    "kind": {
      "scan_failed": "一次掃描未能完成",
      "scan_dead_lettered": "一次掃描停止回應",
      "draft_failed": "草稿無法生成",
      "google_connection": "Google 連結需要處理"
    },
    "next": {
      "rescan": "為這個據點重新掃描。",
      "contact_support": "請聯絡 Fimmick，並提供下方參考編號。",
      "open_action": "開啟行動，再次嘗試生成草稿。",
      "reauthorise": "重新授權 Google 以恢復連結。",
      "ask_owner": "請工作台擁有者重新連結 Google。",
      "dead_lettered": "系統會在 24 小時內自動結束這次掃描，之後你可以重新掃描。",
      "none": "擁有者或負責此據點的經理可以處理。"
    },
    "button": {
      "open_action": "開啟行動",
      "reauthorise": "重新授權",
      "contact_support": "聯絡 Fimmick"
    },
    "reason": {
      "ATTEMPTS_EXHAUSTED": "掃描嘗試三次後仍停止回應。",
      "COLLECTION_FAILED": "收集公開證據失敗。",
      "SCORING_FAILED": "評分失敗。",
      "PERSIST_FAILED": "儲存結果失敗。",
      "PROCESSOR_FAILED": "無法處理這次掃描。",
      "CLAIM_FAILED": "無法開始這次掃描。",
      "consent_missing": "這次掃描沒有已記錄的同意。",
      "consent_policy_stale": "同意是依舊版政策提供的。",
      "action_run_timeout": "生成草稿逾時。",
      "action_run_reaped": "生成草稿停止回應。",
      "invalid_output": "無法讀取草稿。",
      "action_run_failed": "生成草稿失敗。",
      "expired": "Google 授權已過期。",
      "error": "Google 回報連結錯誤。",
      "workspace_post_process_failed": "掃描後更新工作台失敗。",
      "generic": "發生問題。"
    },
    "scanStuck": {
      "title": "這次掃描停止回應",
      "body": "系統會在 24 小時內自動結束這次掃描。你可以隨時開始新的掃描。",
      "button": "開始新的掃描"
    }
  },
```

Run: `corepack pnpm vitest run tests/i18n.test.ts`
Expected: PASS (the three files still share one key set).

- [ ] **Step 2: Write the failing copy test**

`lib/ops/problem-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextStepText, problemReasonLabel, problemTitle, KNOWN_REASON_CODES } from "./problem-copy";
import type { OwnerProblem } from "./failure-types";

const LOCALES = ["en", "zh-HK", "zh-TW"] as const;

function problem(partial: Partial<OwnerProblem>): OwnerProblem {
  return {
    kind: "scan_failed", id: "id", reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: null, locationId: null, actionId: null, businessName: "Kam Man House", reason: "COLLECTION_FAILED",
    attempts: null, operatorAction: "none", ownerAction: "none", contactHref: null, ...partial,
  };
}

describe("problem copy", () => {
  it("labels every known reason code in every locale, never echoing the code", () => {
    for (const locale of LOCALES)
      for (const code of KNOWN_REASON_CODES) {
        const label = problemReasonLabel(locale, code);
        expect(label).not.toBe(code);
        expect(label).not.toContain("problems.");
      }
  });

  it("falls back to the generic line for an unknown or unsafe code", () => {
    for (const code of ["WEIRD_NEW_CODE", "kind.scan_failed", "../reason", ""]) {
      expect(problemReasonLabel("en", code)).toBe("Something went wrong.");
    }
  });

  it("titles each owner-visible kind", () => {
    expect(problemTitle("en", "google_connection")).toBe("The Google connection needs attention");
    expect(problemTitle("zh-HK", "scan_failed")).toBe("一次掃描未能完成");
  });

  it("uses the dead-letter line for a stuck scan whatever the action", () => {
    expect(nextStepText("en", problem({ kind: "scan_dead_lettered", ownerAction: "none" }))).toBe("It closes automatically within 24 hours; you can then rescan.");
    expect(nextStepText("en", problem({ ownerAction: "rescan" }))).toBe("Run a new scan for this location.");
    expect(nextStepText("en", problem({ ownerAction: "none" }))).toBe("An owner, or a manager for this location, can act on this.");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `corepack pnpm vitest run lib/ops/problem-copy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`lib/ops/problem-copy.ts`:

```ts
import { hasMessage, t } from "@/lib/i18n";
import type { FailureKind, OwnerProblem } from "./failure-types";

/** Every code the model can emit today. Tests prove each has a label in every locale. */
export const KNOWN_REASON_CODES = [
  "ATTEMPTS_EXHAUSTED", "COLLECTION_FAILED", "SCORING_FAILED", "PERSIST_FAILED", "PROCESSOR_FAILED", "CLAIM_FAILED",
  "consent_missing", "consent_policy_stale",
  "action_run_timeout", "action_run_reaped", "invalid_output", "action_run_failed",
  "expired", "error", "workspace_post_process_failed",
] as const;

const SAFE_CODE = /^[A-Za-z_]+$/;

/** A reason's label; an unknown or unsafe code gets the generic line. A raw code is never returned. Client-safe. */
export function problemReasonLabel(locale: string, code: string): string {
  const key = `problems.reason.${code}`;
  return SAFE_CODE.test(code) && hasMessage(locale, key) ? t(locale, key) : t(locale, "problems.reason.generic");
}

export function problemTitle(locale: string, kind: FailureKind): string {
  return t(locale, `problems.kind.${kind}`);
}

export function nextStepText(locale: string, problem: OwnerProblem): string {
  if (problem.kind === "scan_dead_lettered") return t(locale, "problems.next.dead_lettered");
  return t(locale, `problems.next.${problem.ownerAction}`);
}
```

Note: `hasMessage` checks the locale bundle; the three bundles share one key set, so a key present in one is present in all.

- [ ] **Step 5: Run it and confirm it passes**

Run: `corepack pnpm vitest run lib/ops/problem-copy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing owner-action test**

`lib/ops/owner-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildOwnerProblems, filterToLocation, ownerActionFor, visibleTo, type OwnerContext } from "./owner-actions";
import type { FailureItem, FailureKind } from "./failure-types";

const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function item(kind: FailureKind, locationId: string | null = LOC_A, actionId: string | null = null): FailureItem {
  return {
    kind, id: `${kind}-id`, reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: { id: "ws", slug: "kam-man-house", name: "Kam Man House" }, locationId, actionId,
    businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
  };
}
const owner: OwnerContext = { role: "owner", locationScope: null, tier: "paid" };
const scopedManager: OwnerContext = { role: "manager", locationScope: [LOC_A], tier: "paid" };
const viewer: OwnerContext = { role: "viewer", locationScope: null, tier: "paid" };

describe("ownerActionFor", () => {
  const cases: Array<[string, FailureItem, OwnerContext, string]> = [
    ["failed scan, paid owner", item("scan_failed"), owner, "rescan"],
    ["failed scan, lite owner", item("scan_failed"), { ...owner, tier: "lite" }, "contact_support"],
    ["failed scan without a location", item("scan_failed", null), owner, "contact_support"],
    ["failed scan, manager in scope", item("scan_failed"), scopedManager, "rescan"],
    ["failed scan, manager out of scope", item("scan_failed", LOC_B), scopedManager, "none"],
    ["failed scan, viewer", item("scan_failed"), viewer, "none"],
    ["stuck scan, owner", item("scan_dead_lettered"), owner, "none"],
    ["failed draft, owner", item("draft_failed", LOC_A, "act-1"), owner, "open_action"],
    ["failed draft, manager out of scope", item("draft_failed", LOC_B, "act-1"), scopedManager, "none"],
    ["failed draft, viewer", item("draft_failed", LOC_A, "act-1"), viewer, "none"],
    ["google, owner", item("google_connection", null), owner, "reauthorise"],
    ["google, manager", item("google_connection", null), scopedManager, "ask_owner"],
    ["google, viewer", item("google_connection", null), viewer, "none"],
  ];
  it.each(cases)("%s", (_name, failure, ctx, expected) => {
    expect(ownerActionFor(failure, ctx)).toBe(expected);
  });
});

describe("visibility and location", () => {
  it("hides post-processing from everyone and other locations from a scoped manager", () => {
    expect(visibleTo(item("workspace_processing"), owner)).toBe(false);
    expect(visibleTo(item("scan_failed", LOC_B), scopedManager)).toBe(false);
    expect(visibleTo(item("scan_failed", LOC_A), scopedManager)).toBe(true);
    expect(visibleTo(item("google_connection", null), scopedManager)).toBe(true);
    expect(visibleTo(item("scan_failed", LOC_B), viewer)).toBe(true);
  });

  it("keeps workspace-wide items on every location page, and everything on 'all'", () => {
    const items = [item("scan_failed", LOC_A), item("scan_failed", LOC_B), item("google_connection", null)];
    expect(filterToLocation(items, LOC_A).map((i) => i.locationId)).toEqual([LOC_A, null]);
    expect(filterToLocation(items, "all")).toHaveLength(3);
  });

  it("builds problems with the contact link only for contact_support", () => {
    const problems = buildOwnerProblems([item("scan_failed"), item("google_connection", null)], { ...owner, tier: "lite" }, "https://wa.me/85200000000");
    expect(problems.map((p) => [p.ownerAction, p.contactHref])).toEqual([
      ["contact_support", "https://wa.me/85200000000"],
      ["reauthorise", null],
    ]);
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `corepack pnpm vitest run lib/ops/owner-actions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 8: Implement**

`lib/ops/owner-actions.ts`:

```ts
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";
import type { FailureItem, OwnerAction, OwnerProblem } from "./failure-types";

/**
 * Spec §3 owner-action matrix. Resolved on the server; components only render
 * the result. Location scope mirrors lib/auth.ts inLocationScope: only a
 * manager with a non-null location_scope is restricted.
 */
export interface OwnerContext {
  role: WorkspaceRole;
  locationScope: string[] | null;
  tier: "lite" | "paid";
}

function scoped(ctx: OwnerContext): boolean {
  return ctx.role === "manager" && ctx.locationScope !== null;
}

function inScope(ctx: OwnerContext, locationId: string | null): boolean {
  if (!scoped(ctx)) return true;
  return locationId !== null && ctx.locationScope!.includes(locationId);
}

/** Workspace-wide items (no location) are visible to every member; post-processing to none. */
export function visibleTo(item: FailureItem, ctx: OwnerContext): boolean {
  if (item.kind === "workspace_processing") return false;
  if (item.locationId === null) return true;
  return inScope(ctx, item.locationId);
}

export function ownerActionFor(item: FailureItem, ctx: OwnerContext): OwnerAction {
  const canAct = ctx.role === "owner" || (ctx.role === "manager" && inScope(ctx, item.locationId));
  switch (item.kind) {
    case "scan_failed":
      if (!canAct) return "none";
      return ctx.tier === "paid" && item.locationId ? "rescan" : "contact_support";
    case "draft_failed":
      return canAct && item.actionId ? "open_action" : "none";
    case "google_connection":
      return ctx.role === "owner" ? "reauthorise" : ctx.role === "manager" ? "ask_owner" : "none";
    case "scan_dead_lettered":
    case "workspace_processing":
      return "none";
  }
}

/** The Home card follows ?location=; workspace-wide items appear on every location. */
export function filterToLocation<T extends FailureItem>(items: T[], locationId: string | "all"): T[] {
  if (locationId === "all") return items;
  return items.filter((item) => item.locationId === null || item.locationId === locationId);
}

export function buildOwnerProblems(items: FailureItem[], ctx: OwnerContext, contactHref: string | null): OwnerProblem[] {
  return items
    .filter((item) => visibleTo(item, ctx))
    .map((item) => {
      const ownerAction = ownerActionFor(item, ctx);
      return { ...item, ownerAction, contactHref: ownerAction === "contact_support" ? contactHref : null };
    });
}
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `corepack pnpm vitest run lib/ops/owner-actions.test.ts lib/ops/problem-copy.test.ts tests/i18n.test.ts`
Expected: PASS.

- [ ] **Step 10: Mutation check**

Change `return ctx.tier === "paid" && item.locationId ? "rescan" : "contact_support";` to `return "rescan";`. Run `lib/ops/owner-actions.test.ts`: the lite and no-location cases FAIL. Revert.

- [ ] **Step 11: Commit**

```bash
git add lib/messages/en.json lib/messages/zh-HK.json lib/messages/zh-TW.json lib/ops/problem-copy.ts lib/ops/problem-copy.test.ts lib/ops/owner-actions.ts lib/ops/owner-actions.test.ts
git commit -m "feat(P3.5b): owner problem copy and the owner-action matrix"
```

---

### Task 5: Dead-letter repository (auto-close and release)

**Files:**
- Modify: `lib/workspace/audit.ts`
- Modify: `lib/workspace/audit-labels.ts`
- Create: `lib/repositories/dead-letter.ts`
- Create: `test/integration/neon-dead-letter.integration.test.ts`

- [ ] **Step 1: Add the two audit events**

In `lib/workspace/audit.ts`, change the last line of the `AUDIT_EVENTS` tuple from:

```ts
  "mail.attempted",
] as const;
```

to:

```ts
  "mail.attempted",
  "scan.auto_closed", "ops.scan.released",
] as const;
```

and, after `export const RUN_TIMED_OUT_EVENT = "run.timed_out" satisfies AuditEvent;`, add:

```ts
/** Written from raw SQL in lib/repositories/dead-letter.ts; the constants tie that SQL to the tuple. */
export const SCAN_AUTO_CLOSED_EVENT = "scan.auto_closed" satisfies AuditEvent;
export const SCAN_RELEASED_EVENT = "ops.scan.released" satisfies AuditEvent;
```

In `lib/workspace/audit-labels.ts`, after the `"mail.attempted"` entry add:

```ts
  "scan.auto_closed": { en: "Stuck scan closed", zh: "已結束停止回應的掃描" },
  "ops.scan.released": { en: "Scan resumed by Fimmick", zh: "Fimmick 已恢復掃描" },
```

Run: `corepack pnpm vitest run lib/workspace/audit.test.ts`
Expected: PASS (the label-coverage test sees both new events labelled).

- [ ] **Step 2: Write the failing integration test**

`test/integration/neon-dead-letter.integration.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { deadLetterRepository } from "../../lib/repositories/dead-letter";
import { createScanExecutionStore } from "../../lib/scan/execution-store";

describe.runIf(process.env.NEON_INTEGRATION === "1")("Neon dead-letter handling", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;
  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href, max: 6 });
  });
  beforeEach(async () => {
    vi.stubEnv("POSTHOG_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await runtime.query("DELETE FROM audit_events; DELETE FROM audit_jobs; DELETE FROM workspaces; DELETE FROM app_users");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), owner?.end()]);
    fixture?.stop();
  });

  const repo = () => deadLetterRepository(runtime);
  const workspace = async () => (await runtime.query("INSERT INTO workspaces(slug) VALUES($1) RETURNING id", [`dl-${randomUUID().slice(0, 8)}`])).rows[0].id as string;
  const stuck = async (lastAttempt: string, opts: { attempts?: number; ws?: string | null; session?: string } = {}) => {
    const id = (await runtime.query(
      "INSERT INTO audit_jobs(business_name,status,processing_stage,attempt_count,last_attempt_at,workspace_id) VALUES('Stuck','collecting','collecting_aeo',$1,now()-$2::interval,$3) RETURNING id",
      [opts.attempts ?? 3, lastAttempt, opts.ws ?? null],
    )).rows[0].id as string;
    if (opts.session)
      await runtime.query("INSERT INTO scan_events(job_id,anonymous_session_id,event_name,properties,dedupe_key) VALUES($1,$2,'scan_started','{}','started')", [id, opts.session]);
    return id;
  };
  const jobRow = async (id: string) => (await runtime.query("SELECT status,processing_stage,failure_category,failure_correlation_id,completed_at,attempt_count FROM audit_jobs WHERE id=$1", [id])).rows[0];
  const events = async (id: string) => (await runtime.query("SELECT event,actor_type,actor_id,workspace_id,payload FROM audit_events WHERE entity_id=$1 ORDER BY id", [id])).rows;
  const completed = async (id: string) => (await runtime.query("SELECT anonymous_session_id,properties FROM scan_events WHERE job_id=$1 AND event_name='scan_completed'", [id])).rows;
  const operator = async () => (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@fimmick.test`])).rows[0].id as string;

  describe("closeExhausted", () => {
    it("closes a scan stuck for over 24 hours as ATTEMPTS_EXHAUSTED, but not one at 23 hours", async () => {
      const ws = await workspace();
      const old = await stuck("25 hours", { ws, session: "session-1" });
      const recent = await stuck("23 hours");
      expect(await repo().closeExhausted(20)).toEqual([old]);
      expect(await jobRow(old)).toMatchObject({ status: "failed", processing_stage: "failed", failure_category: "ATTEMPTS_EXHAUSTED" });
      expect((await jobRow(old)).failure_correlation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect((await jobRow(old)).completed_at).not.toBeNull();
      expect((await jobRow(recent)).status).toBe("collecting");
    });

    it("writes exactly one scan_completed under the scan's own session and one scan.auto_closed", async () => {
      const ws = await workspace();
      const old = await stuck("25 hours", { ws, session: "session-1" });
      await repo().closeExhausted(20);
      await repo().closeExhausted(20);
      expect(await completed(old)).toEqual([{ anonymous_session_id: "session-1", properties: { outcome: "failed", coverage: 0 } }]);
      expect(await events(old)).toEqual([{ event: "scan.auto_closed", actor_type: "system", actor_id: null, workspace_id: ws, payload: { locale: null, attempts: 3 } }]);
    });

    it("still records scan_completed when the scan has no scan_started session", async () => {
      const old = await stuck("25 hours");
      await repo().closeExhausted(20);
      expect(await completed(old)).toHaveLength(1);
    });

    it("never closes a claimable job, and respects the batch limit", async () => {
      const claimable = await stuck("25 hours", { attempts: 2 });
      await stuck("26 hours");
      await stuck("27 hours");
      expect(await repo().closeExhausted(1)).toHaveLength(1);
      expect((await jobRow(claimable)).status).toBe("collecting");
    });
  });

  describe("release", () => {
    it("grants exactly one more attempt on the same job and records who released it", async () => {
      const ws = await workspace();
      const id = await stuck("2 hours", { ws, attempts: 4 });
      const op = await operator();
      expect(await repo().release(id, op)).toEqual({ released: true, previousAttempts: 4 });
      expect((await jobRow(id)).attempt_count).toBe(2);
      expect(await events(id)).toEqual([{ event: "ops.scan.released", actor_type: "user", actor_id: op, workspace_id: ws, payload: { locale: null, previous_attempts: 4 } }]);
      expect(await repo().release(id, op)).toEqual({ released: false });
    });

    it("refuses a job that is not dead-lettered", async () => {
      const op = await operator();
      const claimable = await stuck("2 hours", { attempts: 2 });
      const fresh = await stuck("5 minutes");
      const done = (await runtime.query("INSERT INTO audit_jobs(business_name,status,attempt_count) VALUES('Done','done',3) RETURNING id")).rows[0].id;
      for (const id of [claimable, fresh, done, randomUUID()]) expect(await repo().release(id, op)).toEqual({ released: false });
      expect(await events(claimable)).toEqual([]);
    });

    it("lets exactly one of two concurrent releases win", async () => {
      const id = await stuck("2 hours");
      const op = await operator();
      const results = await Promise.all([repo().release(id, op), repo().release(id, op)]);
      expect(results.filter((r) => r.released)).toHaveLength(1);
      expect(await events(id)).toHaveLength(1);
    });

    it("makes the job claimable once, through the budgeted claim, which logs one attempt", async () => {
      vi.stubEnv("BUDGET_SCAN_ATTEMPTS_GLOBAL_24H", "off");
      const id = await stuck("2 hours");
      await repo().release(id, await operator());
      const store = createScanExecutionStore(randomUUID(), {
        pool: runtime,
        env: { BUDGET_SCAN_ATTEMPTS_GLOBAL_24H: "off" },
        onBudgetRefused: vi.fn(),
        analytics: { insert: async () => {}, capturePostHog: async () => {}, reportError: () => {} },
      });
      expect(await store.claimJob(id)).not.toBeNull();
      expect((await jobRow(id)).attempt_count).toBe(3);
      expect((await runtime.query("SELECT count(*)::int AS n FROM scan_attempts WHERE job_id=$1", [id])).rows[0].n).toBe(1);
    });

    it("stops the auto-close from closing a job released inside the grace window", async () => {
      const id = await stuck("25 hours");
      await repo().release(id, await operator());
      expect(await repo().closeExhausted(20)).toEqual([]);
      expect((await jobRow(id)).status).toBe("collecting");
    });
  });
});
```

Before relying on `store.claimJob(id)`, open `lib/scan/execution-store.ts` and confirm the claim method's name and return shape (the P3.5a integration test `test/integration/neon-scan-claim-budget.integration.test.ts` calls it). Adjust the call in this test to match exactly; do not change the store.

- [ ] **Step 3: Run it and confirm it fails**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-dead-letter.integration.test.ts`
Expected: FAIL (module `lib/repositories/dead-letter` not found).

- [ ] **Step 4: Implement**

`lib/repositories/dead-letter.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPool } from "../db/client";
import { withTransaction } from "../db/transaction";
import { DEAD_LETTERED_JOB_CONDITION_SQL } from "../scan/claimable";
import { SCAN_TERMINAL_DEDUPE_KEY, scanCompletedEvent, writeScanEventSafely } from "../analytics/scan-events";
import { SCAN_AUTO_CLOSED_EVENT, SCAN_RELEASED_EVENT } from "../workspace/audit";

type Db = Pick<Pool, "query" | "connect">;

export const ATTEMPTS_EXHAUSTED = "ATTEMPTS_EXHAUSTED";
/** Spec §2: the window an operator has to release a dead-lettered scan before it is closed. */
export const AUTO_CLOSE_GRACE_SQL = "last_attempt_at < now() - interval '24 hours'";

export type ReleaseResult = { released: false } | { released: true; previousAttempts: number };

/**
 * One transaction per job. The guarded UPDATE re-checks the dead-letter and
 * grace conditions under the row lock, so a job claimed or released since the
 * candidate SELECT is skipped. Like jobsRepository.failQueued it records the
 * job's scan_completed (failed, coverage 0) as its last statement, in a
 * SAVEPOINT, so P3.4's reconciliation gains no gap.
 */
async function closeOne(client: PoolClient, jobId: string): Promise<boolean> {
  const { rows } = await client.query<{ attempt_count: number; workspace_id: string | null; location_id: string | null }>(
    `UPDATE audit_jobs
        SET status='failed', processing_stage='failed', failure_category=$2,
            failure_correlation_id=gen_random_uuid(), completed_at=now()
      WHERE id=$1 AND ${DEAD_LETTERED_JOB_CONDITION_SQL} AND ${AUTO_CLOSE_GRACE_SQL}
      RETURNING attempt_count, workspace_id, location_id`,
    [jobId, ATTEMPTS_EXHAUSTED],
  );
  const row = rows[0];
  if (!row) return false;
  await client.query(
    `INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
     VALUES($1,$2,'system',NULL,'${SCAN_AUTO_CLOSED_EVENT}','audit_job',$3,$4)`,
    [row.workspace_id, row.location_id, jobId, JSON.stringify({ locale: null, attempts: row.attempt_count })],
  );
  // The scan's own session, so the event dedupes against a terminal write
  // from that session. A scan with no recorded start gets a fresh one, as a
  // cookie-less process call would.
  const session =
    (
      await client.query<{ id: string }>(
        "SELECT anonymous_session_id AS id FROM scan_events WHERE job_id=$1 AND event_name='scan_started' AND anonymous_session_id IS NOT NULL ORDER BY created_at LIMIT 1",
        [jobId],
      )
    ).rows[0]?.id ?? randomUUID();
  await writeScanEventSafely(client, { jobId, anonymousSessionId: session, event: scanCompletedEvent("failed", 0), dedupeKey: SCAN_TERMINAL_DEDUPE_KEY });
  return true;
}

/** P3.5b dead-letter handling (spec §2). */
export function deadLetterRepository(pool: Db = getPool()) {
  return {
    /** Closes up to `limit` scans dead-lettered past the grace period; returns the ids it closed. */
    async closeExhausted(limit: number): Promise<string[]> {
      const candidates = (
        await pool.query<{ id: string }>(
          `SELECT id FROM audit_jobs WHERE ${DEAD_LETTERED_JOB_CONDITION_SQL} AND ${AUTO_CLOSE_GRACE_SQL} ORDER BY last_attempt_at, id LIMIT $1`,
          [limit],
        )
      ).rows;
      const closed: string[] = [];
      for (const { id } of candidates) {
        try {
          if (await withTransaction((client) => closeOne(client, id), pool)) closed.push(id);
        } catch {
          console.error("[ops] auto_close_failed", { category: "scan_auto_close_failed", jobId: id });
        }
      }
      return closed;
    },

    /**
     * Grants one more attempt: attempt_count=2 is one below the lease's limit
     * of 3. The CTE's FOR UPDATE re-evaluates the condition after waiting on a
     * concurrent release, so exactly one of two wins. The true attempt history
     * stays in scan_attempts; the audit row keeps the previous counter.
     */
    async release(jobId: string, operatorUserId: string): Promise<ReleaseResult> {
      return withTransaction(async (client) => {
        const { rows } = await client.query<{ previous: number; workspace_id: string | null; location_id: string | null }>(
          `WITH target AS (
             SELECT id, attempt_count AS previous FROM audit_jobs WHERE id=$1 AND ${DEAD_LETTERED_JOB_CONDITION_SQL} FOR UPDATE
           )
           UPDATE audit_jobs j SET attempt_count=2 FROM target t WHERE j.id=t.id
           RETURNING t.previous, j.workspace_id, j.location_id`,
          [jobId],
        );
        const row = rows[0];
        if (!row) return { released: false } as const;
        await client.query(
          `INSERT INTO audit_events(workspace_id,location_id,actor_type,actor_id,event,entity_type,entity_id,payload)
           VALUES($1,$2,'user',$3,'${SCAN_RELEASED_EVENT}','audit_job',$4,$5)`,
          [row.workspace_id, row.location_id, operatorUserId, jobId, JSON.stringify({ locale: null, previous_attempts: row.previous })],
        );
        return { released: true, previousAttempts: row.previous } as const;
      }, pool);
    },
  };
}
```

Note: `release(jobId)` is called with any UUID. A non-UUID string would make PostgreSQL raise; the route validates the id first (Task 7).

- [ ] **Step 5: Run it and confirm it passes**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-dead-letter.integration.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Mutation checks**

One at a time, apply, run the file, confirm the failure, revert:
1. `interval '24 hours'` → `interval '22 hours'` in `AUTO_CLOSE_GRACE_SQL` → "…but not one at 23 hours" fails.
2. Remove `AND ${DEAD_LETTERED_JOB_CONDITION_SQL}` from the release CTE → "refuses a job that is not dead-lettered" fails.
3. Set the release to `attempt_count=3` → "grants exactly one more attempt…" and "makes the job claimable once…" fail.
4. Remove the `writeScanEventSafely` call → "writes exactly one scan_completed…" fails.

The re-check inside `closeOne`'s UPDATE (a job released between the candidate SELECT and the UPDATE is skipped) cannot be interleaved deterministically from this test; it is the same guarded-UPDATE pattern as `failQueued`, and "stops the auto-close from closing a job released inside the grace window" covers the released-before-SELECT case.

- [ ] **Step 7: Commit**

```bash
git add lib/workspace/audit.ts lib/workspace/audit-labels.ts lib/repositories/dead-letter.ts test/integration/neon-dead-letter.integration.test.ts
git commit -m "feat(P3.5b): auto-close and release for dead-lettered scans"
```

---

### Task 6: Shared dispatch helper and the cron auto-close step

**Files:**
- Create: `lib/scan/dispatch-process.ts`, `lib/scan/dispatch-process.test.ts`
- Modify: `app/api/cron/dispatch/route.ts`
- Modify: `app/api/cron/dispatch/route.test.ts`

- [ ] **Step 1: Write the failing helper test**

`lib/scan/dispatch-process.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { waitUntil } = vi.hoisted(() => ({ waitUntil: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

import { dispatchScanProcess } from "./dispatch-process";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("dispatchScanProcess", () => {
  it("returns false and fetches nothing without APP_ORIGIN", () => {
    vi.stubEnv("APP_ORIGIN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(dispatchScanProcess("job-1", vi.fn())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the job to the process route under waitUntil", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    expect(dispatchScanProcess("job-1", vi.fn())).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://app.example.test/api/scan/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1" }),
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("reports a failed dispatch to the caller instead of throwing", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.test");
    const cause = new Error("down");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));
    const onError = vi.fn();
    dispatchScanProcess("job-1", onError);
    await waitUntil.mock.calls[0][0];
    expect(onError).toHaveBeenCalledWith(cause);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `corepack pnpm vitest run lib/scan/dispatch-process.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

`lib/scan/dispatch-process.ts`:

```ts
import { waitUntil } from "@vercel/functions";

/**
 * Asks the app to process a claimable job, the way the cron reclaim always
 * has: a best-effort POST to /api/scan/process kept alive by waitUntil. Shared
 * by the cron tick and the operator release (P3.5b). Returns whether a
 * dispatch was attempted; false only when APP_ORIGIN is not configured. The
 * process route's own claim is the gate, so a duplicate dispatch is harmless.
 */
export function dispatchScanProcess(jobId: string, onError: (cause: unknown) => void): boolean {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return false;
  waitUntil(
    fetch(`${origin}/api/scan/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    })
      .then(() => undefined)
      .catch(onError),
  );
  return true;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `corepack pnpm vitest run lib/scan/dispatch-process.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing cron tests**

In `app/api/cron/dispatch/route.test.ts`:

1. Add `closeExhausted: vi.fn(),` to the `vi.hoisted` object and to its destructuring.
2. Add the mock after the other `vi.mock` lines:

```ts
vi.mock("@/lib/repositories/dead-letter", () => ({ deadLetterRepository: () => ({ closeExhausted }) }));
```

3. In `beforeEach` add `closeExhausted.mockResolvedValue([]);`.
4. Every existing `toEqual({ notified: … })` assertion on the response JSON gains `autoClosed: 0` (search the file for `toEqual({ notified` and add the key to each object).
5. Add these tests inside `describe("POST /api/cron/dispatch", …)`:

```ts
  it("closes exhausted scans in batches of 20 and reports how many", async () => {
    closeExhausted.mockResolvedValue(["job-1", "job-2"]);
    const response = await POST(request());
    expect(closeExhausted).toHaveBeenCalledWith(20);
    expect((await response.json()).autoClosed).toBe(2);
  });

  it("keeps the other steps running when the auto-close step fails", async () => {
    closeExhausted.mockRejectedValue(new Error("boom"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    claimableJobIds.mockResolvedValue(["job-9"]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).autoClosed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reconcileWorkspaceScans).toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith("[cron/dispatch] close_exhausted_scans failed", expect.objectContaining({ category: "cron_dispatch_step_failed", step: "close_exhausted_scans" }));
  });
```

- [ ] **Step 6: Run and confirm the new tests fail**

Run: `corepack pnpm vitest run app/api/cron/dispatch/route.test.ts`
Expected: FAIL (`autoClosed` missing, `closeExhausted` not called).

- [ ] **Step 7: Implement the cron changes**

In `app/api/cron/dispatch/route.ts`:

1. Replace `import { waitUntil } from "@vercel/functions";` with:

```ts
import { dispatchScanProcess } from "@/lib/scan/dispatch-process";
import { deadLetterRepository } from "@/lib/repositories/dead-letter";
```

2. After `const RECLAIM_BATCH_LIMIT = 20;` add:

```ts
/** Bounds one tick's auto-close work (P3.5b), like the reclaim batch. */
const AUTO_CLOSE_BATCH_LIMIT = 20;
```

3. Replace the reclaim block's `if (origin) { … } else if …` with:

```ts
    const origin = process.env.APP_ORIGIN;
    if (origin) {
      for (const jobId of jobIds) dispatchScanProcess(jobId, (cause) => logFailure(`reclaim_dispatch:${jobId}`, cause));
    } else if (jobIds.length > 0) {
      logFailure("reclaim_abandoned_scans", new Error("APP_ORIGIN not configured -- found eligible jobs but could not dispatch any"));
    }
```

4. After the reclaim `try/catch` and **before** the `reconciled` block (so a workspace job closed now reaches the completion outbox in the same tick), add:

```ts
  // P3.5b: scans that used all three attempts and sat past the 24-hour
  // release window are closed as failed, so no owner watches a spinner
  // forever. Before reconcile, so a workspace job closed here gets its
  // scan.failed notification in this same tick.
  let autoClosed = 0;
  try {
    autoClosed = (await deadLetterRepository(getPool()).closeExhausted(AUTO_CLOSE_BATCH_LIMIT)).length;
  } catch (cause) {
    logFailure("close_exhausted_scans", cause);
  }
```

5. Add `autoClosed` to the response object: `{ notified, reclaimCandidates, autoClosed, reconciled, verified }`.
6. Update the route's doc comment list ("Every 5 minutes: …") to include "close scans stuck after three attempts past the 24-hour release window".

- [ ] **Step 8: Run and confirm everything passes**

Run: `corepack pnpm vitest run app/api/cron/dispatch/route.test.ts lib/scan/dispatch-process.test.ts`
Expected: PASS. The existing reclaim tests still see the same `fetch` calls.

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-cron-dispatch.integration.test.ts`
Expected: PASS. If it asserts the full JSON body, add `autoClosed: 0` there too.

- [ ] **Step 9: Commit**

```bash
git add lib/scan/dispatch-process.ts lib/scan/dispatch-process.test.ts app/api/cron/dispatch/route.ts app/api/cron/dispatch/route.test.ts test/integration/neon-cron-dispatch.integration.test.ts
git commit -m "feat(P3.5b): cron closes scans stuck past the release window"
```

(Leave `neon-cron-dispatch.integration.test.ts` out of `git add` if it did not change.)

---

### Task 7: The operator release route

**Files:**
- Create: `app/api/ops/failures/scans/[jobId]/release/route.ts`
- Create: `app/api/ops/failures/scans/[jobId]/release/route.test.ts`

- [ ] **Step 1: Write the failing test**

`app/api/ops/failures/scans/[jobId]/release/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveOperator: vi.fn(), release: vi.fn(), dispatchScanProcess: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperator: () => mocks.resolveOperator() }));
vi.mock("@/lib/repositories/dead-letter", () => ({ deadLetterRepository: () => ({ release: mocks.release }) }));
vi.mock("@/lib/scan/dispatch-process", () => ({ dispatchScanProcess: (...a: unknown[]) => mocks.dispatchScanProcess(...a) }));

const JOB = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function post(jobId = JOB) {
  return import("./route").then(({ POST }) =>
    POST(new Request(`https://app.test/api/ops/failures/scans/${jobId}/release`, { method: "POST" }), { params: Promise.resolve({ jobId }) }),
  );
}

beforeEach(() => {
  mocks.resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada@fimmick.com" });
  mocks.release.mockResolvedValue({ released: true, previousAttempts: 3 });
  mocks.dispatchScanProcess.mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/ops/failures/scans/[jobId]/release", () => {
  it("answers 404 to a non-operator before touching the job", async () => {
    mocks.resolveOperator.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(404);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that is not a uuid", async () => {
    const response = await post("not-a-uuid");
    expect(response.status).toBe(404);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("answers 409 not_dead_lettered when the guarded update matched nothing", async () => {
    mocks.release.mockResolvedValue({ released: false });
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_dead_lettered" });
    expect(mocks.dispatchScanProcess).not.toHaveBeenCalled();
  });

  it("releases as the operator, dispatches, and says whether dispatch was attempted", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: true, dispatched: true });
    expect(mocks.release).toHaveBeenCalledWith(JOB, "op-1");
    expect(mocks.dispatchScanProcess).toHaveBeenCalledWith(JOB, expect.any(Function));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 without detail when the release itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.release.mockRejectedValue(new Error("connection reset with secret"));
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "release_failed" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `corepack pnpm vitest run "app/api/ops/failures/scans/[jobId]/release/route.test.ts"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`app/api/ops/failures/scans/[jobId]/release/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveOperator } from "@/lib/auth/operator";
import { deadLetterRepository } from "@/lib/repositories/dead-letter";
import { dispatchScanProcess } from "@/lib/scan/dispatch-process";

/**
 * POST /api/ops/failures/scans/[jobId]/release → 200 { released, dispatched } | 404 | 409 not_dead_lettered | 503
 *
 * P3.5b spec §2. Operator-only, and 404 to anyone else so the route's
 * existence is not a signal (the /ops convention). The guarded update in
 * deadLetterRepository().release is the whole decision: this route never
 * reads the job first, so there is no check-then-act window. The released job
 * keeps its consent, share slug and budget: its next claim is a retry claim,
 * checked against the P3.5a spend budget.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const operator = await resolveOperator();
  if (!operator) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  let result;
  try {
    result = await deadLetterRepository().release(jobId, operator.userId);
  } catch {
    console.error("[ops] release_failed", { category: "scan_release_failed", jobId });
    return NextResponse.json({ error: "release_failed" }, { status: 503, headers: NO_STORE });
  }
  if (!result.released) return NextResponse.json({ error: "not_dead_lettered" }, { status: 409, headers: NO_STORE });

  // Best-effort: if this fails or APP_ORIGIN is unset, the next cron tick
  // reclaims the job, because it is claimable now.
  const dispatched = dispatchScanProcess(jobId, (cause) =>
    console.error("[ops] release_dispatch_failed", { category: "scan_release_dispatch_failed", jobId, message: cause instanceof Error ? cause.message : "unknown" }),
  );
  return NextResponse.json({ released: true, dispatched }, { headers: NO_STORE });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `corepack pnpm vitest run "app/api/ops/failures/scans/[jobId]/release/route.test.ts" tests/route-exports.test.ts`
Expected: PASS (the route exports only `POST`).

- [ ] **Step 5: Commit**

```bash
git add "app/api/ops/failures/scans/[jobId]/release/route.ts" "app/api/ops/failures/scans/[jobId]/release/route.test.ts"
git commit -m "feat(P3.5b): operator release route for dead-lettered scans"
```

---

### Task 8: Scanning page dead-letter state

**Files:**
- Modify: `lib/repositories/jobs.ts`
- Modify: `app/api/scan/status/route.ts`
- Modify: `lib/funnel/scan-progress.ts`
- Create: `components/scan-stuck-card.tsx`, `components/scan-stuck-card.test.tsx`
- Modify: `components/scanning-page.tsx`
- Modify: `tests/funnel-scan.test.ts`
- Test: the status route test (find it with `ls app/api/scan/status`; if there is none, create `app/api/scan/status/route.test.ts`)

- [ ] **Step 1: Write the failing view-state tests**

Append to `tests/funnel-scan.test.ts` (import `scanViewState` if it is not imported already):

```ts
describe("scanViewState dead-lettered (P3.5b)", () => {
  it("shows the dead-letter state for a stuck in-flight scan, over stalled", () => {
    expect(scanViewState({ status: "collecting", stalledReason: null, deadLettered: true })).toBe("dead_lettered");
    expect(scanViewState({ status: "collecting", stalledReason: "timeout", deadLettered: true })).toBe("dead_lettered");
  });

  it("lets a terminal status win over a stale dead-letter flag", () => {
    expect(scanViewState({ status: "failed", stalledReason: null, deadLettered: true })).toBe("failed");
    expect(scanViewState({ status: "done", stalledReason: null, deadLettered: true })).toBe("ready");
  });

  it("keeps today's states when the flag is absent", () => {
    expect(scanViewState({ status: "collecting", stalledReason: "timeout" })).toBe("stalled");
    expect(scanViewState({ status: "collecting", stalledReason: null })).toBe("running");
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `corepack pnpm vitest run tests/funnel-scan.test.ts`
Expected: FAIL (`dead_lettered` not returned; type error on `deadLettered` is reported by vitest as a failed expectation, not a crash).

- [ ] **Step 3: Implement the view state**

In `lib/funnel/scan-progress.ts`:

1. Add to `ScanStatusResponse`:

```ts
  /** P3.5b: in flight but past its three attempts; the lease will not claim it again. */
  deadLettered?: boolean;
```

2. Replace `ScanViewState` and `scanViewState` with:

```ts
export type ScanViewState = "running" | "ready" | "failed" | "stalled" | "dead_lettered";

export function scanViewState(input: { status: string; stalledReason: StalledReason | null; deadLettered?: boolean }): ScanViewState {
  if (input.status === "failed") return "failed";
  if (isTerminalStatus(input.status)) return "ready";
  if (input.deadLettered) return "dead_lettered";
  if (input.stalledReason) return "stalled";
  return "running";
}
```

Run: `corepack pnpm vitest run tests/funnel-scan.test.ts`
Expected: PASS.

- [ ] **Step 4: Status route flag — failing test**

If `app/api/scan/status/route.test.ts` exists, add a test there following its mocking pattern; otherwise create it:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readStatus: vi.fn() }));
vi.mock("@/lib/repositories/jobs", () => ({ jobsRepository: { readStatus: (...a: unknown[]) => mocks.readStatus(...a) } }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceCompositeIdentifierRateLimit: async () => ({ allowed: true }),
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));

import { GET } from "./route";

const JOB = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const row = (overrides: Record<string, unknown> = {}) => ({
  id: JOB, status: "collecting", processing_stage: "collecting_aeo", share_slug: "slug", score_coverage: null,
  failure_correlation_id: null, module_results: null, module_scores: null, dead_lettered: false, ...overrides,
});

beforeEach(() => mocks.readStatus.mockReset());

describe("GET /api/scan/status deadLettered", () => {
  it("reports a dead-lettered job", async () => {
    mocks.readStatus.mockResolvedValue(row({ dead_lettered: true }));
    const body = await (await GET(new Request(`https://app.test/api/scan/status?jobId=${JOB}`))).json();
    expect(body.deadLettered).toBe(true);
    expect(body.status).toBe("collecting");
  });

  it("reports false otherwise", async () => {
    mocks.readStatus.mockResolvedValue(row());
    const body = await (await GET(new Request(`https://app.test/api/scan/status?jobId=${JOB}`))).json();
    expect(body.deadLettered).toBe(false);
  });
});
```

Run: `corepack pnpm vitest run app/api/scan/status/route.test.ts`
Expected: FAIL (`deadLettered` undefined).

- [ ] **Step 5: Implement the flag**

In `lib/repositories/jobs.ts`:

1. Add `import { DEAD_LETTERED_JOB_CONDITION_SQL } from "../scan/claimable";`.
2. Change the `readStatus` query to:

```ts
        const { rows } = await getPool().query<ScanStatus>(`SELECT id,status,processing_stage,share_slug,score_coverage::float8 AS score_coverage,failure_correlation_id,module_results,module_scores,${DEAD_LETTERED_JOB_CONDITION_SQL} AS dead_lettered FROM audit_jobs WHERE id=$1`, [id]);
```

3. Add to `interface ScanStatus`: `dead_lettered: boolean;`.

In `app/api/scan/status/route.ts`, add `deadLettered: job.dead_lettered === true` to the final `NextResponse.json({...})` object, after `failureCorrelationId`.

Run: `corepack pnpm vitest run app/api/scan/status/route.test.ts`
Expected: PASS.

- [ ] **Step 6: The stuck card — failing test**

`components/scan-stuck-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ScanStuckCard } from "@/components/scan-stuck-card";

function render(locale: "en" | "zh-HK" | "zh-TW") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<ScanStuckCard locale={locale} reference="SCAN-3FA85F" />);
  return root;
}

describe("ScanStuckCard", () => {
  it("explains the stuck scan, gives the reference, and links to a new scan instead of Resume", () => {
    const root = render("en");
    expect(root.textContent).toContain("This scan stopped responding");
    expect(root.textContent).toContain("within 24 hours");
    expect(root.textContent).toContain("Reference SCAN-3FA85F");
    expect(root.querySelector("a")?.getAttribute("href")).toBe("/en/scan");
    expect(root.textContent).not.toMatch(/resume/i);
  });

  it("is localized", () => {
    expect(render("zh-HK").textContent).toContain("這次掃描停止回應");
    expect(render("zh-TW").querySelector("a")?.getAttribute("href")).toBe("/zh-TW/scan");
  });
});
```

Run: `corepack pnpm vitest run components/scan-stuck-card.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement the card**

`components/scan-stuck-card.tsx`:

```tsx
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { FactType } from "@/components/product-ui"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"

/**
 * P3.5b: a scan past its three attempts. Resume cannot help (the lease will
 * never claim it again), so this replaces the stalled card's Resume button
 * with the honest outcome and a new scan. Reuses .partial-result-card.
 */
export function ScanStuckCard({ locale, reference }: { locale: PrototypeLocale; reference: string }) {
  return (
    <div className="partial-result-card" role="status">
      <div>
        <FactType type="Unknown" />
        <h2>{t(locale, "problems.scanStuck.title")}</h2>
        <p>{t(locale, "problems.scanStuck.body")}</p>
        <small>{t(locale, "problems.reference", { reference })}</small>
      </div>
      <Button asChild>
        <Link href={`/${locale}/scan`}>
          {t(locale, "problems.scanStuck.button")} <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}
```

Check `FactType`'s prop type accepts `"Unknown"` (it is used that way in `components/scanning-page.tsx`).

Run: `corepack pnpm vitest run components/scan-stuck-card.test.tsx`
Expected: PASS.

- [ ] **Step 8: Wire it into the scanning page**

In `components/scanning-page.tsx`:

1. Add `import { ScanStuckCard } from "@/components/scan-stuck-card"`.
2. In `tick()`, directly after `if (isTerminalStatus(data.status)) clearPollRecord(jobId, pollStorage())`, add:

```tsx
          // P3.5b: the lease will not claim this job again, so polling can
          // only ever repeat the same answer. Stop, and let the stuck card
          // say what happens next.
          if (data.deadLettered) {
            setChecking(false)
            setResuming(false)
            setStalled(null)
            return
          }
```

3. Change `const view = scanViewState({ status: status.status, stalledReason: stalled })` to:

```tsx
  const view = scanViewState({ status: status.status, stalledReason: stalled, deadLettered: status.deadLettered === true })
```

4. Change `const phases = view === "stalled" ? stallCollectorPhases(base) : base` to:

```tsx
  const phases = view === "stalled" || view === "dead_lettered" ? stallCollectorPhases(base) : base
```

5. Directly before `{atCapacity && (`, add:

```tsx
        {view === "dead_lettered" && <ScanStuckCard locale={locale} reference={scanReference(jobId)} />}
```

The stalled card is already gated on `view === "stalled"`, so it (and its Resume button) never renders in the dead-letter state.

- [ ] **Step 9: Run the related tests and the typecheck**

Run: `corepack pnpm vitest run tests/funnel-scan.test.ts components/scan-stuck-card.test.tsx app/api/scan/status/route.test.ts`
Expected: PASS.

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add lib/repositories/jobs.ts app/api/scan/status/route.ts app/api/scan/status/route.test.ts lib/funnel/scan-progress.ts components/scan-stuck-card.tsx components/scan-stuck-card.test.tsx components/scanning-page.tsx tests/funnel-scan.test.ts
git commit -m "feat(P3.5b): the scanning page stops offering Resume for a dead-lettered scan"
```

---

### Task 9: The operator failures page

**Files:**
- Create: `components/ops/ops-nav.tsx`
- Create: `components/ops/release-button.tsx`
- Create: `app/[locale]/ops/failures/page.tsx`
- Create: `app/[locale]/ops/failures/page.test.tsx`
- Modify: `app/[locale]/ops/access-requests/page.tsx`

- [ ] **Step 1: Write the nav and the release button**

`components/ops/ops-nav.tsx`:

```tsx
import Link from "next/link"

/** Unlisted operator tooling (English by the recorded /ops exception). */
export function OpsNav({ locale, current }: { locale: string; current: "failures" | "access-requests" }) {
  const links = [
    { key: "failures", href: `/${locale}/ops/failures`, label: "Failures" },
    { key: "access-requests", href: `/${locale}/ops/access-requests`, label: "Access requests" },
  ] as const
  return (
    <nav aria-label="Operator tools" className="flex gap-4">
      {links.map((link) => (
        <Link key={link.key} href={link.href} aria-current={link.key === current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
```

`components/ops/release-button.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

const MESSAGES: Record<string, string> = {
  not_dead_lettered: "This scan is no longer stuck: it was closed, claimed or released by someone else.",
  release_failed: "The release could not be recorded. Try again.",
}

/** P3.5b: grants a dead-lettered scan one more attempt. The route is the authority; this only posts and reports. */
export function ReleaseButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function release() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/ops/failures/scans/${encodeURIComponent(jobId)}/release`, { method: "POST", headers: { accept: "application/json" } })
      const body = (await response.json().catch(() => null)) as { error?: string; dispatched?: boolean } | null
      if (response.ok) {
        setMessage(body?.dispatched ? "Released and dispatched." : "Released. The next cron tick will pick it up.")
        router.refresh()
      } else {
        setMessage(MESSAGES[body?.error ?? ""] ?? "The release failed.")
      }
    } catch {
      setMessage("The server could not be reached.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={release} disabled={busy}>
        {busy ? "Releasing…" : "Release for one more attempt"}
      </Button>
      {message && <small role="status">{message}</small>}
    </span>
  )
}
```

- [ ] **Step 2: Write the failing page test**

`app/[locale]/ops/failures/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ requireOperator: vi.fn(), list: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ requireOperator: () => mocks.requireOperator() }));
vi.mock("@/lib/repositories/failures", () => ({ failuresRepository: () => ({ list: mocks.list, health: mocks.health }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import OpsFailuresPage from "./page";
import type { FailureItem, OperatorHealth } from "@/lib/ops/failure-types";

const HEALTH: OperatorHealth = {
  recent: { scan_failed: { day: 2, week: 5 }, draft_failed: { day: 0, week: 1 } },
  open: { scan_dead_lettered: 1, google_connection: 0, workspace_processing: 0 },
  categories: [{ category: "COLLECTION_FAILED", day: 2, week: 4 }],
};
const DEAD: FailureItem = {
  kind: "scan_dead_lettered", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", reference: "SCAN-3FA85F", correlationId: null,
  occurredAt: "2026-09-25T00:00:00.000Z", workspace: { id: "ws", slug: "kam-man-house", name: "Kam Man House" },
  locationId: null, actionId: null, businessName: "Kam Man House", reason: "ATTEMPTS_EXHAUSTED", attempts: 3, operatorAction: "release",
};

async function render(searchParams: Record<string, string> = {}) {
  const element = await OpsFailuresPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(searchParams) });
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(element);
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOperator.mockResolvedValue({ userId: "op", email: "ada@fimmick.com" });
  mocks.list.mockResolvedValue([DEAD]);
  mocks.health.mockResolvedValue(HEALTH);
});

describe("/ops/failures", () => {
  it("is operator-only", async () => {
    mocks.requireOperator.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("shows health, the row, its reason meaning and the release control", async () => {
    const root = await render();
    expect(root.textContent).toContain("COLLECTION_FAILED");
    expect(root.textContent).toContain("SCAN-3FA85F");
    expect(root.textContent).toContain("kam-man-house");
    expect(root.textContent).toContain("The scan stopped responding after three attempts.");
    expect(root.textContent).toContain("Release for one more attempt");
    expect(root.querySelector('a[href*="/owner/"]')).toBeNull();
  });

  it("passes the kind filter and a parsed reference search to the reader", async () => {
    await render({ kind: "scan_failed", q: "SCAN-3FA85F" });
    expect(mocks.list).toHaveBeenCalledWith({ kinds: ["scan_failed"], hexPrefix: "3fa85f", uuid: null, workspaceId: null, limit: 200 });
  });

  it("explains an invalid search instead of querying", async () => {
    const root = await render({ q: "hello" });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Search by a SCAN-, RUN- or CONN- reference, or a full id.");
  });

  it("shows an explicit error, never an empty queue, when the reader fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.list.mockRejectedValue(new Error("down"));
    const root = await render();
    expect(root.textContent).toContain("The failure queue could not be loaded.");
    expect(root.textContent).not.toContain("No open failures");
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `corepack pnpm vitest run "app/[locale]/ops/failures/page.test.tsx"`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the page**

`app/[locale]/ops/failures/page.tsx`:

```tsx
import type { Metadata } from "next";

import { OpsNav } from "@/components/ops/ops-nav";
import { ReleaseButton } from "@/components/ops/release-button";
import { requireOperator } from "@/lib/auth/operator";
import { FAILURE_KINDS, isFailureKind, type FailureItem, type FailureKind, type OperatorHealth } from "@/lib/ops/failure-types";
import { problemReasonLabel } from "@/lib/ops/problem-copy";
import { parseFailureSearch } from "@/lib/ops/references";
import { failuresRepository } from "@/lib/repositories/failures";

export const dynamic = "force-dynamic";
/** Unlisted internal tooling: never index it, and never link to it from a merchant surface. */
export const metadata: Metadata = { title: "Failures", robots: { index: false, follow: false } };

const KIND_LABELS: Record<FailureKind, string> = {
  scan_failed: "Failed scan",
  scan_dead_lettered: "Stuck scan (dead-lettered)",
  draft_failed: "Failed draft",
  google_connection: "Google connection",
  workspace_processing: "Workspace post-processing",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The operator failure queue (P3.5b, spec §3). English by the same recorded
 * exception as /ops/access-requests. Cross-tenant, but it shows no personal
 * data (the reader selects allowlisted columns only) and links to no owner
 * page: operators hold no membership. Queue views are not audited, following
 * the access-request precedent; releases are.
 */
export default async function OpsFailuresPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireOperator();
  const { locale } = await params;
  const query = searchParams ? await searchParams : {};
  const kindParam = first(query.kind);
  const kind = isFailureKind(kindParam) ? kindParam : null;
  const q = first(query.q) ?? "";
  const search = parseFailureSearch(q);

  let data: { items: FailureItem[]; health: OperatorHealth } | null = null;
  let failed = false;
  if (search !== "invalid") {
    const searchKinds = search?.kinds ?? null;
    const kinds = kind ? (searchKinds && !searchKinds.includes(kind) ? [] : [kind]) : searchKinds;
    try {
      const repo = failuresRepository();
      const [items, health] = await Promise.all([
        repo.list({ kinds, hexPrefix: search?.hexPrefix ?? null, uuid: search?.uuid ?? null, workspaceId: null, limit: 200 }),
        repo.health(),
      ]);
      data = { items, health };
    } catch {
      console.error("[ops] failures_unavailable", { category: "ops_failures_unavailable" });
      failed = true;
    }
  }

  return (
    <div className="settings-page">
      <OpsNav locale={locale} current="failures" />
      <h1>Failures</h1>
      <p>Open problems across every workspace, newest first. Owners retry their own scans and drafts; the only operator control is releasing a stuck scan.</p>

      <form method="get" className="flex flex-wrap gap-3" role="search">
        <select name="kind" defaultValue={kind ?? ""} aria-label="Kind">
          <option value="">All kinds</option>
          {FAILURE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="SCAN-…, RUN-…, CONN-… or a full id" aria-label="Reference or id" />
        <button type="submit">Filter</button>
      </form>

      {search === "invalid" && <p className="limitation-note" role="status">Search by a SCAN-, RUN- or CONN- reference, or a full id.</p>}
      {failed && <p className="limitation-note" role="alert">The failure queue could not be loaded. Nothing below is a sign that there are no failures.</p>}

      {data && (
        <>
          <section aria-label="Health">
            <h2>Health</h2>
            <ul>
              <li>Failed scans: {data.health.recent.scan_failed.day} in 24 h · {data.health.recent.scan_failed.week} in 7 days</li>
              <li>Failed drafts: {data.health.recent.draft_failed.day} in 24 h · {data.health.recent.draft_failed.week} in 7 days</li>
              <li>Open now: {data.health.open.scan_dead_lettered} stuck scans · {data.health.open.google_connection} Google connections · {data.health.open.workspace_processing} post-processing</li>
            </ul>
            {data.health.categories.length > 0 && (
              <table>
                <caption>Failed scans by category</caption>
                <thead><tr><th>Category</th><th>24 h</th><th>7 days</th></tr></thead>
                <tbody>{data.health.categories.map((row) => <tr key={row.category}><td>{row.category}</td><td>{row.day}</td><td>{row.week}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          <section aria-label="Queue">
            <h2>Queue</h2>
            {data.items.length === 0 ? (
              <p>No open failures match.</p>
            ) : (
              <div className="compact-action-list">
                {data.items.map((item) => (
                  <div key={`${item.kind}:${item.id}`}>
                    <div>
                      <strong>{KIND_LABELS[item.kind]} · {item.reference}</strong>
                      <small>
                        {item.businessName}
                        {item.workspace?.slug ? ` · workspace ${item.workspace.slug}` : " · no workspace"}
                        {` · ${item.reason} — ${problemReasonLabel("en", item.reason)}`}
                        {item.attempts !== null ? ` · ${item.attempts} attempts` : ""}
                        {` · ${item.occurredAt}`}
                        {item.correlationId ? ` · correlation ${item.correlationId}` : ""}
                      </small>
                    </div>
                    {item.operatorAction === "release" && <ReleaseButton jobId={item.id} />}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
```

Note the "No open failures" copy (`No open failures match.`) only renders when the read succeeded.

- [ ] **Step 5: Add the nav to the access-request page**

In `app/[locale]/ops/access-requests/page.tsx`, add `import { OpsNav } from "@/components/ops/ops-nav";` and render `<OpsNav locale={locale} current="access-requests" />` as the first child of `<div className="settings-page">`.

- [ ] **Step 6: Run and confirm it passes**

Run: `corepack pnpm vitest run "app/[locale]/ops/failures/page.test.tsx"`
Expected: PASS (5 tests).

Run: `corepack pnpm typecheck; corepack pnpm lint`
Expected: typecheck exit 0; lint 0 errors (warning count unchanged from the branch base, 30).

- [ ] **Step 7: Commit**

```bash
git add components/ops/ops-nav.tsx components/ops/release-button.tsx "app/[locale]/ops/failures/page.tsx" "app/[locale]/ops/failures/page.test.tsx" "app/[locale]/ops/access-requests/page.tsx"
git commit -m "feat(P3.5b): operator failures page with health and release"
```

---

### Task 10: Owner notices on Home and Activity

**Files:**
- Create: `lib/workspace/problems.ts`, `lib/workspace/problems.test.ts`
- Create: `components/workspace/problem-item.tsx`
- Create: `components/workspace/needs-attention-card.tsx`
- Create: `components/workspace/problems-list.tsx`
- Create: `components/workspace/problems.test.tsx`
- Modify: `app/[locale]/owner/[workspaceSlug]/page.tsx`
- Modify: `app/[locale]/owner/[workspaceSlug]/activity/page.tsx`
- Modify: `components/workspace/activity-view.tsx`

- [ ] **Step 1: Write the failing loader test**

`lib/workspace/problems.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceProblems, type ProblemsInput } from "./problems";
import type { FailureItem } from "@/lib/ops/failure-types";

const item = (kind: FailureItem["kind"], locationId: string | null = "loc-a"): FailureItem => ({
  kind, id: `${kind}-1`, reference: "SCAN-ABCDEF", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
  workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House" }, locationId, actionId: null,
  businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
});

const input: ProblemsInput = { workspaceId: "ws-1", market: "hk", membership: { role: "owner", locationScope: null }, tier: "lite" };

afterEach(() => vi.restoreAllMocks());

describe("loadWorkspaceProblems", () => {
  it("reads only owner kinds for this workspace and resolves actions", async () => {
    const list = vi.fn().mockResolvedValue([item("scan_failed")]);
    const problems = await loadWorkspaceProblems(input, { list, contactHref: () => "https://wa.me/85200000000" });
    expect(list).toHaveBeenCalledWith({ kinds: ["scan_failed", "scan_dead_lettered", "draft_failed", "google_connection"], hexPrefix: null, uuid: null, workspaceId: "ws-1", limit: 50 });
    expect(problems).toEqual([expect.objectContaining({ kind: "scan_failed", ownerAction: "contact_support", contactHref: "https://wa.me/85200000000" })]);
  });

  it("returns null and logs, never an empty list, when the read fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const problems = await loadWorkspaceProblems(input, { list: vi.fn().mockRejectedValue(new Error("down")), contactHref: () => null });
    expect(problems).toBeNull();
    expect(errors).toHaveBeenCalledWith("[ops] problems_unavailable", { category: "ops_problems_unavailable" });
  });
});
```

Run: `corepack pnpm vitest run lib/workspace/problems.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the loader**

`lib/workspace/problems.ts`:

```ts
import "server-only";
import { getMarketCtas, type Market } from "@sme-scanner/region";
import { OWNER_FAILURE_KINDS, type OwnerProblem } from "@/lib/ops/failure-types";
import { buildOwnerProblems } from "@/lib/ops/owner-actions";
import { failuresRepository, type FailureQuery } from "@/lib/repositories/failures";
import type { FailureItem } from "@/lib/ops/failure-types";
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace";

export interface ProblemsInput {
  workspaceId: string;
  market: Market;
  membership: { role: WorkspaceRole; locationScope: string[] | null };
  tier: "lite" | "paid";
}

export interface ProblemsDeps {
  list: (query: FailureQuery) => Promise<FailureItem[]>;
  contactHref: (market: Market) => string | null;
}

const defaults: ProblemsDeps = {
  list: (query) => failuresRepository().list(query),
  contactHref: (market) => getMarketCtas(market)[0]?.href ?? null,
};

/**
 * Owner-side problems (P3.5b spec §1, §4). Null means "could not be read":
 * the page then renders without the card or section rather than claiming
 * there are no problems.
 */
export async function loadWorkspaceProblems(input: ProblemsInput, deps: ProblemsDeps = defaults): Promise<OwnerProblem[] | null> {
  try {
    const items = await deps.list({ kinds: OWNER_FAILURE_KINDS, hexPrefix: null, uuid: null, workspaceId: input.workspaceId, limit: 50 });
    return buildOwnerProblems(items, { ...input.membership, tier: input.tier }, deps.contactHref(input.market));
  } catch {
    console.error("[ops] problems_unavailable", { category: "ops_problems_unavailable" });
    return null;
  }
}
```

Check that `Market` is exported by `@sme-scanner/region` (it is imported that way in `lib/funnel/report-props.ts:4`).

Run: `corepack pnpm vitest run lib/workspace/problems.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing component test**

`components/workspace/problems.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { ProblemsList } from "@/components/workspace/problems-list";
import type { OwnerAction, OwnerProblem } from "@/lib/ops/failure-types";

function problem(ownerAction: OwnerAction, overrides: Partial<OwnerProblem> = {}): OwnerProblem {
  return {
    kind: "scan_failed", id: "job-1", reference: "SCAN-3FA85F", correlationId: null, occurredAt: "2026-09-25T00:00:00.000Z",
    workspace: { id: "ws-1", slug: "kam-man-house", name: "Kam Man House" }, locationId: "loc-a", actionId: null,
    businessName: "Kam Man House", reason: "COLLECTION_FAILED", attempts: null, operatorAction: "none",
    ownerAction, contactHref: null, ...overrides,
  };
}

const common = { locale: "en" as const, workspaceSlug: "kam-man-house", workspaceId: "ws-1", tier: "paid" as const, role: "owner" as const, consentPolicyVersion: "2026-07-28" };

function html(node: ReactElement) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(node);
  return root;
}

describe("NeedsAttentionCard", () => {
  it("renders nothing without problems", () => {
    expect(renderToStaticMarkup(<NeedsAttentionCard {...common} problems={[]} />)).toBe("");
  });

  it("shows at most two problems and links to Activity", () => {
    const root = html(<NeedsAttentionCard {...common} problems={[problem("none"), problem("none", { id: "b" }), problem("none", { id: "c" })]} />);
    expect(root.querySelectorAll("[data-problem]")).toHaveLength(2);
    expect(root.querySelector('a[href="/en/owner/kam-man-house/activity"]')).not.toBeNull();
  });
});

describe("ProblemItem buttons (via ProblemsList)", () => {
  it("renders the rescan control for rescan", () => {
    expect(html(<ProblemsList {...common} problems={[problem("rescan")]} />).textContent).toContain("Rescan");
  });

  it("links to the action for open_action", () => {
    const root = html(<ProblemsList {...common} problems={[problem("open_action", { kind: "draft_failed", actionId: "act-1", reference: "RUN-3FA85F", reason: "invalid_output" })]} />);
    expect(root.querySelector('a[href="/en/owner/kam-man-house/actions/act-1"]')?.textContent).toContain("Open action");
    expect(root.textContent).toContain("The draft could not be read.");
  });

  it("links to Google re-authorisation for reauthorise", () => {
    const root = html(<ProblemsList {...common} problems={[problem("reauthorise", { kind: "google_connection", locationId: null, reason: "error" })]} />);
    expect(root.querySelector('a[href="/api/oauth/google/start?workspace=kam-man-house&locale=en"]')).not.toBeNull();
  });

  it("links to the contact channel for contact_support, and shows text only without one", () => {
    expect(html(<ProblemsList {...common} problems={[problem("contact_support", { contactHref: "https://wa.me/85200000000" })]} />).querySelector('a[href="https://wa.me/85200000000"]')).not.toBeNull();
    const bare = html(<ProblemsList {...common} problems={[problem("contact_support")]} />);
    expect(bare.querySelector("a")).toBeNull();
    expect(bare.textContent).toContain("Contact Fimmick and quote the reference below.");
  });

  it("shows no button for none, and always shows the reference", () => {
    const root = html(<ProblemsList {...common} role="viewer" problems={[problem("none")]} />);
    expect(root.querySelector("a, button")).toBeNull();
    expect(root.textContent).toContain("Reference SCAN-3FA85F");
  });

  it("never shows a raw unknown reason code", () => {
    expect(html(<ProblemsList {...common} problems={[problem("none", { reason: "NEW_PROVIDER_CODE" })]} />).textContent).not.toContain("NEW_PROVIDER_CODE");
  });

  it("says there are no open problems only when it was given an empty list", () => {
    expect(html(<ProblemsList {...common} problems={[]} />).textContent).toContain("No open problems.");
  });
});
```

Run: `corepack pnpm vitest run components/workspace/problems.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the components**

`components/workspace/problem-item.tsx`:

```tsx
import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import { RescanButton } from "@/components/workspace/rescan-button"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"
import type { OwnerProblem } from "@/lib/ops/failure-types"
import { nextStepText, problemReasonLabel, problemTitle } from "@/lib/ops/problem-copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"

export interface ProblemSurfaceProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  tier: "lite" | "paid"
  role: WorkspaceRole
  consentPolicyVersion: string
}

/**
 * One owner-facing problem (P3.5b spec §3): what happened, the reason in
 * plain words, the next step, the reference, and the one control the
 * server resolved for this member. The routes behind each control enforce
 * the same rules; this is display, not the boundary.
 */
export function ProblemItem({ problem, ...surface }: ProblemSurfaceProps & { problem: OwnerProblem }) {
  const { locale } = surface
  return (
    <article className="brief-action-meta" data-problem={problem.kind}>
      <div>
        <h3><TriangleAlert aria-hidden="true" /> {problemTitle(locale, problem.kind)}</h3>
        <p>{problemReasonLabel(locale, problem.reason)} {nextStepText(locale, problem)}</p>
        <small>{t(locale, "problems.reference", { reference: problem.reference })}</small>
      </div>
      <ProblemControl problem={problem} {...surface} />
    </article>
  )
}

function ProblemControl({ problem, locale, workspaceSlug, workspaceId, tier, role, consentPolicyVersion }: ProblemSurfaceProps & { problem: OwnerProblem }) {
  switch (problem.ownerAction) {
    case "rescan":
      return <RescanButton locale={locale} workspaceId={workspaceId} workspaceSlug={workspaceSlug} locationId={problem.locationId} tier={tier} role={role} consentPolicyVersion={consentPolicyVersion} />
    case "open_action":
      return problem.actionId ? (
        <Button asChild variant="outline"><Link href={`/${locale}/owner/${workspaceSlug}/actions/${problem.actionId}`}>{t(locale, "problems.button.open_action")}</Link></Button>
      ) : null
    case "reauthorise":
      return <Button asChild><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{t(locale, "problems.button.reauthorise")}</a></Button>
    case "contact_support":
      return problem.contactHref ? <Button asChild variant="outline"><a href={problem.contactHref}>{t(locale, "problems.button.contact_support")}</a></Button> : null
    case "ask_owner":
    case "none":
      return null
  }
}
```

`components/workspace/needs-attention-card.tsx`:

```tsx
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import type { OwnerProblem } from "@/lib/ops/failure-types"
import { ProblemItem, type ProblemSurfaceProps } from "@/components/workspace/problem-item"

/** Home: up to two open problems for the current location. Nothing at all when there are none. */
export function NeedsAttentionCard({ problems, ...surface }: ProblemSurfaceProps & { problems: OwnerProblem[] }) {
  if (problems.length === 0) return null
  const { locale, workspaceSlug } = surface
  return (
    <SectionCard>
      <div className="section-card-heading">
        <div><h2>{t(locale, "problems.homeTitle")}</h2></div>
        <Button asChild variant="ghost"><Link href={`/${locale}/owner/${workspaceSlug}/activity`}>{t(locale, "problems.homeMore")} <ArrowRight /></Link></Button>
      </div>
      {problems.slice(0, 2).map((problem) => <ProblemItem key={`${problem.kind}:${problem.id}`} problem={problem} {...surface} />)}
    </SectionCard>
  )
}
```

`components/workspace/problems-list.tsx`:

```tsx
import { SectionCard } from "@/components/product-ui"
import { t } from "@/lib/i18n"
import type { OwnerProblem } from "@/lib/ops/failure-types"
import { ProblemItem, type ProblemSurfaceProps } from "@/components/workspace/problem-item"

/** Activity: every open problem. "No open problems" only when the list was read and is empty. */
export function ProblemsList({ problems, ...surface }: ProblemSurfaceProps & { problems: OwnerProblem[] }) {
  const { locale } = surface
  return (
    <SectionCard>
      <div className="section-card-heading"><div><h2>{t(locale, "problems.activityTitle")}</h2></div></div>
      {problems.length === 0 ? <p>{t(locale, "problems.activityEmpty")}</p> : problems.map((problem) => <ProblemItem key={`${problem.kind}:${problem.id}`} problem={problem} {...surface} />)}
    </SectionCard>
  )
}
```

Check `SectionCard` accepts `children` (it is used with children in `components/scanning-page.tsx`).

- [ ] **Step 5: Run the component test**

Run: `corepack pnpm vitest run components/workspace/problems.test.tsx`
Expected: PASS (9 tests). If the RescanButton renders a disabled button on lite or requires more props, keep the fixture tier `"paid"` as written.

- [ ] **Step 6: Wire the Home page**

In `app/[locale]/owner/[workspaceSlug]/page.tsx`:

1. Add imports:

```tsx
import { NeedsAttentionCard } from "@/components/workspace/needs-attention-card";
import { filterToLocation } from "@/lib/ops/owner-actions";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
```

2. After `const brief = await getHomeBrief(page.ctx, page.locationSlug);` add:

```tsx
  const problems = await loadWorkspaceProblems({
    workspaceId: page.ctx.workspace.id,
    market: page.ctx.workspace.market,
    membership: page.membership,
    tier: page.ctx.workspace.tier,
  });
  const locationId = page.locationSlug === "all" ? "all" : page.ctx.locations.find((l) => l.slug === page.locationSlug)?.id ?? "all";
```

3. Directly before `<HomeBriefView`, render:

```tsx
      {problems && (
        <NeedsAttentionCard
          locale={page.locale}
          workspaceSlug={page.workspaceSlug}
          workspaceId={page.ctx.workspace.id}
          tier={page.ctx.workspace.tier}
          role={page.membership.role}
          consentPolicyVersion={currentScanConsentPolicyVersion()}
          problems={filterToLocation(problems, locationId)}
        />
      )}
```

Confirm `page.ctx.locations` entries have `id` and `slug` (`LocationSummary` in `lib/workspace/queries.ts`) and that `page.ctx.workspace.market` is `"hk" | "tw"`.

- [ ] **Step 7: Wire the Activity page**

In `components/workspace/activity-view.tsx`, add an optional prop and render it after `<PageIntro … />`:

Add `import type { ReactNode } from "react"` at the top, then:

```tsx
export function ActivityView({ locale, timezone, events, problems }: { locale: PrototypeLocale; timezone: string; events: AuditEventRow[]; problems?: ReactNode }) {
```

and render `{problems}` on the line between the existing `<PageIntro … />` and `<SectionCard>`.

In `app/[locale]/owner/[workspaceSlug]/activity/page.tsx`:

```tsx
import type { Metadata } from "next";

import { ActivityView } from "@/components/workspace/activity-view";
import { ProblemsList } from "@/components/workspace/problems-list";
import { currentScanConsentPolicyVersion } from "@/lib/scan/consent";
import { loadOwnerPage, ownerPageMetadata, type OwnerPageProps } from "@/lib/workspace/page-context";
import { loadWorkspaceProblems } from "@/lib/workspace/problems";
import { getActivity } from "@/lib/workspace/queries-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: OwnerPageProps): Promise<Metadata> {
  return ownerPageMetadata(props, { en: "Activity", zh: "活動紀錄" });
}

export default async function ActivityRoute(props: OwnerPageProps) {
  const page = await loadOwnerPage(props);
  const [events, problems] = await Promise.all([
    getActivity(page.ctx),
    loadWorkspaceProblems({ workspaceId: page.ctx.workspace.id, market: page.ctx.workspace.market, membership: page.membership, tier: page.ctx.workspace.tier }),
  ]);
  return (
    <ActivityView
      locale={page.locale}
      timezone={page.ctx.workspace.timezone}
      events={events}
      problems={problems && (
        <ProblemsList
          locale={page.locale}
          workspaceSlug={page.workspaceSlug}
          workspaceId={page.ctx.workspace.id}
          tier={page.ctx.workspace.tier}
          role={page.membership.role}
          consentPolicyVersion={currentScanConsentPolicyVersion()}
          problems={problems}
        />
      )}
    />
  );
}
```

- [ ] **Step 8: Run the owner-page tests, typecheck and lint**

Run: `corepack pnpm vitest run components/workspace lib/workspace tests/owner-pages.test.ts tests/phase6-ui.test.tsx`
Expected: PASS. If `tests/owner-pages.test.ts` mocks the page modules' imports and now fails on the new `lib/workspace/problems` import, add `vi.mock("@/lib/workspace/problems", () => ({ loadWorkspaceProblems: async () => [] }))` following that file's pattern.

Run: `corepack pnpm typecheck; corepack pnpm lint`
Expected: typecheck exit 0; lint 0 errors.

- [ ] **Step 9: Commit**

```bash
git add lib/workspace/problems.ts lib/workspace/problems.test.ts components/workspace/problem-item.tsx components/workspace/needs-attention-card.tsx components/workspace/problems-list.tsx components/workspace/problems.test.tsx "app/[locale]/owner/[workspaceSlug]/page.tsx" "app/[locale]/owner/[workspaceSlug]/activity/page.tsx" components/workspace/activity-view.tsx
git commit -m "feat(P3.5b): owner failure notices on Home and Activity"
```

(Add `tests/owner-pages.test.ts` if you changed it.)

---

### Task 11: Scope integration test for owners

**Files:**
- Modify: `test/integration/neon-failures.integration.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe` block of `test/integration/neon-failures.integration.test.ts` (add `import { buildOwnerProblems } from "../../lib/ops/owner-actions";` at the top):

```ts
  it("never shows a scoped manager another location's problems, through the real reader", async () => {
    const ws = await workspace();
    const mine = await location(ws, "tin-hau");
    const theirs = await location(ws, "yik-yam");
    await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED", ws, loc: mine });
    await job({ status: "failed", completed: "1 hour", category: "COLLECTION_FAILED", ws, loc: theirs });
    await connection(ws, "error");
    const items = await repo().list({ ...ALL, workspaceId: ws, kinds: OWNER_FAILURE_KINDS });
    const problems = buildOwnerProblems(items, { role: "manager", locationScope: [mine], tier: "paid" }, null);
    expect(problems.map((p) => [p.kind, p.locationId, p.ownerAction]).sort()).toEqual([
      ["google_connection", null, "ask_owner"],
      ["scan_failed", mine, "rescan"],
    ]);
  });
```

- [ ] **Step 2: Run it**

Run: `NEON_INTEGRATION=1 corepack pnpm vitest run --config vitest.integration.config.ts test/integration/neon-failures.integration.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 3: Mutation check**

In `lib/ops/owner-actions.ts` `visibleTo`, change `return inScope(ctx, item.locationId);` to `return true;`. The new test FAILS. Revert.

- [ ] **Step 4: Commit**

```bash
git add test/integration/neon-failures.integration.test.ts
git commit -m "test(P3.5b): scoped managers see only their locations' problems"
```

---

### Task 12: No raw error code in the action-detail toast

**Files:**
- Modify: `components/workspace/action-detail-client.tsx:259`
- Modify: `components/workspace/action-detail-client.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `components/workspace/action-detail-client.test.tsx`, find how it triggers a failed `runAction` and asserts `toast.error` (search for `toast.error`). Add a test in the same style where the client call resolves `{ ok: false, status: 500, error: "weird_internal_code" }` and assert:

```ts
    expect(toast.error).toHaveBeenCalledWith("The request failed. Try again, or contact Fimmick if it keeps happening.");
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain("weird_internal_code");
```

Run: `corepack pnpm vitest run components/workspace/action-detail-client.test.tsx`
Expected: FAIL (the toast contains `(weird_internal_code)`).

- [ ] **Step 2: Implement**

In `components/workspace/action-detail-client.tsx`, replace:

```tsx
    else toast.error(isChinese ? `操作失敗（${result.error}）。` : `The request failed (${result.error}).`)
```

with:

```tsx
    // P3.5b: never a raw error code in front of an owner.
    else toast.error(isChinese ? "操作失敗，請再試一次；如持續出現，請聯絡 Fimmick。" : "The request failed. Try again, or contact Fimmick if it keeps happening.")
```

Run: `corepack pnpm vitest run components/workspace/action-detail-client.test.tsx`
Expected: PASS. If an existing test asserted the old `(code)` text, update it to the new line.

- [ ] **Step 3: Commit**

```bash
git add components/workspace/action-detail-client.tsx components/workspace/action-detail-client.test.tsx
git commit -m "fix(P3.5b): the action-detail fallback toast shows no raw error code"
```

---

### Task 13: Record, full verification

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md`

- [ ] **Step 1: Run the full gates, sequentially**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
NEON_INTEGRATION=1 corepack pnpm test:integration
corepack pnpm db:verify
```

Expected: typecheck exit 0; lint 0 errors (30 warnings, same as base); unit and integration all pass; `db:verify` unchanged (36 tables / 422 columns / 162 constraints / 92 indexes, journal 9) because there is no migration. Record the exact file/test counts from each run.

`corepack pnpm build` is blocked locally by the standing Turbopack/radix-ui error; run `corepack pnpm exec next build --webpack` to confirm the app compiles, and note that CI is the real build gate.

- [ ] **Step 2: Append a P3.5b section to `PHASE-3-REPORT.md`**

Add a `## P3.5b — failure and retry view` section after the P3.5a section, with these subsections (content from the spec and the actual run):

- **What it answers** — the Master Plan P3.5 lines it covers (integration health, actionable failure notices, localized owner next steps, dead-letter/retry controls, correlation IDs, tenant/location-scoped support view) and the §P1 line 188 terminal-state requirement.
- **Decisions** — the table from the spec, plus the six planning deviations listed at the top of this plan.
- **What changed** — the file map, one line each.
- **Consent boundary** — why operators cannot retry failed scans or drafts.
- **Owner actions** — operator steps: none required to deploy (no migration, no new env var). Optional: set `OPERATOR_EMAILS` to use `/ops/failures`; auto-close needs `CRON_SECRET` like reclaim.
- **Known limits** — spec §6, verbatim in substance.

- [ ] **Step 3: Append a P3.5b section to `PHASE-3-TEST-RESULTS.md`**

Add the exact command outputs from Step 1 (counts, exit codes), a claims table in the P3.5a style mapping each spec behaviour to its named test and its mutation check (Tasks 1, 3, 4, 5, 11), and the "not run" list: build (local blocker), e2e/acceptance (CI), hosted verification (none).

- [ ] **Step 4: Check for stray changes, then commit**

Run: `git status --short` and restore any CRLF-only or unintended file with `git checkout -- <file>`.

```bash
git add docs/implementation/owner-platform-v1/PHASE-3-REPORT.md docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md
git commit -m "docs(P3.5b): record the failure and retry view and its evidence"
```

---

## Self-review (done while writing)

- **Spec coverage.** §1 model → Tasks 2, 3; readers → Tasks 3, 10; §2 auto-close → Tasks 5, 6; release → Tasks 5, 7; audit names → Task 5; §3 operator page → Task 9; owner surfaces → Tasks 4, 10; scanning page → Task 8; copy → Task 4; raw-code fix → Task 12; §4 error handling → Tasks 9, 10 (explicit error / null degrade), 5 (bounded, per-job), 5 (idempotent release), 3 (privacy); §5 tests → every task; mutation checks → Tasks 1, 3, 4, 5, 11; §6 limits → Task 13.
- **Type consistency.** `FailureQuery` (Task 3) is used identically in Tasks 9 and 10. `OwnerProblem`/`OwnerAction` (Task 2) are produced in Task 4 and rendered in Task 10. `ReleaseResult` (Task 5) is consumed in Task 7. `ScanStatus.dead_lettered` (Task 8) matches the status-route test fixture.
- **Known check-at-implementation points** (named in the steps, not placeholders): the execution-store claim method name (Task 5 Step 2), the existing status-route test file (Task 8 Step 4), `tests/owner-pages.test.ts` mocks (Task 10 Step 8), and the action-detail test's toast pattern (Task 12 Step 1).
