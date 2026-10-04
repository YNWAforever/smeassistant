# Business, Operating and Hosted Decisions

These are pending decisions/authorizations, not new audit findings. They do not block safe local implementation and fixtures where a feature can remain disabled. They do block unapproved exposure, spend, ownership assignment, billing or readiness claims.

**Nothing in this file records permission already granted.** Do not fill approvals with assumptions. No secret values belong here.

| ID | Phase | Decision or permission needed | Safe implementation default until approved | What to record before activation |
|---|---|---|---|---|
| DEC-01 | 1 | Current intended production alias, protection and automatic deployment policy. | Preserve existing hosted settings; use a branch and accurate documentation. Do not take the site down or merge to main to test. | Decision owner, exact project/origin, deployment policy, approved change and rollback. |
| DEC-02 | 1 | Runtime compatibility target and any hosted runtime change. | Inspect actual code/config; test the candidate's intended runtime. No opportunistic Next.js/Node/auth upgrade. | Chosen versions, local/CI/host alignment, tests and any separately authorized hosted change. |
| DEC-03 | 1 | Read-only environment inventory and ownership-claim configuration/Google callbacks. | Implement validation and local tests; keep disabled capabilities honest. | Target/commit, variable names and presence, callback URIs, authorized test account and business. |
| DEC-04 | 1–3 | Provider-spending acceptance budget and test-business scope. | Use owned fixtures. Do not start live scans, generations or rescans. | Providers, HK/TW business references, operation/attempt limits, monetary/quota ceiling and stop condition. |
| DEC-05 | 1–2 | Authorized identity/email recipients and delivery-testing budget. | Fixtures only; no real mail. Retain truthful anti-enumeration and unavailable-state copy. | Recipient references, permitted test cases/count, sender identity, expiry/replay/logout test scope. |
| DEC-06 | 2 | Assisted-verification procedure, operator authorization and queue ownership. | Build protected request/status/queue code, but do not enable real approvals or claim an operating service exists. | Named accountable operating role, reviewer access rules, accepted independent verification methods, rejection/transfer policy and retention/access rules. |
| DEC-07 | 2–3 | Application-email channel and invitation/report-recovery behavior. | No WhatsApp/LINE sender or inbox-delivery promise. In-app status remains authoritative. | Provider configuration, permitted sender/recipients, template/token scope/expiry, retry/deduplication and failure handling. |
| DEC-08 | 3 | Public pricing, currencies, tier names, allowances, period definition and seat policy. | Preserve existing code as the regression baseline; remove unsupported claims, leave checkout unavailable. Do not silently market unlimited delivery or invent a new price. | Approved versioned commercial matrix and upgrade/downgrade/rollover/over-limit rules. |
| DEC-09 | 3 | Stripe test mode and eventual paid rollout. | Billing unavailable; negative boundaries still work. | Test account/origin, permitted events/checkout/portal, no live charges, webhook configuration, acceptance evidence and separate production sign-off. |
| DEC-10 | 3 | Single scheduler deployment, run frequency and provider budget. | Local/fake-clock tests; no hosted cron activation. Discover existing executors first. | Scheduler identity, protected endpoint, schedule/rate/budget, pause/retry policy, actual execution proof. |
| DEC-11 | All | Hosted migrations or data backfills. | Owned fixture only; no production credentials as test fallback. | Exact isolated/production target, migration review, backup/recovery evidence, bounded backfill scope and authorization. |
| DEC-12 | 4 | Provisional unsaved-preview experiment. **Decided 2026-10-04 (user); see "DEC-12 — decided 2026-10-04" below.** | Feature off; main scanner/verified claim flow remains the entrance. The P4.5 code is built behind `PREVIEW_DRAFT_ENABLED`, which ships unset. | Eligible traffic, purpose-limited grant, input/privacy model, generation budget and success/failure metrics: recorded below. Activation still needs `0013` applied (a DEC-11 action) and the flag set by the owner. |
| DEC-13 | 4 | One direct publishing provider and operation. | No activation, publication, external consent or marketing claim. | Provider/account/location, scopes, exact approved-version confirmation, permitted test destination, idempotency/receipt/revocation handling and separate release approval. |
| DEC-14 | 4 | Delivery units for multi-output promotions/packs or future publishing. | Keep existing per-approved-version export semantics. No bundle counting change. | User-visible delivery unit, commercial decision, SQL enforcement/compatibility tests and example bills/usage. |

## DEC-06 — code now exists, the decision does not

The assisted-verification path (Phase 2 items 19–23, plus 27 and 28) is built
and merged, and **is off**. It waits on exactly what the DEC-06 row already
lists: a named accountable operating role, reviewer access rules, accepted
independent verification methods, and a rejection/transfer policy.

Two variables gate it, both shipping unset:

- `OPERATOR_EMAILS` — unset means nobody can open the operator queue at all.
- `ASSISTED_ASSIGNMENT_ENABLED` — unset means the decision route answers 404 to
  everyone, including an allowlisted operator.

The queue is deliberately readable with the flag off, matching this row's
recorded safe default: build the protected request, status and queue code, and
withhold only real approvals. The repository asserts no verification policy of
its own — the reviewer types what they actually checked and who checked it, so
enabling this requires the procedure to exist outside the code, not merely a
variable to be set.

## DEC-12 — decided 2026-10-04

The user made the DEC-12 choices on 2026-10-04 while the P4.5 design was
brainstormed (spec `docs/superpowers/specs/2026-10-04-preview-draft-design.md`,
"Decisions (user, 2026-10-04)"):

| DEC-12 question | Decision |
|---|---|
| Eligible traffic / grant | **Unlocked report viewers only.** The existing viewer grant for *that* job is the capability. Members, staff and the public view are not eligible. |
| What is generated | **One review reply.** The visitor pastes one customer review and may add a star rating. |
| Budget | **Tight trial:** 1 per grant; 3 per job across grants; 5 per IP per day; 50 per day globally; US$2 per day globally, summed from the preview's own cost records. Any limit or check failure refuses. |
| Hand-off | **Nothing carried over.** The draft is shown once and never stored. The CTA leads to the normal sign-in/claim path, and after a verified claim the owner uses the normal review-reply workflow. |
| Architecture | A **`preview_events` table** (migration `0013`, events only, no text) with an atomic `claim_preview_slot`. Per-IP uses `consume_rate_limit`. Flag `PREVIEW_DRAFT_ENABLED`, off unless exactly `true`. |

The row's remaining items map as follows:

- **Input/privacy model.** Only the text the visitor types is sent to the
  model, with the job's market, its business name and a default brand; nothing
  from the report, snapshot, findings or raw data is read. The review, the reply
  and the prompt are never stored or logged; `preview_events` has no text column
  and keeps only the HMAC request fingerprint as `ip_hash`.
- **Success/failure metrics.** Spec §6, as read-only SQL in
  [`PREVIEW-METRICS.md`](PREVIEW-METRICS.md): previews generated per day,
  refusals by reason, failures by reason, daily cost and the claim-after-preview
  rate. There is no dashboard.

**What this does not authorize.** Recording DEC-12 as decided does not apply
`0013` to any hosted database (that is DEC-11, still an explicit owner action),
does not turn the flag on, and does not record any hosted acceptance. As of
2026-10-04 `0013` has been applied only to owned, disposable local Docker
databases, and hosted acceptance was not run. The owner steps are in
`docs/integration/DEPLOY.md` ("P4.5 unsaved preview draft: migration 0013 and
the flag"): apply `apply-0013.sql` on a Neon test branch and then production,
set `PREVIEW_DRAFT_ENABLED=true` and redeploy; roll back by unsetting the flag.

## Configuration inventory — names/presence only

From the supplied verification plan, inspect the candidate deployment for the actual repository names corresponding to:

`RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN`, the LLM gateway key, `RESEND_API_KEY`, Stripe configuration, Google callback configuration, and claim flags. Use current `.env.example` and code for precise names; do not invent names or print values.

Distinguish present, absent, not inspected and configuration-invalid where validation can report that safely. Absence is not inferred from lack of permission. Presence alone does not prove a provider round trip works.

## Acceptance authorization record

```text
Authorization reference:
Approver / operating role:
Authorized target origin / deployment / branch:
Allowed operations:
Explicitly forbidden operations:
Named test-business references and markets:
Authorized test-account / recipient references:
Provider and mail request / retry limits:
Monetary or quota ceiling and stop condition:
Database target and permitted mutation scope:
Approved feature/config changes:
Data retention / cleanup constraints:
Authorization date:
Evidence links:
```

Leave these fields blank until supplied. A blank record is not implied authorization. Do not include passwords, tokens, full connection strings or unnecessary personal data.
