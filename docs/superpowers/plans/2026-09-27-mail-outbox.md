# P3.5c Application-Email Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transactional outbox that queues rescan-complete and regression-alert emails exactly once per member inside the scan-completion transaction, delivers them from the existing cron tick with leases, retries and reconciliation, and sends nothing unless mail is explicitly approved, configured, unpaused and the member opted in.

**Architecture:** Migration 0010 adds `mail_outbox` and three member columns. Pure decision/templating/token modules under `lib/mail/` are wired into `postProcessWorkspaceScan` (enqueue) and a new `deliverMail` cron step (send). A signed-token unsubscribe page + route, per-member settings, ops visibility and runbook entries complete it.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Neon Postgres (`pg` PoolClient repositories), Drizzle schema, Vitest 4 (unit) + Docker Postgres integration harness, fetch-based Resend driver.

**Spec:** `docs/superpowers/specs/2026-09-27-mail-outbox-design.md` (approved 2026-09-27).

**Branch:** `p35c-mail-outbox`, stacked on `claude/commercial-contract-design-3b8561` (PR #25). Diff base for "unchanged" checks: `0190030`.

## Global Constraints

- Templates version: `MAIL_TEMPLATES_VERSION = "2026-09-event-mail-v1"`. Mail is open only when `APPLICATION_MAIL_APPROVED` (trimmed) equals it **and** `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `APP_ORIGIN` are non-blank **and** `MAIL_UNSUBSCRIBE_SECRET` is ≥ 32 bytes (UTF-8 length after trim).
- Kinds: `rescan_complete`, `regression_alert`. States: `queued | sending | sent | retry | held | dead | expired`. Hold reasons: `mail_unapproved | kind_disabled | opted_out | no_address | not_allowlisted | not_member`.
- Decision order (enqueue and send): `mail_unapproved` → `not_member` → `kind_disabled` → `opted_out` → `no_address` → `not_allowlisted` → queue/send.
- Lease 5 min; batch 10; retry delays by attempt number 1→5, 2→15, 3→60, 4→240 minutes; the 5th failed attempt → `dead`; a row created > 24 h before the send attempt → `expired`.
- Unsubscribe token: HMAC-SHA256 with `MAIL_UNSUBSCRIBE_SECRET`, 90-day expiry. GET never mutates.
- `sent` means "accepted by the provider"; never write "delivered" in code, copy or docs.
- Logs never contain an email address, token or provider response text — category + row id only.
- No test calls Resend or any network. No migration edits to 0001–0009; no changes under `packages/`.
- Never write `seat limit`, `seat_limit`, `max_members`, `member_limit`, `pooled_allowance`, `seats_included` under `app/` or `lib/`.
- New UI strings in a new `mail` namespace in `lib/messages/{en,zh-HK,zh-TW}.json`; zh-HK 香港書面中文, zh-TW 台灣用語.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `--no-verify`; no push. Never commit `lib/agents/__snapshots__/agents.test.ts.snap` or `lib/pocket-assistant/__snapshots__/demo.test.ts.snap` (line-ending noise).

## Review Focus

1. A member who unsubscribes (or is removed) after a row is queued but before the tick → the row ends `held` (`opted_out` / `not_member`), never `sent`. (Tasks 6, 7 tests.)
2. `MAIL_RECIPIENT_ALLOWLIST` with mixed case and spaces (`" Owner@Example.com , ,x@y.hk"`) matches `owner@example.com`; an allowlist of only commas/blanks is treated as unset. (Task 2 test.)
3. The completion runs twice for the same job (retry after a later failure) → still exactly one row per member and kind, and a row already `held`/`sent` is not reset to `queued`. (Task 5 integration test.)
4. A send whose lease was stolen (reclaimed after expiry by another tick) cannot overwrite the new holder's result: finishing with a stale `lease_token` changes nothing. (Task 6 integration test.)
5. Unsubscribe link for a workspace the member has since left, or a token signed with an old secret → neutral 400 page/response, no row or switch changes. (Task 7 test.)

## Where this plan departs from the spec, and why

1. **`mail_outbox.payload jsonb not null`** (`{ businessName: string, regressedCount: number | null, workspacePath: string | null }`) is added. The spec's table has nothing the template can render at send time; recomputing from the job and diff later could drift.
2. **The existing `notification-preferences` PATCH becomes owner-only** (`minRole: "owner"`), because the spec makes the workspace switches owner gates. Its existing tests that let a manager/viewer PATCH change to expect `403`.
3. **Unsubscribe rate limiting uses `failClosed: false`**: a limiter outage must not stop someone leaving a mailing; the HMAC token already prevents guessing.
4. **`MailMessage` gains `headers?: Record<string, string>`**; the Resend driver passes `dedupeKey` as the `Idempotency-Key` HTTP header and `headers` in the JSON body.

## File map

| File | Responsibility |
|---|---|
| `neon/migrations/0010_mail_outbox.sql`, `lib/db/schema/business.ts` | schema |
| `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts` | schema baselines |
| `lib/mail/availability.ts` | `mailAvailability`, `MAIL_TEMPLATES_VERSION`, `parseRecipientAllowlist` |
| `lib/mail/decide.ts` | `mailKindsForScan`, `decideRecipient`, retry constants |
| `lib/mail/unsubscribe-token.ts` | sign/verify |
| `lib/mail/templates.ts` | `renderScanMail` |
| `lib/mail/enqueue.ts` | `enqueueScanMail` |
| `lib/repositories/mail-outbox.ts` | all outbox SQL |
| `lib/mail/deliver.ts` | `deliverMail` |
| `lib/mail/transport.ts`, `lib/mail/resend-driver.ts` | headers + idempotency |
| `lib/budgets/pause.ts` | `MAIL_PAUSED` |
| `lib/workspace/post-process.ts`, `app/api/cron/dispatch/route.ts` | wiring |
| `app/[locale]/unsubscribe/page.tsx`, `components/mail/unsubscribe-client.tsx`, `app/api/mail/unsubscribe/route.ts` | unsubscribe |
| `app/api/workspaces/[workspaceId]/my-mail-preferences/route.ts`, `.../notification-preferences/route.ts`, `components/workspace/notifications-view.tsx`, `lib/repositories/notifications.ts`, `lib/workspace/queries-pages.ts` | settings |
| `lib/ops/failure-types.ts`, `lib/ops/references.ts`, `lib/repositories/failures.ts`, ops failures page | ops |
| `docs/implementation/owner-platform-v1/{INCIDENT-RUNBOOK.md,rollout/incident-queries.sql}` | runbook |
| `.env.example`, `tests/unhonoured-promises.test.ts`, `tests/i18n.test.ts` | config, guards |

---

### Task 1: Migration 0010 and every schema baseline

**Files:**
- Create: `neon/migrations/0010_mail_outbox.sql`
- Modify: `lib/db/schema/business.ts` (`workspaceMembers` ~701-723; new `mailOutbox` export), `test/integration/fixtures/legacy-final-catalog.json`, `test/integration/neon-schema.integration.test.ts`

**Interfaces:**
- Produces: table `mail_outbox` with columns exactly: `id uuid PK`, `workspace_id uuid not null → workspaces on delete cascade`, `user_id uuid not null → app_users on delete cascade`, `job_id uuid not null → audit_jobs on delete cascade`, `kind text not null` (check `rescan_complete|regression_alert`), `to_address text`, `locale text not null` (check `en|zh-HK|zh-TW`), `state text not null default 'queued'` (check the 7 states), `hold_reason text` (check the 6 reasons; check `(state = 'held') = (hold_reason is not null)`), `payload jsonb not null`, `attempts integer not null default 0`, `lease_token uuid`, `lease_until timestamptz`, `next_attempt_at timestamptz not null default now()`, `provider_message_id text`, `last_error text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `sent_at timestamptz`. Indexes `mail_outbox_due_idx (state, next_attempt_at)`, `mail_outbox_workspace_idx (workspace_id, created_at desc)`. `workspace_members` gains `mail_rescan_complete boolean not null default false`, `mail_regression_alert boolean not null default false`, `mail_locale text` with check `mail_locale is null or mail_locale in ('en','zh-HK','zh-TW')`. Drizzle export `mailOutbox`.

- [ ] **Step 1: Update the failing baseline test.** In `neon-schema.integration.test.ts` add `"0010_mail_outbox.sql"` to the expected applied list, journal count `toBe(10)`, Drizzle `tables.length` `toBe(39)`, and `verifyCatalog` expectation `tables: 37`; leave the other counts for Step 4.
- [ ] **Step 2: Run** `corepack pnpm test:integration -- test/integration/neon-schema.integration.test.ts` — Expected: FAIL (migration missing).
- [ ] **Step 3: Implement** the migration in the 0009 style (no BEGIN/COMMIT; `IF NOT EXISTS`; RLS block with `REVOKE ALL … FROM PUBLIC`, `GRANT SELECT, INSERT, UPDATE, DELETE … TO sme_app_runtime`, `DROP POLICY IF EXISTS` + `CREATE POLICY server_application`), the Drizzle table in the `pgTable(…).enableRLS()` pattern, and the catalog fixture entries in query order.
- [ ] **Step 4: Run** the Step 2 command; set the remaining `verifyCatalog` counts (columns, constraints, indexes) to what the catalog reports and write, in the commit body, the arithmetic for each delta (e.g. columns 422 + 3 + 19 = 444). Then `corepack pnpm db:verify` (applied 10, replay empty) and `corepack pnpm db:types`; commit the regenerated `lib/db/database.types.ts`.
- [ ] **Step 5: Commit** `feat(P3.5c): migration 0010 — mail outbox and member mail preferences`

### Task 2: Mail availability, allowlist and the mail pause switch

**Files:**
- Create: `lib/mail/availability.ts`, `lib/mail/availability.test.ts`
- Modify: `lib/budgets/pause.ts`, `lib/budgets/pause.test.ts`, `.env.example`

**Interfaces:**
- Produces: `MAIL_TEMPLATES_VERSION`; `type MailAvailability = { open: true } | { open: false; reason: "mail_unapproved" | "provider_unconfigured" }`; `mailAvailability(env: Record<string, string | undefined> = process.env): MailAvailability`; `parseRecipientAllowlist(value: string | undefined): Set<string> | null`. `PAUSE_VARIABLES` gains `"MAIL_PAUSED"`; `PauseConfig` gains `mail: boolean`; `PauseEntry` gains `"mail_send"`.

- [ ] **Step 1: Write failing tests.** Availability (explicit env objects, `console.warn` spied): `{}` → `mail_unapproved`, no warn; `"  "` → same; `"2026-08-old"` → `mail_unapproved` + warn `("[mail] approval_mismatch", { expected: "2026-09-event-mail-v1" })`; matching + no provider → `provider_unconfigured`; `it.each(["RESEND_API_KEY","REPORT_EMAIL_FROM","APP_ORIGIN"])` blank → `provider_unconfigured`; secret of 31 bytes → `provider_unconfigured`; secret of 32 bytes + full env → `{ open: true }`; `" 2026-09-event-mail-v1 "` accepted. Allowlist: `undefined`, `""`, `" , ,"` → `null`; `" Owner@Example.com , ,x@y.hk"` → `Set{"owner@example.com","x@y.hk"}` (Review Focus 2). Pause: `MAIL_PAUSED="true"` → `mail: true`; unset → `false`; invalid value → every flag paused (today's rule).
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail/availability.test.ts lib/budgets/pause.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** In `.env.example` add a commented block after the Resend lines: `# APPLICATION_MAIL_APPROVED=2026-09-event-mail-v1`, `# MAIL_UNSUBSCRIBE_SECRET=` (≥ 32 bytes), `# MAIL_RECIPIENT_ALLOWLIST=` (comma-separated test recipients; DEC-05), `# MAIL_PAUSED=false`, with one comment line saying mail stays closed unless the approval equals `MAIL_TEMPLATES_VERSION` in `lib/mail/availability.ts` and the provider, origin and secret are set.
- [ ] **Step 4: Run** Step 2 command plus `corepack pnpm exec vitest run app/api/cron` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): mail stays closed until approved, configured and unpaused`

### Task 3: Decisions, unsubscribe tokens and templates (pure modules)

**Files:**
- Create: `lib/mail/decide.ts`, `lib/mail/unsubscribe-token.ts`, `lib/mail/templates.ts` and a `*.test.ts` beside each

**Interfaces:**
- Consumes: `MailAvailability` (Task 2).
- Produces:
  - `type MailKind = "rescan_complete" | "regression_alert"`; `type HoldReason` (the 6); `MAIL_KINDS`, `HOLD_REASONS`.
  - `mailKindsForScan(job: { status: string }, diff: { comparable: boolean; regressed_findings: string[] } | null): MailKind[]` — `[]` unless status is `done|partial` and `diff` non-null; `rescan_complete` always then; `regression_alert` added iff `comparable && regressed_findings.length > 0`.
  - `interface RecipientFacts { accepted: boolean; kindAllowed: boolean; optedIn: boolean; address: string | null }`; `decideRecipient(facts: RecipientFacts, ctx: { availability: MailAvailability; allowlist: Set<string> | null }): { state: "queued" } | { state: "held"; reason: HoldReason }` in the Global Constraints order; the allowlist compares `address.trim().toLowerCase()`.
  - `MAX_ATTEMPTS = 5`, `LEASE_MINUTES = 5`, `BATCH_SIZE = 10`, `EXPIRY_HOURS = 24`, `retryDelayMinutes(attempt: number): number | null` (1→5, 2→15, 3→60, 4→240, ≥5→null meaning dead).
  - `interface UnsubscribePayload { userId: string; workspaceId: string; kind: MailKind; expiresAt: number }` (epoch ms); `signUnsubscribeToken(payload, secret: string): string` → `base64url(JSON)` + `.` + `base64url(hmac)`; `verifyUnsubscribeToken(token: string, secret: string, now = Date.now()): UnsubscribePayload | null` (constant-time compare via `timingSafeEqual`; null on malformed, bad signature, unknown kind, expired); `UNSUBSCRIBE_TTL_MS = 90 days`.
  - `renderScanMail(kind: MailKind, locale: "en"|"zh-HK"|"zh-TW", input: { businessName: string; regressedCount: number | null; workspaceUrl: string; unsubscribeUrl: string }): { subject: string; text: string; html: string }` — `html` HTML-escapes every interpolated value and renders URLs as `<a href>`.

Copy (exact; `{…}` interpolated):

| | en | zh-HK | zh-TW |
|---|---|---|---|
| rescan subject | Rescan complete: {business} | 重新掃描完成：{business} | 重新掃描完成：{business} |
| rescan body | Your latest scan of {business} has finished. Open your workspace to see the refreshed evidence and actions: {workspaceUrl} | {business} 的最新掃描已完成。開啟工作台查看更新後的證據及行動：{workspaceUrl} | {business} 的最新掃描已完成。開啟工作台查看更新後的證據與行動：{workspaceUrl} |
| regression subject | New issues found: {business} | 發現新問題：{business} | 發現新問題：{business} |
| regression body | The latest comparable scan of {business} found {count} issue(s) that were not there last time. Open your workspace to see what changed: {workspaceUrl} | {business} 最新一次可比較掃描發現 {count} 項上次沒有的問題。開啟工作台查看變化：{workspaceUrl} | {business} 最新一次可比較掃描發現 {count} 項上次沒有的問題。開啟工作台查看變化：{workspaceUrl} |
| footer (rescan) | You're receiving this because you turned on rescan emails for this workspace. Stop these emails: {unsubscribeUrl} | 你收到此電郵，是因為你在此工作台開啟了重新掃描電郵。停止接收：{unsubscribeUrl} | 你收到這封電子郵件，是因為你在這個工作台開啟了重新掃描通知。停止接收：{unsubscribeUrl} |
| footer (regression) | You're receiving this because you turned on regression alerts for this workspace. Stop these emails: {unsubscribeUrl} | 你收到此電郵，是因為你在此工作台開啟了退步提示。停止接收：{unsubscribeUrl} | 你收到這封電子郵件，是因為你在這個工作台開啟了退步提醒。停止接收：{unsubscribeUrl} |

`text` = body + blank line + footer.

- [ ] **Step 1: Write failing tests.** `mailKindsForScan`: failed → `[]`; done + null diff → `[]`; partial + incomparable diff with regressions → `["rescan_complete"]`; done + comparable, `regressed_findings: []`, `decayed_findings` non-empty → `["rescan_complete"]`; done + comparable + one regression → both. `decideRecipient`: one case per reason proving order (e.g. closed + not accepted → `mail_unapproved`; open + not accepted + opted out → `not_member`; allowlist excludes → `not_allowlisted`; all good → queued). `retryDelayMinutes` table incl. 5 → null. Token: round trip; tampered payload, tampered signature, other secret, expired (`now = expiresAt + 1`), unknown kind, `"abc"` → null. Templates: each kind × locale matches the table; `businessName` `<b>&"x"` is escaped in `html`, raw in `text`; no string contains "delivered".
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail` — Expected: FAIL.
- [ ] **Step 3: Implement** the three modules (no DB, no env reads).
- [ ] **Step 4: Run** Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): mail decisions, signed unsubscribe tokens and templates`

### Task 4: The outbox repository

**Files:**
- Create: `lib/repositories/mail-outbox.ts`, `test/integration/neon-mail-outbox.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 schema; Task 3 types/constants.
- Produces `mailOutboxRepository(client: PoolClient | Pool)` and `export type MailOutboxRepository = ReturnType<typeof mailOutboxRepository>`; `ClaimedRow` is the full outbox row with snake_case column names (`id, workspace_id, user_id, job_id, kind, to_address, locale, state, hold_reason, payload, attempts, lease_token, lease_until, next_attempt_at, created_at`), with `lease_token` non-null. Methods:
  - `recipients(workspaceId: string, kind: MailKind): Promise<Array<{ userId: string; facts: RecipientFacts; locale: "en"|"zh-HK"|"zh-TW" | null }>>` — accepted members with `user_id`; `address` = `app_users.email`; `kindAllowed` from `workspaces.notify_rescan_complete|notify_regression_alert`; `optedIn` from the member column; `locale` = `mail_locale`.
  - `insert(rows: OutboxInsert[]): Promise<number>` — `on conflict (id) do nothing`; `OutboxInsert = { id; workspace_id; user_id; job_id; kind; to_address: string | null; locale; state: "queued" | "held"; hold_reason: HoldReason | null; payload }`.
  - `claimDue(now: Date, limit: number): Promise<ClaimedRow[]>` — one statement: select `where (state in ('queued','retry') and next_attempt_at <= now) or (state = 'sending' and lease_until < now)` order by `next_attempt_at` limit `limit` `for update skip locked`, update to `sending`, fresh `lease_token = gen_random_uuid()`, `lease_until = now + 5 min`, `attempts + 1`, `updated_at`; returns full rows.
  - `sendFacts(row: ClaimedRow): Promise<RecipientFacts>` — current membership/gate/switch/address for that row.
  - `finish(id: string, leaseToken: string, outcome: FinishOutcome): Promise<boolean>` — updates only `where id = $1 and lease_token = $2 and state = 'sending'`; clears the lease; returns whether a row changed. `FinishOutcome = { state: "sent"; providerMessageId: string; toAddress: string } | { state: "retry"; nextAttemptAt: Date; error: string } | { state: "dead"; error: string } | { state: "held"; reason: HoldReason } | { state: "expired" }`.
  - `optOut(userId: string, workspaceId: string, kind: MailKind): Promise<{ member: boolean }>` — in one transaction: set the member column false (only for an accepted member) and move that member's `queued|retry` rows of that kind to `held/opted_out`; `member: false` when no accepted row matched.
  - `setMemberSwitches(workspaceId, userId, { rescanComplete?: boolean; regressionAlert?: boolean; locale })` and `memberSwitches(workspaceId, userId)`.
  - `counts(since: Date): Promise<{ queued: number; dead: number; held: Record<HoldReason, number> }>` and `deadRows(limit: number)` for ops.

- [ ] **Step 1: Write the failing integration test** (Docker harness as in `neon-scan-claim-budget.integration.test.ts`: `startNeonDatabaseFixture`, runtime role, `applyMigrations`): insert the same id twice → one row, and a `held` row is not reset (Review Focus 3); 8 concurrent `claimDue(now, 10)` over 3 due rows → each id returned exactly once in total; a `sending` row with `lease_until` in the past is reclaimed with a new token, and `finish` with the old token returns `false` and leaves the new holder's row unchanged (Review Focus 4); `optOut` flips the switch and holds the member's queued row; `optOut` for a removed member returns `{ member: false }` and changes nothing; `recipients` reads gate/switch/address/locale correctly; `counts` groups held reasons.
- [ ] **Step 2: Run** `corepack pnpm test:integration -- test/integration/neon-mail-outbox.integration.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** in the style of `lib/repositories/*` (parameterised SQL only).
- [ ] **Step 4: Run** Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): mail outbox repository with leased, skip-locked claims`

### Task 5: Enqueue inside the completion transaction

**Files:**
- Create: `lib/mail/enqueue.ts`, `lib/mail/enqueue.test.ts`
- Modify: `lib/workspace/post-process.ts` (after the `scan.completed` notification), `lib/workspace/post-process.test.ts`, `test/integration/neon-mail-outbox.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `enqueueScanMail(repo: Pick<MailOutboxRepository, "recipients" | "insert">, input: { workspaceId: string; jobId: string; status: string; businessName: string; market: "hk" | "tw"; workspacePath: string | null; diff: { comparable: boolean; regressed_findings: string[] } | null }, env = process.env): Promise<number>` — ids `completionId("mail", workspaceId, jobId, kind, userId)`; locale fallback `hk→zh-HK`, `tw→zh-TW`; `to_address` = address when present; payload `{ businessName, regressedCount: kind === "regression_alert" ? regressed_findings.length : null, workspacePath }`; errors propagate.

- [ ] **Step 1: Write failing tests.** Unit with a fake repo: closed mail → rows `held/mail_unapproved` for every member; open + gate off → `kind_disabled`; member without address → `no_address`, `to_address` null; allowlisted/not; locale fallback per market; regression row payload count; failed status → nothing inserted; ids stable across two calls. `post-process.test.ts`: `enqueueScanMail` called with the diff after the in-app notification; a thrown enqueue makes `postProcessWorkspaceScan` return `error`. Integration: running the enqueue twice in two transactions for the same job yields one row per member/kind.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail/enqueue.test.ts lib/workspace/post-process.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** and wire: in `postProcessWorkspaceScan`, after `notification` succeeds, call `enqueueScanMail(mailOutboxRepository(db), { …, market: snapshot.market, workspacePath: await workspaceHref(…), diff })` using the `diff` already loaded.
- [ ] **Step 4: Run** Step 2 command, `lib/workspace`, and the integration file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): queue scan emails exactly once in the completion transaction`

### Task 6: Delivery, driver headers and the cron step

**Files:**
- Create: `lib/mail/deliver.ts`, `lib/mail/deliver.test.ts`
- Modify: `lib/mail/transport.ts`, `lib/mail/resend-driver.ts` (+ tests), `app/api/cron/dispatch/route.ts` (+ test), `test/integration/neon-mail-outbox.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `MailMessage.headers?: Record<string, string>`; `deliverMail(deps: { repo: MailOutboxRepository; transport: MailTransport; env?: Record<string, string | undefined>; now?: () => Date }): Promise<{ sent: number; retried: number; held: number; dead: number; expired: number; paused: boolean }>`. Cron response gains `mail`.

- [ ] **Step 1: Write failing tests.** `deliver.test.ts` (fake repo + fake transport): paused → no claim, `paused: true`, `logPauseRefusal("mail_send")`; per claimed row: > 24 h old → `expired`, no send; each re-check failure → `held` with reason (unsubscribed → `opted_out`, removed → `not_member`: Review Focus 1); success → `sent` with provider id and current address; `failed` on attempt 1..4 → `retry` with `nextAttemptAt = now + retryDelayMinutes(attempt)`; attempt 5 → `dead`; `not_configured` → `held/mail_unapproved`; message has `dedupeKey = row.id`, headers `List-Unsubscribe: <{APP_ORIGIN}/api/mail/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, text/html from `renderScanMail` with `workspaceUrl = APP_ORIGIN + workspacePath` (or `APP_ORIGIN` when null) and `unsubscribeUrl = {APP_ORIGIN}/{locale}/unsubscribe?token=…`; a `finish` returning false is counted nowhere and logged `mail_lease_lost`; logs never contain the address. Resend driver: `Idempotency-Key` header equals `dedupeKey`; `headers` passed through in the body. Cron route test: `mail` step runs after reconcile, its failure is logged `step: "deliver_mail"` without failing other steps.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/mail app/api/cron` — Expected: FAIL.
- [ ] **Step 3: Implement.** In the cron route add a sixth independent try/catch step after `reconcile_stuck_completions` calling `deliverMail({ repo: mailOutboxRepository(<the same pool/client the route's other repository steps use>), transport: createMailTransport() })`.
- [ ] **Step 4: Run** Step 2 command and the integration file (add: a row unsubscribed between enqueue and `deliverMail` ends `held/opted_out`) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): deliver queued mail from the cron tick with leases and retries`

### Task 7: Unsubscribe page and route

**Files:**
- Create: `app/[locale]/unsubscribe/page.tsx`, `components/mail/unsubscribe-client.tsx`, `app/api/mail/unsubscribe/route.ts`, tests beside the route and page
- Modify: `lib/security/rate-limit.ts` (`RATE_LIMITS.mail_unsubscribe`: 30 per hour per IP), `lib/messages/*.json` (`mail.unsubscribe*` keys, see Task 8 table), `tests/i18n.test.ts` (`"mail"` in `APP_NAMESPACES`)

**Interfaces:**
- Consumes: `verifyUnsubscribeToken`, `mailOutboxRepository().optOut`.
- Produces: `POST /api/mail/unsubscribe` accepting the token from `?token=` (RFC 8058 one-click, body `List-Unsubscribe=One-Click`) or a JSON body `{ token }`; `200 { ok: true }` on success (idempotent), `400 { error: "invalid_link" }` for bad/expired token or `{ member: false }`, `429` from the limiter (`failClosed: false`), `503 { error: "unavailable" }` when `MAIL_UNSUBSCRIBE_SECRET` is short/missing. The page (noindex, like `unlock/[slug]/page.tsx`) verifies the token server-side only to choose between the confirm view (button) and the neutral invalid view; it never calls `optOut`.

- [ ] **Step 1: Write failing tests.** Route: valid token → 200 and `optOut(userId, workspaceId, kind)` called once; repeat → 200; tampered/expired/other-secret → 400, `optOut` not called; `{ member: false }` → 400 (Review Focus 5); one-click form body with query token → 200; GET → 405. Page: valid token renders the confirm button text and never calls the repository (mock asserts zero calls); invalid token renders `mail.unsubscribeInvalid`; `robots` noindex in metadata.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run app/api/mail "app/[locale]/unsubscribe" tests/i18n.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (client component POSTs `{ token }` and shows `mail.unsubscribeDone` or the invalid text).
- [ ] **Step 4: Run** Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): one-click unsubscribe that never changes anything on GET`

### Task 8: Settings — owner gates, member switches, honest copy

**Files:**
- Create: `app/api/workspaces/[workspaceId]/my-mail-preferences/route.ts` (+ test), `components/workspace/notifications-view.test.tsx` (if absent)
- Modify: `app/api/workspaces/[workspaceId]/notification-preferences/route.ts` (+ test), `components/workspace/notifications-view.tsx`, `lib/workspace/queries-pages.ts` (`NotificationsModel` gains `role`, `mailOpen`, `myEmails: { rescanComplete: boolean; regressionAlert: boolean }`, `myAddress: string | null`), the notifications page route, `lib/messages/*.json`, `tests/unhonoured-promises.test.ts`

**Interfaces:**
- Consumes: `mailAvailability`, `mailOutboxRepository().setMemberSwitches/memberSwitches`.
- Produces: `PATCH /api/workspaces/[id]/my-mail-preferences` — any accepted member (`authorizeWorkspaceRequest({ id })`), body `{ rescanComplete?: boolean; regressionAlert?: boolean; locale: "en"|"zh-HK"|"zh-TW" }`, 400 on non-boolean/unknown keys/bad locale, 200 `{ ok: true }`, rate-limited under the existing `action_mutation` scope. `notification-preferences` PATCH → `minRole: "owner"` (departure 2).

Messages `mail.*` (exact):

| key | en | zh-HK | zh-TW |
|---|---|---|---|
| allowTitle | Allow these emails in this workspace | 允許此工作台發送以下電郵 | 允許這個工作台寄送以下電子郵件 |
| myEmailsTitle | My emails | 我的電郵 | 我的電子郵件 |
| rescanComplete | Rescan complete | 重新掃描完成 | 重新掃描完成 |
| regressionAlert | New issues found (regression alert) | 發現新問題（退步提示） | 發現新問題（退步提醒） |
| monthlyDigest | Monthly digest · Planned | 每月摘要 · 規劃中 | 每月摘要 · 規劃中 |
| closedNote | Email is not switched on yet. Your choices are saved and take effect once it is. | 電郵功能尚未開啟。你的選擇已儲存，開啟後生效。 | 電子郵件功能尚未開啟。你的選擇已儲存，開啟後生效。 |
| openNote | We'll email you at {address} when these happen. | 發生以下情況時，我們會電郵至 {address}。 | 發生以下情況時，我們會寄送電子郵件至 {address}。 |
| ownerOnly | Only the workspace owner can change these. | 只有工作台擁有人可以更改。 | 只有工作台擁有者可以變更。 |
| unsubscribeTitle | Stop these emails | 停止接收這些電郵 | 停止接收這些電子郵件 |
| unsubscribeConfirm | Unsubscribe | 取消訂閱 | 取消訂閱 |
| unsubscribeDone | You're unsubscribed. You can turn these emails back on in your workspace settings. | 已取消訂閱。你可在工作台設定中重新開啟。 | 已取消訂閱。你可以在工作台設定中重新開啟。 |
| unsubscribeInvalid | This link is no longer valid — manage emails in your workspace settings. | 此連結已失效 — 請在工作台設定中管理電郵。 | 這個連結已失效 — 請在工作台設定中管理電子郵件。 |

(If Task 7 already added the `unsubscribe*` keys, keep them.)

- [ ] **Step 1: Write failing tests.** Route tests: my-mail-preferences — viewer 200 and repository called with the caller's own user id only; bad body 400; unauthenticated 401. notification-preferences — manager/viewer now 403, owner 200 (update existing cases). View: closed → `closedNote` in both cards and no `openNote`; open → `openNote` with the address; non-owner sees the owner card switches disabled plus `ownerOnly`; the monthly digest switch is labelled Planned. `tests/unhonoured-promises.test.ts`: replace the "outbound notification email sender" `PROMISES` entry with a `KEPT` entry whose `exists()` requires `lib/mail/deliver.ts` to call `createMailTransport` and `components/workspace/notifications-view.tsx` to render `mail.openNote` only under `mailOpen`.
- [ ] **Step 2: Run** `corepack pnpm exec vitest run "app/api/workspaces/[workspaceId]/my-mail-preferences" "app/api/workspaces/[workspaceId]/notification-preferences" components/workspace tests` — Expected: FAIL.
- [ ] **Step 3: Implement**, reusing existing classes (`section-card`, `limitation-note`, `CapabilityBadge`) and the existing switch markup; no new CSS.
- [ ] **Step 4: Run** Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): owners gate workspace email, members choose their own`

### Task 9: Operator visibility and the runbook

**Files:**
- Modify: `lib/ops/failure-types.ts`, `lib/ops/references.ts`, `lib/repositories/failures.ts`, `app/[locale]/ops/failures/page.tsx` (+ tests), `docs/implementation/owner-platform-v1/INCIDENT-RUNBOOK.md`, `docs/implementation/owner-platform-v1/rollout/incident-queries.sql`

**Interfaces:**
- Consumes: `mailOutboxRepository().counts/deadRows`.
- Produces: `FAILURE_KINDS` gains `"mail_dead"`; `mailReference(id)` → `MAIL-` + first 6 hex uppercased; `OperatorHealth.open.mail_dead: number` and `OperatorHealth.mail: { queued: number; held: Record<HoldReason, number> }` (last 24 h); failure items for `mail_dead` carry workspace slug, `last_error` category and attempts — never `to_address`.

- [ ] **Step 1: Write failing tests.** Failures repository/unit: a dead row appears as `mail_dead` with reference `MAIL-XXXXXX` and no address field anywhere in the serialised item; health counts include `mail_dead` and held reasons; the ops page renders the mail counts. `lib/ops/incident-queries.test.ts` stays the cross-check: add blocks `mail_outbox_by_state`, `mail_outbox_dead`, `mail_outbox_hold_reasons` (all `-- mode: read`, none selecting `to_address`) and reference each as `` `query:<name>` `` in a new runbook section "Email paused or failing (`MAIL_PAUSED`)" (how to pause, what stays queued, 24 h expiry, where dead rows show).
- [ ] **Step 2: Run** `corepack pnpm exec vitest run lib/ops lib/repositories "app/[locale]/ops"` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** Step 2 command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(P3.5c): dead mail and hold reasons in the operator view and runbook`

### Task 10: Gates, mutation checks and the phase record

**Files:**
- Modify: `docs/implementation/owner-platform-v1/PHASE-3-REPORT.md`, `PHASE-3-TEST-RESULTS.md` (append `## P3.5c — application-email outbox` after the P3.3 section)

- [ ] **Step 1: Unchanged check.** `git diff --stat 0190030 -- packages neon/migrations/0001_identity.sql neon/migrations/0002_business.sql neon/migrations/0003_workflows.sql neon/migrations/0004_atomic_operations.sql neon/migrations/0005_owner_removal_guard.sql neon/migrations/0006_action_applications.sql neon/migrations/0007_action_verification.sql neon/migrations/0008_workspace_internal.sql neon/migrations/0009_scan_attempts.sql` — Expected: empty.
- [ ] **Step 2: Gates, one at a time, nothing else running:** `typecheck`, `lint`, `test`, `test:integration`, `db:verify` (applied 10, replay empty, counts from Task 1), `build` (may be blocked by the standing Turbopack/radix-ui cascade → record blocked and run `npx next build --webpack` as a labelled diagnostic). Load-induced 5 s timeouts in untouched files: re-run the file alone, record both. Counts compared against the P3.3 record with the same command.
- [ ] **Step 3: Mutation checks** (scratch script outside the repo; exact-once pattern; restore bytes; verify `git diff --quiet`): (a) `mailAvailability` returns open when the approval is blank → availability tests fail; (b) `deliverMail` skips `sendFacts` re-check → the opted-out/removed tests fail; (c) the unsubscribe page calls `optOut` → page test fails; (d) `claimDue` without `skip locked` → the concurrent-claim integration test fails; (e) `finish` ignores `lease_token` → the stale-lease test fails.
- [ ] **Step 4: Append the phase record** in the P3.3 section's structure: header (branch, HEAD, base `0190030`, spec, plan, environment line, bold **Implemented and locally verified. Nothing here is hosted-verified.**), what it closes (Master Plan §6 P3.5 outbox item; DEC-05/07 safe defaults), commits table, departures above, verification table, mutation table, spec §10 known limits, and owner actions: apply migration 0010 before deploying (same rehearsed procedure as 0009); to open mail set `APPLICATION_MAIL_APPROVED=2026-09-event-mail-v1`, `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `APP_ORIGIN`, a ≥ 32-byte `MAIL_UNSUBSCRIBE_SECRET`, optionally `MAIL_RECIPIENT_ALLOWLIST`, then redeploy; `MAIL_PAUSED=true` stops sending without losing queued rows (they expire after 24 h).
- [ ] **Step 5: Commit** `docs(P3.5c): record the mail outbox and its evidence`
