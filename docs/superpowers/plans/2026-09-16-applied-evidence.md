# Applied Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record an owner's assertion that an action was applied as first-class, append-only evidence, distinct from "exported" and from "observed change", and define the seam a future provider verifier writes into.

**Architecture:** One new append-only table `action_applications` whose `source` column (`owner_asserted` | `verified`) distinguishes the owner's claim from a future verifier's. One new column `attribution_basis` on `action_measurements` records which signal justified an `Attributed` fact type, with precedence `verified` > `owner_asserted` > `exported`. A POST/DELETE route pair writes and retracts assertions, completing the action in the same transaction. No verifier is built.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Postgres (Neon) via `pg`, Vitest 4, pnpm 9.12.0 via corepack.

**Design doc:** `docs/superpowers/specs/2026-09-16-applied-evidence-design.md`

**Baseline:** `main` at `84bae0b` (PR #15, merged).

---

## File Structure

**Create:**
- `neon/migrations/0006_action_applications.sql` — the table, the `attribution_basis` column, the grant.
- `lib/workspace/applications.ts` — pure domain: the `ApplicationRecord` type, `strongestBasis()`, `recordApplication()` (the verifier seam).
- `lib/workspace/applications.test.ts`
- `lib/repositories/applications.ts` — SQL adapter, scope-defensive in the style of `lib/repositories/measurements.ts`.
- `app/api/actions/[actionId]/applied/route.ts` — POST and DELETE.
- `app/api/actions/[actionId]/applied/route.test.ts`
- `test/integration/neon-action-applications.integration.test.ts`

**Modify:**
- `lib/workspace/measurements.ts` — basis precedence, timing rule, replace the `completed` proxy.
- `lib/repositories/measurements.ts` — `applications()` port; carry `attribution_basis` through `insert`.
- `lib/workspace/overview.ts` — `displayPhaseKey` gains `applied`.
- `lib/copy-workspace.ts` — `DisplayPhaseKey`, `DISPLAY_PHASE_KEYS`, `phases` copy (en + zh-HK; zh-TW inherits).
- `lib/workspace/client.ts` — `markApplied` / `retractApplied`.
- `components/workspace/action-detail-client.tsx` — replace `markChecklistDone` with the assertion control.
- `lib/workspace/audit-labels.ts` — `action.applied`, `action.application_retracted`.

Why this split: the pure decision logic (`applications.ts`) is separated from SQL (`repositories/applications.ts`) and from HTTP (the route), matching how `measurements.ts` / `repositories/measurements.ts` already divide. The precedence rule is the part most likely to be got wrong, so it must be testable with no database at all.

---

### Task 1: Migration

**Files:**
- Create: `neon/migrations/0006_action_applications.sql`

- [ ] **Step 1: Write the migration**

Note: migrations `0001`–`0005` are immutable and must not be edited. The `GRANT` must be in this file — `0003_workflows.sql` holds the grants for existing tables and cannot be extended.

```sql
-- P3.2 applied evidence (docs/superpowers/specs/2026-09-16-applied-evidence-design.md).
-- The Master Plan requires four events kept distinct: approved/exported, owner
-- says applied, provider verifies applied, and later observed metric change.
-- Only the first and last existed; `action_state='completed'` was standing in
-- for the second inside lib/workspace/measurements.ts. This table records the
-- second and third. They share one table because they answer the same question
-- -- "was this applied?" -- with different authority, recorded in `source`.
--
-- Append-only (guardrail 10): a correction is a `retracted_at` stamp, never a
-- DELETE, so the history of what the owner claimed survives the correction.
-- There is deliberately NO unique constraint on (action_id, source):
-- re-applying after a newer approved draft is a legitimate second row, and a
-- verifier may check repeatedly. Duplicate-submit protection is the route's
-- job, not the schema's.

CREATE TABLE IF NOT EXISTS public.action_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action_id         uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, not CASCADE: losing a version must not erase the fact
  -- that the owner applied something.
  output_version_id uuid REFERENCES public.output_versions(id) ON DELETE SET NULL,
  source            text NOT NULL CHECK (source IN ('owner_asserted', 'verified')),
  asserted_by       uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  asserted_at       timestamptz NOT NULL DEFAULT now(),
  evidence          jsonb,
  note              text,
  retracted_at      timestamptz,
  retracted_by      uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- `source` is in the key because latestOwnerAssertion filters on it; without
-- it that lookup rechecks every application row for the action. workspace_id
-- is deliberately NOT a leading column: action_id already determines the
-- workspace, so it would be a scope assertion rather than a selectivity
-- filter sitting ahead of the actually selective column.
CREATE INDEX IF NOT EXISTS action_applications_action_idx
  ON public.action_applications (action_id, source, asserted_at DESC)
  WHERE retracted_at IS NULL;

-- The four-statement block every table in this schema carries; see
-- 0003_workflows.sql, which does exactly this for all 34 existing tables.
-- The policy is scoped TO sme_app_runtime (a NOLOGIN role the app connects
-- through), never to anon/authenticated -- granting to those is forbidden.
-- All four must be here: 0003 is immutable and cannot be extended, and the
-- verifier asserts a global policy count that a missing policy would fail.
ALTER TABLE public.action_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.action_applications FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.action_applications TO sme_app_runtime;
CREATE POLICY server_application ON public.action_applications FOR ALL TO sme_app_runtime USING (true) WITH CHECK (true);

-- Nullable and deliberately NOT backfilled: every existing row predates this
-- and there is no honest value to write. A backfill would invent a claim about
-- what an owner did.
ALTER TABLE public.action_measurements
  ADD COLUMN IF NOT EXISTS attribution_basis text;

ALTER TABLE public.action_measurements
  DROP CONSTRAINT IF EXISTS action_measurements_attribution_basis_check;
ALTER TABLE public.action_measurements
  ADD CONSTRAINT action_measurements_attribution_basis_check
  CHECK (attribution_basis IS NULL OR attribution_basis IN ('exported', 'owner_asserted', 'verified'));
```

- [ ] **Step 2: Verify it applies**

Run: `corepack pnpm db:verify`

Expected: exit 0. The verifier applies the whole corpus against disposable Docker Postgres three times over (so `IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` re-runnability is proven), and checks that every FK states an explicit `ON DELETE`. If it reports a missing `ON DELETE` rule, one of the five FKs above lost its clause.

`test/integration/fixtures/legacy-final-catalog.json` is the verifier's replay-comparison baseline and must be **extended** with the new table's rows in `tables`, `columns`, `constraints` and `indexes`, plus the new `action_measurements.attribution_basis` column and its check constraint. Extend it only — the diff must be insertions with zero deletions. Weakening or removing an existing baseline entry to make the verifier pass would disable the protection this fixture exists to provide.

- [ ] **Step 2b: Update the OTHER two places that encode this schema**

Found during Task 7: `db:verify` and its catalog fixture are not the only things that know the schema, and a migration that updates only those leaves the integration suite red.

1. **`lib/db/schema/` — the Drizzle definitions.** Add `action_applications` to `lib/db/schema/business.ts` (where `actions` and `action_measurements` live), matching the migration exactly: every column, nullability, each FK with its `ON DELETE` rule, the `source` CHECK, and the partial index. Add the `attribution_basis` column and its CHECK to the existing `action_measurements` definition. `db:types` generates from this directory, so a missing definition means generated types silently omit a real table.

2. **`test/integration/neon-schema.integration.test.ts`.** Add the new migration to the applied-migrations list, bump the journal-count assertions (two places), update the catalog baseline, and bump the Drizzle schema-module count.

Note what actually guards Drizzle/migration fidelity, established by Task 7's review: the schema test's "exposes all final columns and constraints through typed Drizzle tables" case diffs every Drizzle table's columns, nullability and constraint names against `test/integration/fixtures/legacy-final-catalog.json` — an independently generated oracle. That column-level diff is the primary guard; the numeric catalog census is a second, coarser tripwire on top of it. Both need updating, but if you must reason about which one would catch a real divergence, it is the oracle diff.

For the catalog baseline, **predict each delta from the migration before running anything**, then confirm the observed numbers match. Pasting whatever a failing run reports converts a baseline guard into a description of current reality, which is how this class of test stops protecting anything. For 0006 the prediction was tables +1, columns +13, constraints +8, indexes +2, triggers/functions/seededRows unchanged — and observation matched exactly. If your prediction and observation disagree, stop: something landed that neither you nor the plan expects, which is what the assertion exists to catch.

Rename any synthetic probe migrations in that file that collide with the new number.

- [ ] **Step 3: Commit**

```bash
git add neon/migrations/0006_action_applications.sql
git commit -m "feat(P3.2): add action_applications and attribution_basis"
```

---

### Task 2: Pure domain — basis precedence and the verifier seam

**Files:**
- Create: `lib/workspace/applications.ts`
- Test: `lib/workspace/applications.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { strongestBasis, type ApplicationRecord } from "./applications";

const HEAD_STARTED = Date.parse("2026-09-10T00:00:00Z");

function application(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: "app-1",
    action_id: "action-1",
    source: "owner_asserted",
    asserted_at: "2026-09-01T00:00:00Z",
    retracted_at: null,
    ...overrides,
  };
}

describe("strongestBasis", () => {
  it("returns null when nothing applies", () => {
    expect(strongestBasis([], { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED })).toBeNull();
  });

  it("returns exported when only the export precedes the head scan", () => {
    expect(strongestBasis([], { exportedBeforeHead: true, headStartedAtMs: HEAD_STARTED })).toBe("exported");
  });

  it("prefers owner_asserted over exported, because export is not publication", () => {
    expect(strongestBasis([application()], { exportedBeforeHead: true, headStartedAtMs: HEAD_STARTED })).toBe("owner_asserted");
  });

  it("prefers verified over owner_asserted", () => {
    expect(
      strongestBasis([application(), application({ id: "app-2", source: "verified" })], { exportedBeforeHead: true, headStartedAtMs: HEAD_STARTED }),
    ).toBe("verified");
  });

  it("ignores a retracted application", () => {
    expect(strongestBasis([application({ retracted_at: "2026-09-05T00:00:00Z" })], { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED })).toBeNull();
  });

  it("ignores an application asserted after the head scan started", () => {
    expect(strongestBasis([application({ asserted_at: "2026-09-11T00:00:00Z" })], { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED })).toBeNull();
  });

  it("ignores an application with an unparseable timestamp", () => {
    expect(strongestBasis([application({ asserted_at: "not-a-date" })], { exportedBeforeHead: false, headStartedAtMs: HEAD_STARTED })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/applications.test.ts`

Expected: FAIL — cannot resolve `./applications`.

- [ ] **Step 3: Write the implementation**

```ts
import type { ApplicationRepository } from "@/lib/repositories/applications";

/**
 * Owner-asserted and verifier-confirmed application evidence
 * (docs/superpowers/specs/2026-09-16-applied-evidence-design.md).
 *
 * The Master Plan requires four events kept distinct: approved/exported, owner
 * says applied, provider verifies applied, and later observed metric change.
 * This module owns the middle two and the rule for which of the three
 * attribution signals wins.
 */
export type ApplicationSource = "owner_asserted" | "verified";
export type AttributionBasis = "exported" | "owner_asserted" | "verified";

export interface ApplicationRecord {
  id: string;
  action_id: string;
  source: ApplicationSource;
  asserted_at: string;
  retracted_at: string | null;
}

/**
 * Precedence: verified > owner_asserted > exported.
 *
 * This inverts the intuitive order deliberately. An export only tells us a file
 * left the building; the Master Plan says so directly -- "'Exported' is not
 * 'published' or 'implemented.'" The owner saying they published it is a closer
 * claim about the world even though it is unverified, so it outranks the
 * export. Only an independent check outranks the owner.
 *
 * `headStartedAt` is the same gate `first_exported_at` already passes: evidence
 * dated after the head scan started cannot explain that scan's numbers, and
 * honouring it would be precisely the "causal claim from timing alone" the
 * plan forbids.
 */
export interface BasisOptions {
  exportedBeforeHead: boolean;
  /** The head scan's START, epoch milliseconds -- not its completion. */
  headStartedAtMs: number;
}

export function strongestBasis(
  applications: readonly ApplicationRecord[],
  options: BasisOptions,
): AttributionBasis | null {
  let owner = false;
  for (const row of applications) {
    if (row.retracted_at) continue;
    const at = Date.parse(row.asserted_at);
    if (!Number.isFinite(at) || at >= options.headStartedAtMs) continue;
    if (row.source === "verified") return "verified";
    owner = true;
  }
  if (owner) return "owner_asserted";
  return options.exportedBeforeHead ? "exported" : null;
}

export interface RecordApplicationInput {
  workspaceId: string;
  actionId: string;
  source: ApplicationSource;
  outputVersionId?: string | null;
  assertedBy?: string | null;
  note?: string | null;
  evidence?: Record<string, unknown> | null;
}

/**
 * THE VERIFIER SEAM. A future provider verifier calls this with
 * `source: 'verified'` and its proof in `evidence`; nothing calls it that way
 * today. It is deliberately a function rather than a route: exposing
 * verification over HTTP is a separate, unauthorized decision, and an empty
 * second table would have been schema built for a feature that does not exist.
 */
export async function recordApplication(
  repo: ApplicationRepository,
  input: RecordApplicationInput,
): Promise<{ id: string } | null> {
  return repo.insert({
    workspace_id: input.workspaceId,
    action_id: input.actionId,
    output_version_id: input.outputVersionId ?? null,
    source: input.source,
    asserted_by: input.assertedBy ?? null,
    note: input.note ?? null,
    evidence: input.evidence ?? null,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run lib/workspace/applications.test.ts`

Expected: PASS, 7 tests. (`ApplicationRepository` does not exist yet — the import is type-only and erased, so this compiles at test time but `pnpm typecheck` will fail until Task 3. That is expected and is why Task 3 is next.)

- [ ] **Step 5: Commit**

```bash
git add lib/workspace/applications.ts lib/workspace/applications.test.ts
git commit -m "feat(P3.2): add attribution basis precedence and the verifier seam"
```

---

### Task 3: Repository adapter

**Files:**
- Create: `lib/repositories/applications.ts`

No separate unit test: this file is SQL with no branching logic, and it is covered end-to-end by the integration test in Task 7. This matches how `lib/repositories/measurements.ts` is tested in this codebase.

- [ ] **Step 1: Write the repository**

Every query is scoped by `workspace_id` as well as by id, matching the defensive style of `lib/repositories/measurements.ts` — an id alone is never trusted to imply a tenant.

```ts
import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import { withTransaction } from '../db/transaction';
import type { ApplicationRecord, ApplicationSource } from '../workspace/applications';

export interface ApplicationInsert {
  workspace_id: string;
  action_id: string;
  output_version_id: string | null;
  source: ApplicationSource;
  asserted_by: string | null;
  note: string | null;
  evidence: Record<string, unknown> | null;
}

/**
 * Result of an owner-assertion insert attempt. `assertApplied`'s guard runs
 * inside the same transaction as the insert, so by the time it returns, the
 * write already did or didn't happen -- this only explains why not, it never
 * decides whether to write. Distinguishing the two zero-row causes matters
 * because they call for different responses: 'duplicate' is a double-clicked
 * button and should look exactly like the up-front idempotency path (200,
 * pointing at the row that exists); 'closed' is the only case that is
 * actually false to report as anything but a refusal.
 */
export type AssertOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'closed' | 'duplicate'; existingId?: string };

export interface ApplicationRepository {
  /** Non-retracted rows for these actions, newest first. */
  forActions(workspaceId: string, actionIds: string[]): Promise<ApplicationRecord[]>;
  /** The newest non-retracted owner assertion for one action, or null. */
  latestOwnerAssertion(workspaceId: string, actionId: string): Promise<(ApplicationRecord & { output_version_id: string | null }) | null>;
  /** True when the version exists, belongs to this action, and is approved. */
  approvedVersion(workspaceId: string, actionId: string, versionId: string): Promise<boolean>;
  /**
   * The verifier path: records an observation about the world. Deliberately
   * has no closed-action guard (unlike assertApplied) — an owner dismissing
   * an action does not make what a verifier observed untrue, so a closed
   * action can still receive a 'verified' row. Only 'owner_asserted' rows
   * are a workflow act gated on the action being open; see assertApplied.
   */
  insert(row: ApplicationInsert): Promise<{ id: string } | null>;
  /**
   * Insert + complete the action in one transaction. A zero-row insert is
   * diagnosed, still inside the transaction, to tell a duplicate submit
   * (a live owner_asserted row already exists for the same
   * output_version_id, including the null/checklist case) from a genuinely
   * closed action — see AssertOutcome.
   */
  assertApplied(row: ApplicationInsert, nowIso: string): Promise<AssertOutcome>;
  /**
   * Stamps EVERY live (non-retracted) owner_asserted row for this action —
   * not just the newest — and reopens the action. "I did not apply this"
   * must leave no standing owner claim; leaving an older live row would let
   * strongestBasis keep returning 'owner_asserted' after the owner withdrew
   * it, which is the exact overclaiming this table exists to prevent.
   * 'verified' rows are untouched: an owner withdrawing their own claim does
   * not invalidate an independent check. Returns the count of rows stamped
   * (0 when there was nothing live to retract).
   */
  retract(workspaceId: string, actionId: string, actorId: string, nowIso: string): Promise<{ retracted: number }>;
}

const CLOSED_STATES = ['dismissed', 'cancelled', 'expired'];

/**
 * Renders a timestamptz as strict UTC ISO 8601. `to_char` of NULL is NULL, so
 * a never-retracted row still reports `retracted_at: null` rather than a
 * string, which the ApplicationRecord contract and every caller rely on.
 */
const ISO_UTC = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Resolves the connection the transactional methods should use. Throws
 * rather than silently falling back to the ambient pool when a query-only
 * client was injected: a silent fallback would mean an injected test/scoped
 * client is ignored and a real write lands on the ambient database, which is
 * far worse than a loud, immediate failure.
 */
function transactor(client?: Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>): Pick<Pool, 'connect'> {
  if (!client) return getPool();
  if (typeof client.connect !== 'function') {
    throw new Error('applicationRepository: a query-only client cannot run assertApplied/retract; inject a Pool');
  }
  return client as Pick<Pool, 'connect'>;
}

export function applicationRepository(client?: Pick<Pool, 'query'> & Partial<Pick<Pool, 'connect'>>): ApplicationRepository {
  const db = () => client ?? getPool();
  return {
    async forActions(workspaceId, actionIds) {
      if (!actionIds.length) return [];
      // Timestamps are rendered as strict UTC ISO 8601 rather than left to
      // `::text`: that rendering depends on the session's DateStyle, and only
      // the strict ISO subset is spec-guaranteed to Date.parse. strongestBasis
      // parses asserted_at to decide whether evidence precedes a scan, and a
      // misparse there does not throw -- it silently changes which evidence
      // counts, the exact failure this table exists to prevent.
      return (await db().query<ApplicationRecord>(
        `SELECT p.id, p.action_id, p.source,
                ${ISO_UTC('p.asserted_at')} AS asserted_at,
                ${ISO_UTC('p.retracted_at')} AS retracted_at
         FROM action_applications p JOIN actions a ON a.id = p.action_id AND a.workspace_id = p.workspace_id
         WHERE p.workspace_id = $1 AND p.action_id = ANY($2::uuid[]) AND p.retracted_at IS NULL
         ORDER BY p.asserted_at DESC`,
        [workspaceId, actionIds],
      )).rows;
    },
    async latestOwnerAssertion(workspaceId, actionId) {
      return (await db().query<ApplicationRecord & { output_version_id: string | null }>(
        `SELECT id, action_id, source,
                ${ISO_UTC('asserted_at')} AS asserted_at,
                ${ISO_UTC('retracted_at')} AS retracted_at,
                output_version_id
         FROM action_applications
         WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted' AND retracted_at IS NULL
         ORDER BY asserted_at DESC, id DESC LIMIT 1`,
        [workspaceId, actionId],
      )).rows[0] ?? null;
    },
    async approvedVersion(workspaceId, actionId, versionId) {
      return (await db().query(
        `SELECT 1 FROM output_versions
         WHERE id = $1 AND workspace_id = $2 AND action_id = $3 AND approval_state = 'approved'`,
        [versionId, workspaceId, actionId],
      )).rows.length > 0;
    },
    async insert(row) {
      return (await db().query<{ id: string }>(
        `INSERT INTO action_applications(workspace_id, action_id, output_version_id, source, asserted_by, note, evidence)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE EXISTS(SELECT 1 FROM actions WHERE id = $2 AND workspace_id = $1)
         RETURNING id`,
        [row.workspace_id, row.action_id, row.output_version_id, row.source, row.asserted_by, row.note, row.evidence],
      )).rows[0] ?? null;
    },
    async assertApplied(row, nowIso) {
      // withTransaction runs everything on one checked-out client (BEGIN/COMMIT/ROLLBACK
      // on the same connection), unlike issuing BEGIN on the pool directly.
      return withTransaction(async (conn) => {
        const inserted = await conn.query<{ id: string }>(
          `INSERT INTO action_applications(workspace_id, action_id, output_version_id, source, asserted_by, note, evidence)
           SELECT $1, $2, $3, $4, $5, $6, $7
           WHERE EXISTS(SELECT 1 FROM actions WHERE id = $2 AND workspace_id = $1 AND action_state <> ALL($8::text[]))
           AND NOT EXISTS (
             SELECT 1 FROM action_applications
             WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted'
               AND retracted_at IS NULL
               AND output_version_id IS NOT DISTINCT FROM $3
           )
           RETURNING id`,
          [row.workspace_id, row.action_id, row.output_version_id, row.source, row.asserted_by, row.note, row.evidence, CLOSED_STATES],
        );
        if (inserted.rows[0]) {
          await conn.query(
            `UPDATE actions SET action_state = 'completed', completed_at = $3, updated_at = $3
             WHERE id = $2 AND workspace_id = $1`,
            [row.workspace_id, row.action_id, nowIso],
          );
          return { ok: true, id: inserted.rows[0].id };
        }
        // Zero rows: the insert's WHERE refused for one of two reasons that
        // look identical from the caller's side of that query. Diagnose which,
        // still inside this transaction -- there is no window to lose here,
        // the write already didn't happen; this only explains why.
        const diagnosis = await conn.query<{ duplicate_id: string | null; action_open: boolean }>(
          `SELECT
             (SELECT id FROM action_applications
               WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted'
                 AND retracted_at IS NULL AND output_version_id IS NOT DISTINCT FROM $3
               ORDER BY asserted_at DESC, id DESC LIMIT 1) AS duplicate_id,
             EXISTS(SELECT 1 FROM actions
               WHERE id = $2 AND workspace_id = $1 AND action_state <> ALL($4::text[])) AS action_open`,
          [row.workspace_id, row.action_id, row.output_version_id, CLOSED_STATES],
        );
        const { duplicate_id, action_open } = diagnosis.rows[0] ?? { duplicate_id: null, action_open: false };
        if (duplicate_id) return { ok: false, reason: 'duplicate', existingId: duplicate_id };
        // action_open === true here would mean neither guard clause explains
        // the empty insert. The insert and this diagnostic are two separate
        // statements, and under READ COMMITTED each takes its own snapshot,
        // so a concurrent commit landing in the gap between them (e.g. the
        // action closing after the insert's snapshot but before this one)
        // can make this look inconsistent without anything being wrong --
        // this is a narrow non-atomic window, not a guarantee violation.
        // 'closed' is the safe default either way.
        void action_open;
        return { ok: false, reason: 'closed' };
      }, transactor(client));
    },
    async retract(workspaceId, actionId, actorId, nowIso) {
      return withTransaction(async (conn) => {
        const stamped = await conn.query(
          `UPDATE action_applications SET retracted_at = $4, retracted_by = $3
           WHERE workspace_id = $1 AND action_id = $2 AND source = 'owner_asserted' AND retracted_at IS NULL
           RETURNING id`,
          [workspaceId, actionId, actorId, nowIso],
        );
        if (!stamped.rows.length) return { retracted: 0 };
        // in_progress, not the action's prior state: it is valid in the CHECK,
        // it is honest (engaged, not done), and re-deriving the original state
        // would reimplement the derivation rules in a second place.
        await conn.query(
          `UPDATE actions SET action_state = 'in_progress', completed_at = NULL, updated_at = $3
           WHERE id = $2 AND workspace_id = $1`,
          [workspaceId, actionId, nowIso],
        );
        return { retracted: stamped.rows.length };
      }, transactor(client));
    },
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `corepack pnpm typecheck`

Expected: exit 0. Task 2's `ApplicationRepository` import now resolves.

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/applications.ts
git commit -m "feat(P3.2): add the action_applications repository"
```

---

### Task 4: Wire the basis into measurements

**Files:**
- Modify: `lib/workspace/measurements.ts`
- Modify: `lib/repositories/measurements.ts`
- Test: `lib/workspace/measurements.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/workspace/measurements.test.ts`. Read the file's existing fixtures first and reuse them — these tests assume `buildMeasurement` is called exactly as the existing cases call it, with `basis` added.

```ts
describe("buildMeasurement attribution basis", () => {
  const base = { id: "snap-base", workspaceId: "ws-1", locationId: "loc-1", observedAt: "2026-09-01T00:00:00Z", metrics: { "ig.followers": 100 } } as never;
  const head = { id: "snap-head", workspaceId: "ws-1", locationId: "loc-1", observedAt: "2026-09-10T00:00:00Z", metrics: { "ig.followers": 140 } } as never;
  const action = { id: "action-1", template_key: "ig-bio", location_id: "loc-1", action_state: "recommended" };

  it("records owner_asserted and reaches Attributed without any export", () => {
    const row = buildMeasurement({ action, base, head, basis: "owner_asserted" })!;
    expect(row.fact_type).toBe("Attributed");
    expect(row.attribution_basis).toBe("owner_asserted");
  });

  it("stays Observed with no basis at all", () => {
    const row = buildMeasurement({ action, base, head, basis: null })!;
    expect(row.fact_type).toBe("Observed");
    expect(row.attribution_basis).toBeNull();
  });

  it("stays Unknown when a metric is missing, whatever the basis", () => {
    const thin = { ...head, metrics: {} } as never;
    const row = buildMeasurement({ action, base, head: thin, basis: "verified" })!;
    expect(row.fact_type).toBe("Unknown");
    expect(row.attribution_basis).toBe("verified");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/measurements.test.ts`

Expected: FAIL — `buildMeasurement` does not accept `basis`.

- [ ] **Step 3: Change `buildMeasurement`**

Replace the `exportedBeforeHead: boolean` parameter and the `factType` line. The full new signature and body:

```ts
export function buildMeasurement(input: {
  action: MeasurableActionRow;
  base: SnapshotRecord;
  head: SnapshotRecord;
  basis: AttributionBasis | null;
}): MeasurementInsert | null {
  const metricKey = TEMPLATE_METRIC[input.action.template_key as TemplateKey];
  if (!metricKey) return null;
  const before = metricValue(input.base, metricKey);
  const after = metricValue(input.head, metricKey);
  const known = before !== null && after !== null;
  const factType: MeasurementFactType = !known ? "Unknown" : input.basis ? "Attributed" : "Observed";
  return {
    workspace_id: input.head.workspaceId ?? input.base.workspaceId ?? "",
    action_id: input.action.id,
    before_snapshot_id: input.base.id,
    after_snapshot_id: input.head.id,
    metric_key: metricKey,
    before_value: before,
    after_value: after,
    delta: known ? round1(after - before) : null,
    fact_type: factType,
    attribution_basis: input.basis,
    window_days: windowDaysBetween(input.base.observedAt, input.head.observedAt),
  };
}
```

Add `attribution_basis: AttributionBasis | null;` to the `MeasurementInsert` interface, and import `strongestBasis`, `type AttributionBasis`, `type ApplicationRecord` from `./applications`.

- [ ] **Step 4: Change `recordMeasurements`**

Add an `applications` port call after `exports`, and build the basis per action. Replace the block from `const exportedBeforeHead = new Set<string>();` through the `inserts` loop:

```ts
  const exportedBeforeHead = new Set<string>();
  for (const row of exports) {
    const exportedAt = row.first_exported_at ? Date.parse(row.first_exported_at) : Number.NaN;
    if (Number.isFinite(exportedAt) && exportedAt < headStartedAt) exportedBeforeHead.add(row.action_id);
  }
  const applications = await repo.applications(head, ids);
  const byAction = new Map<string, ApplicationRecord[]>();
  for (const row of applications) {
    const list = byAction.get(row.action_id);
    if (list) list.push(row); else byAction.set(row.action_id, [row]);
  }
  const basisFor = new Map<string, AttributionBasis | null>(
    actions.map((action) => [
      action.id,
      strongestBasis(byAction.get(action.id) ?? [], {
        exportedBeforeHead: exportedBeforeHead.has(action.id),
        // The head scan's START, not its completion: evidence dated after the
        // scan began cannot explain that scan's numbers.
        headStartedAtMs: headStartedAt,
      }),
    ]),
  );

  const inserts: MeasurementInsert[] = [];
  let skipped = 0;
  for (const action of actions) {
    if (alreadyMeasured.has(action.id)) {
      skipped += 1;
      continue;
    }
    const row = buildMeasurement({ action, base, head, basis: basisFor.get(action.id) ?? null });
    if (row) inserts.push(row);
  }
```

- [ ] **Step 5: Replace the `completed`-as-proxy hack**

Replace the `entered` set and the comment above it:

```ts
  // Only an action the owner actually entered into the loop can be labelled
  // measured. A metric existing on both snapshots is not evidence that anyone
  // did anything: without this, an untouched `recommended` action whose finding
  // is still open was badged "Measured" -- the loop's terminal success state --
  // on the second comparable scan, next to an Approval step still pending.
  //
  // Until 0006 this used `action_state === 'completed'` as a stand-in for "the
  // owner says they applied it", because no such record existed. It does now:
  // an owner assertion is the real signal, and POST .../applied writes the
  // assertion and sets 'completed' in one transaction.
  //
  // DATED FALLBACK: the `action_state === 'completed'` test remains ONLY for
  // actions completed before 0006, which have no application row and would
  // otherwise silently lose their `measured` label. Remove it once no
  // pre-0006 completed actions remain.
  //
  // After Task 8 Step 4b the only other writer of 'completed' is
  // closeResolvedActions, which sets measurement_state='measured' itself and
  // only when every source finding appears in a comparable diff's
  // resolved_findings -- a real observation, so the fallback is not laundering
  // a self-report into a badge there. The owner-facing PATCH path that could
  // have done exactly that is removed in that step.
  const entered = new Set(
    actions
      .filter((action) => basisFor.get(action.id) !== null || action.action_state === "completed")
      .map((action) => action.id),
  );
```

- [ ] **Step 6: Add the repository port**

In `lib/repositories/measurements.ts`, add to the `MeasurementRepository` interface:

```ts
 applications(head: SnapshotRecord, ids: string[]): Promise<ApplicationRecord[]>;
```

and to the returned object (import `applicationRepository` from `./applications` and `type ApplicationRecord` from `../workspace/applications`):

```ts
  async applications(head,ids) { return applicationRepository(db()).forActions(head.workspaceId!, ids); },
```

Add `attribution_basis` to the `insert` INSERT column list, its `SELECT` placeholder list as `$14`, and the parameter array as `row.attribution_basis`.

- [ ] **Step 7: Run the full measurement suite**

Run: `corepack pnpm exec vitest run lib/workspace/measurements.test.ts`

Expected: PASS. Existing cases that passed `exportedBeforeHead: true` must be updated to `basis: "exported"` and those passing `false` to `basis: null`; the assertions themselves should not change, which is the point — the export path must behave exactly as before.

- [ ] **Step 8: Commit**

```bash
git add lib/workspace/measurements.ts lib/workspace/measurements.test.ts lib/repositories/measurements.ts
git commit -m "feat(P3.2): attribute measurements by basis, not by a completed-state proxy"
```

---

### Task 5: The route

**Files:**
- Create: `app/api/actions/[actionId]/applied/route.ts`
- Test: `app/api/actions/[actionId]/applied/route.test.ts`

Read `app/api/actions/[actionId]/route.test.ts` first and copy its mocking setup verbatim — it already stubs `authorizeActionMutation`, and reproducing that harness by hand is the single most likely way to waste an hour here.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const ports = vi.hoisted(() => ({
  auth: null as unknown,
  repo: {
    approvedVersion: vi.fn(),
    assertApplied: vi.fn(),
    retract: vi.fn(),
    latestOwnerAssertion: vi.fn(),
  },
}));

vi.mock("@/app/api/actions/_shared/mutation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/actions/_shared/mutation")>()),
  authorizeActionMutation: async () => ports.auth,
}));
vi.mock("@/lib/repositories/applications", () => ({ applicationRepository: () => ports.repo }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: vi.fn(), ipHashFor: () => null }));

const { POST, DELETE } = await import("./route");

const OK_AUTH = {
  ok: true,
  user: { id: "11111111-1111-4111-8111-111111111111" },
  membership: {},
  scope: { actionId: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", locationId: null },
  ipHash: null,
};
const params = { params: Promise.resolve({ actionId: "22222222-2222-4222-8222-222222222222" }) };
const req = (body: unknown) => new Request("http://x/applied", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  ports.auth = OK_AUTH;
  ports.repo.approvedVersion.mockResolvedValue(true);
  ports.repo.assertApplied.mockResolvedValue({ id: "app-1" });
  ports.repo.retract.mockResolvedValue({ id: "app-1" });
  ports.repo.latestOwnerAssertion.mockResolvedValue(null);
  vi.clearAllMocks();
});

describe("POST /api/actions/[actionId]/applied", () => {
  it("refuses an unauthorized caller with the shared helper's own response", async () => {
    ports.auth = { ok: false, response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) };
    expect((await POST(req({}), params)).status).toBe(403);
  });

  it("records an assertion with no version", async () => {
    const res = await POST(req({}), params);
    expect(res.status).toBe(201);
    expect(ports.repo.assertApplied).toHaveBeenCalled();
  });

  it("rejects a version that is not approved or not this action's", async () => {
    ports.repo.approvedVersion.mockResolvedValue(false);
    const res = await POST(req({ output_version_id: "44444444-4444-4444-8444-444444444444" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_not_applicable" });
    expect(ports.repo.assertApplied).not.toHaveBeenCalled();
  });

  it("rejects a malformed version id without touching the database", async () => {
    const res = await POST(req({ output_version_id: "nope" }), params);
    expect(res.status).toBe(400);
    expect(ports.repo.approvedVersion).not.toHaveBeenCalled();
  });

  it("is idempotent: an existing assertion for the same version returns 200, not a second row", async () => {
    ports.repo.latestOwnerAssertion.mockResolvedValue({ id: "app-1", output_version_id: null });
    const res = await POST(req({}), params);
    expect(res.status).toBe(200);
    expect(ports.repo.assertApplied).not.toHaveBeenCalled();
  });

  it("returns 409 when the action is closed", async () => {
    ports.repo.assertApplied.mockResolvedValue(null);
    expect((await POST(req({}), params)).status).toBe(409);
  });
});

describe("DELETE /api/actions/[actionId]/applied", () => {
  it("retracts the newest assertion", async () => {
    const res = await DELETE(new Request("http://x/applied", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(ports.repo.retract).toHaveBeenCalled();
  });

  it("returns 404 when there is nothing to retract", async () => {
    ports.repo.retract.mockResolvedValue(null);
    expect((await DELETE(new Request("http://x/applied", { method: "DELETE" }), params)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run "app/api/actions/[actionId]/applied/route.test.ts"`

Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

```ts
import { applicationRepository } from "@/lib/repositories/applications";
import { authorizeActionMutation, json, localeFrom, readJson, UUID_RE } from "@/app/api/actions/_shared/mutation";
import { recordNeonEvent } from "@/lib/workspace/audit";

/**
 * POST   /api/actions/[actionId]/applied { output_version_id?, note? } -> 201 { applicationId }
 * DELETE /api/actions/[actionId]/applied                               -> 200 { retracted }
 *
 * The owner's assertion that this action is live in the world
 * (docs/superpowers/specs/2026-09-16-applied-evidence-design.md). This is a
 * self-report and nothing here verifies it -- the next comparable scan is what
 * observes the result, and `attribution_basis='owner_asserted'` travels with
 * every measurement built from it so it is never displayed as a confirmation.
 *
 * authorizeActionMutation is the whole front half: actionId shape, action scope
 * load, owner-or-manager-in-scope for the action's location (viewer and
 * out-of-scope manager -> 403), then one `action_mutation` rate-limit token,
 * fail-closed. Authorization always precedes the limiter so an unauthenticated
 * caller cannot burn a member's budget.
 */
export async function POST(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const body = (await readJson(req)) ?? {};
  const rawVersion = body.output_version_id;
  if (rawVersion !== undefined && rawVersion !== null && (typeof rawVersion !== "string" || !UUID_RE.test(rawVersion)))
    return json({ error: "output_version_id is invalid" }, 400);
  const versionId = typeof rawVersion === "string" ? rawVersion : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null;

  const repo = applicationRepository();
  const { workspaceId, locationId } = auth.scope;

  // Asserting publication of an unapproved draft would record a delivery of
  // something nobody approved (guardrail 5).
  if (versionId) {
    let approved: boolean;
    try {
      approved = await repo.approvedVersion(workspaceId, actionId, versionId);
    } catch {
      return json({ error: "unavailable" }, 503);
    }
    if (!approved) return json({ error: "version_not_applicable" }, 409);
  }

  // Duplicate detection lives entirely in assertApplied's own in-transaction
  // guard (below): a pre-check here would just be a second implementation of
  // the same rule that a hand-kept-in-sync copy could drift from, paid for
  // on every assertion to save a round-trip on the rare double-click.
  // latestOwnerAssertion stays on the repository for Task 8's "you marked
  // this applied on {date}" display -- it is just not called from this route.
  let outcome: Awaited<ReturnType<typeof repo.assertApplied>>;
  try {
    outcome = await repo.assertApplied(
      {
        workspace_id: workspaceId,
        action_id: actionId,
        output_version_id: versionId,
        source: "owner_asserted",
        asserted_by: auth.user.id,
        note,
        evidence: null,
      },
      new Date().toISOString(),
    );
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  // The insert's guard runs inside the same transaction, so a zero-row result
  // means the write already didn't happen -- assertApplied's own diagnostic
  // query (still inside that transaction) tells us why. A duplicate submit
  // is not an error: it gets the same 200 an up-front idempotency check would
  // return, because reporting "this action is closed" for a double-clicked
  // button would be false -- the action is open (per this guard's definition
  // of closed, CLOSED_STATES in lib/repositories/applications.ts --
  // dismissed/cancelled/expired; completed counts as open here) and the
  // other request's assertion is what's on record.
  if (!outcome.ok) {
    if (outcome.reason === "duplicate")
      return json({ applicationId: outcome.existingId, alreadyRecorded: true }, 200);
    return json({ error: "action_closed" }, 409);
  }

  await recordNeonEvent({
    workspaceId,
    locationId,
    actorType: "user",
    actorId: auth.user.id,
    event: "action.applied",
    entityType: "action",
    entityId: actionId,
    locale: localeFrom(req, body),
    ipHash: auth.ipHash,
    payload: { application_id: outcome.id, output_version_id: versionId },
  });

  return json({ applicationId: outcome.id }, 201);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  const auth = await authorizeActionMutation(req, actionId, "action_mutation");
  if (!auth.ok) return auth.response;

  const repo = applicationRepository();
  const { workspaceId, locationId } = auth.scope;
  // retract() stamps EVERY live owner assertion for this action, not just the
  // newest, and returns how many. Retraction means "I did not apply this", so
  // it must leave no standing claim -- a buried older assertion would keep
  // strongestBasis returning owner_asserted for work the owner just withdrew.
  let retraction: { retracted: number };
  try {
    retraction = await repo.retract(workspaceId, actionId, auth.user.id, new Date().toISOString());
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  if (retraction.retracted === 0) return json({ error: "not_found" }, 404);

  await recordNeonEvent({
    workspaceId,
    locationId,
    actorType: "user",
    actorId: auth.user.id,
    event: "action.application_retracted",
    entityType: "action",
    entityId: actionId,
    locale: localeFrom(req, null),
    ipHash: auth.ipHash,
    payload: { retracted_count: retraction.retracted },
  });

  return json({ retracted: retraction.retracted }, 200);
}
```



- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run "app/api/actions/[actionId]/applied/route.test.ts"`

Expected: PASS, 11 tests (the original eight plus the duplicate-submit case and two DELETE cases added in review).

- [ ] **Step 5: Register the audit event labels**

In `lib/workspace/audit-labels.ts`, add `action.applied` and `action.application_retracted` alongside the existing `action.*` entries, with all three locales. Read the file's existing `action.dismissed` entry and follow its exact shape.

English: `"Marked as applied"` and `"Applied mark withdrawn"`.
zh-HK: `"標記為已套用"` and `"撤回已套用標記"`.
zh-TW: `"標記為已套用"` and `"撤回已套用標記"`.

- [ ] **Step 6: Run the audit label suite**

Run: `corepack pnpm exec vitest run lib/workspace/audit.test.ts`

Expected: PASS. If this file has an exhaustiveness test over event names, it will fail until both labels are present — that is the test doing its job.

- [ ] **Step 7: Commit**

```bash
git add "app/api/actions/[actionId]/applied" lib/workspace/audit-labels.ts
git commit -m "feat(P3.2): add the applied assertion and retraction route"
```

---

### Task 6: Display phase and copy

**Files:**
- Modify: `lib/copy-workspace.ts`
- Modify: `lib/workspace/overview.ts`
- Test: `lib/workspace/overview.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/workspace/overview.test.ts`:

```ts
describe("displayPhaseKey applied", () => {
  const baseInput = {
    capability: "Live" as const,
    actionState: "completed" as const,
    runState: null,
    approvalState: null,
    deliveryState: "not_requested" as const,
    measurementState: "not_eligible" as const,
    applied: true,
  };

  it("is applied when the owner asserted and no comparable scan has judged it", () => {
    expect(displayPhaseKey(baseInput)).toBe("applied");
  });

  it("measured still wins once a comparable scan has judged it", () => {
    expect(displayPhaseKey({ ...baseInput, measurementState: "measured" })).toBe("measured");
  });

  it("is exported, not applied, when nothing was asserted", () => {
    expect(displayPhaseKey({ ...baseInput, applied: false, deliveryState: "exported" })).toBe("exported");
  });

  it("is applied, not exported, once an exported draft is asserted", () => {
    // The reason `applied` sits above `exported`: deliveryState stays
    // 'exported' forever, so the later position made the assertion invisible
    // on exactly the drafted-action path Task 8's control targets.
    expect(displayPhaseKey({ ...baseInput, deliveryState: "exported" })).toBe("applied");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/overview.test.ts`

Expected: FAIL — `displayPhaseKey` does not accept `applied`.

- [ ] **Step 3: Add the phase key and copy**

In `lib/copy-workspace.ts`, add `| "applied"` to the `DisplayPhaseKey` union immediately BEFORE `"exported"`, and `"applied",` to `DISPLAY_PHASE_KEYS` in the same position, so the declared order matches the evaluation order.

In `workspaceEn.phases` (line ~133), add: `applied: "Applied (reported)",`
In `workspaceZhHK.phases` (line ~229), add: `applied: "已套用（店主回報）",`

`workspaceZhTW` spreads `workspaceZhHK` and does not override `phases`, so zh-TW inherits this string. That is correct here — 已套用（店主回報）reads the same in both registers.

- [ ] **Step 4: Add the fields to `ActionOverview`**

In `lib/workspace/overview.ts`, add two fields to the `ActionOverview` interface (after `measurementState`, before `displayPhase`). Task 8's control reads both, so they must exist before that task starts:

```ts
  /** A non-retracted owner assertion exists for this action. */
  applied: boolean;
  /** ISO timestamp of that assertion, for the "you marked this applied on {date}" line. */
  appliedOn: string | null;
```

Populate them in the same object literal that already builds `displayPhase` (~line 190):

```ts
    applied: ctx.applied ?? false,
    appliedOn: ctx.appliedOn ?? null,
```

- [ ] **Step 5: Add the branch**

In `lib/workspace/overview.ts`, add `applied: boolean;` to the `displayPhaseKey` input type and insert one branch between the `exported` and `awaiting_comparable_scan` branches:

```ts
  // Above `exported` deliberately: deliveryState stays 'exported' forever once
  // a draft is exported, so placing this after it would make the owner's
  // assertion invisible on exactly the drafted-action path that carries a
  // version reference -- the label would show up mainly on checklists, which
  // is close to the opposite of the intent. Applied is further along the loop
  // than exported. The `!== "measured"` guard still defers to the scan's own
  // verdict, which outranks a self-report once it exists.
  if (input.applied && input.measurementState !== "measured") return "applied";
  if (input.deliveryState === "exported") return "exported";
  if (input.measurementState === "awaiting_comparable_scan") return "awaiting_comparable_scan";
```

At the `displayPhaseKey(...)` call site (~line 155), pass `applied: ctx.applied ?? false`, and add `applied?: boolean; appliedOn?: string | null;` to the context type that call reads from.

- [ ] **Step 6: Supply the context from the row loader**

`ctx` is built in `lib/workspace/queries-pages.ts`. Open it and find where `latestVersion` is attached to each action's context — that is the exact pattern to mirror, including how it batches one query for all action ids rather than querying per action.

Add one batched lookup alongside it:

```ts
const applications = await applicationRepository().forActions(workspaceId, actionIds);
const appliedAt = new Map<string, string>();
for (const row of applications) {
  // owner_asserted only: `applied`/`appliedOn` drive the owner-facing "you
  // marked this applied on {date}" line, so a verifier's row must never be
  // rendered as something the owner said. forActions returns BOTH sources.
  if (row.source !== "owner_asserted") continue;
  // forActions returns newest-first and excludes retracted rows, so the first
  // row seen for an action is the one to show.
  if (!appliedAt.has(row.action_id)) appliedAt.set(row.action_id, row.asserted_at);
}
```

then for each action's context: `applied: appliedAt.has(id), appliedOn: appliedAt.get(id) ?? null`.

If `queries-pages.ts` builds contexts in more than one function (the list page and the detail page), **both** need this — otherwise the detail page's control renders from a stale `applied: false` and the owner can assert twice. Grep for `displayPhaseKey(` to find every call site.

- [ ] **Step 7: Run to verify it passes**

Run: `corepack pnpm exec vitest run lib/workspace/overview.test.ts`

Expected: PASS.

- [ ] **Step 8: Run the full unit suite for regressions**

Run: `corepack pnpm exec vitest run lib/workspace`

Expected: PASS. Any snapshot containing the phase list will need updating — inspect each diff and confirm the only change is the added `applied` phase before accepting it.

- [ ] **Step 9: Commit**

```bash
git add lib/copy-workspace.ts lib/workspace/overview.ts lib/workspace/overview.test.ts lib/workspace/queries-pages.ts
git commit -m "feat(P3.2): add the applied display phase"
```

---

### Task 7: Integration test against real Postgres

**Files:**
- Create: `test/integration/neon-action-applications.integration.test.ts`

Model this on `test/integration/neon-cron-dispatch.integration.test.ts` — copy its fixture bootstrap (role creation, `applyMigrations`, the `fixture_runtime` pool, the `vi.stubGlobal("fetch")` transport ban) verbatim rather than inventing one.

- [ ] **Step 1: Write the test**

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations } from "../../scripts/neon/migrations";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { applicationRepository } from "../../lib/repositories/applications";

describe.runIf(process.env.NEON_INTEGRATION === "1")("action applications", () => {
  let fixture: NeonDatabaseFixture, owner: Pool, runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query(
      "CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; CREATE ROLE fixture_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime",
    );
    await applyMigrations(owner);
    const url = new URL(fixture.databaseUrl);
    url.username = "fixture_runtime";
    url.password = "fixture-only";
    runtime = new Pool({ connectionString: url.href });
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", () => { throw new Error("transport forbidden"); });
    await runtime.query("DELETE FROM action_applications; DELETE FROM actions; DELETE FROM workspaces; DELETE FROM app_users");
  });

  afterAll(async () => {
    await Promise.all([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function seed(actionState = "recommended") {
    const ws = (await runtime.query("INSERT INTO workspaces(slug,market) VALUES($1,'hk') RETURNING id", [`ws-${crypto.randomUUID()}`])).rows[0].id;
    const user = (await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${crypto.randomUUID()}@example.test`])).rows[0].id;
    const action = (await runtime.query(
      `INSERT INTO actions(workspace_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,action_state)
       VALUES($1,'ig-bio','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'medium',20,'[]'::jsonb,5,'Live',$2,$3) RETURNING id`,
      [ws, `dedupe-${crypto.randomUUID()}`, actionState],
    )).rows[0].id;
    return { ws, user, action };
  }

  it("records an assertion and completes the action in one transaction", async () => {
    const { ws, user, action } = await seed();
    const created = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(created).not.toBeNull();
    expect((await runtime.query("SELECT action_state FROM actions WHERE id=$1", [action])).rows[0].action_state).toBe("completed");
  });

  it("refuses to assert on a dismissed action and writes nothing", async () => {
    const { ws, user, action } = await seed("dismissed");
    const created = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(created).toBeNull();
    expect((await runtime.query("SELECT id FROM action_applications WHERE action_id=$1", [action])).rows).toEqual([]);
  });

  it("retraction stamps rather than deletes, and reopens the action", async () => {
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    await repo.assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(await repo.retract(ws, action, user, new Date().toISOString())).not.toBeNull();

    expect((await runtime.query("SELECT action_state,completed_at FROM actions WHERE id=$1", [action])).rows[0]).toMatchObject({ action_state: "in_progress", completed_at: null });
    const rows = (await runtime.query("SELECT retracted_at,retracted_by FROM action_applications WHERE action_id=$1", [action])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].retracted_at).not.toBeNull();
    expect(rows[0].retracted_by).toBe(user);
    expect(await repo.forActions(ws, [action])).toEqual([]);
  });

  it("an ordinary assertion does not trip fence_workspace_completion_write", async () => {
    // The fence is opt-in: it returns immediately unless app.completion_job and
    // app.completion_token are set, which only the completion receiver does.
    // This is the actual production path for an owner request -- session
    // variables unset -- and it must not raise.
    const { ws, user, action } = await seed();
    await expect(
      applicationRepository(runtime).assertApplied(
        { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
        new Date().toISOString(),
      ),
    ).resolves.not.toBeNull();
  });

  // Added after Task 5's review. assertApplied's INSERT guard and its
  // diagnostic query carry near-identical predicates that must stay in
  // lockstep: if a future edit changes one and not the other, a duplicate
  // submit gets reported as "this action is closed" (or the reverse) while
  // every unit test still passes, because they all mock the repository. Only a
  // real Postgres run can catch that drift.
  it("tells a duplicate submit apart from a closed action", async () => {
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    const row = { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted" as const, asserted_by: user, note: null, evidence: null };

    const first = await repo.assertApplied(row, new Date().toISOString());
    expect(first.ok).toBe(true);

    // Same action, same (null) version, still live -> duplicate, not closed.
    const second = await repo.assertApplied(row, new Date().toISOString());
    expect(second).toMatchObject({ ok: false, reason: "duplicate" });
    expect(second.ok === false && second.existingId).toBe(first.ok === true && first.id);

    // Exactly one row, so the guard prevented the write rather than merely
    // reporting on it afterwards.
    expect((await runtime.query("SELECT id FROM action_applications WHERE action_id=$1", [action])).rows).toHaveLength(1);
  });

  it("reports a genuinely closed action as closed, not duplicate", async () => {
    const { ws, user, action } = await seed("dismissed");
    const outcome = await applicationRepository(runtime).assertApplied(
      { workspace_id: ws, action_id: action, output_version_id: null, source: "owner_asserted", asserted_by: user, note: null, evidence: null },
      new Date().toISOString(),
    );
    expect(outcome).toEqual({ ok: false, reason: "closed" });
  });

  it("retraction stamps EVERY live owner assertion, not just the newest", async () => {
    // The bug this prevents: retract the newest only, an older live assertion
    // survives, strongestBasis keeps returning owner_asserted, and the product
    // goes on crediting work the owner explicitly withdrew.
    const { ws, user, action } = await seed();
    const repo = applicationRepository(runtime);
    // Two live assertions require two DIFFERENT versions -- the same-version
    // guard from the test above is what stops a same-version duplicate.
    const v1 = await approvedVersion(ws, action);
    const v2 = await approvedVersion(ws, action);
    const base = { workspace_id: ws, action_id: action, source: "owner_asserted" as const, asserted_by: user, note: null, evidence: null };
    expect((await repo.assertApplied({ ...base, output_version_id: v1 }, new Date().toISOString())).ok).toBe(true);
    expect((await repo.assertApplied({ ...base, output_version_id: v2 }, new Date().toISOString())).ok).toBe(true);

    expect(await repo.retract(ws, action, user, new Date().toISOString())).toEqual({ retracted: 2 });
    expect(await repo.forActions(ws, [action])).toEqual([]);
    expect((await runtime.query("SELECT retracted_at FROM action_applications WHERE action_id=$1", [action])).rows.every((r) => r.retracted_at !== null)).toBe(true);
  });

  it("the sme_app_runtime grant from 0006 actually took", async () => {
    // 0003 holds the grants for existing tables and is immutable, so a 0006
    // that forgot its own GRANT would leave this table unreachable at runtime
    // while every unit test still passed.
    const { ws, user, action } = await seed();
    await expect(
      applicationRepository(runtime).insert({ workspace_id: ws, action_id: action, output_version_id: null, source: "verified", asserted_by: user, note: null, evidence: { check: "faq_schema" } }),
    ).resolves.not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-action-applications.integration.test.ts`

Expected: PASS, 8 tests (the five original cases plus the three added after Task 5's review).

NOTE: `assertApplied` and `retract` go through `withTransaction`, which needs `pool.connect()`. They must be exercised through a real `Pool`, not a `{ query }`-only stub — a stub cannot `connect()`, so a test that injects one would not be testing the transaction at all. (`NEON_INTEGRATION=1` is set by `vitest.integration.config.ts`; Docker must be running.)

- [ ] **Step 3: Commit**

```bash
git add test/integration/neon-action-applications.integration.test.ts
git commit -m "test(P3.2): prove assertion, retraction and grants against real Postgres"
```

---

### Task 8: The owner control

**Files:**
- Modify: `lib/workspace/client.ts`
- Modify: `components/workspace/action-detail-client.tsx:302-316`
- Test: `components/workspace/action-detail-client.test.tsx`

- [ ] **Step 1: Add the client helpers**

In `lib/workspace/client.ts`, after `updateAction` (~line 102):

```ts
export function markApplied(actionId: string, body: { output_version_id?: string | null; note?: string } = {}): Promise<ClientResult<{ applicationId: string; alreadyRecorded?: boolean }>> {
  return post(`/api/actions/${encodeURIComponent(actionId)}/applied`, body);
}

export function retractApplied(actionId: string): Promise<ClientResult<{ retracted: string }>> {
  return request(`/api/actions/${encodeURIComponent(actionId)}/applied`, { method: "DELETE", headers: JSON_HEADERS });
}
```

- [ ] **Step 2: Write the failing component test**

Append to `components/workspace/action-detail-client.test.tsx`, following the file's existing render harness:

```ts
it("calls the applied endpoint instead of patching action_state", async () => {
  const applied = vi.fn().mockResolvedValue({ ok: true, data: { applicationId: "app-1" } });
  // Wire `applied` into the existing module mock for @/lib/workspace/client as
  // `markApplied`, exactly as the file already mocks updateAction.
  renderDetail({ action: { ...checklistAction, actionState: "recommended" } });
  await userEvent.click(screen.getByRole("button", { name: /mark as applied|標記為已套用/i }));
  expect(applied).toHaveBeenCalledWith("action-1", {});
});

it("hides the control from viewers", () => {
  renderDetail({ action: checklistAction, canEdit: false });
  expect(screen.queryByRole("button", { name: /mark as applied|標記為已套用/i })).toBeNull();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `corepack pnpm exec vitest run components/workspace/action-detail-client.test.tsx`

Expected: FAIL — no such button.

- [ ] **Step 4: Replace `markChecklistDone`**

Replace the function at `components/workspace/action-detail-client.tsx:302-316` with:

```tsx
  /**
   * The owner's assertion that this action is live in the world. This is a
   * self-report and the product says so: nothing here verifies it, and the
   * next comparable scan is what observes the result. It consumes no delivery
   * allowance and creates no version.
   *
   * It replaces the old checklist-only `markChecklistDone`, which patched
   * action_state='completed' directly. That state is now a consequence of the
   * assertion, set by the route in the same transaction, so there is exactly
   * one owner control and one record of what was claimed.
   */
  async function markApplied() {
    if (!canEdit || applied) return
    setBusy("applied")
    const latestApproved = action.latestVersion?.approvalState === "approved" ? action.latestVersion.id : null
    const result = await markAppliedRequest(action.id, latestApproved ? { output_version_id: latestApproved } : {})
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.success(isChinese ? "已記錄：您表示此行動已套用。下次掃描會觀察結果。" : "Recorded: you reported this as applied. The next scan will observe the result.")
    router.refresh()
  }

  async function retractApplied() {
    if (!canEdit || !applied) return
    setBusy("applied")
    const result = await retractAppliedRequest(action.id)
    setBusy(null)
    if (!result.ok) return failureToast(result)
    toast.success(isChinese ? "已撤回標記。" : "Applied mark withdrawn.")
    router.refresh()
  }
```

Import as `markApplied as markAppliedRequest, retractApplied as retractAppliedRequest` from `@/lib/workspace/client` to avoid shadowing the local handlers. Replace the JSX that rendered the checklist-done button with a control calling `markApplied`, labelled `isChinese ? "標記為已套用" : "Mark as applied"` with the sub-label `isChinese ? "我們只記錄您告訴我們的內容；下次掃描才會檢查。" : "We record what you tell us; the next scan is what checks it."`. When `applied` is true, render `isChinese ? \`您在 \${appliedOn} 標記為已套用 · 未經獨立核實\` : \`You marked this applied on \${appliedOn} · not independently verified\`` with a retract link calling `retractApplied`.

`applied` and `appliedOn` come from the `ActionOverview` fields added in Task 6.

- [ ] **Step 4b: Close the second completion path**

Found during Task 4's review. `PATCH /api/actions/[actionId]` still accepts `action_state: "completed"`, so an owner can reach `completed` — the loop's terminal state, and via the dated fallback in `measurements.ts` a `measured` badge — with no `action_applications` row at all. That is the exact state this slice exists to eliminate, and it contradicts the approved design decision that the assertion IS the record and `completed` is merely its consequence.

Its only caller is the `markChecklistDone` line you just replaced, so remove the path now:

In `app/api/actions/[actionId]/route.ts`, change the guard from accepting `dismissed` or `completed` to accepting `dismissed` only:

```ts
  if (body.action_state !== undefined) {
    // `completed` is deliberately NOT accepted here. Completion is a
    // consequence of an owner assertion, written by POST .../applied in the
    // same transaction as the action_applications row -- see
    // docs/superpowers/specs/2026-09-16-applied-evidence-design.md. Allowing a
    // bare PATCH to set it would let an action reach the loop's terminal state
    // with no evidence of what the owner actually did.
    if (body.action_state !== "dismissed")
      return json({ error: "action_state must be dismissed" }, 400);
    patch.action_state = body.action_state;
    changes.action_state = body.action_state;
  }
```

Delete the `if (body.action_state === "completed") patch.completed_at = ...` line that follows it.

Update `app/api/actions/[actionId]/route.test.ts`: the two existing cases that PATCH `{ action_state: "completed" }` expecting 403 are authorization tests and still pass (authorization runs first), but add one case asserting an authorized caller now gets 400 for `completed`. Narrow `ActionPatch` in `lib/workspace/client.ts` so `action_state` is `"dismissed"` only.

After this, `closeResolvedActions` (`lib/repositories/action-derivation.ts`) is the only other writer of `completed`. That one is legitimate and needs no change: it sets `measurement_state='measured'` itself in the same UPDATE, and only when every source finding appears in a comparable diff's `resolved_findings` — a real observation, not a self-report.

- [ ] **Step 5: Run to verify it passes**

Run: `corepack pnpm exec vitest run components/workspace/action-detail-client.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/workspace/client.ts components/workspace/action-detail-client.tsx components/workspace/action-detail-client.test.tsx
git commit -m "feat(P3.2): replace the checklist-done control with an applied assertion"
```

---

### Task 9: Show the basis wherever the fact type shows

**Files:**
- Modify: `components/workspace/home-brief.tsx` (the proof card)
- Modify: `components/workspace/action-detail-client.tsx` (the "Before and after" measurement card — the product's most detailed measurement display)
- Modify: `lib/copy-workspace.ts`, `lib/workspace/format.ts` (the `basisLabel` helper)
- Modify: `lib/repositories/workspace-read.ts`, `lib/workspace/queries-pages.ts` — `attribution_basis` has to be SELECTed and threaded, or the basis can never render as anything but "not recorded"

NOT `components/workspace/insights-view.tsx`. An earlier draft of this plan named it, but its `metricCards()` is a pure snapshot-to-snapshot comparison that literal-assigns `"Observed"` or `"Unknown"` and never reads `action_measurements` — so no measurement with a basis renders there and there is nothing to append. Verified by tracing `metricCards()` in `lib/workspace/queries-pages.ts`.

- [ ] **Step 1: Add the basis copy**

In `lib/copy-workspace.ts`, add a `basis` block to `workspaceEn` beside `phases`:

```ts
  basis: {
    exported: "exported {date}",
    owner_asserted: "you reported applying this",
    verified: "verified on site",
    unknown: "basis not recorded",
  },
```

and to `workspaceZhHK`:

```ts
  basis: {
    exported: "於 {date} 匯出",
    owner_asserted: "您回報已套用",
    verified: "已在網站核實",
    unknown: "未記錄依據",
  },
```

Add the matching `basis` field to the `WorkspaceCopy` interface. `workspaceZhTW` inherits by spread.

- [ ] **Step 2: Render it**

Wherever these two components render a measurement's `factType`, append ` · ` and the basis string for `measurement.attributionBasis`, falling back to the `unknown` string when it is `null`. A `null` basis means the row predates migration `0006`; it must render as "basis not recorded" and never as a guess.

- [ ] **Step 3: Run the component suites**

Run: `corepack pnpm exec vitest run components/workspace`

Expected: PASS. Update any snapshot that gains the basis suffix, confirming each diff shows only that addition.

- [ ] **Step 4: Commit**

```bash
git add components/workspace lib/copy-workspace.ts
git commit -m "feat(P3.2): show the attribution basis beside every fact type"
```

---

### Task 10: Full verification and phase report

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-TEST-RESULTS.md`

- [ ] **Step 1: Run every offline gate, recording exact output**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:integration
corepack pnpm db:verify
```

Expected: typecheck exit 0; lint exit 0 with **30 warnings, 0 errors** (the standing baseline — any new warning is this work's and must be fixed); test and test:integration exit 0 with counts above the P3.1 baselines of 313 files/3,213 tests and 27 files/277 tests; db:verify exit 0.

`corepack pnpm build` is **expected to fail** on Windows with the standing Turbopack/`radix-ui` module-resolution errors documented in `PHASE-1-TEST-RESULTS.md`, `PHASE-2-TEST-RESULTS.md` and `PHASE-3-TEST-RESULTS.md`. Record it as **blocked**, not failed and not worked around. Do not substitute `--webpack` into the gate; run `npx next build --webpack` separately as the diagnostic that the code itself compiles, and report that separately.

- [ ] **Step 2: Append to the phase report**

Add a "P3.2 applied evidence" section to both documents covering: baseline commit, files and migration changed, exact commands with exit codes and test counts, and the three things this slice does **not** prove, restated from the design doc:

1. no verifier exists, so `source='verified'` has an insert-path test and nothing end-to-end;
2. the browser acceptance artifact (a real comparable pair, plus negative authorization examples) needs hosted access and explicit authorization;
3. the `ScanComparison` state-splitting (`no_accessible_pair` conflating no-access, no-pair and non-comparable) remains an open P3.2 gap, deliberately deferred.

Use **passed / failed / blocked / not run** accurately, and keep implemented / locally verified / hosted verified separate.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/owner-platform-v1
git commit -m "docs(P3.2): record the applied evidence phase report"
```

---

## Verification Checklist

- [ ] `action_applications` exists with an explicit `ON DELETE` on all five FKs and a working `sme_app_runtime` grant
- [ ] Basis precedence is `verified` > `owner_asserted` > `exported`, proven by unit test
- [ ] An assertion dated after the head scan started never produces `Attributed`
- [ ] A retracted assertion is ignored by measurement and invisible to `forActions`
- [ ] Pre-`0006` completed actions keep their `measured` label via the dated fallback
- [ ] Viewers and out-of-scope managers get 403 before any data read
- [ ] An unapproved or foreign version is refused with 409 `version_not_applicable`
- [ ] A double POST yields one row, not two
- [ ] Retraction reopens the action to `in_progress` and clears `completed_at`
- [ ] Every measurement display shows the basis; `null` renders as "basis not recorded"
- [ ] No verifier is registered, scheduled, or reachable over HTTP
