# Phase 2 backlog — Complete owner workspace

The working plan for the commissioning plan's Phase 2. Derived from `phase-prompts/02-COMPLETE-OWNER-WORKSPACE.md` and Master Plan §5 (P2.1–P2.5), both now committed in this directory.

**Method.** One agent per P2 item read the spec section, the sources it cites and the current code, and reported what the item still requires. Every "missing" claim then went to a second agent whose job was to **disprove it by finding the thing** — because the expensive error here is building something that already exists. Of 33 claims, **30 were confirmed and 3 were found to already exist**.

That 3 is the number to keep in mind. An earlier pass at this phase, run before the plan was available, produced a 51-item list that was mostly not Phase 2 at all — see `OWNER-WORKSPACE-GAP-OBSERVATIONS.md`. Every entry below therefore carries a proof of absence: the grep that returned nothing, the route that does not exist, the column absent from the migration. "I did not see it" was not accepted.

**Constraints.** Items needing a cron or second scheduler, an `agent_runs` write, a publishing connector, `OWNER_SELF_SERVICE_CLAIM`, a schema change (`scripts/neon/catalog.ts` deep-equals a frozen catalog, so any migration fails `db:verify`), or a paid/authorized provider are recorded as **blocked**, not as work.

**Totals:** 26 buildable · 4 blocked · 3 already existed.

## Progress

**19 of 26 buildable items are done** (1, 2, 3, 4, 6, 9, 10, 12, 15, 16, **19, 20, 21, 22, 23**, 17, 24, 25, 26); items 6 and 12 are the same defect and landed together, as are 19–23, which shipped as one release. Each carries a **Status** line below with its commit. Seven remain buildable, six of them untouched: 5, 7, 8, 11, 13, 14, 18 (item 5 is deliberately deferred -- see below -- so 7, 8, 11, 13, 14 and 18 are the ones actually next).

**Two of the four blocked items are now unblocked and done: 27 and 28.** Both were `needs_schema_change`, not forbidden — and the P2.4 release settled the storage question with **zero DDL** by carrying decision state on `audit_events` rather than new columns, so the blocker simply went away. Items 29 and 30's stated blocker -- the email port not existing -- is gone as of `268bae9` (item 26, below); what remains for each is its own route/logic plus DEC-07 authorization to actually send, so they stay recorded under Blocked with an update note rather than moved.

Every landed item is **locally verified** — `typecheck`, `lint` held at its 30-warning / 0-error baseline, and the unit/component suite. **None is hosted-verified**: no deployment, migration, paid provider call, real email, OAuth consent or Stripe event was attempted, and `db:verify` / `test:integration` still need Docker, which this machine does not have.

Item 5 (owner-facing tab labels) is deliberately not taken yet: it is the lowest-value entry here by its own proof, and `sources/OWNER-EXPERIENCE-BLUEPRINT.md:60-70` warns against forcing it before the join door opens.

---

## Buildable

### P2.1 — Simplify the daily experience without hiding the evidence

#### 1. Create must lead with review reply, FAQ and website basics, with the remaining capabilities demoted to secondary navigation and honestly labelled (four of them are Beta).

**Effort:** `small` · **Start at:** `components/workspace/create-view.tsx`

**Status:** done — `520cf00`. Create leads with review reply, FAQ and website basics; every card carries its real CapabilityBadge. Headings are advice, not measurement.

**Proof of absence**

components/workspace/create-view.tsx:57 builds one flat list of every agent-backed template in lib/workspace/templates.ts declaration order and renders it as a single equal-weight grid at :125 under two tabs (:122). `grep -c "Capability" components/workspace/create-view.tsx` → 0, so `gbp-photo-pack`, `gbp-post`, `local-seo-brief` and `menu-translation` (capability "Beta" at templates.ts:114, :128, :212, :226) are presented identically to the Live ones.

#### 2. More must link the supporting routes the item lists — assets is missing, which makes /assets (and /calendar) unreachable on a phone.

**Effort:** `small` · **Start at:** `components/workspace/more-view.tsx`

**Status:** done — `92b2a1a`. More links Assets and Calendar; a directory-walking test fails when any non-primary owner route has no mobile entry point.

**Proof of absence**

`grep -rn "assets|calendar" components/workspace/more-view.tsx` returns nothing; the link list at more-view.tsx:11-19 is Locations, Activity, Brand, Integrations, Team, Notifications, Billing. The only other navigation to them is the desktop sidebar (components/product-ui.tsx:305-313), which is `hidden md:flex` (product-ui.tsx:380); the mobile bottom nav is the four primary tabs plus More (product-ui.tsx:464-473). This matters because `social-post` requires an approved asset or an explicit text-only choice (action-detail-client.tsx:500-502).

#### 3. Task-duration estimates must read as estimates, and Today's one priority must name the inputs it needs (not just count them).

**Effort:** `small` · **Start at:** `lib/workspace/format.ts`

**Status:** done — `b22dd04`. Durations read as estimates, and Today names the inputs it needs.

**Proof of absence**

lib/workspace/format.ts:60-62 returns a bare `"10 minutes"` / `"10 分鐘"`, rendered unqualified as "10 minutes owner time" on Today (components/workspace/home-brief.tsx:91), as the definite term "Owner effort / 店主所需時間" on Tasks (components/workspace/actions-list-view.tsx:62), in the compact list (home-brief.tsx:161) and in the detail header (action-detail-client.tsx:411). Only Create qualifies it ("About … to review" / "店主約需 …", create-view.tsx:125). For inputs, home-brief.tsx:92 uses `priority.missingInputs.length` solely to switch the button label; the input names (available via `copy[locale].workspace.inputs`, as used at create-view.tsx:134) are never shown on Today.

#### 4. Remove the unenforced allowance and seat promises still on the homepage plan cards (P1.7 leftover sitting on a P2.1 screen; the item forbids hiding or misstating charges).

**Effort:** `small` · **Start at:** `components/landing-page.tsx`

**Status:** done — `60dcab6`. The two unenforced homepage plan lines are gone; not replaced with "unlimited".

**Proof of absence**

components/landing-page.tsx:488-489 still render "1 location · 12 approved deliveries/month · 2 users" and "3 locations · 36 pooled approved deliveries/month", while enforcement is lite → 3 and paid → unlimited (lib/workspace/entitlement.ts:51-56). `grep -rn "12 次|12 approved|2 位用戶|2 users" components/ lib/` matches only those two landing-page lines, so the pricing page was already corrected and the homepage was missed.

#### 5. Adopt the owner-facing tab labels named in the plan (今日 / 待辦 / 製作 / 成效 / 更多) as labels on the existing routes.

**Effort:** `small` · **Start at:** `lib/copy.ts`

**Proof of absence**

lib/copy.ts:1299-1303 (en), :1352-1356 (zh-HK) and :1405-1409 (zh-TW) define the nav as Home/Actions/Create/Insights/More (主頁 / 行動 / 建立內容 / 成效 / 更多); components/product-ui.tsx:352-357 maps those strings into both the sidebar and the mobile bottom nav. Labels only — the blueprint (sources/OWNER-EXPERIENCE-BLUEPRINT.md:60-70) explicitly says no new routes, and warns not to force this before the join door opens, so this is the lowest-value entry here.

#### 6. Checklist actions must render as a checklist. `gbp-profile-fix` and `ig-highlights` currently open the same draft editor whose primary control is "Generate a draft", which cannot succeed.

**Effort:** `medium` · **Start at:** `components/workspace/action-detail-client.tsx`

**Status:** done — `92e2a44`. ActionOverview carries the template's `delivery`; a checklist action renders steps and a completion control instead of a Generate button that can only 409. Same commit as item 12.

**Proof of absence**

`grep -rn "checklist" components/` matches only the comment at components/workspace/create-view.tsx:56 — there is no branch on `template.delivery` anywhere in components (`grep -n "delivery" components/workspace/action-detail-client.tsx | grep -c template` → 0; the `delivery` variable there is the version's `delivery_state`). `canGenerate` (action-detail-client.tsx:186) does not consider the template's agent, so the button is enabled; lib/workspace/runs.ts:110-117 throws `agent_unavailable` for a null template agent and the client dead-ends with the toast at action-detail-client.tsx:223 ("No agent is available for this action yet").

#### 7. Results must show the approved/exported work, not only scores and observed checks.

**Effort:** `medium` · **Start at:** `lib/workspace/queries-pages.ts`

**Proof of absence**

`InsightsModel` (lib/workspace/queries-pages.ts:208-217) contains series, trend, aeoTrend, metricCards, ledger and perLocation — no deliveries or approved versions, and components/workspace/insights-view.tsx renders nothing of the kind. The `deliveries` table is never read anywhere: `grep -rn "deliveries" lib/repositories/ lib/workspace/*.ts | grep -v approved_deliveries` returns only a comment at lib/workspace/usage.ts:22. The table and its columns already exist, so this is a read-only query, not a schema change.

#### 8. Carry allowlisted outcome intent end to end: three outcome examples on the homepage (review replies / FAQ / Google-profile basics) linking into the existing scan with an `intent`, that intent surviving scan → sign-in → claim, and a compatible action being selected afterwards.

**Effort:** `large` · **Start at:** `components/landing-page.tsx`

**Proof of absence**

`grep -rn "\bintent\b" app/[locale]/scan app/[locale]/owner components/scan-page.tsx components/sign-in-page.tsx components/onboarding-page.tsx lib/identity/sign-in-flow.ts` returns 0 lines. app/[locale]/scan/page.tsx:27-38 accepts only `market` and `business`. The sign-in allowlist at app/[locale]/owner/sign-in/page.tsx:21 is exactly `["claim", "returnTo", "method"]`. Nothing reads the stored objective back after claim: `grep -rn "objective" lib/workspace/completion.ts lib/workspace/claim.ts lib/workspace/actions.ts lib/workspace/priority.ts` returns one comment, lib/workspace/actions.ts:229. The landing page has no outcome-card section (sections at components/landing-page.tsx:293-510 are hero, confidence strip, owner story, sources, loop, comparison, agent team, sample case, plans, workspace preview).

### P2.2 — Deliver the three complete AI workflows

#### 9. FAQ + JSON-LD: validate that the generated JSON-LD is structurally valid and matches the FAQ copy. P2.2 demands 'structurally valid matching JSON-LD', and the whole point of this workflow is that the next scan's faq_schema check can confirm it — an unparseable or mismatched block silently fails that recheck after the owner has already pasted it. Parse the fenced block, require @context/@type FAQPage/mainEntity Question+acceptedAnswer, and require the Q&A pairs in the prose to match the JSON-LD entities; emit new guardrail codes (jsonld_invalid, jsonld_mismatch) so the approver sees them.

**Effort:** `small` · **Start at:** `lib/agents/agents/faq-jsonld.ts`

**Status:** done — `0631309`. `validateFaqJsonLd` calls the same `jsonLdBlocks` detector the scan uses; `jsonld_invalid` and `jsonld_mismatch` join the guardrail vocabulary. A fenced ```json block is correctly reported as missing, because no scan can see it.

**Proof of absence**

lib/agents/agents/faq-jsonld.ts:17 is the only validation: `if (output.body.trim() && !output.body.includes("FAQPage")) warnings.push("jsonld_missing")` — a substring test. `grep -rn "JSON.parse" lib/agents` returns exactly one hit, lib/agents/schema.ts:109, which parses the model's own envelope, not the JSON-LD. `grep -rn "FAQPage" lib components app` returns only faq-jsonld.ts:14,17 and the registry test. lib/workspace/version-meta.ts:66-79 classify() has no code for an invalid or mismatched JSON-LD block.

#### 10. Website basics: ground the draft in the actual check results, not just the failing keys. The agent is asked to rewrite the title, meta description and H1 but is never shown the current ones or the site URL, so the output cannot be presented as current → suggested and the export cannot give item-level outcomes the next scan can re-check. The data already exists: each check result carries a detail string ('57 chars', '2 h1', the host).

**Effort:** `small` · **Start at:** `lib/workspace/runs.ts`

**Status:** done — `e466730`. `snapshotEvidence` passes every check result as `{key, pass, observed}` instead of failing keys only. Also fixed: the `https` detail reported the scheme, not the host; and the new "(now: …)" annotation would have broken the agent's own title-length check.

**Proof of absence**

lib/workspace/runs.ts:148-156 maps websiteChecks to `{ evaluated, passed, failed: results.filter(!pass).map(r => r.key) }`, dropping WebsiteCheckResult.detail (lib/website/checks.ts:31-35) which inspectHtml populates at lib/website/checks.ts:104-118 with title length, description length, h1 count and host. lib/agents/agents/website-basics.ts:9-10 says 'Using the website checks in the evidence' but the evidence block contains only those key names; no location/website URL is added to AgentContext (lib/workspace/runs.ts:280-284 passes name/address/district only).

#### 11. FAQ + JSON-LD: request the three facts as actual questions, and give the agent the questions it is supposed to answer. Today the workflow stalls at needs_input because the owner is shown three blank boxes and neither the owner nor the model knows which customer questions are unanswered. Derive the three asks from the evidence that created the action (failing website checks plus the AEO queries already stored as aeo_surface_snapshots.query_text), label the inputs with those questions, and prefill/offer reuse of brand_profiles.facts ('reusing approved stored facts where suitable').

**Effort:** `medium` · **Start at:** `lib/workspace/runs.ts`

**Proof of absence**

lib/copy-workspace.ts:134 and :192 label the inputs literally 'Owner fact 1/2/3' / '店主事實 1/2/3' — there is no question text anywhere. The agent's evidence block is snapshotEvidence (lib/workspace/runs.ts:137-159), which emits only observed_at/score/coverage/module_states/metrics and website_checks {evaluated, passed, failed:[keys]} — no query text and no question. `grep -rn "query_text|queryText" lib app components --include=*.ts` (excluding db/schema, database.types, execution-store, migrations) returns nothing: the column is written at lib/scan/execution-store.ts:210 and never read back; lib/repositories/snapshots.ts:34 selects only surface, cited, rank. lib/workspace/evidence-inputs.ts:28 lists reviews_without_response as the only server-resolvable input and explicitly leaves owner_fact_* to the owner, and nothing prefills the form (components/workspace/action-detail-client.tsx:136 `useState<Record<string,string>>({})`).

#### 12. Keep gbp-profile-fix (and ig-highlights) visibly a checklist. Right now an agent-less template renders exactly like an agent one: the action detail page offers 'Generate a draft', and pressing it — or submitting the opening_hours/categories input form, which always calls generate() — returns 409 agent_unavailable with the toast 'No agent is available for this action yet.' There is no completion path at all for these two templates. Surface the template's delivery mode to the page, replace Generate with the checklist items and a completion control, and keep the same audit/approval semantics.

**Effort:** `medium` · **Start at:** `components/workspace/action-detail-client.tsx`

**Status:** done — `92e2a44`. Same commit as item 6: the template's delivery mode reaches the page, and the input form records inputs without calling an agent.

**Proof of absence**

`grep -rn "TemplateDelivery|template.delivery|\.delivery ===" --include=*.ts --include=*.tsx .` returns only the declaration and the field itself: lib/workspace/templates.ts:37 and :46. The field is set ('checklist' at :104 and :174) and never read. ActionOverview (lib/workspace/overview.ts:40-55) carries no delivery or agent-availability field — `grep -rn "agentAvailable|hasAgent"` returns nothing. components/workspace/action-detail-client.tsx:186 gates Generate only on capability !== 'Requires connection', and submitInputs() ends with `await generate(...)` at :294. lib/workspace/runs.ts:112-113 throws RunError('agent_unavailable') for a null template agent, mapped to 409 at app/api/actions/[actionId]/run/route.ts:48-57.

#### 13. Export the two website workflows with implementation instructions and an explicit 'not applied' statement. P2.2 requires the FAQ export to carry 'instructions for the owner's website editor' and the website-basics export to be 'an approved export/checklist for implementation, NOT a claim that the website was updated'. The exported file is the raw model body only. The agents' own acceptance_criteria are already persisted and would make the checklist, but are never read back.

**Effort:** `medium` · **Start at:** `components/workspace/action-detail-client.tsx`

**Proof of absence**

components/workspace/action-detail-client.tsx:402-404 builds the download from `selectedVersion.body` plus optional alt text and nothing else, filename `${action.templateKey}-v${n}.md`. `grep -rn "paste|貼上|editor" lib/copy-workspace.ts components/workspace/action-detail-client.tsx` finds no instruction copy (only unrelated 'draft-editor' class names). acceptance_criteria is written into output_versions.meta at lib/repositories/artifacts.ts:312 but lib/workspace/version-meta.ts:82-105 parses only origin, agent_key and warnings, so VersionRow (lib/workspace/queries-pages.ts:95-119) never carries it to the page or the export.

#### 14. Test coverage for workflows 2 and 3, and for the new review picker. The Phase 2 gate requires all three workflows to pass happy and negative paths, but only review-response is ever exercised. Needed: a faq_jsonld run asserting facts_needed → needs_input with no version (A5) and a valid JSON-LD on the happy path; a website_basics run asserting the draft cites the failed checks and creates v1; and a picker test proving the checkbox selection narrows what the agent receives and can never widen it.

**Effort:** `medium` · **Start at:** `lib/agents/agents.test.ts`

**Proof of absence**

`grep -rn "visibility-content|website-basics|faq_jsonld|website_basics" --include=*.test.ts --include=*.test.tsx --include=*.spec.ts .` returns only registry/derivation/metric-map assertions: lib/agents/agents.test.ts:58 (Live-agent list), lib/workspace/actions.test.ts:39,47, lib/workspace/templates.test.ts:9,35-36, lib/workspace/measurements.test.ts:118-119 — no test runs either agent or drives either action. e2e/acceptance/merchant-loop.spec.ts:7 is the only lifecycle journey and test/e2e/seed.ts:14 seeds template_key 'review-response' exclusively. `grep -rn "selected_reviews" --include=*.spec.ts e2e` returns nothing, and lib/workspace/evidence-inputs.test.ts covers only the pure filter, not the UI or the PATCH round-trip.

### P2.3 — Make shared business context reliable

#### 15. Scope asset selection to the action's location and the manager's location_scope, on both the picker and the server rights check, so a social-post draft cannot attach another location's approved photo and an out-of-scope manager cannot see or use it.

**Effort:** `small` · **Start at:** `app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx`

**Status:** done — `4d09059`. `assetUsableByAction` is one predicate the picker and the run route share. `location_id === null` means workspace-wide and stays usable everywhere.

**Proof of absence**

app/[locale]/owner/[workspaceSlug]/actions/[actionId]/page.tsx:30-33 — `listAssets(page.ctx.workspace.id, page.ctx.locations, { signedUrls: false })` then `assets.filter(a => a.rights_status === "approved" && a.kind === "image")`: no location predicate and no inScopeFor() call, even though inScopeFor is already imported (line 6) and used for the action itself (line 42). Server side, lib/workspace/runs.ts:170-177 socialAssetSatisfied resolves `assets.get(workspaceId, assetId)` and checks only `rights_status === 'approved'` — no location_id comparison against the action's scope. (By contrast components/workspace/assets-view.tsx:31 DOES filter by ?location=, so the Assets page and the action picker disagree.)

#### 16. Stop re-asking facts the workspace already stores: resolve brand_voice, language and approved_claim from brand_profiles so those actions are not born in needs_input, and inject the resolved values into providedInputs so the agent task text does not read '(not provided)'. This is the literal core of P2.3 ('ask only for missing task-specific facts').

**Effort:** `medium` · **Start at:** `lib/workspace/evidence-inputs.ts`

**Status:** done — `352cf77`. `resolveEvidenceInputs` now accepts an optional `brand` and resolves `brand_voice` (always, once a real `brand_profiles` row exists), `language` (once it has one) and `approved_claim` (only once it has a non-empty one) — kept conservative at derivation time, in `lib/repositories/action-derivation.ts`, which now reads `voice,languages,approved_claims` instead of only checking the row's existence. Separately, `resolveBrandProvidedInputs` (new) supplies the actual values `lib/workspace/runs.ts` merges into `providedInputs` before building every prompt — unconditionally, since a real value belongs in the prompt by generation time regardless of whether a row was ever saved; the owner's own stored answers and this run's submitted inputs still win over the resolved default. `language` maps through `@sme-scanner/region`'s `LOCALE_LABELS` to a human-readable value.

**Proof of absence**

lib/workspace/evidence-inputs.ts:28 — `export const SERVER_RESOLVABLE_INPUT_KEYS = ["reviews_without_response"] as const;` is the ONLY resolvable key, and resolveEvidenceInputs (lines 117-121) adds nothing else. Its own doc comment at lines 18-27 states the deferral verbatim: 'brand_voice and language look resolvable from brand_profiles, but the agents read them through inputLine(ctx,key) -> ctx.providedInputs ... Resolving those is a separate change that must also inject the values into providedInputs.' lib/workspace/actions.ts:138 applies only that set; brandProfileExists (line 149) feeds scorePriority only, never applyResolvedInputs. Consequence: lib/repositories/action-derivation.ts:100 inserts `action.requiredInputs.length?'needs_input':'recommended'`, so review-response, review-request, gbp-post and ig-bio (lib/workspace/templates.ts:74,88,130,158) always demand brand_voice even though brand_profiles.voice is non-null and already reaches the prompt at lib/workspace/runs.ts:253,270-276. grep -rn "brand_voice" lib components returns no reader of brand_profiles.voice for input resolution.

#### 17. Show a compact 'business details used' summary before generation (workspace/location identity, market, brand voice, approved claims, prohibited terms, languages, asset rights basis, snapshot observed_at), with each row labelled by origin and a deep-link to the authorized brand save.

**Effort:** `medium` · **Start at:** `lib/workspace/queries-pages.ts`

**Status:** done. `ActionDetail.businessContext` (new) carries workspace/location identity, market, brand voice, approved claims, prohibited terms, languages, snapshot `observed_at`, and -- only for a template that actually requires one -- asset rights, each row labelled by origin (Brand settings / the workspace record / the latest scan / Assets). Rendered as a collapsed-by-default panel on the draft tab, before the Generate control, with a link to Brand settings. Reads through the same mockable `workspaceReadRepository`-adjacent surface (`getBrand`, `assetRepository`) the rest of this file already uses, so it can never show a different value than what generation itself grounds on -- and the asset lookup mirrors `socialAssetSatisfied`'s own read exactly.

**Proof of absence**

No such data reaches any generation surface. lib/workspace/queries-pages.ts:174-180 — `export interface ActionDetail { action; versions; runs; measurements; scanInputs }` contains no brand, workspace or location facts. components/workspace/create-view.tsx:27-37 CreateViewProps likewise. `grep -rn "brandRepository|getBrand|assistantBrand" --include=*.tsx components` returns ZERO matches; the only non-test readers are lib/workspace/brand.ts:135, app/api/workspaces/[workspaceId]/brand/route.ts:23, app/[locale]/owner/onboarding/page.tsx:94 and app/[locale]/owner/[workspaceSlug]/settings/brand/page.tsx:20. `grep -rniE "business details|details used|所用資料|context used" lib components app` matches only docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md:263. The 'brand-check-panel' at components/workspace/action-detail-client.tsx:517 is a post-generation guardrail badge on the draft, not a pre-generation context summary.

#### 18. Localize human-readable evidence limitations in zh-HK, zh-TW and en without altering scoring meaning — a code->message map with an untranslated raw-code fallback, replacing the English-only humaniser and the three raw-code render sites.

**Effort:** `medium` · **Start at:** `lib/funnel/report-labels.ts`

**Proof of absence**

lib/funnel/report-labels.ts:67-70 — `export function humaniseLimitationCode(code: string): string` takes NO locale and builds English word-splitting from the code; it is the only humaniser (`grep -rn "humaniseLimitationCode"` returns report-labels.ts:67, report-props.ts:13,282 and tests/funnel-scan.test.ts only). No translation keys exist: `grep -c "NOT_PROVIDED|NOT_MEASURED|UNREACHABLE|NOT_RECORDED" lib/messages/{en,zh-HK,zh-TW}.json` returns 0/0/0, and `grep -n "limitation" lib/messages/en.json` returns only line 371 'accuracyHeading'. Raw machine codes are rendered directly to owners in all three locales at components/report/dashboard-metrics.tsx:44 (`{module.limitationCode && <p>{module.limitationCode}</p>}`) and components/workspace/evidence-gallery.tsx:40 (`{item.limitationCode && <small>{item.limitationCode}</small>}`). Codes originate at lib/workspace/module-states.ts:75,79,81,224 and lib/report/load-report.ts:40 plus scan-engine provider codes. Related dead data: lib/workspace/queries-pages.ts:371 loads instagram.limitationCode into the integrations model but `grep -n "limitationCode" components/workspace/integrations-view.tsx` returns nothing, so the owner is never told why Instagram was not measured.

### P2.4 — Operate assisted ownership assignment

#### 19. A default-off enablement gate on the approve/assign action, checked as the first statement in the route (not only in the UI), tied to DEC-06: no real approvals until a named accountable operating role and an approved independent-verification procedure exist. The reviewer must record WHAT independent control/authority was verified and BY WHOM, chosen from an operator-entered value rather than a universal policy hard-coded in this repo.

**Effort:** `small` · **Start at:** `.env.example:59`

**Status:** done — `70b8a3d`. `ASSISTED_ASSIGNMENT_ENABLED`, exactly "true", checked as the first statement in the decision route and answering 404 before authorization. The queue stays readable with it off, per DEC-06's safe default. The reviewer's method and verifier are operator-entered free text, not a picklist.

**Proof of absence**

`grep -n "STAFF|FIMMICK|CLAIM|OAUTH" .env.example` shows the flag pattern exists only for WORKSPACE_CLAIM_VIA_OAUTH_ENABLED (.env.example:59) and OWNER_SELF_SERVICE_CLAIM (:60); there is no assignment/operator flag. DEC-06 (docs/implementation/owner-platform-v1/BUSINESS-AND-HOSTED-DECISIONS.md:14) still lists 'Named accountable operating role, reviewer access rules, accepted independent verification methods, rejection/transfer policy and retention/access rules' as the pending input, so the enable step cannot be taken in this phase.

#### 20. A persistable decision outcome. `workspace_access_requests` cannot express approved vs rejected vs needs-information, an auditable reason, the requester's preferred contact, or verification-evidence references — it has six columns and only a binary resolved/not-resolved signal. Either (a) add columns (status, decision_reason, preferred_contact, contact_identifier, evidence_ref, decided_at) — which is the LOUD schema change, or (b) carry outcome/reason/contact/evidence as `audit_events` rows keyed entity_type='workspace_access_request', entity_id=<request id>, using resolved_at/resolved_by_staff_user_id as the closed flag. Option (b) needs zero DDL but makes current status a derived read and needs-information non-terminal; it ALSO requires widening the typed writers, because both require a non-null workspace id today (lib/workspace/audit.ts:32 `workspaceId: string`, lib/repositories/claims.ts `ClaimAuditEvent.workspace_id:string`) while a pre-assignment request has no workspace — note `audit_events.workspace_id` is already nullable in SQL (neon/migrations/0002_business.sql:114).

**Effort:** `medium` · **Start at:** `neon/migrations/0002_business.sql:417`

**Status:** done — `ff19a5f`. Zero DDL. `resolved_at`/`resolved_by_staff_user_id` stay the closed flag; outcome, reason, contact and verification ride on `audit_events`, with the previously unused `idempotency_key` unique index making a terminal decision exactly-once. Both typed writers were widened to a nullable workspace id -- `tsc` found the second one.

**Proof of absence**

`grep -rn "workspace_access_requests" neon/migrations/*.sql` returns exactly 10 lines: the CREATE TABLE (0002:417), the pkey (0002:577), three FKs (0002:645-647), two indexes (0002:689-690) and the 0003 RLS/grant/policy block (0003:148-151). There is no ALTER TABLE … ADD COLUMN for it in any migration. The CREATE TABLE body at 0002_business.sql:418-423 lists id, job_id, user_id, requested_at, resolved_at, resolved_by_staff_user_id and nothing else. On the freeze: scripts/neon/catalog.ts:46-47 runs `assert.deepEqual(columns(business(actual.columns)), columns(legacy.columns))` and :45 `assert.deepEqual(business(actual.tables), legacy.tables)` against test/integration/fixtures/legacy-final-catalog.json; the only escape hatches are `additionalFunctions`/`additionalTriggers` (catalog.ts:11-12, used by 0005_owner_removal_guard.sql, which added a function+trigger and no columns). There is no additionalTables/additionalColumns/additionalIndexes list, so any ADD COLUMN or new table fails db:verify until the frozen fixture is regenerated.

#### 21. An approve/reject action that invokes the SAME checked services as verified ownership (createWorkspaceWithOwner + attachJobToWorkspace), refuses already-claimed/tampered jobs via attachJob's false return, is idempotent on re-submit, closes the request row, and emits audit events. The audit vocabulary for it does not exist and is compile-enforced, so new names must be added to the AUDIT_EVENTS tuple and the label map.

**Effort:** `medium` · **Start at:** `app/api/oauth/google/claim/callback/route.ts:127`

**Status:** done — `84ef171`. `resolveAccessRequest` runs the SAME `createWorkspaceWithOwner` + `attachJob` as verified ownership, on one transaction client. Task 1 made both executor-aware first, because neither could join a caller's transaction. `attachJob` returning false throws `already_claimed` and rolls everything back.

**Proof of absence**

`attachJobToWorkspace` has exactly two consumers — app/api/oauth/google/claim/callback/route.ts:141 and lib/identity/complete-sign-in-ports.ts:56 (through claimScan); no operator or request-approval call site exists. `grep -n "access\|assign" lib/workspace/audit-labels.ts` returns nothing, and the AUDIT_EVENTS tuple at lib/workspace/audit.ts:11-16 contains 26 names, none of which relates to an access request or an assignment (workspace.claimed is the OAuth/self path). `ls -R app/api` lists no requests/, access-requests/ or ops/ directory.

#### 22. An owner-facing request/status surface that survives return visits, shows exactly what happens next, and keeps another person's request private (scope it to the signed-in user's own user_id). The natural homes are select-workspace (where a memberless signed-in user lands) and onboarding step 2.

**Effort:** `medium` · **Start at:** `app/[locale]/owner/select-workspace/page.tsx:38`

**Status:** done — `39fa2cd`. Status is derived, never stored, and scoped `WHERE user_id` = the verified session. Rendered on select-workspace and onboarding step 2. The copy promises no review and no response time, because DEC-06 says not to claim an operating service exists.

**Proof of absence**

`grep -rn "FROM workspace_access_requests|UPDATE workspace_access_requests|workspaceAccessRequests" lib/ app/ components/ scripts/ tests/ e2e/` returns only four declaration lines — lib/db/schema/business.ts:620, lib/db/schema/workspaces.ts:1, lib/db/database.types.ts:32 and :70. No SELECT or UPDATE against the table exists anywhere in the application. app/[locale]/owner/select-workspace/page.tsx:38-47 reads only `listWorkspaceCards(user.id)` and a `denied` query param and renders no request card; app/[locale]/owner/onboarding/page.tsx loads claim evidence, ownership, GBP connection and saved setup (:141-146) and never queries a request.

#### 23. A genuinely authenticated, server-authorized operator role and minimal operations queue in this Neon app. Needs: an explicit allowlist (env config, e.g. OPERATOR_EMAILS) resolved against the VERIFIED session email → app_users.id; a `requireOperator()` guard beside requireMembership that fails closed the same way; a queue page and route that reads pending requests (using the existing workspace_access_requests_pending_idx); and audit entries per view/decision. Must NOT flip lib/auth/staff.ts to true and must NOT reconnect the retired Supabase console. Also note app_users has no role column, so the role must live in config, not schema.

**Effort:** `large` · **Start at:** `lib/auth/staff.ts:20`

**Status:** done — `97bf170`. `lib/auth/operator.ts` beside the untouched `staff.ts` stub: an `OPERATOR_EMAILS` allowlist resolved to an `app_users.id`, failing closed five ways. Unlisted `/{locale}/ops` queue and detail pages, English copy by recorded exception, `robots: noindex`.

**Proof of absence**

`find app lib components -type d \( -iname "*ops*" -o -iname "*admin*" -o -iname "*operator*" -o -iname "*staff*" -o -iname "*queue*" -o -iname "*access-request*" \)` returns nothing — no such directory exists. lib/auth/staff.ts:21-27 returns false/null unconditionally. lib/auth.ts:99-101 returns `{kind:"none"}` for anything that is not an accepted member. `grep -n "STAFF\|FIMMICK\|OPERATOR\|ADMIN" .env.example` returns nothing — no operator allowlist variable exists. app_users is defined at neon/migrations/0001_identity.sql:12-16 with exactly id, email, created_at — no role column.

### P2.5 — Repair supporting communication and audit paths

#### 24. Authorized mark-as-read path for workspace_notifications (F-23). The bell's unread badge can never reach zero. Needs a member-authorized mutation that only ever updates the caller's own rows (workspace_id = authorized workspace AND user_id = auth.user.id AND read_at IS NULL), plus the UI affordance on the notifications page (per-row on open, and a 'mark all read' action). No schema change: read_at already exists.

**Effort:** `small` · **Start at:** `app/api/workspaces/[workspaceId]/notifications/route.ts`

**Status:** done — `9a749ca`. `PATCH /api/workspaces/[id]/notifications`; the repository predicate pins `user_id` to the verified session, so a member cannot mark another's rows read.

**Proof of absence**

`grep -rn "markRead|markAsRead|mark_read|markNotification" --include=*.ts --include=*.tsx .` over the repo (node_modules excluded) returns ZERO matches. Grep for `read_at` across {lib,app,components,neon,supabase} returns only reads and column definitions - lib/repositories/workspace-read.ts:52 (count WHERE read_at IS NULL), :162 (SELECT read_at::text), components/workspace/notifications-view.tsx:19 and :42 (filter/className), neon/migrations/0002_business.sql:458 (column), lib/db/schema/business.ts:689 (drizzle column) - and NO `UPDATE workspace_notifications` anywhere. `ls app/api/workspaces/[workspaceId]/` lists actions, assets, billing-portal, brand, checkout-link, fix-pack-drafts, google-connection, instagram-handle, members, notification-preferences, rescan, usage - there is no `notifications` directory. components/workspace/notifications-view.tsx (full file, 50 lines) renders the unread count at :37 and contains no button or form that could clear it.

#### 25. Audit row on Fix Pack review (second half of F-29). The legacy review path is reachable in this app and approve/reject leaves no trace in the append-only ledger (guardrail 10). Add a review event name to AUDIT_EVENTS + audit-labels and emit it from the PATCH route after a successful repository.review, best-effort like every other route. No schema change and no write to agent_runs beyond the existing review UPDATE.

**Effort:** `small` · **Start at:** `app/api/workspaces/[workspaceId]/fix-pack-drafts/[runId]/route.ts`

**Status:** done — `2a70d4d`. `fix_pack.reviewed` joins AUDIT_EVENTS with its label and is emitted only on a successful review.

**Proof of absence**

Full read of app/api/workspaces/[workspaceId]/fix-pack-drafts/[runId]/route.ts: its only imports are next/server, @/lib/auth and @/lib/repositories/fix-pack - no recordNeonEvent, no recordClaimAuditEvent, no audit call anywhere between the successful `repository.review(...)` and `return NextResponse.json({ ok: true })`. lib/workspace/audit.ts:11-16 lists all 26 AUDIT_EVENTS members and contains no fix_pack/agent_run review name; lib/workspace/audit-labels.ts has no corresponding label. Reachability proven: components/workspace/home-brief.tsx:177 renders <FixPackCard/>, which calls lib/owner/fix-pack-card-client.ts:47 `fetch('/api/workspaces/${workspaceId}/fix-pack-drafts/${runId}', {PATCH})`. Schema is free: neon/migrations/0002_business.sql:112-124 declares audit_events.event as plain `text`; the only CHECK on that table is audit_events_actor_type_check at :528.

#### 26. One application transactional-email abstraction (a port with a driver selected from the repository's intended configuration - RESEND_API_KEY + REPORT_EMAIL_FROM), explicitly separate from Neon Auth identity mail. It must return an evidence-bearing result (queued | accepted-by-provider with the provider message id | failed), must report 'not configured' rather than pretending to send when the key is absent, and must never be called 'sent'. Sending real mail is separately authorized; the port, the unconfigured driver, the status vocabulary and the retry/dedupe ledger are buildable now.

**Effort:** `medium` · **Start at:** `lib/mail/transport.ts`

**Status:** done — `268bae9`. `lib/mail/transport.ts` exports the port (`MailTransport.send`), the `not_configured | queued | accepted_by_provider | failed` vocabulary, and `createMailTransport()`, which returns the safe unconfigured driver unless both `RESEND_API_KEY` and `REPORT_EMAIL_FROM` are set. `lib/mail/resend-driver.ts` is the real driver — a direct `fetch` against Resend's REST API, no new npm dependency — mapping a 2xx body's `id` to `accepted_by_provider`, everything else to `failed` with a reason, never `accepted` without a provider message id. `lib/mail/ledger.ts` records/reads attempts on `audit_events` (`entity_type='mail_attempt'`, `idempotency_key='mail:'+dedupeKey`, `ON CONFLICT DO NOTHING`) — zero DDL, reusing the column item 29 already identified. Nothing calls this port yet; that is items 29 and 30, below.

**Proof of absence**

package.json dependencies (read in full) contain no mail client at all: no resend, nodemailer, postmark, sendgrid, mailgun, @aws-sdk/client-ses. `grep RESEND_API_KEY|REPORT_EMAIL_FROM|api.resend.com` restricted to {lib,app,components,scripts,tests,test}/** returns exactly ONE hit - scripts/assert-secret-boundary.mjs:31, a synthetic sentinel value for the bundle scan - i.e. no consumer. `ls lib/` shows no mail/ or email/ directory. The only outbound mail in the repo is Neon Auth identity mail: lib/identity/composition.ts:9 `getNeonAuth().signIn.magicLink(input)`, used only by app/api/owner/magic-link/route.ts:70 and app/api/workspace-invites/magic-link/route.ts:70. .env.example:49-50 ships REPORT_EMAIL_FROM= and RESEND_API_KEY= as empty placeholders. Related: the intended provider-receipt table notification_events (resend_message_id column, lib/db/schema/business.ts:366-378, neon/migrations/0002_business.sql:257-264) has NO writer - grep 'notification_events' over lib/ and app/ returns only the drizzle schema, lib/db/database.types.ts and lib/security/migration-hardening-sweep.test.ts.

---

## Blocked

Not work until the blocker is lifted. Each says why.

### P2.4 — Operate assisted ownership assignment

#### 27. An explicit owner request submission — a route plus a form on onboarding — that captures requester intent, preferred contact and the minimum necessary verification evidence reference for the named report/job, rate-limited like the other public POSTs. Today the only request is filed implicitly during sign-in, carries no contact or evidence, and is never filed at all for a manual-entry owner who reaches onboarding without a `claim` slug.

**Status:** `needs_schema_change`

**Status:** done — `d41693c`. **Unblocked by this release** -- it was `needs_schema_change`, and this adds no DDL. `POST /api/access-requests` is bound by the Phase 1 `isLeadRecipient` eligibility rule and answers 404 for an ineligible job, so the response never confirms it exists. The form is on onboarding step 2, the manual-entry owner's only route in.

Could not find it. Searches run: (1) enumerated all 44 route handlers via `find app -name route.ts` - no access-request/requests/assignment/assisted route exists; the only name collision is app/api/versions/[versionId]/request-changes/route.ts, which is version review. (2) Server actions - only one "use server" file in the repo, app/[locale]/owner/actions.ts:9, containing signOutAction alone. (3) Case-insensitive repo-wide grep for access.?request|accessRequest|access_request - 25 hits, all docs, the two lib files, schema/types, migrations, or tests of those. (4) Grep for assisted|assistance|ownership_request|owner-request|request-access|requestAccess|help-request|support-request - hits only under docs/implementation/owner-platform-v1/**, never in app/, lib/, or components/. (5) All writers of the table: one, lib/repositories/claims.ts:67. (6) Rate-limit scopes lib/security/rate-limit.ts:8-31 lists all 22 buckets - no access_request/ownership_request bucket; workspace_claim covers only the post-verification completion route. (7) Contact capture (preferred_contact_channel, scan_discussion) exists only in the unlock funnel (lib/funnel/unlock.ts, app/api/report-access/unlock/route.ts), a lead-capture path unrelated to owner assignment. (8) Components - no file matching *request*; components/select-workspace-page.tsx has no contact/request affordance at all. (9) Tests/e2e (e2e/acceptance/*, test/integration/neon-owner-sign-in-completion.integration.test.ts, neon-membership.integration.test.ts) exercise only the implicit sign-in insert, never a POST endpoint. (10) Git history across all branches (git log --all --name-only, plus --diff-filter=D) - no such route was ever added or deleted. (11) SQL layer - no function, no extra columns in 0003/0004/0005; lib/db/schema/business.ts:620-635 mirrors the six-column shape. The project's own plan confirms absence: docs/implementation/owner-platform-v1/MASTER-IMPLEMENTATION-PLAN.md:270 marks P2.4 "NEW", and OWNER-WORKSPACE-GAP-OBSERVATIONS.md:13 lists the operated assisted-ownership route as a gap.

#### 28. Test coverage for the acceptance criteria: a non-operator is refused review/assign; concurrent approvals cannot double-claim (attachJob's `WHERE workspace_id IS NULL` already makes the second lose — it needs a test that asserts the loser sees a visible refusal, not a silent success); a rejected request leaves the requester a non-member; and a manual-entry (no place_id) business completes request → decision → workspace → one task.

**Status:** `needs_schema_change`

**Status:** done — `1c25db9`. **Unblocked by this release.** All four criteria written against a real PostgreSQL; Docker is absent here so CI is the authority. One deviation recorded in the file: assignment does not derive actions -- that happens when the owner completes onboarding through the claim route.

The claim holds. Three of the four named criteria test a feature that does not exist anywhere in this repo, so no test can cover them.

1) Non-operator refused review/assign — there is NO review/assign surface: app/api/ contains no operations/staff/access-request route, app/[locale]/ has no operator segment, and neon/migrations/0004_atomic_operations.sql defines no assignment or decision function. lib/auth/staff.ts:21-23 is an intentional fail-closed stub (isAllowedStaffEmail always false, loadStaffIdentity always null, FIMMICK_STAFF_EMAILS ignored), asserted by lib/auth/staff.test.ts:5-24. Nobody can be an operator, so "non-operator is refused" has no subject.

2) Concurrent approvals cannot double-claim with a visible refusal — this one IS covered, but only on the OAuth-verified claim path, not an operator approval path: test/integration/neon-membership.integration.test.ts:142-149 proves attachJob resolves [false,true] and a replay returns false, and app/api/oauth/google/claim/callback/route.test.ts:366-385 proves the loser is redirected with claimed=already_claimed and that replaceGoogleConnection/recordMerchantClaimEvent are NOT called — i.e. a visible refusal, not a silent success.

3) Rejected request leaves the requester a non-member — no rejection path exists. workspace_access_requests is write-only here: the sole writer is lib/repositories/claims.ts:66-68 via lib/identity/complete-sign-in-ports.ts:33-40, and nothing reads or resolves it. The owner-facing path is an out-of-band contact link ("Ask Fimmick to assign your workspace", components/onboarding-page.tsx:246-248).

4) Manual-entry (no place_id) request -> decision -> workspace -> one task — manual entry is covered only at scan start (test/integration/neon-scan-start.integration.test.ts:38-50, e2e/acceptance/public-funnel.spec.ts:81). No journey test exists because there is no decision step to traverse.

Searched: re-ran their grep then widened to operator_|OPERATOR_ALLOW|operatorEmails|isOperator|requireOperator|assignWorkspace|assign_workspace|resolved_by_staff|resolvedBy|recordAccessRequest|decideAccessRequest|requires_verification|attachJob|workspace_id IS NULL|manual_entry across app/, lib/, components/, e2e/, test/, neon/migrations/, supabase/migrations/, docs/. Also enumerated every directory under app/api and app/[locale], every CREATE FUNCTION in neon/migrations/, and read lib/workspace/access-request.ts + .test.ts, lib/repositories/claims.ts, test/integration/neon-membership.integration.test.ts, test/integration/neon-owner-sign-in-completion.integration.test.ts, all of e2e/acceptance/, and components/onboarding-page.tsx/.test.tsx.

### P2.5 — Repair supporting communication and audit paths

#### 29. Invitation delivery with evidence-based status, and invitation expiry. Today the invite is a row plus an audit line and nothing ever reaches the invitee; the owner is told to notify them out of band. Needed: (a) an invitation notice sent through the new email port, (b) a persisted attempt record carrying queued/accepted-by-provider/failed WITH the provider id, so a retry re-sends at most once and never creates a second invitation, (c) an expiry predicate on pending invitations. LOUD SCHEMA CALLOUT: there is no invitation status/token/expiry column and no invitations table, and the catalog is frozen - so unless a migration is authorized, the attempt ledger must ride on audit_events (its payload jsonb plus its UNUSED idempotency_key column, which already has a unique index) rather than a new column, and expiry must be derived from workspace_members.invited_at rather than stored. Provider-accepted must be rendered as 'accepted by the mail provider', never as 'delivered'.

**Status:** `blocked_needs_authorization`

**Update after `268bae9`:** the email port now exists (`lib/mail/transport.ts`, item 26, above) and defaults to `not_configured` until DEC-07 sets both env vars, so building this item's own route, attempt ledger wiring and expiry predicate no longer needs the port itself to be invented first. Actually sending an invitation still needs DEC-07 authorization; the proof below is otherwise unchanged.

Genuinely absent, all three parts. (a) No email port exists: no lib/email, no lib/notifications, no transactional-mail abstraction; RESEND_API_KEY appears only in .env.example:50, scripts/assert-secret-boundary.mjs and docs, never imported by code. The only mail is Neon Auth's sendMagicLink (lib/identity/composition) used by app/api/owner/magic-link/route.ts:101 and app/api/workspace-invites/magic-link/route.ts:70; the latter is invitee-initiated sign-in mail gated by membershipRepository.hasSignInMembership, not an invitation notice sent when the owner invites. The invite POST makes no mail call. (b) No attempt ledger: AUDIT_EVENTS (lib/workspace/audit.ts:11-16) contains no mail/delivery event, NOTIFICATION_KINDS (lib/workspace/notify.ts:14-20) contains none, and no code writes queued/accepted-by-provider/failed with a provider id; no string 'accepted by the mail provider' or equivalent exists anywhere. (c) No expiry predicate: bindPending (lib/repositories/membership.ts:33-45) filters only on user_id IS NULL AND accepted_at IS NULL, and test/integration/neon-membership.integration.test.ts:41-42 deliberately asserts a 2000-01-01 invitation still binds. Searched: full-repo case-insensitive greps for invit*, EmailPort/MailPort/sendEmail/sendMail/mailer, resend/smtp/nodemailer/postmark/sendgrid/mailgun, idempotency_key, invited_at, expire/expiry/ttl, member.invited, reinvite/resend-invite/invite_sent/invitation.sent/notice.sent/message_id/'mail provider'; enumerated the whole app/api route tree, lib/repositories, lib/identity, lib/workspace, components/workspace, neon/migrations/0001-0005, supabase/migrations, tests and e2e; checked git log --all --grep=invit and confirmed a clean working tree with zero untracked source files. Two corrections to their proof: audit_events.idempotency_key is NOT unused and claims.ts:111 is not its sole writer - lib/repositories/snapshots.ts:58 and lib/repositories/action-derivation.ts:115 both populate it (the dedupe hook is live, just never used for invitations); and an invite-adjacent mail route does exist (app/api/workspace-invites/magic-link/route.ts), it simply is not an invitation notice and records no attempt.

#### 30. Report recovery. A recovery request route plus a single-use redeem route, issuing a fresh expiring grant for the SAME job to the address recorded at unlock, with an anti-enumeration response, and sending it through the email port. It must mint only a viewer grant for that one job - never a workspace membership, never a widened grant. Build it only once the email channel above exists; until then the honest state is the current one (nothing promised). Also resolve REPORT_RECOVERY_ENABLED, which is documented as a gate but is read by nothing.

**Status:** `blocked_needs_authorization`

**Update after `268bae9`:** the email port now exists (item 26, above), so the same reasoning as item 29 applies here — the missing prerequisite named below is otherwise unchanged, and sending a real recovery email still needs DEC-07 authorization.

I could not find a recovery request route or a single-use redeem route anywhere, and I searched hard. Route inventory (find app/api -type d, 60 dirs) shows report-access/ holds only sign-out and unlock. Repo-wide case-insensitive greps for recover, redeem, redeemed_at, redeemGrant, redeemViewerGrant, issueRecovery, recoveryGrant and "report-access/recover" across .ts/.tsx/.sql/.mjs/.json found no implementation: every "recover" hit is either the guided sign-in error-recovery screen (lib/identity/complete-sign-in.ts:42-49, components/auth/sign-in-flow.tsx:22, app/api/owner/sign-in/complete/route.ts:37 returning {kind:"recover", reason:"unavailable"} — an auth retry UI, not report recovery) or the unlock form's recovery_email field. redeemed_at has a column (neon/migrations/0002_business.sql:317), a type (lib/report-access/authorize-report.ts:45), a SELECT list (lib/repositories/reports.ts:69) and test fixtures, but no writer and no redeeming reader. I also checked every ref with git ls-tree for report-access/(recover|redeem) — zero hits — and git log --diff-filter=D for deleted recover/redeem files — none. No SQL function in neon/migrations mints or redeems a recovery grant. No mail dependency exists in package.json (no resend/nodemailer/postmark/SES); the only sender is lib/identity/composition.ts:7 sendMagicLink, which mints an auth session, not a per-job viewer grant, so it cannot satisfy "mint only a viewer grant, never a workspace membership".

Two corrections to the claim, however. First, the item's second clause — resolve REPORT_RECOVERY_ENABLED, "documented as a gate but read by nothing" — IS implemented. .env.example:48 now annotates it truthfully ("not read by any code; no recovery route or mail sender exists. Reserved for a future bounded delivery check."), docs/integration/NEON-CUTOVER.md:40 records it as an unresolved provider action rather than a live switch, and docs/implementation/owner-platform-v1/IMPLEMENTATION-TRACEABILITY.md:89 marks "Resolve the recovery-link promise" as fixed this phase. Their proof quotes that annotation as evidence of absence when it is the resolution. Second, the item's own conditional — "until then the honest state is the current one (nothing promised)" — is satisfied and actively enforced: commit 634b879 removed the recovery-link promise from the unlock form, the trust page and legal.retentionBody, deleted the orphaned unlock.* namespace, and added regression guards in components/unlock-page.test.tsx, tests/funnel-unlock.test.ts and tests/i18n.test.ts; tests/unhonoured-promises.test.ts structurally bans re-promising mail until a real sender lands. So the requirement is partially met by design; only the two routes and the email channel are outstanding.

Their buildStatus is correct. No schema change is needed — report_access_grants already carries purpose, email_normalized, expires_at, redeemed_at, revoked_at, last_used_at, and lib/report-access/token.ts already exports createViewerToken/hashViewerToken/tokenHashMatches/createIdempotencyKey. The only missing prerequisite is the email channel, which NEON-CUTOVER.md:40 ties to an approved report-delivery account/sender/mode that is not authorized ("leave recovery disabled until bounded delivery checks authorized"), and the repo constraint forbids paid/provider provisioning actions.

---

## Already existed

Claimed missing, then found. Recorded so they are not claimed again.

- **P2.1 — Simplify the daily experience without hiding the evidence** — Action detail must present ONE state-appropriate next action, with the other controls demoted to secondary/disclosure (without hiding approval/version state, guardrail flags or the allowance charge).
  - Found at: components/workspace/action-detail-client.tsx:621 (single state-switched primary control: isApprovedCurrent ? Export : Approve, with Save demoted to variant="outline"); components/workspace/action-detail-client.tsx:439 (six-branch "Direct next step" state derivation); demotion tiers at components/ui/button.tsx:12-21 + app/ramp-refresh.css:83-95; disclosure at action-detail-client.tsx:506 (<details>) and :450-451 (tabs); state machine at lib/workspace/overview.ts:92-110

- **P2.3 — Make shared business context reliable** — Distinguish ingestion/scan time from per-source observation time on the report instead of suppressing provenance entirely: every module row currently reads 'Observation date unavailable' even for a fully measured module on a scan whose completion time is known.
  - Found at: C:\Users\laich\Documents\smeassistant\.claude\worktrees\sme-assistant-phase-1-e83fdc\components\report\scan-metrics.tsx:43 (scan/ingestion time rendered as its own labelled row: `{c.scanned}: <RecordedDate value={report.scannedAt} fallback={c.scanUnavailable} />`) and :66 (per-source observation time: `{c.observed}: <RecordedDate value={row.observedAt} fallback={c.dateUnavailable} />`). Supporting: components\report\dashboard-summary.tsx:22,36 (scan date in the report header under `d.scanned`); lib\funnel\report-props.ts:351 (`scannedAt` carried as a distinct prop); lib\copy.ts:1456,1465,1474 and :532,:852,:1161 (separate trilingual vocabularies `scanned`/`scanUnavailable` vs `observed`/`dateUnavailable`/`published`/`publicationUnavailable`); lib\report\scan-metrics\search.ts:154,195 (per-observation `observedAt` populated from `run.requested_at`, nulled when a group's timestamps disagree); lib\funnel\report-dashboard.ts:79 (`observedAt: merchant.generatedAt`) rendered at components\report\dashboard-metrics.tsx:54. Tests: components\report\scan-metrics.test.tsx:30-33 + :58; tests\funnel-report-props.test.ts:108-111. Governing requirement text: docs\implementation\owner-platform-v1\MASTER-IMPLEMENTATION-PLAN.md:265.

- **P2.4 — Operate assisted ownership assignment** — Honest acknowledgement handling: in-app status must be authoritative and no mail claim may be made, because there is no application mail service in this repo yet (that is P2.5) and a requester with no workspace cannot receive an in-app notification row either. Whatever copy ships must not promise a send or an SLA.
  - Found at: components/onboarding-page.tsx:238-248 (honest assisted-ownership copy; comment at :239-245 records removal of the "you will be emailed"/"Reply to the report email" promises); components/onboarding-page.tsx:145-147 (authoritative in-app status: Verified with Google | Assigned by Fimmick | Pending verification); app/[locale]/owner/onboarding/page.tsx:132-141 (status + resumeStep derived from persisted state alone, survives return visits); components/onboarding-page.tsx:107-112 and :247-248 (owner-initiated market contact channels carrying the report reference, with a no-dead-link fallback); components/onboarding-page.test.tsx:74-80, :93-100, :102-104 (tests asserting no mail promise, no dead channel link, and in-app "return to this page" resolution)
