# Website Verifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `source='verified'` its first caller — a bounded sweep that refetches an owner's website and confirms the check that created an action now passes.

**Architecture:** Templates declare which website checks would evidence them. A pure rule compares the action's source-snapshot check results against a fresh fetch and returns verified / not-yet / not-applicable. A bounded sweep, added as a fourth concern inside the existing cron dispatch, fetches once per location and writes `verified` rows through P3.2's existing `recordApplication` seam.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Postgres (Neon) via `pg`, Vitest 4, pnpm 9.12.0 via corepack.

**Design doc:** `docs/superpowers/specs/2026-09-16-website-verifier-design.md`

**Baseline:** branch `worktree-p32-rescan-reachability` at `72697df` (P3.2 merged into this branch; PR #16 open).

---

## File Structure

**Create:**
- `neon/migrations/0007_action_verification.sql` — one nullable column on `actions`.
- `lib/verify/decide.ts` — the pure rule. No I/O, no imports beyond types.
- `lib/verify/decide.test.ts`
- `lib/verify/website-sweep.ts` — the orchestrator: select, fetch per location, decide, write, stamp.
- `lib/verify/website-sweep.test.ts`
- `lib/repositories/verification.ts` — SQL adapter, scope-defensive in the style of `lib/repositories/applications.ts`.
- `test/integration/neon-website-verification.integration.test.ts`

**Modify:**
- `lib/workspace/templates.ts` — `ActionTemplate.verifyChecks`, set on the two website templates.
- `lib/workspace/templates.test.ts` — assert the two declare it and no other does.
- `lib/db/schema/business.ts` — the new column in the Drizzle definition.
- `test/integration/neon-schema.integration.test.ts` — migration list, journal counts, catalog census, module count.
- `app/api/cron/dispatch/route.ts` — the fourth concern.
- `app/api/cron/dispatch/route.test.ts`
- `lib/workspace/overview.ts` — `ActionOverview.verified` / `verifiedOn`, and the `verified` display phase.
- `lib/workspace/queries-pages.ts` — populate them from the existing `forActions` call.
- `lib/copy-workspace.ts` — the `verified` phase string, with a zh-TW override.
- `lib/workspace/audit.ts` and `lib/workspace/audit-labels.ts` — `action.verified`.

Why this split: the rule (`decide.ts`) is the part most likely to be got subtly wrong and must be testable with no database and no network. SQL lives in `repositories/`, matching how `applications.ts` / `measurements.ts` already divide. The sweep is the only piece that knows about all three.

---

### Task 1: Migration and schema definitions

**Files:**
- Create: `neon/migrations/0007_action_verification.sql`
- Modify: `lib/db/schema/business.ts`, `test/integration/neon-schema.integration.test.ts`

- [ ] **Step 1: Write the migration**

Migrations `0001`–`0006` are immutable. This one needs no RLS block: `actions` already carries its four-statement block from `0003_workflows.sql`, and a new column inherits it.

```sql
-- Website verifier (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
-- P3.2 built the four-event model but shipped "provider verifies applied" as a
-- seam with no caller. The sweep that fills it runs inside the existing cron
-- tick and must not refetch a customer's website every five minutes, so it
-- records when it last looked.
--
-- Nullable and deliberately NOT backfilled: null means "never attempted",
-- which is true of every existing row.
--
-- This is scheduling state on a domain table, which is a boundary smudge --
-- `actions` is otherwise about what the owner should do. Accepted because a
-- separate table for one nullable timestamp would be worse, and the column
-- doubles as operator visibility into what the sweep is doing. If `actions`
-- accumulates further sweep state, that is the signal to move it out.
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS verification_checked_at timestamptz;
```

- [ ] **Step 2: Update the other two places that encode this schema**

`db:verify` and its catalog fixture are not the only things that know the schema. P3.2 learned this at its Task 7, when the integration suite went red because migration `0006` had landed without them.

1. **`lib/db/schema/business.ts`** — add `verificationCheckedAt` to the existing `actions` table definition, following the conventions of the neighbouring nullable timestamp columns.
2. **`test/integration/neon-schema.integration.test.ts`** — add `"0007_action_verification.sql"` to the applied-migrations list, bump the journal-count assertions (two places), and update the catalog baseline.

   **Do NOT touch the `tables.length` assertion.** It is hardcoded (`expect(tables.length).toBe(37)`), but it counts Drizzle table *modules*, and `0007` adds a column to an existing table rather than a new table. It changes only when a migration creates a table — as `0006` did, taking it 36 → 37. Changing it here would make the assertion agree with a schema that has not changed.

**Predict the delta from the migration before running anything**, then confirm observation matches. For `0007` it is: **columns +1**, and tables / constraints / indexes / triggers / functions / seededRows all unchanged. If observation disagrees with that prediction, STOP — something landed that neither the plan nor you expects, which is exactly what the assertion exists to catch. Pasting the observed numbers converts a baseline guard into a description of current reality.

Note the Drizzle/migration fidelity guard that actually matters is the schema test's "exposes all final columns and constraints through typed Drizzle tables" case, which diffs against `test/integration/fixtures/legacy-final-catalog.json`. Extend that fixture too — insertions only, zero deletions.

- [ ] **Step 3: Verify**

Run: `corepack pnpm db:verify`
Expected: exit 0, `0007_action_verification.sql` in the applied list, `replay: []`, columns 417.

Run: `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-schema.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add neon/migrations/0007_action_verification.sql lib/db/schema/business.ts test/integration/neon-schema.integration.test.ts test/integration/fixtures/legacy-final-catalog.json
git commit -m "feat(verifier): add actions.verification_checked_at"
```

---

### Task 2: Templates declare what would verify them

**Files:**
- Modify: `lib/workspace/templates.ts`
- Test: `lib/workspace/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/workspace/templates.test.ts`:

```ts
import { WEBSITE_CHECK_KEYS } from "@/lib/website/checks";

describe("verifyChecks", () => {
  it("is declared by exactly the two website-backed templates", () => {
    const declared = TEMPLATES.filter((t) => t.verifyChecks?.length).map((t) => t.key).sort();
    expect(declared).toEqual(["visibility-content", "website-basics"]);
  });

  it("names only real website check keys", () => {
    // A typo here would make an action permanently unverifiable while
    // compiling and passing every other test.
    for (const template of TEMPLATES) {
      for (const key of template.verifyChecks ?? []) {
        expect(WEBSITE_CHECK_KEYS).toContain(key);
      }
    }
  });

  it("maps visibility-content to the FAQ schema check", () => {
    expect(TEMPLATES.find((t) => t.key === "visibility-content")?.verifyChecks).toEqual(["faq_schema"]);
  });

  it("maps website-basics to the three basics checks", () => {
    expect(TEMPLATES.find((t) => t.key === "website-basics")?.verifyChecks).toEqual([
      "title",
      "meta_description_50_160",
      "single_h1",
    ]);
  });
});
```

If `TEMPLATES` is not the exported name in that file, read it and use the real one — do not rename the export.

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/templates.test.ts`
Expected: FAIL — `verifyChecks` is not a property of `ActionTemplate`.

- [ ] **Step 3: Add the field**

In `lib/workspace/templates.ts`, add to the `ActionTemplate` interface after `channel`:

```ts
  /**
   * Website checks whose passing would evidence this template's work, for the
   * verifier sweep (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
   *
   * Optional because most templates are not website-backed and never will be --
   * a GBP photo pack has nothing an HTTP fetch could confirm. Absent means "not
   * verifiable", which is a permanent and correct answer, not a gap.
   *
   * Declared here rather than in the verifier so the same row says what creates
   * an action and what would prove it is done.
   */
  verifyChecks?: readonly WebsiteCheckKey[];
```

Import the type: `import type { WebsiteCheckKey } from "@/lib/website/checks";`

Then set it on the two website templates:

```ts
  // visibility-content
  verifyChecks: ["faq_schema"],
```

```ts
  // website-basics
  verifyChecks: ["title", "meta_description_50_160", "single_h1"],
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run lib/workspace/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workspace/templates.ts lib/workspace/templates.test.ts
git commit -m "feat(verifier): templates declare which website checks evidence them"
```

---

### Task 3: The pure decision rule

**Files:**
- Create: `lib/verify/decide.ts`
- Test: `lib/verify/decide.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { WebsiteChecks } from "@/lib/website/checks";
import { decideVerification } from "./decide";

function checks(entries: Record<string, boolean>): WebsiteChecks {
  const results = Object.entries(entries).map(([key, pass]) => ({ key: key as never, pass }));
  return { evaluated: results.length, passed: results.filter((r) => r.pass).length, results };
}

const THREE = ["title", "meta_description_50_160", "single_h1"] as const;

describe("decideVerification", () => {
  it("is not_verifiable when the template declares nothing", () => {
    expect(decideVerification([], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: true }) })).toBe("not_verifiable");
  });

  it("is not_verifiable when there is no prior result at all", () => {
    expect(decideVerification(["faq_schema"], { prior: null, fresh: checks({ faq_schema: true }) })).toBe("not_verifiable");
  });

  it("is not_verifiable when the prior snapshot never evaluated the key", () => {
    // Evaluated other checks but not this one -- we cannot say it was failing,
    // so we must not later claim it was fixed.
    expect(decideVerification(["faq_schema"], { prior: checks({ title: true }), fresh: checks({ faq_schema: true }) })).toBe("not_verifiable");
  });

  it("is not_verifiable when nothing was wrong to begin with", () => {
    // Every declared check already passed, so there is nothing to confirm.
    // Without this, a site that always had FAQ schema would produce a
    // `verified` row for work nobody did.
    expect(decideVerification(["faq_schema"], { prior: checks({ faq_schema: true }), fresh: checks({ faq_schema: true }) })).toBe("not_verifiable");
  });

  it("is verified when the one failing check now passes", () => {
    expect(decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: true }) })).toBe("verified");
  });

  it("is not_yet when the failing check still fails", () => {
    expect(decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: checks({ faq_schema: false }) })).toBe("not_yet");
  });

  it("verifies on the relevant subset, ignoring checks that were never broken", () => {
    // website-basics declares three, but this action existed because only the
    // meta description was wrong. Requiring all three to have failed would make
    // it permanently unverifiable; requiring all three to pass now would
    // withhold verification over a check that was never the problem.
    const prior = checks({ title: true, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: true, single_h1: true });
    expect(decideVerification(THREE, { prior: prior, fresh: fresh })).toBe("verified");
  });

  it("is not_yet when only some of the relevant checks are fixed", () => {
    const prior = checks({ title: false, meta_description_50_160: false, single_h1: true });
    const fresh = checks({ title: true, meta_description_50_160: false, single_h1: true });
    expect(decideVerification(THREE, { prior: prior, fresh: fresh })).toBe("not_yet");
  });

  it("is not_yet when the fresh fetch never evaluated a relevant check", () => {
    // An unreachable site yields evaluated: 0. That is "we could not look",
    // not "it is fixed".
    expect(decideVerification(["faq_schema"], { prior: checks({ faq_schema: false }), fresh: { evaluated: 0, passed: 0, results: [] } })).toBe("not_yet");
  });

  it("is not_yet when the fresh fetch evaluated only some of the relevant checks", () => {
    // A partial fetch is not a partial verification. This is the case a
    // refactor that special-cased `evaluated === 0` would break while every
    // other test stayed green -- the rule must stay a per-key lookup.
    const prior = checks({ title: false, meta_description_50_160: true, single_h1: false });
    const fresh = checks({ title: true });
    expect(decideVerification(THREE, { prior: prior, fresh: fresh })).toBe("not_yet");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/verify/decide.test.ts`
Expected: FAIL — cannot resolve `./decide`.

- [ ] **Step 3: Write the implementation**

```ts
import type { WebsiteCheckKey, WebsiteChecks } from "@/lib/website/checks";

/**
 * Does a fresh fetch of the owner's site evidence that this action's work
 * landed? (docs/superpowers/specs/2026-09-16-website-verifier-design.md)
 *
 * Pure on purpose: this rule decides what the product is allowed to claim it
 * confirmed, and it must be testable without a database or a network.
 *
 * - `verified`       every check that was FAILING at the action's source
 *                    snapshot now passes.
 * - `not_yet`        try again tomorrow.
 * - `not_verifiable` can never change for this action; the sweep stops asking.
 */
export type VerificationDecision = "verified" | "not_yet" | "not_verifiable";

function resultFor(checks: WebsiteChecks | null, key: WebsiteCheckKey): boolean | null {
  const hit = checks?.results.find((result) => result.key === key);
  return hit ? hit.pass : null;
}

export function decideVerification(
  verifyChecks: readonly WebsiteCheckKey[],
  // Named rather than positional: both are WebsiteChecks, so a transposition
  // would compile and silently invert every decision.
  { prior, fresh }: { prior: WebsiteChecks | null; fresh: WebsiteChecks },
): VerificationDecision {
  if (!verifyChecks.length || !prior) return "not_verifiable";

  // Only the checks that were actually broken. A template declares every check
  // that could evidence it, but an action usually exists because one of them
  // failed -- judging it on all of them would both withhold verification over a
  // check that was never the problem and, for a wholly-passing prior, confirm
  // work nobody did.
  const relevant: WebsiteCheckKey[] = [];
  for (const key of verifyChecks) {
    const before = resultFor(prior, key);
    // null means the prior scan never evaluated it, so we cannot say it was
    // failing, so we must not later claim it was fixed.
    if (before === false) relevant.push(key);
  }
  // Load-bearing, NOT an early-exit optimisation. Without it an empty
  // `relevant` makes the loop below vacuous and execution falls through to
  // `return "verified"` -- so a website nobody could reach would read as
  // confirmed. Removing this as redundant is the worst bug this function can
  // have.


  for (const key of relevant) {
    // A fresh fetch that failed yields evaluated: 0 and no results, so every
    // lookup is null -- "we could not look", not "it is fixed".
    if (resultFor(fresh, key) !== true) return "not_yet";
  }
  // The length check lives HERE, not before the loop: a vacuous loop must not
  // fall through to success, and folding it into this return makes "empty
  // relevant set" and "verified" unable to co-occur by construction.
  return relevant.length ? "verified" : "not_verifiable";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm exec vitest run lib/verify/decide.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/verify/decide.ts lib/verify/decide.test.ts
git commit -m "feat(verifier): add the pure verification decision rule"
```

---

### Task 4: Repository adapter

**Files:**
- Create: `lib/repositories/verification.ts`

No separate unit test: this file is SQL with no branching logic, covered end to end by Task 7. That matches how `lib/repositories/applications.ts` is tested.

- [ ] **Step 1: Write the repository**

Two selection methods rather than one: the batch cap is per **location**, and a single `LIMIT` on actions could return five actions all belonging to one site. Splitting also keeps each query small enough to reason about.

Read `lib/repositories/applications.ts` first — it is the direct style model, including `import 'server-only'`, the `client?: Pick<Pool,'query'>` parameter for test injection, and SQL where an id is never trusted to imply a tenant.

```ts
import 'server-only';
import type { Pool } from 'pg';
import { getPool } from '../db/client';
import type { WebsiteChecks } from '../website/checks';

export interface VerifiableLocation {
  location_id: string;
  workspace_id: string;
  website_url: string;
}

export interface VerifiableAction {
  id: string;
  workspace_id: string;
  location_id: string;
  template_key: string;
  prior_checks: WebsiteChecks | null;
}

export interface VerificationRepository {
  /**
   * Distinct locations with at least one eligible action, oldest-checked
   * first. `templateKeys` is the set that declares `verifyChecks`, passed in
   * by the caller: keeping domain tables out of the SQL layer is why
   * applications.ts reads the way it does.
   */
  dueLocations(limit: number, templateKeys: string[]): Promise<VerifiableLocation[]>;
  /** Every eligible action for these locations, with its source snapshot's checks. */
  actionsForLocations(locationIds: string[], templateKeys: string[]): Promise<VerifiableAction[]>;
  /** Stamp the attempt, whatever its outcome. */
  markChecked(actionIds: string[], nowIso: string): Promise<void>;
}

/**
 * Eligibility, shared by both selection queries so they cannot drift:
 *
 * - the template can be verified at all (the caller passes the key list)
 * - the location has a website to fetch
 * - the action has a source snapshot to read a prior result from
 * - the owner ENGAGED: exported an approved version, or has a live assertion.
 *   The four-event model's third event is "provider verifies APPLIED" --
 *   without engagement there is no claim to corroborate, and a third party's
 *   change to the site would be recorded as the owner's applied work.
 * - it is not already verified (append-only evidence, not a site monitor)
 * - the 24h throttle has expired
 */
const ELIGIBLE = `
  a.template_key = ANY($1::text[])
  AND l.website_url IS NOT NULL AND l.website_url <> ''
  AND a.source_snapshot_id IS NOT NULL
  AND (a.verification_checked_at IS NULL OR a.verification_checked_at < now() - interval '24 hours')
  AND NOT EXISTS (
    SELECT 1 FROM action_applications p
    WHERE p.action_id = a.id AND p.workspace_id = a.workspace_id
      AND p.source = 'verified' AND p.retracted_at IS NULL)
  AND (
    EXISTS (
      SELECT 1 FROM output_versions v
      WHERE v.action_id = a.id AND v.workspace_id = a.workspace_id
        AND v.first_exported_at IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM action_applications p
      WHERE p.action_id = a.id AND p.workspace_id = a.workspace_id
        AND p.source = 'owner_asserted' AND p.retracted_at IS NULL)
  )`;

export function verificationRepository(client?: Pick<Pool, 'query'>): VerificationRepository {
  const db = () => client ?? getPool();
  return {
    async dueLocations(limit, templateKeys) {
      if (!templateKeys.length) return [];
      return (await db().query<VerifiableLocation>(
        `SELECT a.location_id, a.workspace_id, l.website_url
         FROM actions a JOIN locations l ON l.id = a.location_id AND l.workspace_id = a.workspace_id
         WHERE ${ELIGIBLE}
         GROUP BY a.location_id, a.workspace_id, l.website_url
         ORDER BY min(a.verification_checked_at) ASC NULLS FIRST, a.location_id
         LIMIT $2`,
        [templateKeys, limit],
      )).rows;
    },
    async actionsForLocations(locationIds, templateKeys) {
      if (!locationIds.length || !templateKeys.length) return [];
      return (await db().query<VerifiableAction>(
        `SELECT a.id, a.workspace_id, a.location_id, a.template_key, s.website_checks AS prior_checks
         FROM actions a
         JOIN locations l ON l.id = a.location_id AND l.workspace_id = a.workspace_id
         JOIN scan_snapshots s ON s.id = a.source_snapshot_id AND s.workspace_id = a.workspace_id
         WHERE a.location_id = ANY($2::uuid[]) AND ${ELIGIBLE}`,
        [templateKeys, locationIds],
      )).rows;
    },
    async markChecked(actionIds, nowIso) {
      if (!actionIds.length) return;
      await db().query(
        `UPDATE actions SET verification_checked_at = $2 WHERE id = ANY($1::uuid[])`,
        [actionIds, nowIso],
      );
    },
  };
}
```

Two notes on the SQL:

- `actionsForLocations` binds the location ids as `$2` because `$1` is the template keys. Keep that numbering rather than tidying it — `ELIGIBLE` is shared text that references `$1`, and renumbering one caller silently breaks the other.
- `templateKeys` is a parameter rather than an import so the repository never reaches into `lib/workspace/templates.ts`. Keeping domain tables out of the SQL layer is why `applications.ts` reads the way it does, and an empty list short-circuits to `[]` rather than issuing a query that can match nothing.

- [ ] **Step 2: Verify types compile**

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/verification.ts
git commit -m "feat(verifier): add the verification repository"
```

---

### Task 5: The sweep, and wiring it into the cron tick

**Files:**
- Create: `lib/verify/website-sweep.ts`
- Test: `lib/verify/website-sweep.test.ts`
- Modify: `app/api/cron/dispatch/route.ts`, `app/api/cron/dispatch/route.test.ts`
- Modify: `lib/workspace/audit.ts`, `lib/workspace/audit-labels.ts`

- [ ] **Step 1: Register the audit event**

Add `action.verified` to the `AUDIT_EVENTS` tuple in `lib/workspace/audit.ts` and a label in `lib/workspace/audit-labels.ts`, following the shape of the existing `action.applied` entry:

- en: `"Confirmed on the website"`
- zh: `"已在網站確認"`

Run: `corepack pnpm exec vitest run lib/workspace/audit.test.ts`
Expected: PASS. If that suite has an exhaustiveness test over event names, it fails until the label exists — that is the test doing its job.

- [ ] **Step 2: Write the failing sweep test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { runWebsiteVerification } from "./website-sweep";

const html = (body: string) => `<!doctype html><html lang="en"><head><title>A shop that is long enough</title><meta name="description" content="${"d".repeat(80)}"></head><body><h1>One</h1>${body}</body></html>`;
const FAQ = `<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>`;

function repo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    dueLocations: vi.fn().mockResolvedValue([{ location_id: "loc-1", workspace_id: "ws-1", website_url: "https://example.test" }]),
    actionsForLocations: vi.fn().mockResolvedValue([
      { id: "act-1", workspace_id: "ws-1", location_id: "loc-1", template_key: "visibility-content",
        prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] } },
    ]),
    markChecked: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runWebsiteVerification", () => {
  let recorded: Array<Record<string, unknown>>;
  let fetchCalls: string[];

  beforeEach(() => {
    recorded = [];
    fetchCalls = [];
  });

  const deps = (body: string) => ({
    fetch: (async (url: string) => {
      fetchCalls.push(String(url));
      return new Response(html(body), { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch,
    record: async (row: Record<string, unknown>) => { recorded.push(row); },
  });

  it("writes one verified row when the failing check now passes", async () => {
    const r = repo();
    const result = await runWebsiteVerification(r as never, deps(FAQ), { now: new Date("2026-09-16T00:00:00Z"), limit: 5 });
    expect(result).toEqual({ locationsChecked: 1, actionsVerified: 1 });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ source: "verified", actionId: "act-1", workspaceId: "ws-1" });
  });

  it("writes nothing but still stamps when the check still fails", async () => {
    const r = repo();
    const result = await runWebsiteVerification(r as never, deps(""), { now: new Date(), limit: 5 });
    expect(result.actionsVerified).toBe(0);
    expect(recorded).toEqual([]);
    // Stamping on failure is what turns a five-minute retry into a daily one.
    expect(r.markChecked).toHaveBeenCalledWith(["act-1"], expect.any(String));
  });

  it("treats an unreachable site as not-yet, not as verified", async () => {
    const r = repo();
    const failing = { ...deps(""), fetch: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch };
    const result = await runWebsiteVerification(r as never, failing, { now: new Date(), limit: 5 });
    expect(result.actionsVerified).toBe(0);
    expect(recorded).toEqual([]);
    expect(r.markChecked).toHaveBeenCalled();
  });

  it("fetches a location once even when it has several eligible actions", async () => {
    const r = repo({
      actionsForLocations: vi.fn().mockResolvedValue([
        { id: "act-1", workspace_id: "ws-1", location_id: "loc-1", template_key: "visibility-content",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "faq_schema", pass: false }] } },
        { id: "act-2", workspace_id: "ws-1", location_id: "loc-1", template_key: "website-basics",
          prior_checks: { evaluated: 1, passed: 0, results: [{ key: "single_h1", pass: false }] } },
      ]),
    });
    await runWebsiteVerification(r as never, deps(FAQ), { now: new Date(), limit: 5 });
    // Two actions, one site: the owner's server must not be hit twice.
    expect(fetchCalls).toHaveLength(1);
  });

  it("asks for at most `limit` locations", async () => {
    const r = repo();
    await runWebsiteVerification(r as never, deps(FAQ), { now: new Date(), limit: 3 });
    expect(r.dueLocations).toHaveBeenCalledWith(3, expect.any(Array));
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `corepack pnpm exec vitest run lib/verify/website-sweep.test.ts`
Expected: FAIL — cannot resolve `./website-sweep`.

- [ ] **Step 4: Write the sweep**

```ts
import { recordApplication } from "@/lib/workspace/applications";
import type { VerificationRepository } from "@/lib/repositories/verification";
import { findTemplate, TEMPLATES, type TemplateKey } from "@/lib/workspace/templates";
import { runWebsiteChecks, type WebsiteChecks } from "@/lib/website/checks";
import { decideVerification } from "./decide";

export interface VerificationSweepDeps {
  fetch?: typeof fetch;
  /** Injected so tests assert what was written without a database. */
  record: (row: { workspaceId: string; actionId: string; source: "verified"; evidence: Record<string, unknown> }) => Promise<void>;
}

export interface VerificationSweepResult {
  locationsChecked: number;
  actionsVerified: number;
}

/** Template keys that declare verifyChecks, computed once. */
const VERIFIABLE_KEYS = TEMPLATES.filter((t) => t.verifyChecks?.length).map((t) => t.key);

/**
 * `scan_snapshots.website_checks` is jsonb, so the repository's
 * `WebsiteChecks | null` is a claim Postgres cannot enforce -- a legacy row or
 * a future writer bug could return any shape. `decideVerification` reads
 * `.results.find(...)`, which would throw on a malformed value and take down
 * the whole verification concern for the tick rather than one action.
 *
 * An unreadable prior state means we cannot establish what was failing, which
 * is exactly `not_verifiable`. Coercing to null says that honestly instead of
 * guessing or crashing.
 */
function asChecks(value: unknown): WebsiteChecks | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WebsiteChecks>;
  return Array.isArray(candidate.results) ? (candidate as WebsiteChecks) : null;
}

/**
 * Confirm that website work an owner exported or marked applied is now live
 * (docs/superpowers/specs/2026-09-16-website-verifier-design.md).
 *
 * Bounded deliberately: this is the product's first scheduled outbound traffic
 * to CUSTOMER infrastructure rather than to a provider it pays. One fetch per
 * location per tick, a hard cap on locations, and every attempt stamped so a
 * permanently broken site is retried daily rather than every five minutes.
 */
export async function runWebsiteVerification(
  repo: VerificationRepository,
  deps: VerificationSweepDeps,
  opts: { now: Date; limit: number },
): Promise<VerificationSweepResult> {
  const locations = await repo.dueLocations(opts.limit, VERIFIABLE_KEYS);
  if (!locations.length) return { locationsChecked: 0, actionsVerified: 0 };

  const actions = await repo.actionsForLocations(locations.map((l) => l.location_id), VERIFIABLE_KEYS);
  if (!actions.length) return { locationsChecked: locations.length, actionsVerified: 0 };

  // One fetch per location, in parallel. A rejected fetch becomes an empty
  // result, which decideVerification reads as "we could not look" -- never as
  // "it is fixed".
  const fetched = await Promise.allSettled(
    locations.map((location) => runWebsiteChecks(location.website_url, { fetch: deps.fetch })),
  );
  const checksByLocation = new Map<string, WebsiteChecks>();
  locations.forEach((location, index) => {
    const settled = fetched[index];
    checksByLocation.set(location.location_id, settled.status === "fulfilled" ? settled.value : { evaluated: 0, passed: 0, results: [] });
  });

  const nowIso = opts.now.toISOString();
  let actionsVerified = 0;
  for (const action of actions) {
    const template = findTemplate(action.template_key as TemplateKey);
    const fresh = checksByLocation.get(action.location_id) ?? { evaluated: 0, passed: 0, results: [] };
    const decision = decideVerification(template?.verifyChecks ?? [], { prior: asChecks(action.prior_checks), fresh });
    if (decision !== "verified") continue;
    await deps.record({
      workspaceId: action.workspace_id,
      actionId: action.id,
      source: "verified",
      evidence: {
        checked_at: nowIso,
        checks: template?.verifyChecks ?? [],
        url: locations.find((l) => l.location_id === action.location_id)?.website_url ?? null,
      },
    });
    actionsVerified += 1;
  }

  // Stamped for every action looked at, verified or not: the stamp records the
  // attempt, not the outcome.
  await repo.markChecked(actions.map((action) => action.id), nowIso);
  return { locationsChecked: locations.length, actionsVerified };
}
```

If `findTemplate` or `TEMPLATES` are named differently in `lib/workspace/templates.ts`, read the file and use the real names.

- [ ] **Step 5: Run to verify it passes**

Run: `corepack pnpm exec vitest run lib/verify/website-sweep.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire it into the cron tick**

In `app/api/cron/dispatch/route.ts`, add a fourth concern in its own try/catch, after the reconcile block and before the response. Follow the shape of the three that are already there:

```ts
  let verified = { locationsChecked: 0, actionsVerified: 0 };
  try {
    verified = await runWebsiteVerification(
      verificationRepository(),
      {
        record: async (row) => {
          await recordApplication(applicationRepository(), row);
          await recordNeonEvent({
            workspaceId: row.workspaceId, locationId: null, actorType: "system", actorId: null,
            event: "action.verified", entityType: "action", entityId: row.actionId,
            locale: null, ipHash: null, payload: { checks: row.evidence.checks },
          });
        },
      },
      { now: new Date(), limit: VERIFY_LOCATION_LIMIT },
    );
  } catch (cause) {
    logFailure("verify_website_actions", cause);
  }
```

Declare `const VERIFY_LOCATION_LIMIT = 5;` beside the existing `RECLAIM_BATCH_LIMIT`, with a comment that it bounds one tick rather than rationing throughput. Add `verified` to the JSON response object.

Check `recordNeonEvent`'s real signature before writing this — match it rather than the sketch above.

- [ ] **Step 7: Add a route test**

Add to `app/api/cron/dispatch/route.test.ts`, following its existing mocking setup: a case asserting the response body carries `verified`, and one asserting a throwing verifier does not prevent the other three concerns from reporting. That isolation is the whole reason each concern has its own try/catch.

- [ ] **Step 8: Verify**

Run: `corepack pnpm exec vitest run "app/api/cron/dispatch/route.test.ts" lib/verify`
Expected: PASS.

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/verify app/api/cron/dispatch lib/workspace/audit.ts lib/workspace/audit-labels.ts
git commit -m "feat(verifier): sweep website actions in the cron tick"
```

---

### Task 6: Surface verification in the workspace

**Files:**
- Modify: `lib/workspace/overview.ts`, `lib/workspace/queries-pages.ts`, `lib/copy-workspace.ts`
- Test: `lib/workspace/overview.test.ts`, `lib/workspace/queries-pages.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/workspace/overview.test.ts`, extend the `displayPhaseKey` base fixture with `verified: false` and add:

```ts
describe("displayPhaseKey verified", () => {
  const base = {
    capability: "Live" as const, actionState: "completed" as const, runState: null,
    approvalState: null, deliveryState: "not_requested" as const,
    measurementState: "not_eligible" as const, applied: false, verified: true,
  };

  it("is verified when the site confirmed it and no scan has judged it", () => {
    expect(displayPhaseKey(base)).toBe("verified");
  });

  it("outranks applied, because a check beats a self-report", () => {
    expect(displayPhaseKey({ ...base, applied: true })).toBe("verified");
  });

  it("outranks exported", () => {
    expect(displayPhaseKey({ ...base, deliveryState: "exported" })).toBe("verified");
  });

  it("still defers to the scan's own verdict", () => {
    expect(displayPhaseKey({ ...base, measurementState: "measured" })).toBe("measured");
  });
});
```

In `lib/workspace/queries-pages.test.ts`, add a case proving `verified` / `verifiedOn` come from `source: 'verified'` rows while `applied` / `appliedOn` still come only from `owner_asserted` — one action with each kind, asserting the two do not cross over. That separation is what Task 6 of the P3.2 plan had to fix in review; it must not regress now that both sources are used.

- [ ] **Step 2: Run to verify they fail**

Run: `corepack pnpm exec vitest run lib/workspace/overview.test.ts lib/workspace/queries-pages.test.ts`
Expected: FAIL — `verified` is not accepted by `displayPhaseKey`.

- [ ] **Step 3: Add the phase**

In `lib/copy-workspace.ts`: add `| "verified"` to `DisplayPhaseKey` immediately before `"applied"`, and `"verified",` to `DISPLAY_PHASE_KEYS` in the same position, so the declared order matches evaluation order.

Copy — **and note zh-TW needs its own override here.** Task 9 of the P3.2 plan shipped a locale inversion by assuming inheritance was safe for a string carrying the 核實/查證 verb. The same trap is live:

- `workspaceEn.phases`: `verified: "Confirmed on site"`
- `workspaceZhHK.phases`: `verified: "已在網站核實"`
- `workspaceZhTW.phases` — add a `phases` override block (it currently has none) spreading zh-HK and overriding this one key: `verified: "已在網站查證"`

In `lib/workspace/overview.ts`: add `verified: boolean;` to the `displayPhaseKey` input type (required, not optional-with-default, so every call site is compiler-checked), and one branch above the `applied` branch:

```ts
  // Above `applied`: an independent check beats the owner's own report, the
  // same order strongestBasis uses for attribution. Still below `measured`,
  // which is the scan's verdict on the effect rather than on the change.
  if (input.verified && input.measurementState !== "measured") return "verified";
  if (input.applied && input.measurementState !== "measured") return "applied";
```

Add `verified: boolean` and `verifiedOn: string | null` to `ActionOverview` beside `applied` / `appliedOn`, plus `verified?: boolean; verifiedOn?: string | null` on the context type, populated as `ctx.verified ?? false` and `ctx.verifiedOn ?? null`.

- [ ] **Step 4: Populate from the existing query**

In `lib/workspace/queries-pages.ts`'s `overviewsFor`, the `forActions` call already returns BOTH sources and currently discards `verified` rows. Build a second map beside `appliedAt`:

```ts
const verifiedAt = new Map<string, string>();
for (const row of applications) {
  if (row.source !== "verified") continue;
  if (!verifiedAt.has(row.action_id)) verifiedAt.set(row.action_id, row.asserted_at);
}
```

and thread `verified: verifiedAt.has(id), verifiedOn: verifiedAt.get(id) ?? null` into each context. Do NOT loosen the existing `owner_asserted` filter — the two maps stay separate.

- [ ] **Step 5: Verify**

Run: `corepack pnpm exec vitest run lib/workspace components tests`
Expected: PASS. Any snapshot carrying the phase list needs updating; inspect each diff and confirm the only change is the added phase. The two snapshot files `lib/agents/__snapshots__` and `lib/pocket-assistant/__snapshots__` routinely show as modified with ZERO content change (CRLF churn on Windows) — revert those.

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/workspace lib/copy-workspace.ts
git commit -m "feat(verifier): add the verified display phase and overview fields"
```

---

### Task 7: Integration test against real Postgres

**Files:**
- Create: `test/integration/neon-website-verification.integration.test.ts`

Model the fixture bootstrap on `test/integration/neon-action-applications.integration.test.ts` — copy its role creation, `applyMigrations`, `fixture_runtime` pool and `vi.stubGlobal("fetch")` transport ban verbatim rather than inventing one. Keep the `afterEach(() => vi.unstubAllGlobals())`.

- [ ] **Step 1: Write the test**

The eligibility query is the piece most likely to be quietly wrong — four conditions interact, and a mistake in any one silently changes who gets verified. Cover, against real Postgres:

1. an action with a live `owner_asserted` application is returned by `dueLocations` / `actionsForLocations`
2. an action with an exported approved version but no assertion is also returned
3. an action with neither is NOT returned
4. an action that already has a `verified` row is NOT returned (permanently excluded)
5. an action stamped one hour ago is NOT returned; one stamped 25 hours ago IS
6. `markChecked` stamps only the ids passed
7. two actions on one location produce ONE location row from `dueLocations` and two from `actionsForLocations`
8. `recordApplication` with `source: 'verified'` lands a row that `forActions` returns — that path has only ever been exercised as a type contract

Then the loop-closing case, which is the point of the whole slice:

9. seed a verified row plus a comparable snapshot pair, run `recordMeasurements`, and assert the resulting measurement is `fact_type: "Attributed"` with `attribution_basis: "verified"`. Every previous test of that branch used a hand-made row; this is the first time the four-event model is proven end to end.

Write the fixtures with the same helper style as the applications integration test (`workspace()`, `member()`, `approvedVersion()`), adding one for a snapshot carrying `website_checks`.

- [ ] **Step 2: Run it**

Run: `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-website-verification.integration.test.ts`
Expected: PASS, 10 tests. Docker must be running.

Run: `corepack pnpm test:integration`
Expected: PASS, one file and nine tests more than the current 28 / 285.

- [ ] **Step 3: Commit**

```bash
git add test/integration/neon-website-verification.integration.test.ts
git commit -m "test(verifier): prove eligibility and the verified attribution path"
```

---

### Task 8: Full verification and phase report

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md`

- [ ] **Step 1: Run every gate, recording exact output**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:integration
corepack pnpm db:verify
```

Expected: typecheck 0; lint 0 with **30 warnings, 0 errors** (any new warning is this work's and must be fixed, not recorded); test and test:integration 0 with counts above the P3.2 baselines of 316 files / 3,264 tests and 28 files / 285 tests; db:verify 0.

`build` is **expected to fail** on this Windows machine with the standing Turbopack/`radix-ui` module-resolution cascade documented in PHASE-1/2/3 test results. Record it as **blocked**, not failed, and do NOT substitute `--webpack` into the gate. Run `npx next build --webpack` separately as a labelled diagnostic that the code compiles.

- [ ] **Step 2: Append a "website verifier" section to both documents**

Match the structure and precision of the existing P3.1 and P3.2 sections. Cover baseline, what changed with file citations, exact commands with exit codes and counts, and — stated plainly — what this does **not** prove:

1. It proves the check that was failing now passes. It does **not** prove the owner applied our draft: their developer may have fixed it independently, a CMS template update may have added the markup, and no fetch distinguishes those. The copy says "verified on site" deliberately, not "verified you applied our draft".
2. Two templates are verifiable, not thirteen. GBP and Instagram verifiers need provider quota and a separate authorization (DEC-04).
3. Nothing is hosted verified. The sweep runs inside the cron that still needs `CRON_SECRET` set in a real environment and a deploy — the same outstanding step P3.1 recorded.

Also record this observation, found while reviewing Task 2 and deliberately not acted on: in `packages/scoring`, the findings `aeo.website_content_weak` and `aeo.website_meta_weak` fire on byte-identical conditions (`meta_description_len < 50`), so one is redundant. That package is vendored verbatim from upstream and CLAUDE.md forbids changing its semantics here, so it is reported rather than fixed. It matters to this slice only in that `website-basics` appears to have three independent triggers when it effectively has two.

Use **passed / failed / blocked / not run** accurately, and keep *implemented*, *locally verified* and *hosted verified* distinct.

- [ ] **Step 3: Commit**

```bash
git add docs/implementation/owner-platform-v1
git commit -m "docs(verifier): record the website verifier phase report"
```

---

## Verification Checklist

- [ ] `decideVerification` judges only the checks that were failing, so a template's un-broken checks neither withhold nor manufacture a verification
- [ ] A prior snapshot that never evaluated a key yields `not_verifiable`, never `not_yet`
- [ ] An unreachable site yields `not_yet` and writes no row
- [ ] Every attempt stamps `verification_checked_at`, so a broken site is retried daily rather than every tick
- [ ] One fetch per location per tick, whatever the action count
- [ ] Only owner-engaged actions are eligible
- [ ] An already-verified action is never re-checked
- [ ] `verified` rows never populate `applied` / `appliedOn`, and vice versa
- [ ] The `verified` display phase outranks `applied` and `exported`, and defers to `measured`
- [ ] zh-TW carries its own `verified` phase string, not zh-HK's 核實
- [ ] A measurement built from a verified row is `Attributed` with `attribution_basis: 'verified'`
