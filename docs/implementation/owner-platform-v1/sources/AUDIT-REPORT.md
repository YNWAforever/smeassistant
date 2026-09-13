# AUDIT-REPORT — SME Scanner Visibility Workspace (`YNWAforever/smeassistant`)

**Audit date:** 2026-09-09 (UTC) · **Auditor:** Claude (read-only audit; no code, configuration or hosted system was changed)

---

## 1. Executive verdict

> **Can an owner currently join and complete a useful AI-assisted task?**
>
> **No — not by any self-service route.** A visitor can scan a business, receive an evidence-backed report and unlock it. From there the journey stops: there is no reachable route into a workspace, so no owner can select a task, obtain a saved AI draft, approve it or export it.

Three independently sufficient blockers, each verified:

1. **The claim entry point is never linked.** The whole ownership journey hangs off `/{locale}/owner/sign-in?claim=<slug>`. No page, component or redirect in the codebase ever emits that URL (grep over `app/`, `components/`, `lib/` on the deployed commit returns zero hrefs). The sign-in page tells a claimant *"如果你只解鎖了報告，請返回該報告頁登入並認領"* ("if you only unlocked a report, return to that report to sign in and claim it" — `components/sign-in-page.tsx:133`), but `components/report-view.tsx` renders no sign-in, join or claim control at all. The instruction is circular.
2. **The only implemented ownership mechanism is switched off in production.** Live probe against the serving deployment: `GET /api/oauth/google/claim/start?slug=auditprobe` → `404 {"error":"not_found"}`, which by `app/api/oauth/google/claim/start/route.ts:37-39` means `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is not `"true"`. `attachJobToWorkspace` — the sole writer that binds a scan to a workspace — is called only from the OAuth claim callback (`app/api/oauth/google/claim/callback/route.ts:133`).
3. **The documented alternative does not exist in this application.** The onboarding step-2 fallback ("Ask Fimmick to assign your workspace") is copy only: no lead, no notification, no form. Its single side effect is a `workspace_access_requests` row written during `/auth/callback`, and nothing in this repository ever reads that table. Staff identity is hard-disabled here (`lib/auth/staff.ts:21-28` always returns false/null); the staff console lives on the retired Supabase deployment, which does not write to this Neon database.

The consequence is that **a workspace can currently be created only by an operator writing rows directly into Neon.** Everything downstream of joining — the part the product is really about — is comparatively well built and cannot be reached.

A second, structural finding frames the rest of this report: **the repository's own release documentation does not describe the system that is running.** README, `CLAUDE.md`, `DEPLOY.md`, `NEON-CUTOVER.md` and `LAUNCH-REPORT.md` all state that the hosted target is *NOT CHOSEN* and hosted acceptance/deployment are *NOT RUN*, while `main` auto-deploys to a public production alias that is serving live PostgreSQL, live SerpApi scans and live Neon Auth callbacks. Release decisions are being made against a map of a different territory.

### What is strong and must be preserved

The evidence-and-approval core is the best part of this codebase and should not be disturbed by any of the recommendations below.

- **Coverage-aware scoring is real.** `packages/scoring/src/index.ts:25-43` returns `overall: null` unless at least two of ig/gbp/aeo are measured; missing evidence lowers `coverage`, never the score. Unmeasured modules carry `score: null`. This is enforced in the scorer, not in the UI.
- **The approval and delivery contract is enforced in SQL, not in the client.** `export_output_version` (`neon/migrations/0004_atomic_operations.sql:452-488`) refuses a non-approved version, counts exactly one delivery on first export, checks the allowance inside the same transaction, and marks repeat exports and copies `counted = false`. Generation, revisions, rejections and failed runs are incapable of consuming allowance — the only writer of `workspace_usage.approved_deliveries` is that function.
- **Authorization is genuinely server-side and consistent.** Every workspace, action, version and assistant route resolves the entity to its workspace *before* the membership check (`app/api/actions/_shared/mutation.ts:77-136`). I looked specifically for cross-tenant reads and found none.
- **Evidence media handling is hardened to a high standard.** `lib/evidence/safe-media.ts` does scheme validation, DNS resolution with a pinned connection, full IPv4/IPv6 private-range rejection, re-validated manual redirects, magic-byte sniffing and decode limits. It is the model the scanner's own website fetch should have followed (see F-08).
- **Comparability is honest.** `packages/scoring/src/diff.ts:145-160` refuses to compare across an unknown or mismatched scoring version or with no shared measured module, and time-driven findings are reported as decay rather than regression.

---

## 2. Inspected scope, and what I could not reach

### Sources inspected

| Item | Value |
|---|---|
| Repository | `github.com/YNWAforever/smeassistant` (public) |
| Initially cloned commit | `30046da86f1c54d40fdbd6d3fff00b6decd26734` (`main`, PR #11, 2026-09-08 22:39 +0800) |
| **Re-baselined to** | `8f4c5b481f32a482fce1d090e9173952d8cbcccc` (`main`, PR #12, 2026-09-10 01:32 +0800) |
| Working tree | Clean at both commits (`git status --short` empty) |
| Live URL | `https://smeassistant.vercel.app` |
| Serving deployment | `dpl_GKaE39VfhqbNHm22R8veD2UadyHT`, `target: production`, `READY`, region `iad1`, built from `8f4c5b4` |
| Vercel project | `prj_Hbox4o4NhM3p0yxRxmY8Xq1mjtb5` (`smeassistant`), team `team_qvzlsFmfCsLkgItSypqHjw3z`, Node `24.x` |

**`main` advanced during this audit.** I cloned `30046da`, and while the code trace was running PR #12 ("guide owner sign-in with recoverable callback flow") merged and auto-deployed. I detected the divergence by comparing live page copy against the checkout — the deployed sign-in page reads *"登入你的工作台"*, which exists at neither commit I had read — then confirmed it through the Vercel deployment record. I re-baselined to `8f4c5b4` and re-verified every joining/authentication finding against it. The diff is confined to 47 files, all sign-in/callback/identity/test files; findings outside that surface are unaffected and are cited at `30046da`, which is byte-identical for those paths.

### Access I had

Public pages (read-only browsing), the full public repository, read-only Vercel project/deployment/runtime-error metadata, and a local Node 22.22.2 / pnpm 9.12.0 / Docker 29.4.3 environment in which I ran the repository's own offline gates.

### Access I did not have — and what remains untested because of it

I did not have, and did not attempt to obtain, any authenticated owner session, workspace, Neon database credential, LLM gateway key, Stripe test permission, Google test account or provider budget. I therefore **did not** run a live paid scan, redeem a real magic link, complete a Google consent, generate a real draft, approve or export anything on hosted infrastructure, or send any email. Section 8 lists each of these as an explicit untested area with the test that remains to be run. Where the repository's documents describe hosted acceptance as "not run", my audit does not change that status.

Two tool limitations are worth recording honestly. The sandbox's egress proxy refused direct `curl` to the live host, so all live evidence was gathered through a browser pane; and `WebFetch` refuses `/api/*` paths because `robots.txt` disallows them, so the API boundary probes were executed as same-origin `fetch` calls from within the loaded page — the same anonymous, credential-free GET/POST shapes that `scripts/launch-check.mjs` uses.

---

## 3. Source versus deployment comparison

This is the section the repository's own documents get wrong, so it is worth stating plainly.

| Question | Documented position | Observed reality |
|---|---|---|
| Is there a chosen hosted target? | "Hosted Neon branch, Auth configuration and staging origin are **NOT CHOSEN**" (`README.md:3`); identical in `CLAUDE.md:27`, `DEPLOY.md:3`, `NEON-CUTOVER.md:3` | A production alias is serving `main` continuously. Production logs show live PostgreSQL connections, live SerpApi scans and Neon Auth callbacks |
| Has deployment run? | "hosted acceptance and deployment are **NOT RUN**" (`README.md:3`); "Hosted actions: NOT READY / NOT RUN" (`DEPLOY.md:3`) | 20+ deployments listed; `dpl_GKaE39V…` is `target: production` and aliased to `smeassistant.vercel.app` |
| Is automatic Git deployment disabled? | "`vercel.json` keeps automatic Git deployment disabled for the migration and completion branches" (`DEPLOY.md:23`) | Accurate but immaterial: `vercel.json` blocks only `codex/merchant-acceptance-completion` and `codex/neon-migration`. **`main` deploys automatically**, which is exactly what produced the state the documents say never happened |
| Which runtime? | `.nvmrc` = `22`; `package.json:9` `>=22.13.0`; `DEPLOY.md:76` "Node 22.x" | Vercel project `nodeVersion: 24.x`. `DEPLOY.md:8` separately says "Planned runtime is Node 24 (locally tested 24.18.0)… `.nvmrc` 22 remains a historical local default, not verified Node 22 compatibility". CI tests on 22; production runs 24 |
| Which database? | `ARCHITECTURE.md:3-4,13,34` describes a shared **Supabase** project, 28 upstream migrations, service-role client, anon key | The app runs on Neon PostgreSQL with `neon/migrations/0001-0004` and a `sme_app_runtime` role; a CI gate (`test:no-supabase`) forbids the retired transport. `ARCHITECTURE.md` and large parts of `CLAUDE.md` (§1.3, §3.3, D2, D9, "migrations are hand-applied through the Supabase dashboard") were never rewritten |
| Google sign-in? | "no Google **sign-in**" (`CLAUDE.md:250`); `e2e/owner-shell.spec.ts` asserted no Google button | A Google button is rendered and live. The stale assertion passed only because the test runs on zh-HK, where the label is Chinese |

**Interpretation.** These are not clerical errors. The gating documents are the artefact a release decision would be made from, and they would tell a reader that nothing is exposed. In fact a public production URL has been accepting anonymous scans, spending SerpApi and Google Places quota, and writing to a live database. That is the single most important governance finding in this audit, and it is why F-31 is rated P1 despite being "only" documentation.

---

## 4. Architecture summary and system map

Next.js 16 App Router on Vercel, React 19, Node 24 in production. Locale-prefixed routes (`zh-HK` default, `zh-TW`, `en`); market (`hk|tw`) is chosen explicitly and stored on the job, never derived from display language at read time. `proxy.ts` handles locale redirects and the owner-session gate, deliberately stripping the SDK's signed session cache so revocation is checked upstream, and failing closed to sign-in on any configuration or transport error.

Four vendored upstream packages (`scoring`, `region`, `scan-engine`, `contracts`) are pinned verbatim at upstream `b9b4151f` and transpiled by Next. Persistence is typed Neon PostgreSQL repositories over `pg`, with four immutable migrations and eleven SQL functions that own the atomic parts of the workflow.

```
PUBLIC FUNNEL (works, live)          JOIN (blocked)                 WORKSPACE (built, unreachable)
landing → /scan (4-step wizard)      unlock ✗→ claim                home · actions · create · insights
  → POST /api/scan/start              ↑ no link ever emitted          action → run (11 agents, zod)
  → POST /api/scan/process            OAuth claim: 404 in prod        → output_versions (immutable)
  → poll /api/scan/status             Fimmick assign: copy only       → approve exact version
  → /r/[slug]  (coverage-aware)       staff console: not here         → export = 1 delivery (SQL)
  → /unlock/[slug] → grant cookie                                     → audit_events · measurements
```

**Feature classification.** *Verified live:* public funnel routing, scan start/status, report rendering, unlock, sign-in page render, API negative boundaries. *Verified locally (fixture):* the entire authenticated work loop, role denials, allowance enforcement, export idempotency, migration/catalog integrity. *Implemented but unverified:* Stripe checkout/portal/webhook (unit-mocked only; **and unconfigured in production**), Vercel Blob asset upload, Google Business connect, in-app notifications. *Demo/mock:* the public assistant, sample report, demo workspace, and the landing page's "7 則評論回覆草稿已備妥"-style outputs, which are marketing copy rather than data. *Intentionally restricted:* direct publishing, external scan dispatch. *Missing:* any scheduler or stuck-job reaper in this application, an email sender, a Fix Pack generator, and a mark-notification-read path.

---

## 5. Complete owner-journey findings

Each finding is classified as **CD** confirmed defect (runtime-observed, or deterministic from code plus a live probe), **CR** code risk (present in code; runtime impact not observed), **UX** UX hypothesis (expert assessment, explicitly not user research), or **MV** missing verification. Severity (P0–P3) and confidence are given separately.

### 5.1 First-time owner arriving from search

The landing page answers "who is this for" and "what will I get" reasonably well in Traditional Chinese, keeps a prominent free-scan entry, and labels demo material honestly. The scan wizard collects no email and no login — a genuinely good decision that gets a visitor to value fast.

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-14** | The scanning page renders raw coverage as a percentage. `score_coverage` is a 0–1 weight sum (`packages/scoring/src/index.ts:32-42`), passed through unmodified by `app/api/scan/status/route.ts:32` and interpolated into `coverageLine: "覆蓋率 {coverage}%"` (`lib/copy.ts:731`) at `components/scanning-page.tsx:162`. An owner sees **"覆蓋率 0.7%"** where 70% is meant. The report view normalises correctly (`lib/report/view-model.ts:114-118`), so the two screens disagree. No test covers this line. | CD | **P2** | High |
| **F-17** | An Instagram-less scan fails hard rather than degrading. Terminal status is `done` only if all requested modules measured, `partial` if `overall !== null && measured ≥ 2`, else **`failed`** (`packages/scan-engine/src/processor.ts:181-192`). With no IG handle (a normal case) the scan needs *both* GBP and AEO to succeed; if either is unavailable the owner gets "掃描未能完成" and no report at all — contradicting the product's core promise that missing evidence reduces coverage rather than breaking the result. | CR | **P2** | High |
| **F-18** | No completion path beyond the function ceiling. `/api/scan/process` has `maxDuration = 300` while documented scans take 5–13 minutes; `dispatchToScanWorker` always returns `false` (`lib/scan/dispatch-runtime.ts:6-16`); `vercel.json` has no crons; the lease is only re-claimable after 30 minutes *and only if a client POSTs again* (`neon/migrations/0004_atomic_operations.sql:65-74`). The scanning page polls indefinitely with no elapsed-time cap while promising "即使離開此頁，餘下檢查仍會繼續" (`lib/copy.ts:741`). | CR | **P2** | High |
| **F-15** | The step-4 consent checkbox is never persisted. It gates the client only; `buildScanStartPayload` sends no consent field and `parseScanStartBody` reads none. The `consent.public_evidence` audit event exists as an enum label (`lib/workspace/audit.ts:15`) and is never emitted. `CLAUDE.md` guardrail 13 and the owner-facing copy both promise a recorded, purpose-limited consent. | CD | **P2** | High |
| **F-36** | The scanning page shows every collector as "已量度" (measured) on a `partial` result regardless of which module actually failed (`lib/funnel/scan-progress.ts:57-73`; `components/scanning-page.tsx:30-36`). Real per-module state appears only on the report. | CD | P3 | High |

### 5.2 Joining and ownership verification — the blocking journey

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-01** | **No in-product entry to the claim flow.** `sign-in?claim=<slug>` is emitted by nothing. `components/sign-in-page.tsx:133` directs claimants back to the report; `components/report-view.tsx` has no sign-in/claim control. Verified by grep on the deployed commit. | CD | **P1** | High |
| **F-02** | **OAuth ownership claim is disabled in production.** Live: `GET /api/oauth/google/claim/start?slug=auditprobe` → `404 {"error":"not_found"}` (route lines 37-39 ⇒ flag not `"true"`). This is the only code path that attaches a scan to a workspace. | CD | **P1** | High |
| **F-03** | **"Ask Fimmick to assign" is copy only.** No lead, no mail, no queue. The one side effect is a `workspace_access_requests` insert in `/auth/callback`; nothing in this repository reads it. Staff identity is disabled (`lib/auth/staff.ts:21-28`). `PHASE-2-REPORT.md:96` already recorded this. | CD | **P1** | High |
| **F-33** | **A production Google sign-in failure is open and owner-reported.** `docs/integration/2026-09-08-owner-sign-in-debugging.md:41` records that the user reaches Google account selection and fails after selecting an account, with two `owner_sign_in_failed` callbacks logged at 14:46:00 and 14:46:15 UTC on 2026-09-08. The document states the available evidence cannot distinguish which of six stages failed. PR #12 adds stage diagnostics but explicitly "does not claim the hosted Google failure is resolved". | CD | **P1** | High |
| **F-04** | Even the claim path cannot reach most owners. `isLeadRecipient` matches `leads.email`, which the unlock route populates **only** when the chosen contact channel is `email` (`app/api/report-access/unlock/route.ts:139`). HK defaults to WhatsApp and TW to LINE, and the separate recovery email lands on `report_access_grants.email_normalized`, which the predicate never consults. | CD | **P2** | High |
| **F-06** | An owner with a manual-entry scan (no `place_id`) or no Google Business Profile can never verify ownership: `claim/start` returns 422 `no_place_id`, and the callback requires a managed location whose placeId matches. No manual or public-evidence alternative exists. The product direction explicitly asks for this path. | CD | **P2** | High |
| **F-05** | Every claim failure redirects to `/{locale}/r/<slug>?claim=<reason>`, but the report page ignores `searchParams` entirely. An owner whose Google account does not manage the business lands back on the public report with **no message at all**. | CD | **P2** | High |
| **F-07** | *(Resolved during the audit.)* At `30046da`, `safeClaim` on the sign-in and onboarding pages used `/^[a-z0-9-]{1,120}$/i`, silently discarding claim slugs containing `_` — roughly 31% of `randomBytes(18).base64url` slugs. PR #12 replaced it with `parseAuthFlow` (`lib/identity/sign-in-flow.ts:14`, `[A-Za-z0-9_-]{6,64}`). **Fixed in the deployed commit.** | CD | — | High |

The magic-link anti-enumeration design is correct in itself, but combined with the above it produces the worst possible owner experience: an ineligible owner submits their email, receives a uniform `{ok:true}`, sees "請查看你的收件箱" and waits for a message that was never sent. PR #12's new `no_access` completion state is a real improvement for signed-in users with no membership; it does not address the ineligible-email case.

### 5.3 Owner with an urgent task — problem-first entry

Problem-first entry **exists but is entirely behind the membership gate.** `/{locale}/owner/[slug]/create` offers a template picker (review responses, review requests, GBP posts, social posts, IG bio, FAQ/JSON-LD, website basics, local SEO brief, menu translation, photo brief) and creates an `owner_objective` action with an immediate agent run. Publicly there is nothing: the landing page's specialist chips ("評論回覆", "餐牌翻譯", …) are `<Badge>` elements with no href (`components/landing-page.tsx:453`), and the public assistant answers 13 fixed demo intents about a fictional restaurant.

The honest position is therefore that the capability the "urgent task" owner needs is already written — it simply sits on the far side of a door that does not open. My recommendation in the Blueprint is *not* to build a new problem-first product, but to add an outcome-led public entrance that routes into the existing scan-and-claim flow, plus a strictly scoped provisional draft space that uses only owner-supplied text, claims no business, attaches no protected scan, and touches no third-party account.

### 5.4 The work loop, once inside

This is the strongest part of the system: task → run → immutable version → edit → approval of an exact version → export → one counted delivery → audit event → measurement is implemented end-to-end, enforced in SQL, and covered by unit, integration and browser-fixture tests including duplicate-export, allowance-exhaustion and role-denial cases.

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-19** | **Billing is unconfigured in production.** Live: `POST /api/webhooks/stripe` → `500 {"error":"Stripe is not configured"}`. The paid tier cannot be purchased, and since rescan is paid-only (`rescan/route.ts:44-47`), the "re-scan and prove the change" half of the loop is unreachable even for a provisioned owner. | CD | **P2** | High |
| **F-20** | Upgrading mid-period does not raise the allowance. `workspace_usage.allowance` is copied at row creation and never updated; `applyTier` writes only `workspaces.tier`. A workspace that pays mid-month stays capped at 3 exports and sees `allowance_exceeded` immediately after paying. | CR | **P2** | High |
| **F-26** | The two-scan comparison panel is effectively unreachable on the share route: the grant cookie carries exactly one job, `/r/[slug]` never resolves membership, so every historical candidate fails authorization and the panel always renders `no_accessible_pair`. The repository's own verification document already records this as an unresolved release gap. | CD | **P2** | High |
| **F-21** | The assistant sheet reports success before the server does. `createVersion` calls `onCreateVersion(...)` then immediately `setVersionCreated(true)` (`components/pocket-assistant/assistant-sheet.tsx:150-154`); the handler is fire-and-forget. On a 409, 403 or network failure the sheet still says "new version created" while only a toast contradicts it. | CR | P3 | High |
| **F-22** | The Create page toasts success even when the inline run failed: the route returns 201 with `state:"failed"`, and the client checks only `result.ok` (`components/workspace/create-view.tsx:87-95`). With no LLM key configured, an owner is told the first draft is being prepared and lands on a failed action. | CR | P3 | High |
| **F-23** | In-app notifications can never be cleared: no code anywhere issues `UPDATE workspace_notifications … read_at`. The bell's unread count is permanent. | CR | P3 | High |
| **F-24** | Inviting a teammate sends no email. `POST …/members` inserts a pending row only, while the UI says "We email a magic link… Invite sent by email" (`components/workspace/team-client.tsx:164-165`). The invitee must independently discover the sign-in page. | CR | P3 | High |
| **F-27** | `member` access is unreachable on `/r/[slug]` because `loadReport` is never given a membership resolver — a signed-in owner sees the public preview unless they hold the viewer cookie. | CD | P3 | High |
| **F-29** | `assistant.run` is a declared and labelled audit event that is never emitted, and Fix Pack approve/reject writes no audit row — partial violations of guardrail 10. | CR | P3 | High |
| **F-30** | The Fix Pack card has no generator in this repository (no `agent_runs` insert exists), so on this deployment it is permanently empty while telling owners drafts "appear here after a paid-tier scan". | CR | P3 | High |

### 5.5 Team, roles and multi-location

The role contract is implemented correctly and defended server-side: owner > manager > viewer, manager location scoping enforced in `inLocationScope`, `owner` never grantable through the members API, member ids always scoped by `workspace_id` in SQL. Browser tests cover viewer denial, out-of-scope manager denial and revoked membership.

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-10** | **A sole owner can destroy their own workspace through the API.** The guard `if (target.role === "owner" && auth.membership.role !== "owner")` (`app/api/workspaces/[workspaceId]/members/route.ts:93`) is unreachable dead code, because the route already requires `minRole: "owner"`. Removing the last member fires `workspace_members_cleanup_orphan` → `delete_orphaned_workspace()` (`neon/migrations/0003_workflows.sql:2-13,31`), and 18 tables cascade — including `output_versions`, `deliveries`, `audit_events` and `workspace_tier_events`. The append-only audit ledger and the billing ledger are destroyed with no confirmation and no recovery. The UI hides the button for owner rows (`components/workspace/team-view.tsx:49`), so today only a deliberate API call reaches it — which is why this is P1 and not P0. | CR | **P1** | High |

### 5.6 Trust, security and lifecycle boundaries

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-08** | **Unauthenticated SSRF via `website_url`.** `parseScanStartBody` validates `maps_url` and `facebook_url` with `isOptionalHttpUrl` but never validates `website_url` — it is only trimmed (`lib/scan/start-job.ts:96,136-142`). The engine then fetches it with a bare `fetch(websiteUrl, { signal: AbortSignal.timeout(5000) })` (`packages/scan-engine/src/collect-providers.ts:797`): no scheme allowlist, no private/link-local address rejection, no DNS pinning, redirects followed by default, no response size cap. Three derived values (`has_faq_schema`, `meta_description_len`, `h1_count`) plus reachability are persisted and rendered, giving a blind oracle. The path is anonymous and rate-limited only 10/h per IP — and that limiter fails open (F-11). `lib/evidence/safe-media.ts` already contains exactly the validator this needs. | CR | **P1** | High |
| **F-11** | The rate limiter **fails open** on the paid-provider routes. `scan_start`, `scan_process`, `scan_status`, `business_search` and `ig_search` all pass `failClosed: false`, so a missing `RATE_LIMIT_SECRET` silently removes limiting from precisely the endpoints that spend SerpApi, Google Places and RapidAPI quota. `.env.example:41` states the opposite: "every rate-limited route 503s without it". Whether the secret is set in production is unverified. | CR | **P2** | High |
| **F-16** | Public pricing contradicts enforced entitlements. The landing and pricing pages promise "每月 12 次核准後交付", "36 次" pooled and "2 位用戶"; `deliveryAllowanceForTier` returns **3** for `lite` and unlimited for `paid` (`lib/workspace/entitlement.ts:55-57`), and no seat limit exists anywhere. A paying owner would hit their cap at delivery 4. | CD | **P2** | High |
| **F-34** | Funnel analytics are silently dropped in production. `event_record_failed { category: 'backend_unavailable' }` fired 9× across `/api/scan/start` and `/api/scan/process`; the cause is a 250 ms budget around a pooled insert that opens a transaction (`packages/scan-engine/src/analytics.ts:166-175`), routinely exceeded on a cold Neon connection. Non-fatal to the scan, but it means `scan_started`/`scan_completed` denominators are unreliable — which matters directly for the §10 measurement plan. | CD | **P2** | High |
| **F-12** | No prompt-injection boundary. Scraped reviews and website text are embedded in an `EVIDENCE (JSON)` block with no "treat as data, not instructions" statement, no system message, and a single user message (`lib/agents/prompt.ts:21-46`; `lib/llm.ts:108-123`). Mitigations that do exist and matter: no tools/function-calling, zod-validated output, prohibited-term checks, and no model output ever influencing authorization or routing. Owner-supplied `provided_inputs` are also unbounded in size before embedding. | CR | P3 | High |
| **F-13** | `Pool` is constructed from `DATABASE_URL` with no explicit `ssl` option (`lib/db/client.ts:12-19`). With Neon's `sslmode=require` this emits the pg deprecation warning seen on every cold start in production, and at pg 9 the same URL will adopt libpq semantics — i.e. **no CA verification**. Fix now by pinning `sslmode=verify-full` or passing `ssl: { rejectUnauthorized: true }`. | CR | P3 | Med |
| **F-25** | Unlock and Trust copy promise a secure delivery link to the chosen channel and a "復原連結 15 分鐘後失效" recovery link. No sender exists in this repository and there is no recovery route under `app/api/report-access/`. | CD | P3 | High |
| **F-31** | Release documentation asserts "NOT CHOSEN / NOT RUN" while a production alias serves `main` continuously (see §3). | CD | **P1** | High |
| **F-32** | `ARCHITECTURE.md` and large parts of `CLAUDE.md` still describe Supabase as the database and auth. Anyone onboarding, human or agent, is handed a contradictory contract. | CD | **P2** | High |
| **F-35** | Historical production errors indicate configuration drift: `Supabase service role client is not configured` ×3 on `/api/scan/start` and `REPORT_ACCESS_TOKEN_SECRET must be at least 32 bytes in production` ×3 on `/api/report-access/unlock`. Both are on superseded deployments; they show that fail-closed security config reached production unset at least once. | CD | P3 | High |
| **F-37** | `OWNER_SELF_SERVICE_CLAIM` is honoured at runtime (`app/auth/callback/route.ts:160` feeds `selfServiceEnabled` into `claimScan`) with no build- or deploy-time guard rejecting the variable. Guardrail 15 is enforced by operator discipline alone. | CR | P3 | High |

### 5.7 Mobile and accessibility (live, 375×812)

Measured directly on the serving deployment. The page does not scroll horizontally at 375 px, and the wide `loop-ribbon` and comparison table scroll inside their own containers — correct. Two issues:

| # | Finding | Class | Sev | Conf |
|---|---|---|---|---|
| **F-28** | Owner sign-in is not discoverable on mobile. The header link is `hidden lg:inline-flex` (`components/product-ui.tsx:257`); measured live it is present in the DOM with `offsetParent === null` and a 0×0 rect. The only mobile route is the hamburger sheet, where it is the **8th and last** item. A returning owner on a phone — the product's own stated primary scenario — has no visible way back in. | UX | **P2** | Med |
| **F-38** | The mobile navigation sheet's dismiss control is labelled **"Close"** in English on a `zh-HK` page. Several controls measure 40 px tall (below the 44 px touch target), and a photo-credit link measures 11 px. | CD | P3 | High |

I did not run an automated accessibility audit and I am **not** reporting a Lighthouse or axe score. The repository's own browser tests do assert focus return, `aria-expanded`, a single `h1` and no overflow on report pages at 375 and 1440, which is real coverage but limited to report pages.

---

## 6. Evidence register

Live evidence, gathered read-only against `dpl_GKaE39VfhqbNHm22R8veD2UadyHT` on 2026-09-09:

| Probe | Result | Establishes |
|---|---|---|
| `GET /zh-HK` | 200, `<html lang="zh-HK">`, title "讓更多顧客找到你…" | Public funnel serving; locale wiring correct |
| `GET /zh-HK/owner/sign-in` | 200; h1 "登入你的工作台"; Google + email controls hydrated | Sign-in renders; **copy matches neither `30046da` nor PR #12's branch tip — this is what exposed the source/deployment divergence** |
| `GET /api/oauth/google/claim/start?slug=auditprobe` | `404 {"error":"not_found"}` | `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED` is off ⇒ **F-02** |
| `POST /api/owner/magic-link {}` | `400 {"error":"invalid_email"}` | Input rejection boundary correct |
| `POST /api/webhooks/stripe {}` | `500 {"error":"Stripe is not configured"}` | **F-19**; also a weaker boundary than the documented 400 |
| `POST /api/scan/start {market:"XX",…}` | `400 {"error":"business_name is required"}` | Validation active (name checked before market) |
| DOM at 375×812 | no page overflow; sign-in link `offsetParent === null`, 0×0; hamburger item 8 of 8; "Close" untranslated | **F-28**, **F-38** |
| Vercel runtime errors, 7 days | pg SSL warning ×38 (10 users, 9 routes); `event_record_failed backend_unavailable` ×9; SerpApi timeout ×4; `Owner auth callback failed auth_unavailable` ×3 | **F-13**, **F-34**, live scans confirmed, **F-33** |

Local gate evidence is recorded in full in `VERIFICATION-PLAN.md`.

---

## 7. Readiness status

**Not ready for owner acquisition, and already exposed.** These two facts sit together uncomfortably and should drive the immediate response.

The product is publicly reachable and spending money on providers, while the journey it advertises terminates at unlock. A visitor today can be told a price of HK$888/month and an allowance of 12 deliveries, click "開始增長工作台", arrive at a sign-in page, enter their email, be told to check an inbox, and receive nothing — with no path forward and no error. That is the state to fix first, and it is fixable without a rewrite: the loop behind the door is sound.

Readiness by area: the public funnel is **live but defective in three visible ways** (F-14, F-17, F-15); joining is **blocked** (F-01, F-02, F-03); the work loop is **built and locally verified, hosted-unverified**; billing is **unconfigured**; recurring value is **not executable** (no scheduler, paid-gated rescan); security is **materially sound with one unauthenticated SSRF** (F-08); and release governance is **misaligned with reality** (F-31).

---

## 8. Explicit untested areas

Listed as untested rather than passing. Each has a concrete remaining test in `VERIFICATION-PLAN.md` §4.

1. **Hosted Neon Auth email delivery and magic-link redemption.** Every passing sign-in test in this repository runs against a fixture identity server (`test/e2e/identity-server.ts`), not Neon Auth. No test has ever redeemed a real link.
2. **Completed Google sign-in.** Only the redirect to `accounts.google.com` has been observed; consent has never been completed. This is the open production failure (F-33).
3. **A real scan end to end with live providers.** Production logs prove scans run; no recorded test asserts the outcome. I did not run one — it spends provider budget I was not authorized to spend.
4. **A real LLM draft.** Every green draft test uses the local fixture LLM server. Whether an LLM gateway key is configured in production is unverified, and F-22 makes an unconfigured gateway look like success in the UI.
5. **Approve → export on hosted infrastructure.** Proven repeatedly on fixtures; never on the deployed build against Neon.
6. **Stripe test-mode signed events, entitlement transitions and idempotency.** Unit-mocked only; production returns "not configured".
7. **Whether `RATE_LIMIT_SECRET`, `REPORT_ACCESS_TOKEN_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `BLOB_*` and the LLM keys are set on the serving deployment.** F-11 and F-35 both hinge on this, and it is a read-only environment inspection away.
8. **A successful two-scan comparison rendered in a browser.** Acknowledged as a release gap in the repository's own documents.
9. **Mobile behaviour of the scan wizard, unlock, sign-in, onboarding and every `/owner/*` page.** No Playwright config declares a mobile project; 375 px coverage exists only for report pages.
10. **Asset upload against a real Vercel Blob store**, and whether `BLOB_READ_WRITE_TOKEN` is present.
11. **Behaviour when a scan exceeds 300 s in production** (F-18) — how often it happens, and what the owner sees.

---

## 9. What to do first

The ranked plan is in `PRIORITISED-BACKLOG.md`. In short: decide and record the truth about the deployment (either take the production alias down or update the release documents to describe it, and set `vercel.json` accordingly); close the unauthenticated SSRF and the rate-limit fail-open; then open the door — link the claim entry point from the report and unlock pages, choose one ownership path you will actually operate (enable the Google claim, or build a real assisted-assignment queue instead of copy), fix the coverage display and the pricing/allowance contradiction, and ship the three workflows named in `AGENT-TOOL-CAPABILITY-MATRIX.md`. None of that is a rewrite. The hard, valuable, well-tested part — evidence, approval, delivery counting, audit — is already built and should be left alone.
