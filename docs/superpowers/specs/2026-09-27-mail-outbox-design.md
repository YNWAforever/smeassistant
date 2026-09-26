# P3.5c — Application-email outbox on safe defaults: design

**Date:** 2026-09-27 · **Branch:** `p35c-mail-outbox` (stacked on `claude/commercial-contract-design-3b8561`, PR #25) · **Status:** approved in brainstorming, awaiting spec review

## Why

Master Plan §6 P3.5: "Application-email outbox/reconciliation where needed for reliable recurring notifications. Do not send weekly reminders unless recipients/channel and opt-out behavior are configured and authorized." DEC-05 (authorized recipients, delivery-testing budget) and DEC-07 (application-email channel) are open, so their safe defaults apply: fixtures only, no real mail, no inbox-delivery promise, in-app status authoritative.

Today:

- In-app `workspace_notifications` are live (`lib/workspace/notify.ts`), written inside the scan-completion transaction by `postProcessWorkspaceScan` (`lib/workspace/post-process.ts`) with deterministic ids from `completionId()`.
- `workspaces.notify_rescan_complete / notify_regression_alert / notify_monthly_digest` are saved by any member and do nothing; the Notifications page says so.
- `lib/mail/transport.ts` + `lib/mail/resend-driver.ts` are a dormant, fetch-based Resend driver (`not_configured | accepted_by_provider | failed`) with no callers.
- No outbox, no digest, no per-member opt-out, no stored member locale.
- The completion ledger (`workspace_scan_completions`: claim → lease → retry → reconcile on the 5-minute cron tick) is the reliability pattern to mirror; `app/api/cron/dispatch/route.ts` is the only cron route; P3.5d pause switches live in `lib/budgets/pause.ts`.

## Decisions (user, 2026-09-27)

| Question | Decision |
|---|---|
| Which mail | **Event mail only:** rescan-complete and regression-alert. The monthly digest stays unbuilt (recurring reminders need DEC-05/07). |
| Opt-out | **Per member, opt-in (default off), with a signed one-click unsubscribe link.** Workspace switches become owner-only "allow this kind" gates. |
| While mail is closed | **Record rows as `held` with a terminal reason**; held rows are never sent later. |
| Approach | **Transactional outbox** written in the completion transaction, delivered by a new step of the existing cron tick. |

## 1. Data — migration `0010_mail_outbox.sql`

Additive; follows the 0005–0009 conventions (RLS enabled, `server_application` policy for `sme_app_runtime`, explicit `on delete`), with matching Drizzle schema in `lib/db/schema/`.

- `workspace_members` gains `mail_rescan_complete boolean not null default false`, `mail_regression_alert boolean not null default false`, `mail_locale text` (null; check `en|zh-HK|zh-TW`).
- New table `mail_outbox`:

| column | notes |
|---|---|
| `id uuid primary key` | deterministic: `completionId("mail", workspaceId, jobId, kind, userId)` |
| `workspace_id` | → `workspaces` on delete cascade |
| `user_id` | → `app_users` on delete cascade |
| `job_id` | → `audit_jobs` on delete cascade |
| `kind` | check `rescan_complete | regression_alert` |
| `to_address text` | null when held before an address is resolved |
| `locale text not null` | `en | zh-HK | zh-TW` |
| `state text not null` | check `queued | sending | sent | retry | held | dead | expired` |
| `hold_reason text` | check `mail_unapproved | kind_disabled | opted_out | no_address | not_allowlisted | not_member`; non-null iff `state='held'` |
| `attempts int not null default 0`, `lease_token uuid`, `lease_until`, `next_attempt_at`, `provider_message_id`, `last_error text` | `last_error` is a category code, never provider text containing addresses |
| `created_at`, `updated_at`, `sent_at` | |

Indexes: `(state, next_attempt_at)` for claiming; `(workspace_id, created_at desc)` for ops reads.

## 2. Mail availability — `lib/mail/availability.ts`

```ts
export const MAIL_TEMPLATES_VERSION = "2026-09-event-mail-v1";
export type MailAvailability = { open: true } | { open: false; reason: "mail_unapproved" | "provider_unconfigured" };
export function mailAvailability(env = process.env): MailAvailability;
```

- Open only when `APPLICATION_MAIL_APPROVED` (trimmed) equals `MAIL_TEMPLATES_VERSION` **and** `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `APP_ORIGIN` are non-blank **and** `MAIL_UNSUBSCRIBE_SECRET` is at least 32 bytes. Unset/blank approval → closed silently; set but different → closed + `console.warn("[mail] approval_mismatch", { expected })`. Both reasons map to hold reason `mail_unapproved`.
- A template change is a reviewed code change with a new version, so an old approval never covers new wording.
- `MAIL_RECIPIENT_ALLOWLIST` (optional, comma-separated, case-insensitive addresses): when set, only listed addresses may be queued/sent; others hold `not_allowlisted`. This is DEC-05's authorized-recipient/testing control.
- `.env.example` documents all new variables, commented out.

## 3. Enqueue — inside the completion transaction

`lib/mail/enqueue.ts::enqueueScanMail(db, { job, diff })`, called from `postProcessWorkspaceScan` after the in-app notification, on the same `PoolClient`:

- **Rescan complete:** job `done|partial`, workspace-linked, and a `scan_diffs` row exists with this job as head (comparable or not).
- **Regression alert:** that diff is `comparable` and `regressed_findings` is non-empty. `decayed_findings` never count.
- Failed scans enqueue nothing.
- Recipients = accepted members with a `user_id`. For each, decide once, in this order: `mail_unapproved` (availability closed) → `kind_disabled` (workspace `notify_rescan_complete` / `notify_regression_alert` false) → `opted_out` (member switch false) → `no_address` (no `app_users.email`) → `not_allowlisted` → `queued`. `to_address` = `app_users.email` (the verified sign-in address), `locale` = `mail_locale` else market default (`hk → zh-HK`, `tw → zh-TW`).
- Insert with `on conflict (id) do nothing`: a re-run completion never duplicates or resurrects a row.
- Enqueue failure throws, like the in-app notification: the completion retries, so mail is never silently skipped.

## 4. Delivery — `deliverMail` step in `app/api/cron/dispatch/route.ts`

Runs after the completion reconcile, in its own try/catch like the other steps. `lib/mail/deliver.ts` + `lib/repositories/mail-outbox.ts`:

- `MAIL_PAUSED` joins `PAUSE_VARIABLES` in `lib/budgets/pause.ts` (`pauseState().mail`; invalid value → paused, as today) with a new `PauseEntry` `"mail_send"`. Paused → step skipped, rows stay `queued|retry`.
- Claim up to 10 rows `where state in ('queued','retry') and next_attempt_at <= now()` **or** `state='sending' and lease_until < now()` (reclaim a crashed send), `for update skip locked`, set `sending`, new `lease_token`, `lease_until = now() + 5 min`, `attempts + 1`.
- Before sending, re-check: availability, workspace gate, member still accepted (`not_member`), member switch, allowlist, address. A failing check → `held` with that reason. A row whose `created_at` is older than 24 h → `expired`.
- Send through `createMailTransport()`; the driver gains an `Idempotency-Key: <row id>` header and `List-Unsubscribe: <https://…/api/mail/unsubscribe?token=…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
- Results, finished only if the row still holds the claimed `lease_token`: `accepted_by_provider` → `sent` + `provider_message_id` + `sent_at` (never described as "delivered"); `failed` → `retry` with `next_attempt_at` +5, +15, +60, +240 min by attempt; attempt 5 failing → `dead`; `not_configured` → `held mail_unapproved`.
- Logs carry category + row id, never an address or token.

## 5. Unsubscribe

- `lib/mail/unsubscribe-token.ts`: `signUnsubscribeToken({ userId, workspaceId, kind, expiresAt })` / `verifyUnsubscribeToken(token)`; HMAC-SHA256 with `MAIL_UNSUBSCRIBE_SECRET`, base64url payload, constant-time compare, 90-day expiry.
- `GET /[locale]/unsubscribe?token=` renders a confirm page (no mutation — mail scanners prefetch links) with a button that POSTs.
- `POST /api/mail/unsubscribe` (form or RFC 8058 one-click body): verifies the token, sets that member's switch for that kind to false (idempotent), and holds that member's queued/retry rows of that kind as `opted_out`. No session needed. Invalid/expired → the same neutral page ("This link is no longer valid — manage emails in your workspace settings"), status 400, nothing revealed. Rate-limited with the existing limiter.

## 6. Settings and copy

- Notifications page: the owner card keeps the workspace switches, relabelled as "Allow these emails in this workspace" (rescan complete, regression alert; the monthly-digest switch stays saved and is labelled Planned). A new **"My emails"** card lets each member set their own two switches via `PATCH /api/workspaces/[id]/my-mail-preferences` (saving also stores the current page locale as `mail_locale`).
- While mail is closed, both cards keep today's honest note (email not enabled yet; choices are saved). While open: "We'll email you at {address} when…". Copy lives in a new `mail` namespace in `lib/messages/{en,zh-HK,zh-TW}.json`.
- Emails: `lib/mail/templates.ts`, plain text + minimal HTML, per locale: what happened, a link to the workspace (`APP_ORIGIN` + workspace href), why you are receiving it, and the unsubscribe link. No scores without coverage (guardrail 1), no causal claims (guardrail 4).
- `tests/unhonoured-promises.test.ts`: the existing "outbound notification email sender" entry is replaced by a KEPT promise — "We'll email you" copy requires the outbox sender (`lib/mail/deliver.ts`) and is only rendered when `mailAvailability().open`.

## 7. Operations

- The P3.5b failure read model (`lib/repositories/failures.ts`) gains kind `mail` for `dead` rows: reference `MAIL-` + first 6 of id, workspace slug, last error category, attempts; no address. The health strip adds outbox counts (queued, dead, held by reason, last 24 h).
- `INCIDENT-RUNBOOK.md` gains a `MAIL_PAUSED` section and named SQL blocks (outbox by state, dead rows, hold reasons) in `rollout/incident-queries.sql`.

## 8. Error handling

- Mail can never fail a scan or a completion beyond a retryable completion error at enqueue.
- Closed, paused, unconfigured or misconfigured mail sends nothing and never claims success.
- A crashed send is reclaimed after its lease; the idempotency key prevents a provider-side duplicate.

## 9. Testing

- **Unit:** availability parsing (unset, blank, mismatch logs, each missing variable, short secret, open); enqueue decision order for every hold reason and both kinds (decayed-only diff → no regression mail; failed scan → nothing); send-time re-checks; lease-token guard; backoff schedule, `dead` at 5, `expired` at 24 h; pause skip; driver headers; token sign/verify/tamper/expiry; GET renders without mutating; POST idempotent; copy in three locales.
- **Integration (Docker Postgres):** exactly-once enqueue in the completion transaction, including a duplicate completion run; two concurrent claims never take the same row; lease-expiry reclaim; unsubscribe holds queued rows; migration 0010 in `db:verify`.
- **Mutation checks:** availability defaulting open; skipping the send-time re-check; GET unsubscribe mutating; claim without `skip locked` — each must fail a test.
- No test calls Resend.

## 10. Known limits

- No monthly digest or any recurring reminder (waits for DEC-05/07).
- No real mail sent or inbox delivery verified; `sent` means accepted by the provider.
- No bounce/complaint webhook; a hard bounce is not fed back into opt-outs.
- Opening mail needs the approval variable, full provider configuration, a secret and a redeploy.
- Held rows are terminal: switching mail on does not send anything that happened while it was closed.
