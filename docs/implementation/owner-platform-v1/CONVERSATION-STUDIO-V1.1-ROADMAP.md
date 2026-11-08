# Conversation Studio v1.1 — next development roadmap

Status: **active plan** (2026-11-09). Baseline: `main` at `8d57823`; production DB migrated through `0021`; conversation workbench live (`CONVERSATION_HOME_ENABLED=true`); Studio hidden (`CONVERSATION_STUDIO_ENABLED` unset); PRs #130–#133 merged.

The Studio is integrated as the persistent mode of the conversation workbench (Path A). What remains is making it the *only* thread model, making its grounding cover documents/search, and making it shareable and operable.

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

Blocked on explicit owner authorization to flip the flag. Everything below can proceed with the Studio still off.

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

- **Cost/latency telemetry:** per-turn tokens, model, duration and cost aggregation; a read-only ops query; budget alert thresholds; no message text in telemetry.
- **Preview database strategy:** schema-only Neon branch per PR (or a labeled CI branch), journal/checksum verification in CI, never the production branch from previews.
- **Readiness vars:** add `DATABASE_URL_UNPOOLED`, `NEON_READINESS_HOST`, `NEON_READINESS_DATABASE` if the read-only readiness tooling is adopted; no runtime exposure.
- **Test depth:** expand Studio browser acceptance (documents, shared threads, mobile), prompt-injection regressions on attached files, streaming load test, a11y audit.
- **Security review:** document/brief revocation, citation-id validation, audit payload limits, rate-limit tuning (`studio_message` 60/h, `studio_import` 20/h, `studio_import_bulk` 5/h).

## Phase 3 — Product polish (backlog, prioritized after Phase 1)

- Composer attachments/voice; artifact edit-in-place; inline “request changes” flow (design-gated).
- Conversation search, rename/archive UX, transcript export/share (read-only).
- Today/Insights deep-links into the same conversation (“continue this in Studio”).
- Optional provider routing through Neon AI Gateway/cost-aware model selection.

## Sequencing

```
P0 (owner) ─────────────┐
P1.1 evidence picker ───┼─ P1.2 server-first workbench ── P1.3 shared conversations
P2.1 telemetry, P2.2 preview branches, P2.4 tests (parallel from P1.1)
P3 after P1.3 / product review
```

Phase 1 PRs are independent of P0: the Studio stays safely hidden until the owner flips the flag.

## Immediate start: P1.1

Branch `feat/studio-v1.1-evidence-picker`. First commits: citation contract extension + search-brief loading in the messages route; then the picker UI; then tests and the PR.
