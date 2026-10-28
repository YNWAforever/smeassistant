# Conversation Stage 2 Implementation Plan

> For agentic workers: use superpowers:executing-plans; bounded independent implementation/review may be delegated under superpowers:dispatching-parallel-agents.

Goal: implement Willy's approved Stage 2 brief, in A documents → B GSC read-only → C gated research order, then open an unmerged PR against main.

Architecture: extend private assets with append-only extracted document versions; Stage 1 local threads retain only version IDs. Reuse Google OAuth consent, encrypted oauth_connections and membership checks for a distinct google_gsc read-only credential. Paid research reserves conservative cost ceilings in a separate atomic workspace/account ledger before any network call; failures and timeouts retain reservations.

Tech stack: existing Next.js 16, React 19, TypeScript, pg, Vitest, offline Playwright.
Spec: user's Stage 2 approved brief and docs/implementation/conversation-home-stage-1.md. Referenced /workspace/phase1 stage packet is absent; prototype retrieval is unavailable. No backend truth is inferred from the prototype.

## Global Constraints

- CONVERSATION_HOME_ENABLED remains server-only; VERCEL_ENV=production forcibly OFF. No hosted settings changed.
- Stage 3 not in this PR. No merge, production flag flip, publishing, second model path, delivery-count changes, ACL redesign or private-thread sharing.
- Today stays default; preserve all navigation/deep links and Ask Kinnso.
- en, zh-HK and zh-TW copy parity. Missing/unavailable data is never zero or invented success.
- No paid/provider calls in tests. Integration fixtures must be owned disposable resources.
- Work from main c63b145 on codex/conversation-home-stage-2. User authorizes push and PR creation only.

## Review Focus

- Cross-workspace/location document and citation ID substitution must fail closed.
- Concurrent versions preserve saved text and cited provenance; later uploads append.
- Budget reservations serialize concurrent calls across workspaces sharing an account; unknown cost remains reserved.
- OAuth provider scope cannot swap GSC and GBP or change existing GBP behavior.
- Scope changes during requests must not render stale documents or connector data.

## Task 1 — Private asset document versions

Files: lib/workspace/conversation-documents.ts, lib/repositories/conversation-documents.ts, app/api/workspaces/[workspaceId]/conversation/documents/route.ts and tests; draft SQL in work/docs-schema.sql.
Interface: GET ?location_id=<UUID|all> → {versions: DocumentVersion[]}; POST multipart file, location_id, document_id? → {version: DocumentVersion}. DocumentVersion has id, documentId, assetId, version, title, createdAt, text, truncated, sha256. Owner uploads; accepted members read with existing location restrictions. Exact scope: all is separate, no location fallback. UTF-8 .txt/.md/.csv ≤128 KiB; extract ≤20,000 chars; invalid/binary/PDF unsupported clearly. Reuse assets/private storage; transactional asset + version insert, append-only persistence; document_id must already exist in the same scope. Return only safe typed errors, no secrets.
- [x] Write failing extraction, isolation, version and API tests, run RED.
- [x] Implement bounded extraction, append-only asset-backed versions, read/write endpoint.
- [x] Run relevant tests GREEN; review task.

## Task 2 — GSC read-only OAuth and context

Files: existing google OAuth start/callback/helper and claims repository; lib/connectors/gsc.ts, lib/repositories/conversation-connectors.ts; conversation connectors API and tests.
Interface: signed OAuth provider discriminator google_gsc; request only webmasters.readonly; preserve default google_gbp. Owner-only connect/reconnect/disconnect. GSC data uses server-resolved location website and only a verified matching property. Read-only Search Analytics last complete 28 days; bounded rows, timeout; honest disconnected/reconnect/empty/failed/partial/unsupported states and source/time/property scope. No write API calls.
- [x] Add scope/state/readonly request tests RED.
- [x] Extend existing flow and provider-specific encrypted connection persistence.
- [x] Implement read-only context adapter and scope-authorized API.
- [x] Run relevant tests GREEN; review task.

## Task 3 — Paid provider gates, cost reservations and partial results

Files: lib/connectors/research.ts, lib/repositories/research-budget.ts and tests; SQL work/research-schema.sql; shared API integration by primary agent.
Interface: runResearch({workspaceId,locationId,provider,url,market}, deps?) → normalized source/time/status/rows/budget. Firecrawl single basic scrape and DataForSEO single bounded organic SERP task only. Explicit env flags + credentials + finite positive workspace/account budgets and verified per-call ceilings required; default OFF. Atomic monthly reservations under account lock before each paid request; charge conservative ceiling even timeout/failed/unknown outcomes, no retry. Bounded response bytes/items and ≤15s timeout. Remaining/blocked/failed/partial states. DataForSEO coverage requires explicit market enablement; never LLM Mentions or HK opportunity claims.
- [x] Write budget concurrency/gates/timeout/provider error/partial tests RED.
- [x] Implement fail-closed config and persistent atomic reservations.
- [x] Implement bounded paid adapters without live calls in tests.
- [x] Run relevant tests GREEN; review task.

## Task 4 — Conversation UI, schema, proof and delivery

Files: document/connectors client components and copy; Stage 1 thread optional documentVersionIds; conversation page/view; additive migration/schema/types; offline e2e; .env.example; docs/implementation/conversation-home-stage-2.md.
- [x] Write UI/persistence/isolation and regression tests RED.
- [x] Add document upload/version/cite and readonly connector context with honest recovery/remaining states.
- [x] Preserve old local records, remount by scope, never copy extracts/private notes into shared actions.
- [ ] Assemble minimal additive schema and verify on owned PostgreSQL; generate types.
- [x] Run typecheck, lint, unit, relevant e2e, build/security/JS gates.
- [x] Independent final review; fix material findings and verify.
- [ ] Commit, push feature branch, open PR with approval, flags/env names, preview steps and “Stage 3 not in this PR”. Observe CI to terminal state and report PR/head/run URL; do not merge.
