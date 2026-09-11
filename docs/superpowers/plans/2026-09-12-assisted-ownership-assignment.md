# Operated Assisted Ownership Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a merchant whose business cannot be verified through Google a real path to a workspace — they ask, a named Fimmick operator verifies independently, and an approval creates the workspace through the same checked services verified ownership uses.

**Architecture:** Zero DDL. `workspace_access_requests` keeps its six columns and answers *is this still open*; `audit_events` carries *what happened and why*, using its existing table-wide unique index on `idempotency_key` to make a terminal decision exactly-once. Two independent gates protect the operator path: an `OPERATOR_EMAILS` allowlist for identity, and a default-off `ASSISTED_ASSIGNMENT_ENABLED` flag for DEC-06.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `pg` via `lib/db/client.ts` + `lib/db/transaction.ts`, Vitest 4, Neon PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-12-assisted-ownership-assignment-design.md`

**Baseline:** branch `claude/development-continuation-b3cbc1` at `32b6501`.

---

## Conventions you must follow

Read these once. They are not optional and they are not obvious from the code.

- **Package manager is `corepack pnpm`.** There is no global pnpm. Every command below uses it.
- **Never push, never open a PR, never apply a migration.** CLAUDE.md §0.1. Commit locally and stop.
- **Run before every commit:** `corepack pnpm exec tsc --noEmit` and the task's tests. The lint baseline is **30 warnings, 0 errors** — do not add an error, and do not "fix" the 30.
- **Docker is absent on this machine.** `test:integration` and `db:verify` cannot run. Task 14's integration cases are written blind and first run in CI. That is expected, not a failure.
- **No migration in this plan.** If you find yourself writing `ALTER TABLE`, stop — `scripts/neon/catalog.ts` deep-equals columns against a frozen fixture and it will fail `db:verify`.
- **The executor pattern** in this repo is `Pick<Pool,'query'>`. A `PoolClient` satisfies it. See `lib/repositories/action-derivation.ts:18`.
- **Audit writes are best-effort everywhere except Task 9.** Read Task 9's note before you touch it.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `lib/repositories/claims.ts` *(modify)* | Two services become executor-aware | 1 |
| `lib/workspace/audit.ts` *(modify)* | Nullable workspace id; new event names | 2, 3 |
| `lib/workspace/audit-labels.ts` *(modify)* | Labels for the new events | 3 |
| `lib/workspace/assisted-assignment.ts` *(create)* | Pure decision vocabulary, validation, key construction. No database. | 4 |
| `lib/auth/operator.ts` *(create)* | Operator allowlist (pure) + `requireOperator()` (server) | 5, 6 |
| `lib/workspace/assignment-flag.ts` *(create)* | The DEC-06 enablement flag | 7 |
| `lib/repositories/access-requests.ts` *(create)* | All SQL: `listPending`, `get`, `resolve` | 8, 9 |
| `lib/security/rate-limit.ts` *(modify)* | New `access_request` bucket | 10 |
| `app/api/access-requests/route.ts` *(create)* | Owner submission | 10 |
| `app/api/ops/access-requests/[requestId]/route.ts` *(create)* | Operator decision | 11 |
| `app/[locale]/ops/access-requests/page.tsx` *(create)* | Queue | 12 |
| `app/[locale]/ops/access-requests/[requestId]/page.tsx` *(create)* | Request detail | 12 |
| `components/ops/access-request-decision.tsx` *(create)* | Decision form (client) | 12 |
| `lib/workspace/my-access-request.ts` *(create)* | Owner-scoped status derivation | 13 |
| `components/workspace/access-request-status.tsx` *(create)* | Owner status card | 13 |

---

## Task 1: Make the two assignment services executor-aware

**This is first because the whole single-transaction guarantee depends on it.** `createWorkspaceWithOwner` currently opens its *own* `withTransaction`, and `attachJob` uses `getPool().query` directly. Neither can join a caller's transaction today.

Both parameters are **optional**, so the two existing callers — `app/api/oauth/google/claim/callback/route.ts` and `lib/identity/complete-sign-in-ports.ts` — keep working unchanged.

**Files:**
- Modify: `lib/repositories/claims.ts:31-44`
- Modify: `lib/workspace/callback-queries.ts:19-26`
- Test: `lib/repositories/claims-executor.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/repositories/claims-executor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const poolQuery = vi.fn();
vi.mock("../db/client", () => ({ getPool: () => ({ query: poolQuery, connect }) }));

import { claimsRepository } from "./claims";

/** A fake transaction client: the thing a caller would hand in. */
function fakeClient() {
  const query = vi.fn(async (sql: string) => {
    if (/INSERT INTO workspaces/.test(sql)) return { rows: [{ id: "ws-1", slug: "kam-man-house" }], rowCount: 1 };
    if (/SELECT slug FROM workspaces/.test(sql)) return { rows: [], rowCount: 0 };
    if (/UPDATE audit_jobs/.test(sql)) return { rows: [{ id: "job-1" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query };
}

describe("claimsRepository executor awareness", () => {
  it("runs createWorkspaceWithOwner on a supplied client, opening no transaction of its own", async () => {
    const client = fakeClient();
    const result = await claimsRepository.createWorkspaceWithOwner(
      { ownerUserId: "u1", ownerEmail: "o@example.test", businessName: "Kam Man House", industry: null, district: null, market: "hk" },
      client,
    );
    expect(result).toEqual({ id: "ws-1", slug: "kam-man-house" });
    // The caller owns BEGIN/COMMIT: this must not check out its own connection.
    expect(connect).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
    // The advisory lock still runs, now scoped to the CALLER's transaction.
    expect(client.query.mock.calls.some(([sql]) => /pg_advisory_xact_lock/.test(String(sql)))).toBe(true);
  });

  it("runs attachJob on a supplied client", async () => {
    const client = fakeClient();
    expect(await claimsRepository.attachJob("job-1", "ws-1", client)).toBe(true);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE audit_jobs"), ["job-1", "ws-1"]);
  });

  it("still uses the pool when no client is supplied", async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: "job-1" }], rowCount: 1 });
    expect(await claimsRepository.attachJob("job-1", "ws-1")).toBe(true);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/repositories/claims-executor.test.ts`
Expected: FAIL — `createWorkspaceWithOwner` ignores the second argument and calls `connect`.

- [ ] **Step 3: Make both services executor-aware**

In `lib/repositories/claims.ts`, add `Pool` to the type imports at the top:

```ts
import type { Pool } from "pg";
```

Then replace the `createWorkspaceWithOwner` and `attachJob` methods with:

```ts
 /**
  * `db` lets a caller run this inside its own transaction (the operator
  * assignment path). Omitted, it opens its own, which is what the OAuth claim
  * callback and the sign-in completion port have always done.
  *
  * Nesting is safe and slightly stronger: pg_advisory_xact_lock is scoped to
  * the surrounding transaction, so when a caller supplies one the slug lock is
  * held until THEIR commit rather than released early.
  */
 async createWorkspaceWithOwner(input:OwnerWorkspaceInput, db?:Pick<Pool,"query">):Promise<{id:string;slug:string}> {
  const run = async (client:Pick<Pool,"query">) => {
   const base=slugify(input.businessName??"workspace");
   // Serialize the slug namespace; the persisted unique index is the final guard.
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workspace-slug:${base}`]);
   const slug=await uniqueWorkspaceSlug(client,base);
   const row=(await client.query<{id:string;slug:string}>("INSERT INTO workspaces(business_name,industry,district,market,slug) VALUES($1,$2,$3,$4,$5) RETURNING id,slug",[input.businessName,input.industry,input.district,input.market==="tw"?"tw":"hk",slug])).rows[0];
   await client.query("INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'owner',now())",[row.id,input.ownerUserId,input.ownerEmail]);
   return row;
  };
  return db ? run(db) : withTransaction(run);
 },
 /** False is a lost claim race; database failures remain errors. */
 async attachJob(jobId:string,workspaceId:string,db:Pick<Pool,"query">=getPool()):Promise<boolean> {
  return Boolean((await db.query("UPDATE audit_jobs SET workspace_id=$2 WHERE id=$1 AND workspace_id IS NULL RETURNING id",[jobId,workspaceId])).rows.length);
 },
```

- [ ] **Step 4: Pass the executor through the workspace-layer wrappers**

In `lib/workspace/callback-queries.ts`, add the type import at the top:

```ts
import type { Pool } from "pg";
```

and replace lines 19-26:

```ts
export async function createWorkspaceWithOwner(input:OwnerWorkspaceInput,db?:Pick<Pool,"query">): Promise<{id:string;slug:string}> {
 return claimsRepository.createWorkspaceWithOwner(input,db);
}

/** False is a lost claim race; database failures remain errors. */
export async function attachJobToWorkspace(jobId:string,workspaceId:string,db?:Pick<Pool,"query">): Promise<boolean> {
 return db ? claimsRepository.attachJob(jobId,workspaceId,db) : claimsRepository.attachJob(jobId,workspaceId);
}
```

- [ ] **Step 5: Run the new test and the existing claim suites**

Run: `corepack pnpm exec vitest run lib/repositories/claims-executor.test.ts lib/workspace/claim.test.ts lib/workspace/callback-queries.test.ts "app/api/oauth/google/claim/callback/route.test.ts"`
Expected: PASS, all files. The existing callers pass no executor and must be unaffected.

- [ ] **Step 6: Typecheck and commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/repositories/claims.ts lib/repositories/claims-executor.test.ts lib/workspace/callback-queries.ts
git commit -m "refactor(P2.4): let the assignment services join a caller's transaction"
```

---

## Task 2: Let an audit event carry no workspace

A request that has not been assigned yet has no workspace. `audit_events.workspace_id` is already nullable in SQL (`neon/migrations/0002_business.sql:114`); only the TypeScript writer requires it.

**Files:**
- Modify: `lib/workspace/audit.ts:32`
- Test: `lib/workspace/audit.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `lib/workspace/audit.test.ts`:

```ts
describe("pre-assignment events", () => {
  it("accepts a null workspace id, because a request has no workspace yet", async () => {
    await expect(
      recordNeonEvent({ workspaceId: null, actorType: "user", event: "action.updated" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the typecheck to verify it fails**

Run: `corepack pnpm exec tsc --noEmit`
Expected: FAIL — `Type 'null' is not assignable to type 'string'` on `workspaceId`. (Vitest does not typecheck, so `tsc` is the gate that proves this test is meaningful.)

- [ ] **Step 3: Widen the type**

In `lib/workspace/audit.ts`, change the `AuditEventInput` field:

```ts
export interface AuditEventInput {
  /**
   * Null before assignment: a workspace_access_request exists before any
   * workspace does. The SQL column has always been nullable; only this type
   * required one. Widening is source-compatible -- every existing caller
   * passes a string.
   */
  workspaceId: string | null;
```

- [ ] **Step 4: Run test and typecheck to verify they pass**

Run: `corepack pnpm exec vitest run lib/workspace/audit.test.ts && corepack pnpm exec tsc --noEmit`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/workspace/audit.ts lib/workspace/audit.test.ts
git commit -m "feat(P2.4): let an audit event record something that has no workspace yet"
```

---

## Task 3: Add the decision vocabulary to the audit ledger

`AUDIT_EVENTS` is compile-enforced, and `lib/workspace/audit.test.ts` already asserts every event has a label — so a missing label fails the suite without you adding a test for it.

**Files:**
- Modify: `lib/workspace/audit.ts:11-16`
- Modify: `lib/workspace/audit-labels.ts`

- [ ] **Step 1: Add the event names**

In `lib/workspace/audit.ts`, extend the `AUDIT_EVENTS` tuple (keep `as const`):

```ts
  "brand.updated", "asset.uploaded", "asset.rights_confirmed", "assistant.run", "consent.public_evidence",
  "fix_pack.reviewed",
  "access_request.submitted", "access_request.reviewed", "access_request.information_requested",
  "access_request.approved", "access_request.rejected", "workspace.assigned",
```

- [ ] **Step 2: Add the labels**

In `lib/workspace/audit-labels.ts`, after the `fix_pack.reviewed` entry:

```ts
  "access_request.submitted": { en: "Access request submitted", zh: "已提交存取申請" },
  "access_request.reviewed": { en: "Access request opened by an operator", zh: "營運人員已開啟申請" },
  "access_request.information_requested": { en: "More information requested", zh: "已要求補充資料" },
  "access_request.approved": { en: "Access request approved", zh: "存取申請已批准" },
  "access_request.rejected": { en: "Access request rejected", zh: "存取申請已拒絕" },
  // Distinct from workspace.claimed, which is the Google-attested path. Merging
  // them would make the ledger unable to tell an attested claim from an
  // operator assignment.
  "workspace.assigned": { en: "Workspace assigned by an operator", zh: "營運人員已指派工作台" },
```

- [ ] **Step 3: Run the vocabulary tests**

Run: `corepack pnpm exec vitest run lib/workspace/audit.test.ts`
Expected: PASS — including the existing "gives every event a label" case, which now covers the six new names.

- [ ] **Step 4: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/workspace/audit.ts lib/workspace/audit-labels.ts
git commit -m "feat(P2.4): add the assisted-assignment decision vocabulary"
```

---

## Task 4: The pure decision module

No database. This mirrors the boundary `lib/workspace/access-request.ts` documents for itself: "Pure decision plus an injected write … this module touches no database and so cannot widen its own reach."

**Files:**
- Create: `lib/workspace/assisted-assignment.ts`
- Test: `lib/workspace/assisted-assignment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/workspace/assisted-assignment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ASSISTED_DECISIONS,
  decisionEvent,
  decisionIsTerminal,
  decisionIdempotencyKey,
  parseVerification,
  type AssistedDecision,
} from "./assisted-assignment";

describe("decision vocabulary", () => {
  it("lists exactly the three outcomes", () => {
    expect([...ASSISTED_DECISIONS].sort()).toEqual(["approved", "needs_information", "rejected"]);
  });

  it.each([
    ["approved", true],
    ["rejected", true],
    ["needs_information", false],
  ] as Array<[AssistedDecision, boolean]>)("%s terminality is %s", (decision, terminal) => {
    expect(decisionIsTerminal(decision)).toBe(terminal);
  });

  it("maps each decision to its audit event name", () => {
    expect(decisionEvent("approved")).toBe("access_request.approved");
    expect(decisionEvent("rejected")).toBe("access_request.rejected");
    expect(decisionEvent("needs_information")).toBe("access_request.information_requested");
  });
});

describe("decisionIdempotencyKey", () => {
  // One key for either terminal outcome: at most one terminal decision per
  // request can ever exist, so approving after rejecting collides and loses.
  it("is the same key for approved and rejected", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(decisionIdempotencyKey(id, "approved")).toBe(`access_request:${id}:decision`);
    expect(decisionIdempotencyKey(id, "rejected")).toBe(decisionIdempotencyKey(id, "approved"));
  });

  it("is null for a non-terminal decision, so it can be repeated", () => {
    expect(decisionIdempotencyKey("33333333-3333-4333-8333-333333333333", "needs_information")).toBeNull();
  });

  it("is globally unique, because the index is table-wide", () => {
    expect(decisionIdempotencyKey("a", "approved")).not.toBe(decisionIdempotencyKey("b", "approved"));
  });
});

describe("parseVerification", () => {
  it("accepts what the operator actually checked", () => {
    expect(parseVerification({ method: " Business registration BR12345678 ", verified_by: " Ada Wong " }))
      .toEqual({ method: "Business registration BR12345678", verified_by: "Ada Wong" });
  });

  it.each([
    ["missing method", { verified_by: "Ada Wong" }],
    ["blank method", { method: "   ", verified_by: "Ada Wong" }],
    ["missing verifier", { method: "BR12345678" }],
    ["blank verifier", { method: "BR12345678", verified_by: "" }],
    ["not an object", "BR12345678"],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(parseVerification(input)).toBeNull();
  });

  it("bounds each field so one request cannot write an essay into the ledger", () => {
    expect(parseVerification({ method: "x".repeat(501), verified_by: "Ada" })).toBeNull();
    expect(parseVerification({ method: "x".repeat(500), verified_by: "Ada" })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/assisted-assignment.test.ts`
Expected: FAIL — `Cannot find module './assisted-assignment'`.

- [ ] **Step 3: Write the module**

Create `lib/workspace/assisted-assignment.ts`:

```ts
import type { AuditEvent } from "./audit";

/**
 * Assisted ownership assignment (Phase 2 backlog items 19-23), the path for a
 * merchant whose business cannot be verified through Google.
 *
 * Pure: no database, no environment, no session. The boundary is deliberate and
 * matches lib/workspace/access-request.ts -- a module that cannot reach the
 * database cannot widen its own reach.
 */
export const ASSISTED_DECISIONS = ["approved", "rejected", "needs_information"] as const;
export type AssistedDecision = (typeof ASSISTED_DECISIONS)[number];

export function isAssistedDecision(value: unknown): value is AssistedDecision {
  return typeof value === "string" && (ASSISTED_DECISIONS as readonly string[]).includes(value);
}

/**
 * Only approved and rejected close a request. "Needs information" deliberately
 * leaves resolved_at null, so the request stays in the queue and stays
 * answerable -- which is the honest reading of asking someone a question.
 */
export function decisionIsTerminal(decision: AssistedDecision): boolean {
  return decision === "approved" || decision === "rejected";
}

export function decisionEvent(decision: AssistedDecision): AuditEvent {
  if (decision === "approved") return "access_request.approved";
  if (decision === "rejected") return "access_request.rejected";
  return "access_request.information_requested";
}

/**
 * ONE key for either terminal outcome, so at most one terminal decision per
 * request can ever exist: a second approve, or a reject after an approve,
 * collides on audit_events_idempotency_key_idx and loses.
 *
 * That index is table-wide and is NOT declared NULLS NOT DISTINCT, so a null
 * key is always insertable -- which is why non-terminal events carry none and
 * can be repeated.
 */
export function decisionIdempotencyKey(requestId: string, decision: AssistedDecision): string | null {
  return decisionIsTerminal(decision) ? `access_request:${requestId}:decision` : null;
}

export interface Verification {
  method: string;
  verified_by: string;
}

const MAX_FIELD = 500;

/**
 * What the reviewer records: what independent control or authority they
 * verified, and who verified it. Free text on purpose -- enumerating accepted
 * methods would make this repository assert a verification policy that DEC-06
 * says does not exist yet. The operator names what they actually checked.
 */
export function parseVerification(input: unknown): Verification | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const method = typeof record.method === "string" ? record.method.trim() : "";
  const verifiedBy = typeof record.verified_by === "string" ? record.verified_by.trim() : "";
  if (!method || !verifiedBy) return null;
  if (method.length > MAX_FIELD || verifiedBy.length > MAX_FIELD) return null;
  return { method, verified_by: verifiedBy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run lib/workspace/assisted-assignment.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/workspace/assisted-assignment.ts lib/workspace/assisted-assignment.test.ts
git commit -m "feat(P2.4): the pure assisted-assignment decision module"
```

---

## Task 5: The operator allowlist (pure half)

New file beside `lib/auth/staff.ts`. **Do not modify `staff.ts`** — item 23 forbids it, and the ported report-access layer compiles against its fail-closed stub.

**Files:**
- Create: `lib/auth/operator.ts`
- Test: `lib/auth/operator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/operator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedOperatorEmail, normalizeOperatorEmail } from "./operator";

describe("normalizeOperatorEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeOperatorEmail("  Ada.Wong@Fimmick.COM ")).toBe("ada.wong@fimmick.com");
  });
});

describe("isAllowedOperatorEmail", () => {
  const allowlist = "ada.wong@fimmick.com, Bo.Chan@fimmick.com";

  it("accepts a listed address regardless of case or padding", () => {
    expect(isAllowedOperatorEmail("ADA.WONG@fimmick.com", allowlist)).toBe(true);
    expect(isAllowedOperatorEmail("  bo.chan@fimmick.com  ", allowlist)).toBe(true);
  });

  it("refuses an address that is not listed", () => {
    expect(isAllowedOperatorEmail("someone@example.test", allowlist)).toBe(false);
  });

  // Fail closed: an unset or empty allowlist must grant nobody, which is also
  // the shipped default.
  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["separators only", " , , "],
  ])("grants nobody when the allowlist is %s", (_label, list) => {
    expect(isAllowedOperatorEmail("ada.wong@fimmick.com", list)).toBe(false);
  });

  it.each([
    ["empty email", ""],
    ["whitespace email", "   "],
  ])("refuses an %s", (_label, email) => {
    expect(isAllowedOperatorEmail(email, allowlist)).toBe(false);
  });

  it("splits on commas, semicolons and whitespace", () => {
    expect(isAllowedOperatorEmail("bo.chan@fimmick.com", "ada@x.test;bo.chan@fimmick.com")).toBe(true);
    expect(isAllowedOperatorEmail("bo.chan@fimmick.com", "ada@x.test bo.chan@fimmick.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/auth/operator.test.ts`
Expected: FAIL — `Cannot find module './operator'`.

- [ ] **Step 3: Write the pure half**

Create `lib/auth/operator.ts`:

```ts
/**
 * Operator identity for the assisted-assignment queue (Phase 2 item 23).
 *
 * Deliberately a NEW module beside lib/auth/staff.ts rather than a change to
 * it. staff.ts is the legacy Fimmick console's identity, which stays in the
 * sme-scanner deployment and fails closed here by design; this is a different
 * trust model with a different allowlist, and merging them would make one
 * variable govern two consoles.
 *
 * app_users has no role column (neon/migrations/0001_identity.sql), so the role
 * lives in configuration, not schema.
 */
export function normalizeOperatorEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Fails closed on an absent, empty or separator-only allowlist, which is the
 * shipped default: OPERATOR_EMAILS is not set in .env.example.
 */
export function isAllowedOperatorEmail(email: string, allowlist = process.env.OPERATOR_EMAILS): boolean {
  const candidate = normalizeOperatorEmail(email ?? "");
  if (!candidate) return false;
  const allowed = (allowlist ?? "")
    .split(/[,;\s]+/)
    .map(normalizeOperatorEmail)
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(candidate);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run lib/auth/operator.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/auth/operator.ts lib/auth/operator.test.ts
git commit -m "feat(P2.4): the operator allowlist, failing closed when unset"
```

---

## Task 6: `requireOperator()` — the server half

**Files:**
- Modify: `lib/auth/operator.ts`
- Test: `lib/auth/operator-session.test.ts` (create — a separate file because it mocks the session module)

- [ ] **Step 1: Write the failing test**

Create `lib/auth/operator-session.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const poolQuery = vi.fn();
vi.mock("@/lib/auth", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: poolQuery }) }));

import { resolveOperator } from "./operator";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

function signedIn(email = "ada.wong@fimmick.com") {
  getUser.mockResolvedValue({ id: "session-user", email, verified: true });
}

describe("resolveOperator", () => {
  it("returns the operator with the app_users id the FK needs", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn();
    poolQuery.mockResolvedValue({ rows: [{ id: "app-user-1" }], rowCount: 1 });
    expect(await resolveOperator()).toEqual({ userId: "app-user-1", email: "ada.wong@fimmick.com" });
  });

  it("refuses when there is no session", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    getUser.mockResolvedValue(null);
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not on the allowlist", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn("merchant@example.test");
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("refuses everyone when the allowlist is unset", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "");
    signedIn();
    expect(await resolveOperator()).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });

  // resolved_by_staff_user_id is an FK to app_users(id): an allowlisted address
  // with no row cannot be recorded as the decider, so it is not an operator.
  it("refuses when the address has no app_users row", async () => {
    vi.stubEnv("OPERATOR_EMAILS", "ada.wong@fimmick.com");
    signedIn();
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await resolveOperator()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/auth/operator-session.test.ts`
Expected: FAIL — `resolveOperator` is not exported.

- [ ] **Step 3: Add the server half**

At the **top** of `lib/auth/operator.ts` (imports must precede other statements), add:

```ts
import "server-only";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPool } from "@/lib/db/client";
```

and append to the end of the file:

```ts
export interface OperatorIdentity {
  /** app_users.id -- required by the FK on workspace_access_requests.resolved_by_staff_user_id. */
  userId: string;
  email: string;
}

/**
 * Returns the operator, or null. Fails closed at every step: no session, not on
 * the allowlist, allowlist unset, or no app_users row for the address.
 *
 * Being an operator grants nothing else. It is not a membership: an operator
 * cannot open /owner/* and holds no workspace role.
 */
export async function resolveOperator(): Promise<OperatorIdentity | null> {
  const user = await getUser();
  if (!user?.email) return null;
  const email = normalizeOperatorEmail(user.email);
  if (!isAllowedOperatorEmail(email)) return null;
  const row = (
    await getPool().query<{ id: string }>("SELECT id FROM app_users WHERE lower(email)=$1 LIMIT 1", [email])
  ).rows[0];
  return row ? { userId: row.id, email } : null;
}

/**
 * Page guard. 404 rather than a redirect to sign-in: the operator surface is
 * unlisted, and a redirect would confirm the route exists to anyone guessing
 * the URL.
 */
export async function requireOperator(): Promise<OperatorIdentity> {
  const operator = await resolveOperator();
  if (!operator) notFound();
  return operator;
}
```

- [ ] **Step 4: Run all three auth test files**

Run: `corepack pnpm exec vitest run lib/auth/operator.test.ts lib/auth/operator-session.test.ts lib/auth/staff.test.ts`
Expected: PASS all three. `staff.test.ts` must be untouched and still green.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/auth/operator.ts lib/auth/operator-session.test.ts
git commit -m "feat(P2.4): requireOperator, failing closed like requireMembership"
```

---

## Task 7: The DEC-06 enablement flag

**Files:**
- Create: `lib/workspace/assignment-flag.ts`
- Modify: `.env.example`
- Test: `lib/workspace/assignment-flag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/workspace/assignment-flag.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistedAssignmentEnabled } from "./assignment-flag";

afterEach(() => vi.unstubAllEnvs());

describe("assistedAssignmentEnabled", () => {
  it("is on only for exactly \"true\"", () => {
    vi.stubEnv("ASSISTED_ASSIGNMENT_ENABLED", "true");
    expect(assistedAssignmentEnabled()).toBe(true);
  });

  // Same shape as WORKSPACE_CLAIM_VIA_OAUTH_ENABLED: anything else is off, so a
  // typo or a truthy-looking value cannot enable real ownership assignment.
  it.each([["empty", ""], ["1", "1"], ["yes", "yes"], ["TRUE", "TRUE"], ["true with padding", "true "]])(
    "is off when %s",
    (_label, value) => {
      vi.stubEnv("ASSISTED_ASSIGNMENT_ENABLED", value);
      expect(assistedAssignmentEnabled()).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/assignment-flag.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the flag**

Create `lib/workspace/assignment-flag.ts`:

```ts
/**
 * DEC-06 gate (Phase 2 item 19). DEC-06 -- assisted-verification procedure,
 * operator authorization and queue ownership -- is still pending, and its
 * recorded safe default is to build the protected request, status and queue
 * code but NOT to enable real approvals.
 *
 * So the queue is reachable by an allowlisted operator with this off; only the
 * decision route is gated. Exactly "true", matching
 * WORKSPACE_CLAIM_VIA_OAUTH_ENABLED, so no truthy-looking typo can enable real
 * ownership assignment.
 */
export function assistedAssignmentEnabled(): boolean {
  return process.env.ASSISTED_ASSIGNMENT_ENABLED === "true";
}
```

- [ ] **Step 4: Document both variables**

In `.env.example`, directly below the `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` line:

```bash
# Assisted ownership assignment (Phase 2 P2.4). Both ship unset, which is off.
OPERATOR_EMAILS=                                               # comma-separated; unset means nobody can open the operator queue
ASSISTED_ASSIGNMENT_ENABLED=false                              # exactly "true" opens the decision route; gated on DEC-06
```

- [ ] **Step 5: Run test and the env guard**

Run: `corepack pnpm exec vitest run lib/workspace/assignment-flag.test.ts tests/launch-check.test.ts`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/workspace/assignment-flag.ts lib/workspace/assignment-flag.test.ts .env.example
git commit -m "feat(P2.4): a default-off DEC-06 gate for real approvals"
```

---

## Task 8: Reading the queue

**Files:**
- Create: `lib/repositories/access-requests.ts`
- Test: `lib/repositories/access-requests.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/repositories/access-requests.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const poolQuery = vi.fn();
vi.mock("../db/client", () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock("../db/transaction", () => ({ withTransaction: vi.fn() }));
vi.mock("./claims", () => ({ claimsRepository: { createWorkspaceWithOwner: vi.fn(), attachJob: vi.fn() } }));

import { accessRequestRepository } from "./access-requests";

beforeEach(() => vi.resetAllMocks());

describe("listPending", () => {
  it("reads only unresolved requests, newest first", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await accessRequestRepository().listPending(25);
    const [sql, params] = poolQuery.mock.calls[0];
    // The partial index is ON (requested_at DESC) WHERE resolved_at IS NULL;
    // both halves must appear or it is not the index being used.
    expect(sql).toContain("r.resolved_at IS NULL");
    expect(sql).toContain("ORDER BY r.requested_at DESC");
    expect(params).toEqual([25]);
  });

  it("returns the job evidence an operator needs to verify independently", async () => {
    poolQuery.mockResolvedValue({
      rows: [{
        id: "req-1", job_id: "job-1", user_id: "u-1", requested_at: "2026-09-10T02:00:00Z",
        requester_email: "owner@example.test", business_name: "Kam Man House", industry: null, district: null, region: "hk",
        place_id: null, share_slug: "abc123", job_workspace_id: null,
      }],
      rowCount: 1,
    });
    const [row] = await accessRequestRepository().listPending(25);
    expect(row.business_name).toBe("Kam Man House");
    // place_id null is the manual-entry case this whole path exists for.
    expect(row.place_id).toBeNull();
    expect(row.job_workspace_id).toBeNull();
  });
});

describe("get", () => {
  it("returns null for an unknown request", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await accessRequestRepository().get("req-missing")).toBeNull();
  });

  it("carries the decision events alongside the row", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ id: "req-1", job_id: "job-1", user_id: "u-1", requested_at: "2026-09-10T02:00:00Z", resolved_at: null, resolved_by_staff_user_id: null, requester_email: "o@example.test", business_name: "Kam Man House", industry: null, district: null, region: "hk", place_id: null, share_slug: "abc123", job_workspace_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ event: "access_request.submitted", payload: { intent: "I run this shop" }, actor_id: "u-1", created_at: "2026-09-10T02:00:00Z" }], rowCount: 1 });
    const result = await accessRequestRepository().get("req-1");
    expect(result?.request.id).toBe("req-1");
    expect(result?.events[0].event).toBe("access_request.submitted");
    const [eventsSql] = poolQuery.mock.calls[1];
    expect(eventsSql).toContain("entity_type='workspace_access_request'");
  });
});

describe("openRequestFor", () => {
  it("finds the one open request the unique partial index allows", async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: "req-1" }], rowCount: 1 });
    expect(await accessRequestRepository().openRequestFor("job-1", "u-1")).toEqual({ id: "req-1" });
    const [sql] = poolQuery.mock.calls[0];
    expect(sql).toContain("resolved_at IS NULL");
  });

  it("returns null when there is none", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await accessRequestRepository().openRequestFor("job-1", "u-1")).toBeNull();
  });
});

describe("latestForUser", () => {
  it("scopes to the caller, so another person's request is never visible", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await accessRequestRepository().latestForUser("u-1");
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("r.user_id = $1");
    expect(params).toEqual(["u-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/repositories/access-requests.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the read half**

Create `lib/repositories/access-requests.ts`:

```ts
import "server-only";
import type { Pool } from "pg";
import { getPool } from "../db/client";

/**
 * Assisted ownership assignment reads and writes (Phase 2 items 20-23).
 *
 * NO schema change: workspace_access_requests keeps its six columns and answers
 * "is this still open"; audit_events answers "what happened and why". See
 * docs/superpowers/specs/2026-09-12-assisted-ownership-assignment-design.md.
 */
export interface PendingAccessRequest {
  id: string;
  job_id: string;
  user_id: string;
  requested_at: string;
  requester_email: string | null;
  business_name: string | null;
  /** Carried so an assigned workspace matches what the OAuth claim path creates. */
  industry: string | null;
  district: string | null;
  region: string;
  /** Null is the manual-entry case this whole path exists for. */
  place_id: string | null;
  share_slug: string;
  /** Non-null means the job was claimed while this sat in the queue. */
  job_workspace_id: string | null;
}

export interface AccessRequestRow extends PendingAccessRequest {
  resolved_at: string | null;
  resolved_by_staff_user_id: string | null;
}

export interface AccessRequestEvent {
  event: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

const SELECT_COLUMNS = `r.id, r.job_id, r.user_id, r.requested_at::text AS requested_at,
    r.resolved_at::text AS resolved_at, r.resolved_by_staff_user_id,
    u.email AS requester_email,
    j.business_name, j.industry, j.district, j.region, j.place_id, j.share_slug, j.workspace_id AS job_workspace_id`;

const EVENTS_SQL = `SELECT event, payload, actor_id, created_at::text AS created_at
       FROM audit_events
      WHERE entity_type='workspace_access_request' AND entity_id = $1
      ORDER BY created_at ASC, id ASC`;

export function accessRequestRepository(db: Pick<Pool, "query"> = getPool()) {
  async function eventsFor(requestId: string): Promise<AccessRequestEvent[]> {
    return (await db.query<AccessRequestEvent>(EVENTS_SQL, [requestId])).rows;
  }

  return {
    /** Uses workspace_access_requests_pending_idx ON (requested_at DESC) WHERE resolved_at IS NULL. */
    async listPending(limit: number): Promise<PendingAccessRequest[]> {
      return (
        await db.query<PendingAccessRequest>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.resolved_at IS NULL
      ORDER BY r.requested_at DESC
      LIMIT $1`,
          [limit],
        )
      ).rows;
    },

    async get(requestId: string): Promise<{ request: AccessRequestRow; events: AccessRequestEvent[] } | null> {
      const request = (
        await db.query<AccessRequestRow>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.id = $1`,
          [requestId],
        )
      ).rows[0];
      if (!request) return null;
      return { request, events: await eventsFor(request.id) };
    },

    /**
     * The open request for this job and user, if any.
     * `workspace_access_requests_open_idx` is UNIQUE (job_id,user_id) WHERE
     * resolved_at IS NULL, so there is at most one and the database -- not this
     * code -- is what guarantees it.
     */
    async openRequestFor(jobId: string, userId: string): Promise<{ id: string } | null> {
      return (
        await db.query<{ id: string }>(
          "SELECT id FROM workspace_access_requests WHERE job_id=$1 AND user_id=$2 AND resolved_at IS NULL",
          [jobId, userId],
        )
      ).rows[0] ?? null;
    },

    /**
     * The caller's own most recent request. Scoped by user_id, so another
     * person's request is never visible (item 22).
     */
    async latestForUser(userId: string): Promise<{ request: AccessRequestRow; events: AccessRequestEvent[] } | null> {
      const request = (
        await db.query<AccessRequestRow>(
          `SELECT ${SELECT_COLUMNS}
       FROM workspace_access_requests r
       JOIN audit_jobs j ON j.id = r.job_id
       LEFT JOIN app_users u ON u.id = r.user_id
      WHERE r.user_id = $1
      ORDER BY r.requested_at DESC
      LIMIT 1`,
          [userId],
        )
      ).rows[0];
      if (!request) return null;
      return { request, events: await eventsFor(request.id) };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run lib/repositories/access-requests.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/repositories/access-requests.ts lib/repositories/access-requests.test.ts
git commit -m "feat(P2.4): read the access-request queue nothing has ever read"
```

---

## Task 9: `resolve()` — the one transaction

**Read this before writing code.** Everywhere else in this repository the audit write is best-effort: "a failed audit insert never undoes the mutation it describes". **Here it is the opposite**, and the reason must be in the code. The decision event *is* the decision, and it carries the uniqueness (`audit_events_idempotency_key_idx`) that makes the decision exactly-once. If it cannot be written, the assignment must not happen.

Order inside the transaction: **claim the key first**, then create the workspace, attach the job, close the row, emit `workspace.assigned`. Claiming first means a concurrent second approver loses before any workspace is created.

**Files:**
- Modify: `lib/repositories/access-requests.ts`
- Test: `lib/repositories/access-requests-resolve.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `lib/repositories/access-requests-resolve.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const createWorkspaceWithOwner = vi.fn();
const attachJob = vi.fn();
vi.mock("./claims", () => ({ claimsRepository: { createWorkspaceWithOwner, attachJob } }));

const client = { query: vi.fn() };
vi.mock("../db/transaction", () => ({
  withTransaction: (run: (c: unknown) => Promise<unknown>) => run(client),
}));
vi.mock("../db/client", () => ({ getPool: () => ({ query: vi.fn() }) }));

import { resolveAccessRequest } from "./access-requests";

const REQUEST = {
  id: "33333333-3333-4333-8333-333333333333",
  job_id: "job-1",
  user_id: "u-1",
  requester_email: "owner@example.test",
  business_name: "Kam Man House",
  region: "hk",
  industry: null as string | null,
  district: null as string | null,
};

beforeEach(() => {
  vi.resetAllMocks();
  client.query.mockResolvedValue({ rows: [], rowCount: 1 });
  createWorkspaceWithOwner.mockResolvedValue({ id: "ws-1", slug: "kam-man-house" });
  attachJob.mockResolvedValue(true);
});

function approve(over: Record<string, unknown> = {}) {
  return resolveAccessRequest({
    request: REQUEST,
    decision: "approved",
    reason: "Registration checked",
    verification: { method: "BR12345678", verified_by: "Ada Wong" },
    operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    ...over,
  });
}

describe("resolveAccessRequest", () => {
  it("claims the idempotency key BEFORE creating anything", async () => {
    await approve();
    const firstSql = String(client.query.mock.calls[0][0]);
    expect(firstSql).toContain("INSERT INTO audit_events");
    expect(client.query.mock.calls[0][1]).toContain(`access_request:${REQUEST.id}:decision`);
    // Order is the guarantee: a concurrent approver must lose before a
    // workspace exists, not after. The key insert is call 0, the workspace
    // creation happens only afterwards.
    expect(createWorkspaceWithOwner.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.query.mock.invocationCallOrder[0],
    );
  });

  it("creates the workspace and attaches the job on the SAME client", async () => {
    const result = await approve();
    expect(result).toEqual({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
    expect(createWorkspaceWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "u-1", ownerEmail: "owner@example.test", market: "hk" }),
      client,
    );
    expect(attachJob).toHaveBeenCalledWith("job-1", "ws-1", client);
  });

  it("closes the row and emits workspace.assigned", async () => {
    await approve();
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s) && /resolved_at=now\(\)/.test(s))).toBe(true);
    expect(client.query.mock.calls.some(([, params]) => Array.isArray(params) && params.includes("workspace.assigned"))).toBe(true);
  });

  it("refuses when the job was claimed while the request sat in the queue", async () => {
    attachJob.mockResolvedValue(false);
    await expect(approve()).rejects.toThrow("already_claimed");
  });

  it("creates no workspace when rejecting, and still closes the row", async () => {
    const result = await resolveAccessRequest({
      request: REQUEST,
      decision: "rejected",
      reason: "Could not verify the registration",
      verification: { method: "BR lookup", verified_by: "Ada Wong" },
      operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    });
    expect(result).toEqual({ ok: true, workspaceId: null, slug: null });
    expect(createWorkspaceWithOwner).not.toHaveBeenCalled();
    expect(attachJob).not.toHaveBeenCalled();
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s))).toBe(true);
  });

  it("leaves the row open when only asking for information", async () => {
    const result = await resolveAccessRequest({
      request: REQUEST,
      decision: "needs_information",
      reason: "Please send the registration number",
      verification: null,
      operator: { userId: "op-1", email: "ada.wong@fimmick.com" },
    });
    expect(result).toEqual({ ok: true, workspaceId: null, slug: null });
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((s) => /UPDATE workspace_access_requests/.test(s))).toBe(false);
    // Non-terminal events carry no key, so the operator can ask twice.
    expect(client.query.mock.calls[0][1]).toContain(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/repositories/access-requests-resolve.test.ts`
Expected: FAIL — `resolveAccessRequest` is not exported.

- [ ] **Step 3: Write `resolveAccessRequest`**

In `lib/repositories/access-requests.ts`, add these imports below the existing ones:

```ts
import { withTransaction } from "../db/transaction";
import { claimsRepository } from "./claims";
import {
  decisionEvent,
  decisionIdempotencyKey,
  decisionIsTerminal,
  type AssistedDecision,
  type Verification,
} from "../workspace/assisted-assignment";
```

and append to the end of the file:

```ts
export interface ResolveAccessRequestInput {
  request: {
    id: string;
    job_id: string;
    user_id: string;
    requester_email: string | null;
    business_name: string | null;
    region: string;
    industry: string | null;
    district: string | null;
  };
  decision: AssistedDecision;
  reason: string;
  verification: Verification | null;
  operator: { userId: string; email: string };
}

export interface ResolveAccessRequestResult {
  ok: true;
  workspaceId: string | null;
  slug: string | null;
}

/**
 * The whole decision, in one transaction.
 *
 * THE AUDIT WRITE HERE IS NOT BEST-EFFORT, and that inverts this repository's
 * usual rule (see lib/workspace/audit.ts: "a failed audit insert is logged,
 * never thrown"). The decision event IS the decision: it carries the
 * idempotency key whose table-wide unique index makes a terminal decision
 * exactly-once. If it cannot be written, the assignment must not happen, so it
 * is inside the transaction rather than after it.
 *
 * It is also written FIRST. A concurrent second approver then loses on the
 * unique index before any workspace has been created, rather than after.
 */
export async function resolveAccessRequest(input: ResolveAccessRequestInput): Promise<ResolveAccessRequestResult> {
  const { request, decision, reason, verification, operator } = input;
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload,idempotency_key)
       VALUES(NULL,'user',$1,$2,'workspace_access_request',$3,$4,$5)`,
      [
        operator.userId,
        decisionEvent(decision),
        request.id,
        { reason, verification, operator_email: operator.email },
        decisionIdempotencyKey(request.id, decision),
      ],
    );

    if (!decisionIsTerminal(decision)) return { ok: true as const, workspaceId: null, slug: null };

    let workspaceId: string | null = null;
    let slug: string | null = null;

    if (decision === "approved") {
      // The SAME checked services verified ownership uses -- not a second path.
      const workspace = await claimsRepository.createWorkspaceWithOwner(
        {
          ownerUserId: request.user_id,
          ownerEmail: request.requester_email ?? "",
          businessName: request.business_name,
          industry: request.industry,
          district: request.district,
          market: request.region,
        },
        client,
      );
      // False means the owner completed Google verification while this sat in
      // the queue. Throwing rolls the whole transaction back, so no orphan
      // workspace survives and the operator is told why.
      if (!(await claimsRepository.attachJob(request.job_id, workspace.id, client))) {
        throw new Error("already_claimed");
      }
      workspaceId = workspace.id;
      slug = workspace.slug;

      await client.query(
        `INSERT INTO audit_events(workspace_id,actor_type,actor_id,event,entity_type,entity_id,payload)
         VALUES($1,'user',$2,$3,'workspace_access_request',$4,$5)`,
        [workspaceId, operator.userId, "workspace.assigned", request.id, { job_id: request.job_id, slug }],
      );
    }

    await client.query(
      "UPDATE workspace_access_requests SET resolved_at=now(), resolved_by_staff_user_id=$2 WHERE id=$1 AND resolved_at IS NULL",
      [request.id, operator.userId],
    );

    return { ok: true as const, workspaceId, slug };
  });
}
```

- [ ] **Step 4: Run both repository test files**

Run: `corepack pnpm exec vitest run lib/repositories/access-requests-resolve.test.ts lib/repositories/access-requests.test.ts`
Expected: PASS both files.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/repositories/access-requests.ts lib/repositories/access-requests-resolve.test.ts
git commit -m "feat(P2.4): resolve a request and assign the workspace in one transaction"
```

---

## Task 10: The owner submission route

**The binding rule is the point of this task, not the form.** Nothing may let a signed-in user file a request against an arbitrary job — that puts a stranger's business in front of an operator labelled "this person says it is theirs", the hijack primitive guardrail 15 exists to prevent. Reuse `claimsRepository.isLeadRecipient`, and answer **404** for an ineligible job so the response never confirms it exists.

**Files:**
- Modify: `lib/security/rate-limit.ts:8-31`
- Create: `app/api/access-requests/route.ts`
- Test: `app/api/access-requests/route.test.ts`

- [ ] **Step 1: Add the rate-limit bucket**

In `lib/security/rate-limit.ts`, add to the `RateLimitScope` union (after `"workspace_claim"`):

```ts
  | "access_request"
```

and to `RATE_LIMITS`:

```ts
  access_request: { limit: 5, windowSeconds: 60 * 60 },
```

- [ ] **Step 2: Write the failing test**

Create `app/api/access-requests/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const jobBySlug = vi.fn();
const isLeadRecipient = vi.fn();
const recordAccessRequest = vi.fn();
const openRequestFor = vi.fn();
const recordNeonEvent = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/repositories/claims", () => ({ claimsRepository: { jobBySlug, isLeadRecipient, recordAccessRequest } }));
vi.mock("@/lib/repositories/access-requests", () => ({ accessRequestRepository: () => ({ openRequestFor }) }));
vi.mock("@/lib/workspace/audit", () => ({ recordNeonEvent: (...a: unknown[]) => recordNeonEvent(...a), ipHashFor: () => "hash" }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimit(...a) }));

afterEach(() => vi.resetAllMocks());

const BODY = { slug: "abc123", intent: "I run this shop", preferred_contact_channel: "whatsapp", contact_identifier: "+85255550000", evidence_ref: "BR12345678" };

function post(body: unknown = BODY) {
  return import("./route").then(({ POST }) =>
    POST(new Request("https://app.test/api/access-requests", { method: "POST", body: JSON.stringify(body) })),
  );
}

function ready({ eligible = true } = {}) {
  getUser.mockResolvedValue({ id: "u-1", email: "owner@example.test", verified: true });
  enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  jobBySlug.mockResolvedValue({ id: "job-1", share_slug: "abc123", workspace_id: null });
  isLeadRecipient.mockResolvedValue(eligible);
  openRequestFor.mockResolvedValue({ id: "req-1" });
}

describe("POST /api/access-requests", () => {
  it("files a request for an eligible job and records what was said", async () => {
    ready();
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, requestId: "req-1" });
    expect(recordAccessRequest).toHaveBeenCalledWith("job-1", "u-1");
    expect(recordNeonEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: null,
        event: "access_request.submitted",
        entityType: "workspace_access_request",
        entityId: "req-1",
        payload: expect.objectContaining({ intent: "I run this shop", contact_identifier: "+85255550000", evidence_ref: "BR12345678" }),
      }),
    );
  });

  // The binding rule. A 404, not a 403: the answer must not confirm the job exists.
  it("answers 404 for a job the caller is not eligible for, writing nothing", async () => {
    ready({ eligible: false });
    expect((await post()).status).toBe(404);
    expect(recordAccessRequest).not.toHaveBeenCalled();
    expect(recordNeonEvent).not.toHaveBeenCalled();
  });

  it("answers 404 for a job that does not exist", async () => {
    ready();
    jobBySlug.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(isLeadRecipient).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller before touching the database", async () => {
    getUser.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(jobBySlug).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter refuses", async () => {
    getUser.mockResolvedValue({ id: "u-1", email: "owner@example.test", verified: true });
    enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await post()).status).toBe(429);
    expect(jobBySlug).not.toHaveBeenCalled();
    // One object argument, not positional -- see lib/security/rate-limit.ts:182.
    expect(enforceRateLimit).toHaveBeenCalledWith({ req: expect.anything(), scope: "access_request", identifiers: ["u-1"], failClosed: true });
  });

  it.each([
    ["no slug", { ...BODY, slug: "" }],
    ["no intent", { ...BODY, intent: "   " }],
    ["bad channel", { ...BODY, preferred_contact_channel: "telegram" }],
    ["no contact", { ...BODY, contact_identifier: "" }],
  ])("rejects %s", async (_label, body) => {
    ready();
    expect((await post(body)).status).toBe(400);
    expect(recordAccessRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `corepack pnpm exec vitest run "app/api/access-requests/route.test.ts"`
Expected: FAIL — module `./route` not found.

- [ ] **Step 4: Write the route**

Create `app/api/access-requests/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { claimsRepository } from "@/lib/repositories/claims";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { ipHashFor, recordNeonEvent } from "@/lib/workspace/audit";

/**
 * POST /api/access-requests → 201 { ok, requestId }
 *
 * A merchant whose business cannot be verified through Google asks Fimmick to
 * assign the workspace. Filing is NOT ownership: an operator must still verify
 * independently (guardrail 15).
 *
 * THE BINDING RULE. Nothing may let a signed-in user file against an arbitrary
 * job -- that would put a stranger's business in front of an operator labelled
 * "this person says it is theirs", which is the hijack primitive ownership
 * proof exists to prevent. Eligibility reuses `isLeadRecipient`, the same rule
 * Phase 1 built for magic links, and an ineligible job answers 404 rather than
 * 403 so the response never confirms the job exists.
 *
 * Re-submitting is safe by construction: workspace_access_requests_open_idx is
 * UNIQUE (job_id,user_id) WHERE resolved_at IS NULL, and recordAccessRequest
 * already carries the matching ON CONFLICT DO NOTHING. A fresh `submitted`
 * event is appended every time -- always, rather than only when something
 * changed, so no comparison decides what is worth recording. The rate limit is
 * what bounds it.
 */
const CHANNELS = new Set(["whatsapp", "line", "phone", "email"]);
const MAX_TEXT = 1000;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const decision = await enforceRateLimit({ req, scope: "access_request", identifiers: [user.id], failClosed: true });
  if (!decision.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = text(body.slug, 200);
  const intent = text(body.intent);
  const contactIdentifier = text(body.contact_identifier, 200);
  const channel = typeof body.preferred_contact_channel === "string" ? body.preferred_contact_channel : "";
  const evidenceRef = text(body.evidence_ref) ?? null;
  if (!slug || !intent || !contactIdentifier || !CHANNELS.has(channel)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const job = await claimsRepository.jobBySlug(slug);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await claimsRepository.isLeadRecipient(slug, user.email))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await claimsRepository.recordAccessRequest(job.id, user.id);
  const request = await accessRequestRepository().openRequestFor(job.id, user.id);
  if (!request) return NextResponse.json({ error: "unavailable" }, { status: 500 });

  await recordNeonEvent({
    workspaceId: null,
    actorType: "user",
    actorId: user.id,
    event: "access_request.submitted",
    entityType: "workspace_access_request",
    entityId: request.id,
    ipHash: ipHashFor(req),
    payload: { intent, preferred_contact_channel: channel, contact_identifier: contactIdentifier, evidence_ref: evidenceRef, job_id: job.id },
  });

  return NextResponse.json({ ok: true, requestId: request.id }, { status: 201 });
}
```

- [ ] **Step 5: Run tests**

Run: `corepack pnpm exec vitest run "app/api/access-requests/route.test.ts" lib/security/rate-limit.test.ts tests/route-exports.test.ts`
Expected: PASS all three.

- [ ] **Step 6: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/security/rate-limit.ts "app/api/access-requests"
git commit -m "feat(P2.4): let an eligible owner file an access request explicitly"
```

---

## Task 11: The operator decision route

**Gate order is the contract:** flag → operator → request → decision. The flag is checked as the **first statement**, before authorization and before body parsing, and answers **404** — the precedent is `app/api/oauth/google/claim/start/route.ts`, whose tests assert 404-before-config and 401-when-anonymous.

**Files:**
- Create: `app/api/ops/access-requests/[requestId]/route.ts`
- Test: `app/api/ops/access-requests/[requestId]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/ops/access-requests/[requestId]/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const resolveOperator = vi.fn();
const get = vi.fn();
const resolveAccessRequest = vi.fn();
const assistedAssignmentEnabled = vi.fn();

vi.mock("@/lib/auth/operator", () => ({ resolveOperator: () => resolveOperator() }));
vi.mock("@/lib/repositories/access-requests", () => ({
  accessRequestRepository: () => ({ get }),
  resolveAccessRequest: (...a: unknown[]) => resolveAccessRequest(...a),
}));
vi.mock("@/lib/workspace/assignment-flag", () => ({ assistedAssignmentEnabled: () => assistedAssignmentEnabled() }));

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const BODY = { decision: "approved", reason: "Registration checked", verification: { method: "BR12345678", verified_by: "Ada Wong" } };

function patch(body: unknown = BODY, requestId = REQUEST_ID) {
  return import("./route").then(({ PATCH }) =>
    PATCH(new Request(`https://app.test/api/ops/access-requests/${requestId}`, { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ requestId }),
    }),
  );
}

function ready() {
  assistedAssignmentEnabled.mockReturnValue(true);
  resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada.wong@fimmick.com" });
  get.mockResolvedValue({
    request: { id: REQUEST_ID, job_id: "job-1", user_id: "u-1", requester_email: "o@example.test", business_name: "Kam Man House", industry: null, district: null, region: "hk", resolved_at: null, place_id: null, share_slug: "abc", job_workspace_id: null, requested_at: "2026-09-10T02:00:00Z", resolved_by_staff_user_id: null },
    events: [],
  });
  resolveAccessRequest.mockResolvedValue({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
}

afterEach(() => vi.resetAllMocks());

describe("PATCH /api/ops/access-requests/[requestId]", () => {
  it("approves and reports the created workspace", async () => {
    ready();
    const response = await patch();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, workspaceId: "ws-1", slug: "kam-man-house" });
  });

  // DEC-06: with the flag off there is no decision route, for anyone.
  it("answers 404 with the flag off, before authorizing", async () => {
    assistedAssignmentEnabled.mockReturnValue(false);
    resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada.wong@fimmick.com" });
    expect((await patch()).status).toBe(404);
    expect(resolveOperator).not.toHaveBeenCalled();
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("refuses a non-operator with the flag on", async () => {
    ready();
    resolveOperator.mockResolvedValue(null);
    expect((await patch()).status).toBe(403);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("answers 409 for a request someone already decided", async () => {
    ready();
    get.mockResolvedValue({ request: { id: REQUEST_ID, resolved_at: "2026-09-11T00:00:00Z" }, events: [] });
    expect((await patch()).status).toBe(409);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  // The loser of a race must see a refusal, never a silent success.
  it("answers 409 when a concurrent decision won the idempotency key", async () => {
    ready();
    resolveAccessRequest.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));
    const response = await patch();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_decided" });
  });

  it("answers 409 when the job was claimed while the request waited", async () => {
    ready();
    resolveAccessRequest.mockRejectedValue(new Error("already_claimed"));
    const response = await patch();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_claimed" });
  });

  it.each([
    ["an unknown decision", { ...BODY, decision: "maybe" }],
    ["no reason", { ...BODY, reason: "  " }],
    ["no verification on a terminal decision", { decision: "approved", reason: "ok" }],
    ["blank verifier", { ...BODY, verification: { method: "BR1", verified_by: "" } }],
  ])("rejects %s", async (_label, body) => {
    ready();
    expect((await patch(body)).status).toBe(400);
    expect(resolveAccessRequest).not.toHaveBeenCalled();
  });

  it("does not require verification to ask for more information", async () => {
    ready();
    resolveAccessRequest.mockResolvedValue({ ok: true, workspaceId: null, slug: null });
    const response = await patch({ decision: "needs_information", reason: "Please send the BR number" });
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run "app/api/ops/access-requests/[requestId]/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `app/api/ops/access-requests/[requestId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveOperator } from "@/lib/auth/operator";
import { accessRequestRepository, resolveAccessRequest } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";
import { decisionIsTerminal, isAssistedDecision, parseVerification } from "@/lib/workspace/assisted-assignment";

/**
 * PATCH /api/ops/access-requests/[requestId] → 200 { ok, workspaceId, slug }
 *
 * Gate order is the contract and is tested in both directions:
 *   flag → operator → request → decision.
 *
 * The DEC-06 flag is the FIRST statement, before authorization and before the
 * body is read, and answers 404 rather than 403 so the route's existence is not
 * itself a signal. Precedent: app/api/oauth/google/claim/start/route.ts.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function PATCH(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  if (!assistedAssignmentEnabled()) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const operator = await resolveOperator();
  if (!operator) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { requestId } = await params;
  if (!UUID_RE.test(requestId)) return NextResponse.json({ error: "requestId is invalid" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision;
  if (!isAssistedDecision(decision)) return NextResponse.json({ error: "decision is invalid" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 2000) return NextResponse.json({ error: "reason is required" }, { status: 400 });

  // Terminal decisions must record WHAT was verified and BY WHOM (item 19).
  // Asking a question is not a decision, so it needs none.
  const verification = decisionIsTerminal(decision) ? parseVerification(body.verification) : null;
  if (decisionIsTerminal(decision) && !verification) {
    return NextResponse.json({ error: "verification is required" }, { status: 400 });
  }

  const found = await accessRequestRepository().get(requestId);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (found.request.resolved_at) return NextResponse.json({ error: "already_decided" }, { status: 409 });

  try {
    const result = await resolveAccessRequest({
      request: {
        id: found.request.id,
        job_id: found.request.job_id,
        user_id: found.request.user_id,
        requester_email: found.request.requester_email,
        business_name: found.request.business_name,
        region: found.request.region,
        industry: found.request.industry,
        district: found.request.district,
      },
      decision,
      reason,
      verification,
      operator,
    });
    return NextResponse.json({ ok: true, workspaceId: result.workspaceId, slug: result.slug });
  } catch (error) {
    // The loser of a race sees a refusal, never a silent success.
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "already_decided" }, { status: 409 });
    }
    if ((error as Error).message === "already_claimed") {
      return NextResponse.json({ error: "already_claimed" }, { status: 409 });
    }
    console.error("[ops/access-requests] decision failed", { category: "access_request_decision_failed" });
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run "app/api/ops/access-requests/[requestId]/route.test.ts" tests/route-exports.test.ts`
Expected: PASS both.

- [ ] **Step 5: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add "app/api/ops"
git commit -m "feat(P2.4): the operator decision route, gated on DEC-06 and the allowlist"
```

---

## Task 12: The operator queue and detail pages

English copy, locale-prefixed. **The exception to CLAUDE.md §5's trilingual rule is recorded in the spec and restated in the page comment** — the audience is a handful of Fimmick operators, not merchants.

**Files:**
- Create: `app/[locale]/ops/access-requests/page.tsx`
- Create: `app/[locale]/ops/access-requests/[requestId]/page.tsx`
- Create: `components/ops/access-request-decision.tsx`
- Test: `components/ops/access-request-decision.test.tsx`

- [ ] **Step 1: Write the decision form**

Create `components/ops/access-request-decision.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * The decision form. Disabled entirely when DEC-06 has not been settled, with
 * copy that names what is actually missing rather than saying "coming soon".
 * The route enforces the same gate; this only stops the operator wasting typing.
 */
export function AccessRequestDecision({ requestId, enabled, resolved }: { requestId: string; enabled: boolean; resolved: boolean }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [method, setMethod] = useState("")
  const [verifiedBy, setVerifiedBy] = useState("")
  const [busy, setBusy] = useState(false)

  async function decide(decision: "approved" | "rejected" | "needs_information") {
    if (busy) return
    if (!reason.trim()) { toast.error("Record why."); return }
    if (decision !== "needs_information" && (!method.trim() || !verifiedBy.trim())) {
      toast.error("Record what you verified and who verified it.")
      return
    }
    setBusy(true)
    const response = await fetch(`/api/ops/access-requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        reason: reason.trim(),
        ...(decision === "needs_information" ? {} : { verification: { method: method.trim(), verified_by: verifiedBy.trim() } }),
      }),
    })
    setBusy(false)
    if (response.ok) { toast.success("Decision recorded."); router.refresh(); return }
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (body.error === "already_claimed") toast.error("The job was claimed while this request waited; nothing was created.")
    else if (body.error === "already_decided") toast.error("Someone else decided this request first.")
    else toast.error(`The decision was refused (${body.error ?? response.status}).`)
    router.refresh()
  }

  if (resolved) return <p>This request has already been decided.</p>
  if (!enabled) {
    return (
      <p className="limitation-note" role="status">
        Decisions are disabled until a named accountable operating role and an approved independent-verification procedure are recorded (DEC-06).
      </p>
    )
  }

  return (
    <div className="field-stack">
      <Label htmlFor="decision-reason">Why</Label>
      <Textarea id="decision-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
      <Label htmlFor="decision-method">What independent control or authority did you verify?</Label>
      <Input id="decision-method" value={method} onChange={(event) => setMethod(event.target.value)} disabled={busy} />
      <Label htmlFor="decision-by">Verified by</Label>
      <Input id="decision-by" value={verifiedBy} onChange={(event) => setVerifiedBy(event.target.value)} disabled={busy} />
      <div className="draft-editor-actions">
        <Button onClick={() => void decide("approved")} disabled={busy}>Approve and assign</Button>
        <Button variant="outline" onClick={() => void decide("needs_information")} disabled={busy}>Ask for more</Button>
        <Button variant="ghost" className="text-destructive" onClick={() => void decide("rejected")} disabled={busy}>Reject</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the component test**

Create `components/ops/access-request-decision.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AccessRequestDecision } from "@/components/ops/access-request-decision";

function render(props: { enabled: boolean; resolved: boolean }) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<AccessRequestDecision requestId="req-1" {...props} />);
  return root;
}

describe("AccessRequestDecision", () => {
  it("offers the three decisions when DEC-06 is settled", () => {
    const text = render({ enabled: true, resolved: false }).textContent ?? "";
    expect(text).toContain("Approve and assign");
    expect(text).toContain("Ask for more");
    expect(text).toContain("Reject");
  });

  // Names what is missing, rather than "coming soon".
  it("names the missing decision inputs when the flag is off", () => {
    const text = render({ enabled: false, resolved: false }).textContent ?? "";
    expect(text).toContain("named accountable operating role");
    expect(text).toContain("independent-verification procedure");
    expect(text).not.toContain("Approve and assign");
  });

  it("offers nothing on a request already decided", () => {
    const text = render({ enabled: true, resolved: true }).textContent ?? "";
    expect(text).toContain("already been decided");
    expect(text).not.toContain("Approve and assign");
  });
});
```

- [ ] **Step 3: Run the component test**

Run: `corepack pnpm exec vitest run components/ops/access-request-decision.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 4: Write the queue page**

Create `app/[locale]/ops/access-requests/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { requireOperator } from "@/lib/auth/operator";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";

export const dynamic = "force-dynamic";
/** Unlisted internal tooling: never index it, and never link to it from a merchant surface. */
export const metadata: Metadata = { title: "Access requests", robots: { index: false, follow: false } };

/**
 * The operator queue (Phase 2 item 23).
 *
 * English copy on a locale-prefixed route: a deliberate, recorded exception to
 * CLAUDE.md section 5's trilingual rule, because the audience is a handful of
 * Fimmick operators rather than merchants. Locale-prefixed so proxy.ts -- the
 * file that gates every owner route -- needs no exception.
 *
 * Reachable with ASSISTED_ASSIGNMENT_ENABLED off, because DEC-06's safe default
 * is to build the queue and withhold only real approvals.
 */
export default async function OpsAccessRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireOperator();
  const { locale } = await params;
  const requests = await accessRequestRepository().listPending(100);
  const enabled = assistedAssignmentEnabled();

  return (
    <div className="settings-page">
      <h1>Access requests</h1>
      <p>Pending requests to be assigned a workspace, newest first. Filing a request is not proof of ownership; verify independently before deciding.</p>
      {!enabled && (
        <p className="limitation-note" role="status">
          Decisions are disabled: no named accountable operating role and no approved independent-verification procedure are recorded yet (DEC-06). You can read requests; you cannot approve or reject one.
        </p>
      )}
      {requests.length === 0 ? (
        <p>No pending requests.</p>
      ) : (
        <div className="compact-action-list">
          {requests.map((request) => (
            <Link key={request.id} href={`/${locale}/ops/access-requests/${request.id}`}>
              <div>
                <strong>{request.business_name ?? request.share_slug}</strong>
                <small>
                  {request.region.toUpperCase()} · {request.place_id ? "Google listing" : "Manual entry"} · requested {request.requested_at} · {request.requester_email ?? "unknown address"}
                  {request.job_workspace_id ? " · job already claimed" : ""}
                </small>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write the detail page**

Create `app/[locale]/ops/access-requests/[requestId]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessRequestDecision } from "@/components/ops/access-request-decision";
import { requireOperator } from "@/lib/auth/operator";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { assistedAssignmentEnabled } from "@/lib/workspace/assignment-flag";
import { recordNeonEvent } from "@/lib/workspace/audit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access request", robots: { index: false, follow: false } };

/**
 * One request, with the job's own evidence beside what the merchant said.
 *
 * Opening this page logs `access_request.reviewed`, because this is the moment
 * a merchant's details are actually seen. Logging per QUEUE view instead would
 * be noise rather than accountability.
 */
export default async function OpsAccessRequestPage({ params }: { params: Promise<{ locale: string; requestId: string }> }) {
  const operator = await requireOperator();
  const { requestId } = await params;
  const found = await accessRequestRepository().get(requestId);
  if (!found) notFound();

  await recordNeonEvent({
    workspaceId: null,
    actorType: "user",
    actorId: operator.userId,
    event: "access_request.reviewed",
    entityType: "workspace_access_request",
    entityId: requestId,
    payload: { operator_email: operator.email },
  });

  const { request, events } = found;
  const submitted = [...events].reverse().find((event) => event.event === "access_request.submitted");

  return (
    <div className="settings-page">
      <h1>{request.business_name ?? request.share_slug}</h1>
      <dl className="trust-dl">
        <div><dt>Market</dt><dd>{request.region.toUpperCase()}</dd></div>
        <div><dt>Listing</dt><dd>{request.place_id ? `Google place ${request.place_id}` : "Manual entry — no Google listing"}</dd></div>
        <div><dt>Report</dt><dd>{request.share_slug}</dd></div>
        <div><dt>Requester</dt><dd>{request.requester_email ?? "unknown address"}</dd></div>
        <div><dt>Requested</dt><dd>{request.requested_at}</dd></div>
        <div><dt>Job already claimed</dt><dd>{request.job_workspace_id ? "Yes — approving will be refused" : "No"}</dd></div>
      </dl>

      <h2>What the requester said</h2>
      {submitted ? (
        <dl className="trust-dl">
          <div><dt>Intent</dt><dd>{String(submitted.payload?.intent ?? "")}</dd></div>
          <div><dt>Contact</dt><dd>{String(submitted.payload?.preferred_contact_channel ?? "")} · {String(submitted.payload?.contact_identifier ?? "")}</dd></div>
          <div><dt>Evidence reference</dt><dd>{String(submitted.payload?.evidence_ref ?? "none given")}</dd></div>
        </dl>
      ) : (
        <p>Filed implicitly at sign-in; no intent, contact or evidence was captured.</p>
      )}

      <h2>History</h2>
      <ul className="evidence-list">
        {events.map((event, index) => (
          <li key={`${event.event}-${index}`}><span>{event.created_at} · {event.event} · {String(event.payload?.reason ?? "")}</span></li>
        ))}
      </ul>

      <AccessRequestDecision
        requestId={requestId}
        enabled={assistedAssignmentEnabled()}
        resolved={Boolean(request.resolved_at)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Run the route-inventory tests**

Run: `corepack pnpm exec vitest run components/ops/access-request-decision.test.tsx tests/route-metadata.test.ts tests/owner-pages.test.ts`
Expected: PASS. If `tests/route-metadata.test.ts` enumerates route segments and fails on the new `/ops` segment, add `/ops` to its expected list — it is a real route and that test is an inventory, not a prohibition.

- [ ] **Step 7: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add "app/[locale]/ops" components/ops
git commit -m "feat(P2.4): the unlisted operator queue and decision surface"
```

---

## Task 13: The owner's own status

Scoped to the signed-in user's `user_id` — another person's request is never visible. **The copy promises no review and no response time**, because DEC-06 says not to claim an operating service exists.

**Files:**
- Create: `lib/workspace/my-access-request.ts`
- Test: `lib/workspace/my-access-request.test.ts`
- Create: `components/workspace/access-request-status.tsx`
- Modify: `app/[locale]/owner/select-workspace/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/workspace/my-access-request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveRequestStatus } from "./my-access-request";

describe("deriveRequestStatus", () => {
  it("is pending when nothing has closed it", () => {
    expect(deriveRequestStatus({ resolved_at: null }, [])).toBe("pending");
  });

  it("is awaiting_information when that was the last thing said", () => {
    expect(
      deriveRequestStatus({ resolved_at: null }, [
        { event: "access_request.submitted" },
        { event: "access_request.information_requested" },
      ]),
    ).toBe("awaiting_information");
  });

  it("returns to pending after the requester submits again", () => {
    expect(
      deriveRequestStatus({ resolved_at: null }, [
        { event: "access_request.information_requested" },
        { event: "access_request.submitted" },
      ]),
    ).toBe("pending");
  });

  it.each([
    ["access_request.approved", "approved"],
    ["access_request.rejected", "rejected"],
  ])("reads %s from the log, because the row cannot tell them apart", (event, expected) => {
    expect(deriveRequestStatus({ resolved_at: "2026-09-11T00:00:00Z" }, [{ event }])).toBe(expected);
  });

  it("is closed when the row is resolved but no terminal event is readable", () => {
    expect(deriveRequestStatus({ resolved_at: "2026-09-11T00:00:00Z" }, [])).toBe("closed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run lib/workspace/my-access-request.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the derivation**

Create `lib/workspace/my-access-request.ts`:

```ts
/**
 * The owner's view of their own request (Phase 2 item 22).
 *
 * Status is derived, never stored. `resolved_at` answers "is this still open";
 * the append-only log answers which outcome. The row alone cannot distinguish
 * approved from rejected -- that is the intended split, not a gap.
 */
export type MyRequestStatus = "pending" | "awaiting_information" | "approved" | "rejected" | "closed";

export function deriveRequestStatus(
  request: { resolved_at: string | null },
  events: Array<{ event: string }>,
): MyRequestStatus {
  if (request.resolved_at) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].event === "access_request.approved") return "approved";
      if (events[index].event === "access_request.rejected") return "rejected";
    }
    return "closed";
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].event === "access_request.information_requested") return "awaiting_information";
    if (events[index].event === "access_request.submitted") return "pending";
  }
  return "pending";
}
```

- [ ] **Step 4: Write the owner status card**

Create `components/workspace/access-request-status.tsx`:

```tsx
import type { MyRequestStatus } from "@/lib/workspace/my-access-request"

/**
 * DEC-06 says not to claim an operating service exists, so this promises no
 * review, no response time and no "our team is looking at this". It states
 * what is recorded and nothing more.
 */
const COPY: Record<MyRequestStatus, { en: string; zh: string }> = {
  pending: { en: "Your request is recorded. We have not committed to a review time.", zh: "已記錄你的申請。我們未就審核時間作出承諾。" },
  awaiting_information: { en: "Fimmick has asked you for more information before deciding.", zh: "Fimmick 需要你補充資料才能決定。" },
  approved: { en: "Your request was approved and your workspace was created.", zh: "申請已批准，工作台已建立。" },
  rejected: { en: "Your request was not approved.", zh: "申請未獲批准。" },
  closed: { en: "Your request has been closed.", zh: "申請已結束。" },
}

export function AccessRequestStatus({ status, isChinese, businessName }: { status: MyRequestStatus; isChinese: boolean; businessName: string }) {
  const copy = COPY[status]
  return (
    <div className="section-card">
      <p className="eyebrow">{isChinese ? "擁有權申請" : "Ownership request"}</p>
      <h2>{businessName}</h2>
      <p>{isChinese ? copy.zh : copy.en}</p>
    </div>
  )
}
```

- [ ] **Step 5: Render it on select-workspace**

In `app/[locale]/owner/select-workspace/page.tsx`, add these imports at the top:

```tsx
import { AccessRequestStatus } from "@/components/workspace/access-request-status";
import { accessRequestRepository } from "@/lib/repositories/access-requests";
import { deriveRequestStatus } from "@/lib/workspace/my-access-request";
```

After the existing `listWorkspaceCards(user.id)` call, add:

```tsx
  const myRequest = await accessRequestRepository().latestForUser(user.id);
```

and render this immediately above the workspace cards in the returned JSX:

```tsx
      {myRequest && (
        <AccessRequestStatus
          status={deriveRequestStatus(myRequest.request, myRequest.events)}
          isChinese={locale !== "en"}
          businessName={myRequest.request.business_name ?? myRequest.request.share_slug}
        />
      )}
```

- [ ] **Step 6: Write the submission form**

Without this the route from Task 10 has no caller, and the manual-entry owner — the person this whole path exists for — still has no way in.

Create `components/workspace/access-request-form.tsx`:

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

/**
 * Asks Fimmick to assign this report's workspace (Phase 2 item 27).
 *
 * Channels follow the market, matching the unlock funnel: WhatsApp in HK, LINE
 * in TW, phone and email in both. Filing is not ownership -- the copy says so,
 * because an operator still has to verify independently.
 */
const CHANNELS: Record<"hk" | "tw", Array<{ value: string; label: string }>> = {
  hk: [
    { value: "whatsapp", label: "WhatsApp" },
    { value: "phone", label: "Phone" },
    { value: "email", label: "Email" },
  ],
  tw: [
    { value: "line", label: "LINE" },
    { value: "phone", label: "Phone" },
    { value: "email", label: "Email" },
  ],
}

export function AccessRequestForm({ slug, market, isChinese }: { slug: string; market: "hk" | "tw"; isChinese: boolean }) {
  const router = useRouter()
  const [intent, setIntent] = useState("")
  const [channel, setChannel] = useState(CHANNELS[market][0].value)
  const [contact, setContact] = useState("")
  const [evidence, setEvidence] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!intent.trim() || !contact.trim()) {
      toast.error(isChinese ? "請填寫你的說明及聯絡方式。" : "Describe your request and how to reach you.")
      return
    }
    setBusy(true)
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        intent: intent.trim(),
        preferred_contact_channel: channel,
        contact_identifier: contact.trim(),
        evidence_ref: evidence.trim() || undefined,
      }),
    })
    setBusy(false)
    if (response.ok) {
      toast.success(isChinese ? "已記錄你的申請。" : "Your request is recorded.")
      router.refresh()
      return
    }
    if (response.status === 429) toast.error(isChinese ? "請求過於頻繁，請稍後再試。" : "Too many requests; try again shortly.")
    else if (response.status === 404) toast.error(isChinese ? "此報告未能與你的帳戶對應。" : "This report could not be matched to your account.")
    else toast.error(isChinese ? "未能提交申請。" : "The request could not be submitted.")
  }

  return (
    <form className="field-stack" onSubmit={(event) => void submit(event)}>
      <p>{isChinese ? "提交申請不等於證明擁有權；Fimmick 會另行核實。" : "Filing a request is not proof of ownership; Fimmick verifies it separately."}</p>
      <Label htmlFor="request-intent">{isChinese ? "你想申請甚麼？" : "What are you asking for?"}</Label>
      <Textarea id="request-intent" rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} disabled={busy} />
      <Label htmlFor="request-channel">{isChinese ? "聯絡方式" : "How should we reach you?"}</Label>
      <Select value={channel} onValueChange={setChannel}>
        <SelectTrigger id="request-channel"><SelectValue /></SelectTrigger>
        <SelectContent>{CHANNELS[market].map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor="request-contact">{isChinese ? "聯絡號碼或地址" : "Number or address"}</Label>
      <Input id="request-contact" value={contact} onChange={(event) => setContact(event.target.value)} disabled={busy} />
      <Label htmlFor="request-evidence">{isChinese ? "可供核實的參考（選填）" : "Something we can check (optional)"}</Label>
      <Input id="request-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} disabled={busy} placeholder={isChinese ? "例如商業登記號碼" : "For example a business registration number"} />
      <small>{isChinese ? "請填寫可獨立核實的參考，不需上載文件。" : "A reference we can check independently. Do not upload documents; there is no upload here."}</small>
      <Button type="submit" disabled={busy}>{isChinese ? "提交申請" : "Send the request"}</Button>
    </form>
  )
}
```

- [ ] **Step 7: Write the form test**

Create `components/workspace/access-request-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AccessRequestForm } from "@/components/workspace/access-request-form";

function render(market: "hk" | "tw") {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(<AccessRequestForm slug="abc123" market={market} isChinese={false} />);
  return root;
}

describe("AccessRequestForm", () => {
  it("says filing is not ownership", () => {
    expect(render("hk").textContent).toContain("not proof of ownership");
  });

  // There is no upload path anywhere in this feature, so the form must not
  // invite one -- a file input here would be a promise nothing keeps.
  it("asks for a checkable reference, not a document", () => {
    const text = render("hk").textContent ?? "";
    expect(text).toContain("Do not upload documents");
    expect(render("hk").querySelector('input[type="file"]')).toBeNull();
  });

  it("offers WhatsApp in HK and LINE in TW", () => {
    expect(render("hk").textContent).toContain("WhatsApp");
    expect(render("tw").textContent).toContain("LINE");
  });
});
```

- [ ] **Step 8: Render status-or-form on both surfaces**

The spec names both homes: select-workspace, where a memberless signed-in user lands, and onboarding step 2.

In `app/[locale]/owner/select-workspace/page.tsx`, the block added in Step 5 already renders the status when a request exists. Leave it as is — a user on this page has no single report in context, so there is nothing to file a request *against* here.

In `app/[locale]/owner/onboarding/page.tsx`, load the same read beside the existing claim evidence and pass both into the step 2 region: render `AccessRequestStatus` when a request exists, and `AccessRequestForm` when it does not, using the claimed job's `share_slug` and its `region` as the market. This replaces the current fallback copy, which tells the owner to reply to a report email this app never sends.

- [ ] **Step 9: Run the tests**

Run: `corepack pnpm exec vitest run lib/workspace/my-access-request.test.ts lib/repositories/access-requests.test.ts components/workspace/access-request-form.test.tsx components/onboarding-page.test.tsx tests/owner-pages.test.ts`
Expected: PASS all five. `components/onboarding-page.test.tsx` pins the current step-1 and fallback branches — if it asserts the old "reply to the report email" copy, update that assertion, because removing that dead end is the point of this change.

- [ ] **Step 10: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add lib/workspace/my-access-request.ts lib/workspace/my-access-request.test.ts components/workspace/access-request-status.tsx components/workspace/access-request-form.tsx components/workspace/access-request-form.test.tsx "app/[locale]/owner/select-workspace/page.tsx" "app/[locale]/owner/onboarding/page.tsx"
git commit -m "feat(P2.4): let an owner ask, and see their own request, without a dead end"
```

---

## Task 14: Integration tests (written here, first run in CI)

Docker is absent on this machine, so these **cannot be run locally**. Write them against that constraint, state it in the report, and let CI be the authority — the same way the previous phase's integration cases were handled.

**Files:**
- Create: `test/integration/neon-assisted-assignment.integration.test.ts`

- [ ] **Step 1: Copy the harness**

Open `test/integration/neon-membership.integration.test.ts` and copy its imports, pool setup, migration application and teardown **verbatim** into a new `test/integration/neon-assisted-assignment.integration.test.ts`. Do not invent a second harness — that file is the working reference for how these suites reach a real database.

- [ ] **Step 2: Write the four acceptance cases**

Case 1 is written out in full below — it is the hardest and it sets the shape for the rest. Cases 2–4 follow the same structure: seed, act, assert with real SQL.

```ts
it("lets exactly one of two concurrent approvals win, and refuses the other visibly", async () => {
  // Seed: a finished job nobody has claimed, and one open request against it.
  const { rows: [job] } = await pool.query<{ id: string }>(
    `INSERT INTO audit_jobs(share_slug,business_name,region,status,place_id)
     VALUES('race-slug','Race Cafe','hk','done',NULL) RETURNING id`,
  );
  const { rows: [user] } = await pool.query<{ id: string }>(
    `INSERT INTO app_users(email) VALUES('racer@example.test') RETURNING id`,
  );
  const { rows: [operator] } = await pool.query<{ id: string }>(
    `INSERT INTO app_users(email) VALUES('ada.wong@fimmick.com') RETURNING id`,
  );
  const { rows: [request] } = await pool.query<{ id: string }>(
    `INSERT INTO workspace_access_requests(job_id,user_id) VALUES($1,$2) RETURNING id`,
    [job.id, user.id],
  );

  const input = {
    request: {
      id: request.id, job_id: job.id, user_id: user.id,
      requester_email: "racer@example.test", business_name: "Race Cafe",
      industry: null, district: null, region: "hk",
    },
    decision: "approved" as const,
    reason: "Registration checked",
    verification: { method: "BR12345678", verified_by: "Ada Wong" },
    operator: { userId: operator.id, email: "ada.wong@fimmick.com" },
  };

  const [first, second] = await Promise.allSettled([
    resolveAccessRequest(input),
    resolveAccessRequest(input),
  ]);

  // One wins; the other loses on audit_events_idempotency_key_idx.
  const outcomes = [first.status, second.status].sort();
  expect(outcomes).toEqual(["fulfilled", "rejected"]);
  const loser = (first.status === "rejected" ? first : second) as PromiseRejectedResult;
  expect((loser.reason as { code?: string }).code).toBe("23505");

  // The refusal must be real, not cosmetic: exactly one workspace exists, the
  // job points at it, and the request closed once.
  const { rows: workspaces } = await pool.query(`SELECT id FROM workspaces WHERE business_name='Race Cafe'`);
  expect(workspaces).toHaveLength(1);
  const { rows: [attached] } = await pool.query<{ workspace_id: string | null }>(
    `SELECT workspace_id FROM audit_jobs WHERE id=$1`, [job.id],
  );
  expect(attached.workspace_id).toBe(workspaces[0].id);
  const { rows: [closed] } = await pool.query<{ resolved_at: string | null }>(
    `SELECT resolved_at FROM workspace_access_requests WHERE id=$1`, [request.id],
  );
  expect(closed.resolved_at).not.toBeNull();
  const { rows: decisions } = await pool.query(
    `SELECT id FROM audit_events WHERE entity_id=$1 AND event='access_request.approved'`, [request.id],
  );
  expect(decisions).toHaveLength(1);
});
```

The remaining three, same structure:
2. **A rejected request leaves the requester a non-member.** Resolve with `decision: "rejected"`. Assert `SELECT count(*) FROM workspace_members WHERE user_id = <requester>` is `0`, and the request's `resolved_at IS NOT NULL`.
3. **A manual-entry business completes the whole path.** Seed a job with `place_id` NULL. Approve. Assert a workspace exists, `audit_jobs.workspace_id` is set to it, and `SELECT count(*) FROM actions WHERE workspace_id = <new>` is at least `1`.
4. **Approving a job attached in the meantime rolls everything back.** Set `audit_jobs.workspace_id` to another workspace first, then approve. Assert the call rejects with `already_claimed`, no new workspace row exists, and the request's `resolved_at` is still NULL.

- [ ] **Step 3: Confirm it cannot run here, and record that honestly**

Run: `corepack pnpm test:integration`
Expected: **FAILS TO START** — Docker unavailable. This is the expected result on this machine. Record it as `blocked`, never as `passed`.

- [ ] **Step 4: Commit**

```bash
corepack pnpm exec tsc --noEmit
git add test/integration/neon-assisted-assignment.integration.test.ts
git commit -m "test(P2.4): the four assisted-assignment acceptance cases, for CI"
```

---

## Task 15: Documentation

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-2-BACKLOG.md`
- Modify: `docs/implementation/owner-platform-v1/PHASE-2-TEST-RESULTS.md`
- Modify: `docs/implementation/owner-platform-v1/BUSINESS-AND-HOSTED-DECISIONS.md`

- [ ] **Step 1: Mark items 19–23 done and move 27–28 out of Blocked**

In `PHASE-2-BACKLOG.md`, add a `**Status:** done — <sha>. <one-line note>` line under the `**Effort:**` line of items 19, 20, 21, 22, 23, 27 and 28, matching the format already used for items 1–15. Update the Progress section's counts. Items 27 and 28 were blocked on `needs_schema_change`; that blocker is gone because this release adds no DDL, so move both into the Buildable section with their status.

- [ ] **Step 2: Record the gate results**

Append a dated section to `PHASE-2-TEST-RESULTS.md` with the gate table, matching the format of the 2026-09-12 section already there. Use **passed / failed / blocked / not run** accurately: `test:integration` and `db:verify` are **blocked** (no Docker), `build` and `test:secret-boundary` are **blocked** (Windows Turbopack), `e2e` is **not run**.

- [ ] **Step 3: Record what DEC-06 still gates**

In `BUSINESS-AND-HOSTED-DECISIONS.md`, leave the DEC-06 row **pending**, and add a note beneath the table stating that the code now exists behind `ASSISTED_ASSIGNMENT_ENABLED` and `OPERATOR_EMAILS`, both shipping unset, and that enabling it still requires the named accountable operating role, reviewer access rules and accepted independent verification methods the row already lists.

- [ ] **Step 4: Commit**

```bash
git add docs/implementation/owner-platform-v1/
git commit -m "docs(P2.4): record the assisted-assignment release and what DEC-06 still gates"
```

---

## Final verification

- [ ] `corepack pnpm exec tsc --noEmit` → exit 0
- [ ] `corepack pnpm lint` → exit 0, **30 warnings, 0 errors** (unchanged baseline)
- [ ] `corepack pnpm test > /tmp/full.txt 2>&1; echo $?` → **0**. Redirect, do not pipe to `tail` — a pipeline's exit status is `tail`'s, which has masked a failing suite in this repo before.
- [ ] `corepack pnpm test:no-supabase` → passed
- [ ] `corepack pnpm test:no-self-service-claim` → passed
- [ ] `git status --porcelain` → empty
- [ ] Nothing pushed, no PR opened, no migration applied.
