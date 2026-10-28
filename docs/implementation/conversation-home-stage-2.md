# Conversation workbench — Stage 2

Implements **Willy Approve, 2026-10-28 HKT via Grok Master: Stage 2 Docs + connectors**. Based on main Stage 1 merge `c63b145`. The user’s Stage 2 brief is authoritative; the referenced `/workspace/phase1/sme-conversation-home-stage-packet.md` was absent in this environment and the prototype retrieval tool was unavailable. The shipped Stage 1 shell supplies the IA. Prototype/demo data is never a backend source.

**Stage 3 not in this PR. Production conversation flag remains OFF/unset. No merge or hosted configuration/migration/deployment was performed.**

## Documents and citations

The conversation screen extends the existing private `workspace-assets` store and `assets` rows with immutable extraction records. Owners can upload UTF-8 `.txt`, `.md` and `.csv`, at most 128 KiB. Empty, binary, malformed UTF-8, PDF, Word and image inputs are rejected. Extraction retains the first 20,000 JavaScript characters without splitting an emoji; shortened extracts are labeled. Original bytes have a SHA-256 fingerprint, safe filename and a new private asset for every version. Saving an update appends a version under a serialized document lock; old extracts/title/time/hash cannot be overwritten.

The document panel lists the latest version of up to 50 documents in the current scope. A thread can reference up to 20 immutable version IDs, including old versions. Only IDs enter the existing account/workspace/location browser-local thread record, with backward compatibility for Stage 1 notes. Titles, version numbers, timestamps and extracts are resolved again from the authorized server store. Unavailable citations stay unavailable; no alternative document is substituted. Clearing browser data removes local threads/citation references, not saved server documents. Documents are workspace resources; citing them does not share private thread notes or change document access.

Location UUID and `all` are exact, separate namespaces. Every read checks membership, workspace and manager location scope. Every upload checks owner membership. A deleted location leaves an immutable scope snapshot that cannot fall back into `all`. Account erasure can null uploader references; workspace erasure can remove document records, matching existing lifecycle behavior. Extracted facts are source text, not an approval or a publishable claim.

Originals stay in the existing private asset namespace at `<workspace>/<asset>/__conversation_document__/<filename>`. That enforced path keeps contextual documents out of legacy publishable-asset listings, action attachments and preview signing. The original bytes are not exposed through an unscoped signed URL. The scoped extraction endpoint is the supported reading surface. This avoids adding an independent storage product or a new share ACL.

## GSC first, read-only

The existing `/api/oauth/google/start` and callback support `provider=gsc`, signed as `google_gsc`. The same Google OAuth configuration, encryption, owner authorization and callback are reused. GSC requests only `webmasters.readonly`, with incremental scopes disabled for this consent. Its encrypted connection is separate from GBP; connecting or disconnecting GSC never replaces GBP or completes a GBP reconnect action.

An explicit Read context request uses the selected location’s server-stored website and workspace market. It lists the connected account’s verified properties, chooses only a matching domain/URL-prefix property, then queries Search Analytics. Google requests are limited to sites GET and the read-only Search Analytics query POST. The response covers up to 25 reported queries in 28 complete days ending three days before the request; suppressed queries and bounded results are explained. Missing properties, no rows, unsupported markets/locations, expired authorization, forbidden access, provider errors and timeouts have distinct honest recovery states. A location must be selected for connector context; `all` does not choose another shop’s website.

Results show source scope and read time on the current screen. There is no background sync or persisted context cache, and refresh does not pretend an earlier result was synced. No GSC write/publish request exists.

## Paid research: default OFF

Both adapters require the conversation gate, their exact provider flag, credentials, positive finite budgets, a stable nonsecret billing-account ID, verified pricing acknowledgement and a conservative per-call price ceiling. Missing/invalid configuration is disabled before budget or provider work.

- Firecrawl: one `/v2/scrape`, markdown only, empty parsers (no PDF/image OCR), basic proxy (no auto/stealth), no crawl/search/agent calls. Text is bounded to 20,000 characters.
- DataForSEO: one `/v3/serp/google/organic/live/regular` task, depth 10, one maximum crawl page, desktop, English organic results only. Markets must be explicitly enabled using `DATAFORSEO_MARKETS=hk,tw` or a narrower subset. Locale never selects market. These SERPs do not establish LLM Mentions, HK opportunity wins or comparable performance.

Budgets are integer micro-USD reservations in UTC calendar months. Workspace limits cover both providers; account limits cover a provider billing account across workspaces using the same database and stable account ID. Reservations commit atomically **before** every paid call. The full verified ceiling remains charged on success, error, timeout or unknown provider cost; there is no automatic refund/retry. Only one unsettled request per provider account is permitted. A crash or failed settlement blocks further account calls until operators reconcile it. A reported cost above the configured ceiling is recorded upward and permanently blocks that account key pending operator review. Deleting a workspace does not refund account spend. None of this writes delivery counts or AI usage.

These are conservative configured-price limits, not invoice reconciliation or a provider-enforced dollar cap. Operators must verify the current contracted maximum price for the fixed request shape before setting `CONVERSATION_RESEARCH_PRICING_VERIFIED=true`. Changing provider price, using different account IDs for one billing account, or separate databases can invalidate that bound. An observed overage stops future calls; it cannot undo a charge already made. Provider balances outside this application are not measured.

Fetch plus body processing has a 15-second deadline, at most 1 MiB JSON, bounded items/text and explicit partial/failed states. URLs are lexically restricted to ordinary public HTTP(S) addresses; DNS/rebinding and provider-side destination handling are not independently verified. Provider results stay on the current screen and are never automatically sent to the existing model, shared through a todo, or converted into an action.

## Schema and Preview enable steps

`neon/migrations/0019_conversation_resources.sql` adds three bounded-purpose tables: immutable asset extracts, provider account blocks, and an append-only/monotonic reservation ledger. It extends the existing OAuth provider check with `google_gsc`. No thread table, new model path, delivery schema, team permissions, scoring or approval workflow is added. Database triggers enforce version/provenance immutability and monotonic costs. RLS/runtime grants match the existing server repository boundary; they are not presented as a new end-user ACL.

1. Review/apply migration 0019 to an explicitly authorized Preview database using the normal migration process; do not apply it to a shared/Production target as part of this PR.
2. Keep Production `CONVERSATION_HOME_ENABLED` OFF/unset. In the chosen Preview only, set server `CONVERSATION_HOME_ENABLED=true` (`VERCEL_ENV=preview`); local dev/test uses existing Stage 1 semantics. Unknown hosted environments fail closed. Today stays default.
3. Documents reuse `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN`. GSC reuses `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `OAUTH_TOKEN_ENCRYPTION_KEY`. Configure the existing callback URL and allow the read-only Search Console consent in the Google project. No new OAuth redirect variable.
4. Paid providers remain OFF unless deliberately configured. Keys/flags: `CONVERSATION_FIRECRAWL_ENABLED`, `FIRECRAWL_API_KEY`, `CONVERSATION_DATAFORSEO_ENABLED`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `DATAFORSEO_MARKETS`, `CONVERSATION_RESEARCH_ACCOUNT_ID`, `CONVERSATION_RESEARCH_WORKSPACE_MONTHLY_USD`, `CONVERSATION_RESEARCH_ACCOUNT_MONTHLY_USD`, `CONVERSATION_RESEARCH_PRICING_VERIFIED`, `FIRECRAWL_MAX_CALL_USD`, `DATAFORSEO_MAX_CALL_USD`. See `.env.example`; no credential values are committed.

## Verification boundaries

Unit tests inject transport/repositories; owned PostgreSQL tests verify real triggers, concurrent version appends, exact scope filtering, deletion behavior, shared-account reservations, unknown-cost retention, overages and delivery isolation. `e2e:conversation` uses the real shell/components/CSS at desktop/mobile sizes with explicitly synthetic memory HTTP document/connector responses. It verifies upload/cite/version/refresh behavior, scope changes, disconnected/blocked/timeout recovery and the existing navigation/Ask Kinnso path. All unexpected writes and external requests are rejected.

No real Google OAuth consent, GSC account, Firecrawl/DataForSEO charge, hosted Preview identity/database/blob upload or Production runtime flow is claimed. CI has no live provider keys; fixture successes are fixtures. Full lint/typecheck/unit/migration/integration/build/security/JS-budget and browser gate outcomes are reported on the PR and its exact head CI run.

Local candidate verification: typecheck and lint passed (10 pre-existing lint warnings); full unit/package suite 7,015 tests passed; conversation desktop/mobile 16 passed; owned schema/catalog/readiness 38 and document/budget/GSC 6 tests passed. Production build/secret boundary passed across 108 public artifacts; conversation JavaScript was 233/300 KB. The initial full integration run exposed stale schema/readiness assertions; their corrected files passed all 38 focused checks. The PR head CI verify run is the final full-suite evidence.
