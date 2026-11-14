# Conversation Studio v1.1 — historical roadmap and current status

Status reconciled **2026-11-14 after Phase 15 release**. The original 2026-11-09 plan below is retained as historical design/release evidence, not the active implementation queue. Its “next PR”, “implemented locally”, flag-state and pending-acceptance wording describes that earlier point in time. The verified release baseline is `f4eba847504215fdf284515bfe4f40288c6932dc` ([PR #181](https://github.com/YNWAforever/smeassistant/pull/181)); see the [Phase 15 report](../../ux/PHASE-15-STUDIO-DEADLINE.md). The approved next sequence is session reliability investigation, actual assistive-technology/mobile validation, then controlled streaming concurrency and operational visibility. Historical production Auth redirect causality remains unconfirmed.

## Current delivery status

| Capability | Status and evidence |
|---|---|
| Persistent owner conversation | **Shipped.** Kinnso is canonical at `/conversation`; `/conversation/studio` redirects there. The server loads persistent conversations/messages, and browser-local notes remain at `/conversation/notes` with explicit import. See the [canonical page](../../../app/[locale]/owner/[workspaceSlug]/conversation/page.tsx) and [Phase 12 report](../../ux/PHASE-12-OWNER-IA-REPORT.md). This does not claim the historical offline-cache/automatic-note-retirement design was implemented. |
| Documents and approved search briefs | **Shipped.** The [evidence picker](../../../components/studio/evidence-picker.tsx) attaches existing evidence and supports owner document upload; selected evidence is re-read by the server. Phase 13's three-locale browser attachment regression found an existing client parser omission that rejected citation-bearing messages. The final follow-up fixes that defect and passed the eleven-case enabled local suite, including attachment request/history identity and reload at mobile/desktop widths. The later Phase 15 baseline passed PR/final-main CI and 17 enabled browser cases, including evidence persistence. This does not claim fresh hosted Blob upload or live model grounding was tested. |
| Shared team conversations | **Shipped.** The [sharing dialog](../../../components/studio/share-dialog.tsx) manages accepted workspace members with editor/viewer access. Migration 0022 and the historical release checks are recorded in the [production evidence](CONVERSATION-STUDIO-PRODUCTION-EVIDENCE.md). This is not a request to add the schema or sharing feature again. |
| Saved draft → exact-version task review | **Shipped.** Explicit draft saving and `version`/`from=studio` review handoff predate Phase 13. Approval and delivery remain on the task page. See the [historical handoff evidence](CONVERSATION-STUDIO-PRODUCTION-EVIDENCE.md#phase-b--ig-draft-handoff). |
| Enabled Kinnso CI alongside flag-off coverage | **PR [#176](https://github.com/YNWAforever/smeassistant/pull/176), merged.** Adds the enabled Studio/contextual-entry job, no-skips report gate and exclusive-test protection. Both PR CI jobs passed before merge; this is not a claim of GitHub branch-protection enforcement. |
| Return to the exact originating conversation | **Shipped in the current release baseline.** The [#177](https://github.com/YNWAforever/smeassistant/pull/177) journey work adds authorized conversation/location context to the existing version handoff, including refresh/recovery and a two-conversation regression. The later Phase 15 enabled browser suite passed the draft-to-task-and-back journey. This strengthens an existing journey; it is not the initial release of persistent chat or version saving. |

The [Phase 13 owner-journey record](../../ux/PHASE-13-OWNER-JOURNEY.md) records the earlier implementation sequence. Current release evidence is the [Phase 15 report](../../ux/PHASE-15-STUDIO-DEADLINE.md): both CI runs and 36 read-only hosted visits passed on the exact deployed commit. Those visits establish navigation/layout behavior, not fresh hosted generation or delivery.

## Verification boundaries and remaining work

- The [2026-11-10/11 production record](CONVERSATION-STUDIO-PRODUCTION-EVIDENCE.md) records the provider probe and **owner-reported** 15-point acceptance on 2026-11-11. Those are historical observations, not checks rerun for this documentation update. The configuration table there is not a fresh assertion about the currently serving deployment.
- The [Phase 12 hosted walkthrough](../../ux/PHASE-12-HOSTED-WALKTHROUGH.md) and [PR #174 evidence-guardrail release](../../ux/PHASE-12-EVIDENCE-GUARDRAIL.md) record later read-only checks. PR #174 fixed the observed-evidence wording issue without rewriting live business records. PR [#175](https://github.com/YNWAforever/smeassistant/pull/175) fixed the transient-null-document hydration regression in the browser test helper.
- Phase 13 local verification passed eleven enabled cases, including the three-locale attachment fixture and mobile/desktop layouts. The later Phase 15 release passed 17 enabled cases, production build, both CI runs and exact-commit read-only hosted verification. Earlier instructions to land the citation/journey fixes are historical; those features belong to the shipped baseline.
- Fresh production generation, document upload, import, approval or export requires a designated authorized test workspace and explicit authorization for writes/model spend. Read-only hosted verification does not establish those mutation paths.
- Streaming load testing, a broader accessibility audit, and hosted preview-branch provisioning remain follow-ups from the historical plan. No new hosted provisioning, provider routing or paid operation is authorized by this roadmap.

## Historical plan — 2026-11-09

Historical baseline: `main` at `8d57823`; production DB migrated through `0021`; conversation workbench live (`CONVERSATION_HOME_ENABLED=true`); Studio hidden (`CONVERSATION_STUDIO_ENABLED` unset); PRs #130–#133 merged. Subsequent dated status notes below record the rollout as it progressed.

Original intent: integrate Studio as the persistent mode of the conversation workbench (Path A), converge the thread model, add document/search grounding, and add sharing and operations. The current status above supersedes this historical sequence as a development queue.

## Guiding principles

- One conversation entry point; no competing surfaces or redirects.
- Evidence before answer; unavailable stays unavailable; no new authority.
- Additive migrations only; no hosted action without owner sign-off.
- Each phase is one reviewable PR with green CI; no phase depends on a flag being flipped first.

## Phase 0 — Production release gate (owner action, ~1 day)

| Step | Deliverable | Done when |
|---|---|---|
| P0.1 | Enable `CONVERSATION_STUDIO_ENABLED=true` in Vercel Production, redeploy | Studio entry visible for owners; flag-off rollback documented |
| P0.2 | Run `corepack pnpm smoke:studio` with production gateway vars | `ok: true`, streamed deltas match |
| P0.3 | Execute the 15-point hosted acceptance in `CONVERSATION-STUDIO-CUTOVER.md` | Owner/member, three locales, mobile, import, evidence, draft-to-version, privacy, limits, audit |
| P0.4 | Record release evidence (CI run, deployment id, acceptance result) | Evidence file linked from the cut-over runbook |

**Status 2026-11-09:** P0.1 is **done** (journal 22 applied through the prepared rollout after a disposable-branch dry run; `CONVERSATION_STUDIO_ENABLED=true` set in Vercel Production and redeployed). P0.2 has not produced `ok: true` on this machine — the smoke was SKIPPED because no LLM gateway key is available locally and Vercel sensitive variables decrypt empty. P0.3 (15-point hosted acceptance) remains an owner/manual browser step. P0.4 evidence is recorded in the cut-over runbook and report §1.16; production API now returns 401 rather than the flag-off 404.

## Phase 1 — Finish convergence (2–3 PRs, ~2 weeks)

### P1.1 — Studio evidence picker (next PR)

Status: **implemented locally on `feat/studio-v1.1-evidence-picker`** (documents + approved search briefs; picker UI; route/prompt/tests). PR pending CI.

Owners can attach workbench **documents and approved search briefs** directly in the Studio, without first importing a local thread.

- Types: extend the citation part to `source: "document" | "search_brief"` (legacy document-only parts parse unchanged).
- Server: `POST /api/studio/conversations/[id]/messages` accepts `documentVersionIds` (already) and `searchBriefIds`; re-reads both in workspace/location scope; maps a brief to readable fenced context; persists citation parts.
- Prompt: fence search briefs like documents (per-item and total caps); never treat owner files as instructions or as measured scan evidence.
- UI: evidence picker in the Studio composer/context rail — list documents and approved briefs for the current location, toggle up to five, show selected chips, disable while streaming; trilingual copy.
- Tests: route contract (foreign/missing ids, scope, revocation), prompt caps, picker component, integration round-trip, browser acceptance with an uploaded document.
- Acceptance: a question answered from an attached document cites it; revoking the document makes the next turn fail closed; no cross-location access.

### P1.2 — Server-first conversation workbench

Remove the dual thread model from the workbench.

- Workbench reads/writes `studio_conversations`/`studio_messages` when Studio is enabled; local notes become an offline cache and the existing import bridge remains the migration path.
- One “Recent discussions” list; no duplicate local/server sections; conversation continues between workbench and `/conversation/studio` with the same `?chat=` identity.
- Local-note retirement: after all unimported threads are promoted, hide/disable local creation with a clear explanation; keep read-only local access for one release.
- Tests: store contract, page/server data, import/merge edge cases, offline fallback, browser flow workbench → Studio → back.

### P1.3 — Shared team conversations (implemented locally on `feat/studio-v1.3-shared`)

Status: implemented locally on `feat/studio-v1.3-shared` (migration 0022, participant-aware access, sharing API/UI, tests); PR pending CI.

The last schema-changing phase; additive migration `0022`.

- `studio_conversation_members` (conversation_id, user_id, role, added_by) or equivalent; visibility `private | workspace` per conversation.
- Access rules: creator manages; members read/write per role; managers see scoped locations; viewers read-only; no cross-workspace leakage.
- UI: share dialog, participant chips, “shared with you” rail section; audit `conversation.shared` / `conversation.member_added`.
- Tests: policy matrix, repository scoping, RLS-less app-layer authorization, hosted acceptance with two members.

## Phase 2 — Quality and operations (parallel, ongoing)

- **Cost/latency telemetry (implemented locally):** `pnpm ops:studio-usage` read-only report over persisted turns — conversations, owners, user/assistant turns, failed turns, tokens, cost with unknown-cost visibility, adjacent-turn latency (samples/avg/p50/p95), intents, models and a UTC daily series. It never reads message text and runs in a READ ONLY transaction. See `docs/operations/studio-usage.md`; integration-tested against the owned PostgreSQL fixture. Budget alert thresholds are implemented: `--max-cost-usd` and `--max-p95-ms` add a `budgets` block and exit `3` on breach, documented for a scheduled operator check.
- **Preview database strategy (implemented locally):** schema-only Neon branch plan per PR plus a fail-closed isolation verifier (`pnpm preview:db plan|verify`), documented in `docs/operations/preview-databases.md`. No hosted preview branch was created; Vercel per-branch injection remains an operator/integration step.
- **Readiness vars:** add `DATABASE_URL_UNPOOLED`, `NEON_READINESS_HOST`, `NEON_READINESS_DATABASE` if the read-only readiness tooling is adopted; no runtime exposure.
- **Test/a11y depth (implemented locally):** sharing browser acceptance (5/5 Studio spec), share-dialog focus/Escape + aria-modal checks, prompt-injection tests for attached document/brief text and titles, and the readiness preflight docs (`docs/operations/studio-readiness.md`). Remaining follow-ups: streaming load test and a broader a11y audit.
- **Security review:** document/brief revocation, citation-id validation, audit payload limits, rate-limit tuning (`studio_message` 60/h, `studio_import` 20/h, `studio_import_bulk` 5/h).

## Phase 3 — Product polish (backlog, prioritized after Phase 1)

- Composer attachments/voice: the evidence picker attaches workspace documents and approved search briefs (P1.1), and owners can now **upload a TXT/MD/CSV document directly from the picker** (128 KB cap; the owner-only upload route re-reads scope and enforces the same limits; managers/viewers still attach existing documents). The composer offers **browser dictation** where the Web Speech API exists. Dictation follows the UI locale (`en-US`, `zh-HK`, `zh-TW`), appends final phrases to the draft without replacing typed text, never auto-sends, uploads/stores no audio in this app, and hides the microphone (with a permission message when denied) where the API is unavailable. Studio social drafts now return an optional **carousel outline** (3–6 bounded slides) rendered as planning material next to the caption; the saved version remains the caption, and the card states that boundary. Artifact edit-in-place and inline “request changes” remain design-gated.
- Workbench actions deep-link into a fresh Studio conversation (`?action=`) with a contextual starter; unknown/stale ids fall back to the normal rail. The action detail header now offers **Continue in Studio** for in-scope editors and only while the action is open (same `?action=` route). Conversation search and rename/archive UX are implemented. Transcript export is implemented: `GET /api/studio/conversations/[id]/transcript` returns a read-only Markdown attachment (owner or shared member), audited with counts only, with an Export button in the Studio header.
- Today/Insights expose **Continue in Studio** when both flags are enabled; it opens the location-scoped workbench Studio. Implemented in the Today brief and Insights intro with trilingual copy, and asserted in component tests.
- Optional provider routing through Neon AI Gateway/cost-aware model selection.

## Sequencing

```
P0 (owner) ─────────────┐
P1.1 evidence picker ───┼─ P1.2 server-first workbench ── P1.3 shared conversations
P2.1 telemetry, P2.2 preview branches, P2.4 tests (parallel from P1.1)
P3 after P1.3 / product review
```

Phase 1 PRs are independent of P0: the Studio stays safely hidden until the owner flips the flag.

## Historical immediate start: P1.1

The original starting branch was `feat/studio-v1.1-evidence-picker`, with citation contract/search-brief loading, picker UI, tests and a PR planned in that order. This is retained for traceability; the picker has shipped and is not the next implementation task.
