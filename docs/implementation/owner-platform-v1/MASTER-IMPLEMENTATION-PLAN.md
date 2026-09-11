# SME Assistant — Four-Phase Implementation Plan for Claude Code

**Prepared:** 10 September 2026  
**Repository:** `YNWAforever/smeassistant`  
**Audit reference:** `main @ 8f4c5b481f32a482fce1d090e9173952d8cbcccc` (`8f4c5b4`)  
**Historical production origin in the audit:** `https://smeassistant.vercel.app`  
**Document status:** Implementation instructions and proposed release design. No repository changes, tests, deployments, migrations, provider calls or hosted acceptance have been performed by preparing this plan.

> Build a product a legitimate business owner can enter, use to finish a useful task, and return to each week. Do not mistake more agents, more cards or more documentation for a working owner journey.

## 1. Scope, sources and authority

This plan reorganizes the five supplied audit documents into **four larger outcome-based phases**, not a ground-up rewrite. Each phase contains multiple reviewable changes but ends with a demonstrable owner journey and a release gate.

### 1.1 Read these sources before implementation

1. [`sources/AUDIT-REPORT.md`](sources/AUDIT-REPORT.md): evidence, findings, architecture and historical deployment observations.
2. [`sources/PRIORITISED-BACKLOG.md`](sources/PRIORITISED-BACKLOG.md): original stages A–E, repair locations and dependencies.
3. [`sources/AGENT-TOOL-CAPABILITY-MATRIX.md`](sources/AGENT-TOOL-CAPABILITY-MATRIX.md): actual capabilities, the first three workflows and SQL approval/delivery rules.
4. [`sources/OWNER-EXPERIENCE-BLUEPRINT.md`](sources/OWNER-EXPERIENCE-BLUEPRINT.md): proposed owner experience. Its own opening explicitly says these proposals were not implemented.
5. [`sources/VERIFICATION-PLAN.md`](sources/VERIFICATION-PLAN.md): historical test results, blocked gates and remaining hosted tests R1–R11.

The audit is dated 9 September 2026 UTC and was re-baselined to the commit recorded at 10 September 2026 01:32 +0800. **It is a historical snapshot, not proof of today's repository or deployment state.** Current code and serving deployment must be re-baselined before changing anything. Preserve newer fixes and unrelated work.

Use these task labels throughout execution:

- **REPAIR:** directly addresses an audited defect or risk.
- **NEW:** proposed product capability; not evidence that it exists today.
- **CONFIG:** implementation depends on environment, provider setup or a hosted action.
- **DECISION:** commercial, operational or release choice that code must not silently invent.

Source-derived facts are identified by original finding IDs, backlog IDs and source sections. The four-phase grouping, added safeguards, screen budgets, proposed operational design and later expansion are **recommendations in this plan**, not additional audit findings.

### 1.2 Important differences and gaps to resolve explicitly

Do not smooth over these differences in the supplied documents:

| Topic | Source position | Implementation instruction |
|---|---|---|
| First three AI workflows | Capability Matrix §3 selects review replies, FAQ/JSON-LD and website basics. Blueprint §3.2 uses a Google profile-fix card as its third example. | Use the Matrix's three as the generation release scope. Keep Google profile fixing as a separately labelled checklist. A checklist is not a missing AI generator to invent. |
| Upgrade allowance | Blueprint §3.4 suggests copy-following-code removes the upgrade trap. Backlog D3 and Audit F-20 identify allowance frozen on an existing usage row. | Treat the persisted-allowance defect independently. Test and repair it even when public copy follows current entitlements. Changing words cannot update an existing usage row. |
| “Ten offline gates” | Verification §2 lists nine named offline command entries; its acceptance section refers to ten. | Inspect current `package.json`, CI and gate scripts. Produce an explicit command inventory and reconcile the discrepancy. Do not invent a tenth gate or count an embedded build twice without identifying it. |
| Already resolved slug issue | F-07 was fixed in the audited deployed commit. | Preserve it and add/retain regressions. Do not reimplement an older slug regex. |
| Backlog completeness | F-04, the open F-33 sign-in failure, discarded onboarding brand fields, and server-derived onboarding resume are not adequately covered by only implementing A1–E5 literally. | Include them explicitly in Phase 1. |
| Runtime and database documentation | Audit records local/CI Node 22 versus production Node 24 and stale Supabase architecture text. | Verify the actual target. Align tests and documentation with the chosen runtime without an opportunistic framework/auth/database migration. |
| Evidence of success | Fixture tests exercise substantial functionality; hosted auth, generation, approval/export and comparison remain unverified in the audit. | Keep implemented, locally verified and hosted verified separate. Never copy historical passing results into a new release record. |

### 1.3 Default interpretation of “bigger phase”

A phase is a **vertical product release**, not an enormous unreviewable commit. Claude Code must work through implementation, tests, interface states and evidence for that phase rather than stop after an analysis or a cosmetic change. Split work into coherent commits/PRs inside the phase. A blocked hosted test does not prevent safe independent local work, but it prevents a hosted-readiness claim.

## 2. Product direction and non-negotiable boundaries

### 2.1 Owner-facing product

Use the proposed umbrella **SME Assistant — by Fimmick** in owner-facing copy. Preserve scanner visibility and use plain labels such as **免費能見度檢查**, **我的工作台** and **助理**. This is copy and navigation-label work, not authorization to rename packages, URLs, database objects, integrations, repositories or the Vercel project.

The core loop remains:

**Scan → explain evidence → prioritize → prepare a draft → human approval → export/copy → re-scan → verify change.**

The scanner remains the acquisition and diagnosis foundation. The workspace owns permissions, business context, actions, immutable versions, approval, delivery and measurement. Pocket Assistant / Visibility Operator stays contextual: it explains evidence and prepares suggestions, not an autonomous approver, publisher or separate agent marketplace.

### 2.2 Preserve these existing strengths

Based on Audit §1 and Capability Matrix §§5–6:

1. **Evidence quality:** unavailable is not zero; insufficient independent evidence means `overall: null`; coverage remains explicit; unknown or incompatible scoring versions cannot be compared.
2. **Human authority:** approval binds to one immutable version. Editing produces a new draft that requires fresh approval. Previously approved history remains governed by the existing SQL contract, not silently revoked by a UI refactor.
3. **Delivery accounting:** the first qualifying export of the exact approved version is counted once. Repeated export/copy does not increase usage. Generation, revisions, rejection, failures and rescans do not consume approved-delivery allowance.
4. **Server-side authorization:** resolve persisted workspace/location membership before reading or mutating actions, outputs, assets or reports. Client IDs, an LLM response and a UI role badge cannot grant authority.
5. **Technology direction:** retain Neon PostgreSQL/Auth, the package manager and lockfile, existing routes and pinned vendored packages. Do not revive retired Supabase transports or the old staff console.
6. **Assistant boundary:** keep its repository read-only. An explicit owner action may call an authorized host application route; an assistant suggestion itself cannot create authority, approve, export or publish.
7. **Market boundary:** preserve explicit `hk|tw` market selection independently of `zh-HK|zh-TW|en` display language. Switching language must not change business market, currency or access.
8. **Honest capability labels:** no image-generation, WhatsApp/LINE sending, automatic publishing or recurring execution claim without implementation and appropriate verification.

### 2.3 Permission defaults

This plan does **not** authorize production deployment, production writes, migrations, feature-flag activation, paid provider calls, live emails, OAuth consent, billing events or third-party publishing.

Local source changes and tests may proceed in the actual implementation session within its granted permissions. Keep new incomplete or externally dependent features off by default. Before hosted actions, record the authorized origin, accounts, businesses, providers, operation count/budget and data-retention constraints. Never print secret values.

Do not merge to `main` merely to test: the audit records automatic production deployment from `main`. Inspect current deployment behavior first. Do not remove protection, take the production site down or alter automatic deployment policy without an explicit release decision.

## 3. Four releases and their owner outcomes

| Phase | Release outcome | Principal scope | Exit demonstration | Release scope |
|---|---|---|---|---|
| **1 — Safe owner activation** | A legitimate eligible owner can get into the product and finish one useful task. | Baseline truth, security, usable scans, sign-in/claim, context preservation, brand persistence, one review-reply workflow, honest failure states. | Authorized HK and TW journeys: scan → unlock → real sign-in → proven claim → saved review draft → approval → one counted export. | Controlled pilot for verified Google-profile managers. No broad self-service or paid-readiness claim yet. |
| **2 — Complete owner workspace** | Owners can understand today's priority and complete three useful workflows; owners without GBP have a genuine route to assistance. | Simplified daily UI, three complete workflows, shared brand context, assisted-assignment operations, working notifications/invites and broader mobile coverage. | New and returning owners, including an assisted no-GBP case, complete review replies, FAQ/JSON-LD and website basics without duplicate entry or hidden dead ends. | Broader owner onboarding only after the assisted verification process is operated and tested. |
| **3 — Recurring, measurable and commercial service** | Owners can return, recheck, see honest changes and use a billing contract that matches enforcement. | Durable scan/run lifecycle, one scheduler, reachable comparison, billing/allowances/seats, analytics, cost controls and support operations. | An approved output is exported, implementation is separately recorded, a comparable re-scan shows observed change, and authorized test billing behaves correctly. | Paid and recurring-service readiness only after commercial decisions and hosted gates pass. |
| **4 — Reusable growth platform** | The same owner context supports more repeatable work without multiplying separate products. | Offers, promotion-copy workflow, unified work packs, contextual assistant suggestions, reusable workflow contracts and regression evidence. | Confirm one offer → create channel-specific drafts → review exact versions → export under the existing ledger; re-use context in the next work cycle. | Core expansion first. Provisional preview and one publishing connector are separate conditional sub-releases, not assumed capabilities. |

**Dependency rule:** Phase 1 safety and identity repairs are prerequisites, not a parallel stream to ignore while building new screens. Within later phases, reusable work can be coded behind disabled flags while external gates are blocked. Do not declare the predecessor release complete or activate dependent capabilities prematurely.

## 4. Phase 1 — Safe owner activation

### 4.1 Outcome and scope

**Owner promise:** “I can inspect my business, prove it belongs to me, and leave with a saved, approved review reply I can actually use.”

Deliver a complete vertical slice through the existing system. This phase intentionally includes work from original Stages A, B, C and D where it is necessary for the first real delivery. Merely adding the claim button is not completion.

### P1.1 — Re-baseline and establish release truth · REPAIR

**Sources:** A1, E5; F-31, F-32, F-35; Verification R1–R2.

- Read current `CLAUDE.md`, architecture, deployment, migration and vendoring instructions before editing. Treat stale statements as discrepancies to verify, not commands to resurrect retired infrastructure.
- Record current branch/HEAD, dirty files, base branch, lockfile and package manager. Preserve all unrelated changes. Compare relevant paths against `8f4c5b4`; mark each finding present, already fixed, changed, or not verified.
- With authorized read-only access, record the serving deployment's commit, immutable origin, alias, runtime and configuration-name inventory. Without access, mark that inventory **blocked**, not absent and not assumed safe.
- Reconcile `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `docs/integration/DEPLOY.md`, `NEON-CUTOVER.md` and `LAUNCH-REPORT.md` so deployment existence is distinct from acceptance status.
- Discover current CI scripts and runtime version. Test on the candidate's intended serving runtime; do not silently treat a historical Node 22 pass as production Node 24 proof.
- Keep production alias/protection/CD changes in a separately authorized change. Documentation correction alone must not expose or disable anything.

**Output:** phase baseline, exact gate inventory, findings delta and updated architecture/release contract.

### P1.2 — Secure public provider access and workspace integrity · REPAIR

**Sources:** A2–A6; F-08, F-10, F-11, F-13, F-37; Verification R9.

**Likely existing seams:** `lib/scan/start-job.ts`, `packages/scan-engine/src/collect-providers.ts`, `lib/website/checks.ts`, `lib/evidence/safe-media.ts`, paid-provider API routes, `lib/db/client.ts`, workspace members route, current Neon migrations.

Implement these as behavior fixes, not assertions in documentation:

- Validate `website_url` at the API boundary and at actual fetch time. Reuse/extract the safe-media URL-safety core: allowed scheme, DNS resolution, prohibited address rejection, pinned connection, manually revalidated redirects, deadline and response cap. Reject invalid/non-HTML responses for website checks. Exceeded caps are an unavailable/limited observation, not evidence that the page lacks an FAQ or H1.
- Bound URL length, `business_name` and prompt-bound owner inputs. Test private IPv4/IPv6, loopback, link-local, redirect-to-private, oversized body, content type, credentials in URLs and unsafe redirect schemes. Use controlled fixtures; do not probe real internal services.
- Prefer an injected safe fetch adapter into vendored code. When a vendored change is unavoidable, document it in `VENDOR.md`, retain the upstream pin and record the upstream-fix action rather than claiming it was submitted.
- Fail closed on provider-spending routes when limiter/security configuration is unavailable. Return a controlled 503 with a useful retry explanation. Classify read-only status polling separately; do not disable harmless recovery access indiscriminately.
- Prevent removal of the last owner **atomically**. A pre-delete count outside a transaction is insufficient. Serialize membership mutation on the workspace, enforce the invariant at the database boundary, and prevent orphan cleanup from cascading through audit, billing and output history. Cover concurrent owners attempting removal, not just sequential tests.
- Use additive migrations at the **next available migration number**. The audit's 0001–0004 remain immutable; do not assume 0005 is still free. Review runtime-role permissions for new functions/tables.
- Require verified TLS for the actual PostgreSQL client/connection configuration. Test the chosen configuration; never suppress the warning by disabling certificate verification.
- Reject the forbidden `OWNER_SELF_SERVICE_CLAIM` mode at build/deploy startup and at the sensitive runtime boundary. Do not enable email-match self-service ownership to unblock onboarding.

**Rollback:** keep security fixes in place where possible. Disable the affected capability or roll forward instead of restoring an SSRF path, fail-open limiter or destructive deletion behavior. Never roll back by deleting newly created evidence.

### P1.3 — Make the scan a usable, honest entrance · REPAIR

**Sources:** B3–B5; immediate subset of D1; F-14, F-15, F-17, F-18, F-36.

- Reuse the report's `coveragePercent` logic on scanning screens: 0.7 renders 70%, not 0.7%. Preserve unavailable/null semantics.
- Render actual per-module state. A partial job must not label unavailable collectors “measured.”
- Return an inspectable partial report when usable evidence exists but fewer than two independent scoring modules are measured. Keep `overall: null`; do not lower the scoring threshold. No usable evidence can remain failed with an actionable reason.
- Persist the policy-versioned scan consent server-side using the existing consent mechanism where possible. Validate presence and version before dispatch; do not accept a client-only checkbox or invent historical consents.
- Stop indefinite polling and unsupported “continues in the background” promises. Introduce bounded waiting/stalled/failed states, a finite request budget and an explicit safe resume path tied to the existing job.
- Ensure resume is authorized for that job, respects provider budgets and a single lease, and cannot duplicate a scan merely because two tabs return. Do not introduce a second scheduler in this phase.
- Persist/derive enough current state to present an honest result after refresh. Phase 3 adds the durable recurring executor; Phase 1 still must demonstrate that its pilot scans actually reach a terminal usable result.

**Acceptance:** HK/TW fixtures without Instagram remain usable where partial evidence exists; null score and coverage are correctly displayed; consent is stored; stale work has a recoverable bounded state; no implied unattended completion unless demonstrated.

### P1.4 — Repair identity, eligibility and proof of ownership · REPAIR + CONFIG

**Sources:** B1, B2-A, B6, B8; F-01, F-02, F-04, F-05, F-07, F-28, F-33, F-38; Verification R4–R6.

**Likely seams:** report/unlock components, `lib/copy.ts`, current sign-in-flow/diagnostics modules, magic-link route, Google sign-in callbacks, Google claim start/callback, onboarding and claim parsing.

- Emit `/{locale}/owner/sign-in?claim={slug}` from the unlocked report and unlock-success path; retain safe previews and report-grant scopes.
- Preserve the claim slug, explicit market, locale, allowed destination and optional allowlisted intent through every identity handoff. Reuse the repaired parser; keep `_` and `-` in valid base64url slugs. Reject open redirects and arbitrary error/query content.
- Treat **Google sign-in** and **Google Business ownership claim** as different proofs with separate callbacks. Logging into Google does not prove management of a place.
- Resolve the open Google callback defect using the existing six-stage diagnostic/correlation model. A new log line or a successful redirect to account selection is not a fix. Record the root cause and a completed authorized hosted sign-in.
- Repair F-04's channel-dependent eligibility: trace email contact, WhatsApp/LINE contact, recovery email, viewer grant and signed-in identity separately. An eligible authenticated claimant should not dead-end because unlock used WhatsApp or LINE. Do not convert a recovery email, contact-channel match, report grant or self-declared claim into ownership.
- Preserve anti-enumeration for magic-link requests. Provide safe alternative next steps without saying which email owns a workspace. Never show “sent” for an application email path that has no sender; distinguish an accepted identity request from confirmed mail delivery.
- Keep both signed-in/no-workspace and report-only paths useful. Where the claim context is known, retain it in retry/complete screens. Show actionable allowlisted claim outcomes, not raw exception text or another account's private information.
- Make sign-in visible outside the mobile menu. Fix localized dismiss text and target sizes as a product design requirement; include keyboard/focus and screen-reader states.
- Implement and test claim configuration detection locally. Enabling `WORKSPACE_CLAIM_VIA_OAUTH_ENABLED`, registering callbacks and completing consent require explicit hosted authorization. With configuration enabled and complete, the anonymous start probe should be 401 rather than flag-off 404 or misconfigured 503.

**Scope honesty:** Phase 1 supports proven Google-profile managers. No-GBP and manual-entry owners get an honest alternative explanation until Phase 2's assisted flow is real; do not label all-owner self-service available.

### P1.5 — Persist onboarding context and resume safely · REPAIR

**Sources:** Blueprint §4.3; Capability Matrix §4.

- Save brand voice and approved claims to the existing `brand_profiles` path, or defer asking until first draft. Prefer persistence so a field the owner completed has a visible purpose.
- Preserve owner-confirmed facts, prohibited terms and language context; do not overwrite them with newly scraped text or default values on retry.
- Derive the starting onboarding step from authorized persisted state, not React memory. Reuse idempotent attachment/membership completion.
- Provide “wrong business” escape and an optional Instagram step. Do not make unnecessary fields mandatory or infer a new market from the interface locale.
- Preserve location-scoped work and prevent switching a job to another workspace through a tampered resume URL.

### P1.6 — Complete the review-reply vertical slice · REPAIR

**Sources:** C1–C4; F-12, F-21, F-22; Capability Matrix Workflow 1 and acceptance A1–A7.

- Reuse `review-response` / `review_reply`. Show the public reviews already sampled by the scan, identify the source/sample limitation, and let the owner select. Remove required manual re-entry of `reviews_without_response`.
- Use authorized server-side evidence references for the selection. Do not trust arbitrary review IDs/body text supplied as if it were collected evidence. Manual owner-provided text must be identified separately.
- Generate via existing action/run/output-version services. Missing inputs produce targeted `needs_input`; provider failure creates no pretend draft and consumes no delivery allowance.
- Treat scraped evidence as untrusted data with explicit prompt boundaries and input caps. Retain schema/prohibited-term validation and the no-tools authorization boundary. A delimiter alone is not a guarantee; test safe behavior and keep human approval.
- Restrict `agentKey` to the action template's allowed capability. A registered agent is not automatically valid for every action.
- Await actual server outcomes on the action page, Create page and assistant sheet. Distinguish network success from `state: failed` or `facts_needed`. Only report a saved version after a durable version ID exists.
- Reconcile the route execution deadline with provider timeouts/retries. A 60-second function cannot safely promise two 45-second attempts. Reserve finalization time, bound attempts by remaining time, and record a terminal failure/retry state instead of orphaned `running` work.
- Reap/transition expired runs safely on authorized return/load or the existing lifecycle service. Prevent a late worker from overwriting a terminal/retried run. Retrying must be explicit and idempotent.
- Reuse SQL approval and export functions unchanged in authority. Test edit-after-approval, history behavior, replayed export, concurrent repeated export, allowance denial and role/location denial.

### P1.7 — Remove launch-breaking commercial and delivery falsehoods · REPAIR + DECISION

**Sources:** B7; early honesty work from D2; F-16, F-19, F-24, F-25, F-30.

- Do not silently choose new pricing, quotas or seats. Pending the commercial decision, remove unsupported numerical/seat promises and keep checkout unavailable with honest copy. Current enforced entitlements are a regression baseline, not approval to market a new unlimited offer.
- Correct unsigned Stripe-webhook handling before provider initialization so the unsigned negative probe can return the intended 400. If billing is unconfigured, a would-be valid operation must fail closed with a controlled unavailable status, not pretend to process an event.
- Remove “email sent,” WhatsApp/LINE delivery and recovery-link promises where the application has no actual delivery/recovery path. Neon Auth mail and application transactional mail are separate capabilities.
- Hide the dead Fix Pack generation affordance or label it unavailable. Do not seed fake drafts to fill it.

### 4.2 Phase 1 acceptance gate

**Required local evidence:** all current offline gates, repaired security regressions, auth context/eligibility tests, consent/partial-scan tests, real-state UI tests, exact-version/export SQL tests and mobile 375×812 coverage through the first task. Record all failures and skips.

**Required hosted evidence before “pilot ready”:** authorized environment inventory; two usable named-business scans, one HK and one TW; real magic-link delivery/redemption with expiry/replay/logout checks; completed Google sign-in; positive claim and visible negative claim; review draft → edit → exact approval → export for both markets, counted exactly once; candidate `launch:check` with intended configuration.

The evidence must bind the same candidate commit to named immutable deployments/environments. Fixture success is not hosted success. Missing credentials/budget means **blocked/not run**, not completion.

### 4.3 Phase 1 commit groups

Use coherent groups: baseline/contracts → security/data integrity → scan reliability → identity/claim/context → review work loop → end-to-end verification and truthful copy. Put a regression test with its implementation, not in a distant “tests later” commit.

## 5. Phase 2 — Complete owner workspace

### 5.1 Outcome and scope

**Owner promise:** “Tell me what matters today, reuse what you already know about my business, and help me finish the job without learning AI terminology.”

This phase makes the product understandable and useful beyond the first review reply. It also completes a real assisted route for manual-entry/no-GBP businesses. Preserve the working Phase 1 path throughout.

### P2.1 — Simplify the daily experience without hiding the evidence · NEW UX + REPAIR

**Sources:** Blueprint §§1–3, 6–7; original B8; F-28, F-38.

Use the existing routes, not a new application shell:

| Screen | Owner decision | Default presentation | Primary action |
|---|---|---|---|
| Homepage | Is this relevant, and where do I start? | One owner problem, scanner entry, three outcome examples; returning-owner sign-in visible. | Free scan. |
| Report | What is worth fixing, and can I act? | Verdict and coverage, up to three priorities, claim/workspace entry, expandable evidence and limitations. | Claim, or open an authorized task. |
| Today / 今日 | What should I do now? | One recommended action, its reason and needed inputs; approval queue scoped to selected location. | Continue that action. |
| Tasks / 待辦 | What still needs attention? | Prioritized work, explicit state and outcome labels; completed/history available but secondary. | Open/continue a task. |
| Create / 製作 | What outcome do I need? | Review reply, FAQ and website basics first. Existing additional capabilities remain honestly labelled under secondary navigation. | Select the outcome, not an agent. |
| Action detail | What do I need to confirm next? | Source/evidence → only missing inputs → draft → exact-version review/approval → export. | One state-appropriate next action. |
| Results / 成效 | What changed, and how certain is it? | Approved/exported work, observed checks, coverage and comparability limitations. | View a valid comparison when available. |
| More / 更多 | Where are setup and supporting tools? | Existing brand, assets, integrations, team, notifications, billing and activity routes. | Relevant setting. |

Proposed screen budgets: one primary action per task state, one priority on Today, no more than three initial priorities on a report, and secondary technical explanations behind disclosure. These are design constraints to test, not findings from user research.

Do not hide errors, missing facts, sample limitations, ownership requirements, approval/version state or charges just to reduce text. Keep technical agent names, tokens and provider configuration out of ordinary owner tasks. Display task-duration estimates only as estimates, never measured or guaranteed completion times.

Carry allowlisted outcome intent through scan/sign-in/claim and select a compatible action afterward. For the third main generation card use website basics; a Google-profile completeness card remains a checklist. Reuse existing server context where possible; add storage only when current structures cannot safely preserve intent.

### P2.2 — Deliver the three complete AI workflows · REPAIR + PRODUCT INTEGRATION

**Sources:** Stage C; Capability Matrix §3, §§5–7; Blueprint §6.

| Workflow | Evidence and minimum confirmed input | Required usable output | Delivery boundary | Recheck |
|---|---|---|---|---|
| Review replies | Authorized sampled unanswered public reviews; stored brand voice/language. | Selected-review replies grounded in review and confirmed business facts. | Owner reviews exact version, approves and copies/exports; no automatic Google posting. | Comparable public-review response observations, subject to sample limits. |
| FAQ + JSON-LD | Website findings plus three owner-confirmed facts, reusing approved stored facts where suitable. | Useful FAQ copy and structurally valid matching JSON-LD; missing facts requested, not invented. | Approved export, with instructions for the owner's website editor. | Website schema detection is directly checkable; AI citation/ranking changes are separate, coverage-dependent observations. |
| Website basics | Existing website checks and owner-approved claim. | Clearly labelled suggested changes grounded in the checks; no fabricated hours, prices or service claims. | Approved export/checklist for implementation, not a claim that the website was updated. | Comparable `website.checks_passed` and item-level outcomes. |

All three must support saved history, edit-to-new-draft, approval, role denial, first export, repeated export and failure recovery. Reuse the existing template and SQL workflow model; these three workflows do **not** justify new parallel action/version/approval tables.

Extend typed output contracts only where inspection finds a concrete usability gap. Preserve backwards compatibility with existing immutable versions and history rendering. Keep `gbp-profile-fix` visibly a checklist and `photo_brief` a written shot list, not image generation.

### P2.3 — Make shared business context reliable · REPAIR

**Sources:** Capability Matrix §4; Blueprint §§4.3, 6.3.

- Reuse `workspaces`, `locations`, `brand_profiles`, authorized scan snapshots and existing assets/rights metadata.
- Show a compact “business details used” summary before generation. Ask only for missing task-specific facts; allow the owner to correct the stored profile through an explicit authorized save.
- Maintain distinctions between owner-confirmed facts, collected public evidence, model-generated suggestions and operator-verified ownership evidence.
- Preserve source/time limitations. Where source `observed_at` is absent, show unavailable or distinguish ingestion time from observation time; never replace unknown source time with “now” to make provenance look complete.
- Localize human-readable evidence limitations in all existing locales. Do not alter scoring meaning through translation.
- Scope home/approval counts and all selections to the chosen authorized location.
- Confirm private Blob access and rights-review flows with fixtures; hosted asset storage remains unverified until authorized testing succeeds.

### P2.4 — Operate assisted ownership assignment, not just a form · NEW + CONFIG + DECISION

**Sources:** B2-B, E2; F-03, F-06; Blueprint §4.2.

**Full scope:** owner request → acknowledgement → authorized operator queue → evidence-based decision → atomic assignment or visible refusal → owner returns to the correct workspace.

1. Reuse `workspace_access_requests`; inspect its actual schema before extending it. Suggested fields/statuses below are proposals, not assumed current columns.
2. Persist requester identity, authorized report/job reference where applicable, preferred contact, request status, minimum necessary verification evidence references, reviewer/decision timestamps and an auditable reason. Suggested states: submitted, needs-information, approved, rejected and withdrawn/expired where supported by an approved policy.
3. Provide an owner request/status surface. It must survive return visits and show exactly what happens next. Deduplicate retries and keep another person's request details private.
4. Build a genuinely authenticated, server-authorized minimal operations queue **in the current Neon application**. The audit's staff identity is disabled; do not flip it to true for everyone or reconnect the retired Supabase console. Define explicit operator roles/allowlisting, scoped permissions and audit entries. A secret URL is not authorization.
5. Require an approved verification procedure and a named operating role before enabling assignments. Public business knowledge, a submitted email, a screenshot, or claiming “I own this” alone is not proof. Record what independent control/authority was verified and by whom; do not invent a universal verification policy in code.
6. After approval, invoke the same checked attachment/membership services as verified ownership. Make assignment atomic, idempotent and conflict-aware. Refuse already-claimed/tampered jobs; disputed transfers require a separate authorized process, not reassignment by this form.
7. Send only genuinely implemented acknowledgements/notifications through the Phase 2 application-mail service. An in-app status is authoritative even when mail fails. Do not promise an SLA without an operating commitment.

**Entry files/routes:** existing onboarding, access-request insert and ownership repositories first. Any new operations routes or request API names must be marked NEW in the implementation report and protected before being exposed.

**Acceptance:** a legitimate no-GBP/manual-entry test business can request, receive a reviewed decision, enter its assigned workspace and perform a task. A rejected request remains non-member. A non-operator cannot review/assign; concurrent approvals cannot double-claim; the owner sees mail failure honestly without losing the persisted request.

### P2.5 — Repair supporting communication and audit paths · REPAIR + CONFIG

**Sources:** D2, D6; F-23, F-24, F-25, F-29.

- Introduce one application transactional-email abstraction using the repository's intended provider configuration after inspection. Keep Neon Auth's identity mail separate. Do not replace authentication to add invitation emails.
- Implement a real invitation flow: persisted invitation → queued/accepted-by-provider/delivered-or-failed status according to evidence → authorized acceptance → scoped membership. Never label an insert “email sent.” Use expiring, single-use/appropriate replay-protected tokens without account enumeration.
- Build report recovery only when the approved email channel, token scope and expiry policy are implemented. Preserve a single-job viewer grant; recovery must not create workspace ownership or widen a report grant. WhatsApp/LINE sending stays unavailable unless separately built and authorized.
- Reuse existing notification storage. Add an authorized mark-as-read path and make unread counts location/workspace-appropriate.
- Emit the missing `assistant.run` event through the host application's authorized audit service; do not give the assistant write access. Add Fix Pack review audit coverage wherever that legacy review path remains reachable.
- Retry email without duplicate user-visible sends or duplicate invitations. A provider-accepted message is not proof it arrived in the inbox; show status based on actual receipts where available.

### 5.2 Phase 2 acceptance gate

The three workflows must pass local and authorized hosted happy/negative paths, including missing facts and provider failures. The assisted request must be operated end-to-end by an authorized reviewer for a named no-GBP/manual-entry business. Validate an actual authorized invitation/acceptance, notification read/unread behavior and any claimed report recovery path.

Run mobile and desktop browser journeys through scan, unlock, sign-in, onboarding, home, tasks, Create, action detail, insights and More. Check keyboard navigation, focus, accessible names, loading/error states and absence of page overflow. Do not report an accessibility score unless the named tool actually ran.

The phase is not complete if the new owner sees an attractive workspace but cannot generate, save, approve and export all three promised outputs, or if the assisted route still requires undisclosed raw database edits.

## 6. Phase 3 — Recurring, measurable and commercial service

### 6.1 Outcome and scope

**Owner promise:** “The product helps me again next week, shows what changed without exaggerating, and charges according to a clear, correctly enforced contract.”

This phase turns a successful task workspace into a recurring service. Do not confuse a calendar row with a running scheduler, an exported file with an applied change, or a tier label with working billing.

### P3.1 — Design one durable job lifecycle and one scheduler · REPAIR + NEW

**Sources:** D1, C4; F-18; Verification R3, R7.

Start with the repository's current execution design. The audit found no active scheduler in this application; newer code may differ. Discover and integrate an existing executor before adding another.

**Recommended design:** persist job/checkpoint state in Neon; run bounded units within the current Vercel execution boundary; use one authenticated scheduler/dispatcher to wake eligible work. No external worker service or second scheduler is implied or authorized.

Required properties:

- Explicit persisted ownership of a lease, lease expiry, attempt count, next eligible run time and a fencing token or equivalent stale-worker guard.
- Atomic claim-and-run so concurrent requests/scheduler ticks cannot process the same work independently.
- Bounded per-provider and total execution budgets. A route must finalize/checkpoint before its execution ceiling, not rely on an unchecked fire-and-forget promise continuing afterward.
- Persisted checkpoints at safe collection boundaries. Resume does not recollect successful modules or pay twice unnecessarily; reconciling incomplete provider requests must be explicit.
- Retry only transient failures, with capped attempts and delayed retry. Terminal failures preserve useful evidence and an actionable state.
- Reaper behavior for expired scan and agent runs, including a killed worker and late completion. Do not conflate an action-generation lease with a scan lease or let either overwrite a newer attempt.
- Integrate the existing `scan_schedules` contract: due schedule → authorized/entitled job → completion/failure → next valid schedule state. A scheduled date alone must not be shown as guaranteed execution.
- Authenticate scheduler entry points, bound each batch and prevent public spending through a cron URL. Do not enable a cron or hosted queue without authorization.
- Revisit `tests/cron-registration.test.ts` and any “no cron” architectural assertion deliberately with a design decision record and replacement tests. Do not simply delete a failing architecture test.

Inspect existing state enums and SQL functions first. UI states such as “taking longer” may be derived; do not casually expand persisted enums if the existing model can express the lifecycle safely.

**Failure-injection tests:** two workers claim one job; worker dies after one module; stale worker returns after retry; repeated tick; budget exhausted; provider unavailable; entitlement revoked before dispatch; report viewer refreshes; schedule disabled while a job is running. In each case, record the intended transaction and owner-visible result.

### P3.2 — Make re-scan and proof of change reachable · REPAIR

**Sources:** D4; F-26, F-27; Capability Matrix §7 A8; Verification R11.

- Supply membership resolution through the existing `loadReport`/authorization path. Authorize **both** scans independently for the same permitted location. A single-job viewer cookie does not grant history access.
- Make re-scan reachable only under an approved entitlement/pilot policy. Do not secretly unlock all paid features just because Stripe is not yet configured.
- Preserve scoring-version, coverage and shared-module comparability gates. Distinguish time decay from regression as existing scoring does.
- Show no-access, no-pair, non-comparable and insufficient-evidence states separately from a successful comparison.
- Keep four different events separate: approved/exported; owner says applied; provider/check verifies applied; later observed metric change. “Exported” is not “published” or “implemented.”
- Preserve internal `Attributed`, `Observed` and `Unknown` semantics while explaining that timing/association is not proof of causation. No revenue, traffic or ranking guarantee is inferred from a markup change.
- Capture a real successful-pair browser artifact and negative authorization examples. Link the comparison to the source snapshots and the exact exported output version where an association is supported.

### P3.3 — Reconcile billing, allowance and seats atomically · REPAIR + CONFIG + DECISION

**Sources:** B7, D3; F-16, F-19, F-20; Verification R8.

**Commercial decision required:** exact tier names/prices/currencies, allowance per period, billing-period definition, seat policy, upgrade/downgrade behavior, trial/pilot behavior and over-limit UX. Keep existing code defaults for regression tests until a decision is approved; do not advertise those defaults as a newly approved offer.

- Establish one versioned commercial contract read by server policy and presentation, with explicit tests connecting that policy to SQL enforcement. Avoid a third hard-coded pricing copy table.
- Preserve database-side exact-version, first-export counting. Do not move enforcement into the UI or exchange the product's delivery pricing for token pricing.
- Update the active usage allowance when tier policy changes, in a transaction that is safe against simultaneous exports and duplicate billing events. Test a workspace that used all lite deliveries before upgrading, then exports successfully under its new entitlement.
- Define downgrade and period rollover behavior explicitly; never delete historical usage or reset it accidentally to make an upgrade work.
- Enforce seat limits server-side only if the approved plan contains them. Cover pending invitations, accepted members and concurrent invites; prevent removal of the last owner while managing seats.
- Complete authorized Stripe test-mode checkout/portal/webhook and entitlement transitions. Authenticate signatures, deduplicate by event ID, and handle retries/out-of-order events without regressing to an obsolete tier.
- Keep unconfigured billing unavailable, not falsely successful. Test the unsigned negative boundary and duplicate valid events separately.
- Verify HK/TW pricing, market mapping and display independently from locale. Do not invent tax or currency rules; use the approved commercial/provider configuration.

### P3.4 — Restore reliable events and measure actual value · REPAIR + NEW

**Sources:** D5, D7; F-34.

Repair the event-write timeout/reliability path without making a scan wait indefinitely for analytics. Choose a bounded reliable mechanism consistent with current storage, such as a durable outbox/retry, or a measured revised write budget where sufficient. Test cold connection behavior and duplicate delivery. Do not silently count lost events as zero failures.

Define event identities, timestamps, deduplication and denominators before dashboards. Minimum funnel:

- Valid scan started and usable scan completed, with full/partial separated.
- Sign-in/claim started and completed, with supported/assisted paths separated.
- First saved real draft, first approved export, repeat weekly approved export.
- Task/provider failure and missing-input state.
- Paid conversion only after verified billing transition.

**Primary value metric:** weekly businesses completing at least one useful approved delivery. Use persisted exact approved-version export records; do not sum AI messages, generated drafts or repeat exports. Define business identity explicitly: for the initial location-centric product, count distinct eligible `location_id` associated with a qualifying delivery; report distinct workspaces as a separate account metric. Never silently swap those denominators when multi-location use grows.

Define a weekly reporting timezone and week boundary. Exclude demo, fixture and internal test work using explicit data classification; distinguish real pilot activity from ordinary paid use rather than silently erasing it.

Guardrails: draft acceptance, failed-run rate, actual/estimated LLM cost per qualifying delivery (label estimates), provider spend, support contacts per active workspace and week-four retention. Set numerical growth targets **after** observing a baseline. Time-to-first-useful-output measures actual event timestamps; it is not a promised time saving.

### P3.5 — Add operating controls, not just reporting · NEW + REPAIR

- Workspace/provider spend budgets and a global safe limit, enforced before dispatch and bounded across retries. Delivery allowance and anti-abuse/compute budget are different controls; explain them separately.
- Integration-health and actionable failure notices visible to operators; useful, localized owner next steps without secrets or stack traces.
- Authorized dead-letter/retry controls, correlation IDs and a support view that respects tenant/location access.
- Application-email outbox/reconciliation where needed for reliable recurring notifications. Do not send weekly reminders unless recipients/channel and opt-out behavior are configured and authorized.
- An incident/runbook path for disabled providers, expired OAuth, paused scheduling, failed billing synchronization and a rollback that preserves approval/billing history.

### 6.2 Phase 3 acceptance gate

Demonstrate two work cycles against authorized hosted infrastructure: original scan and useful approved export; separately recorded application evidence; later authorized comparable re-scan; correctly scoped measurement. Prove the successful comparison in a browser and verify the negative no-access path.

Execute authorized Stripe test-mode transitions, duplicate-event and upgrade-after-limit scenarios. Exercise a scheduled/resumed scan through its actual configured execution path, not an isolated function mock. Record provider/mail budgets and observed cost/usage where available.

No paid launch until the approved public contract, server policy, SQL allowance and actual payment behavior agree. No “automatic monthly recheck” claim until the scheduler actually executes against the candidate environment.

## 7. Phase 4 — Reusable growth platform

### 7.1 Outcome and scope

**Owner promise:** “The business facts and approvals I already supplied make the next useful job easier; I do not have to start again or manage a collection of separate AI tools.”

This phase is expansion, not remediation. It begins after the core product is usable and measured. Core scope is reusable context, promotion copy, coherent work packs and contextual assistance. Direct publishing and provisional previews are **conditional sub-releases** with separate gates.

### P4.1 — Add confirmed offers and a promotion-copy workflow · NEW

**Sources:** E1; Capability Matrix §§3–4.

- Add an `offers` model only after inspecting whether newer code already has one. Store workspace/location scope, owner-confirmed title/details, price/currency where applicable, validity period, terms, approved claims, prohibited wording, source/confirmation status and optional rights-cleared asset references.
- Keep offer facts distinct from generated variants. Do not infer price, expiry, stock, ingredients, allergens or claims from an image or an incomplete description.
- Reuse existing `social-post`, `gbp-post` or other appropriate copy capabilities through the authorized action/run/version model. Capability labels alone do not prove a publishing API exists.
- Generate channel-specific **text drafts**, using one confirmed offer and brand context. No built-in image generation is assumed; offer owner-uploaded rights-cleared assets or an explicitly labelled human photo brief.
- Decide and show the delivery unit before generation/export: several separately approved versions may create several qualifying deliveries under existing rules. Do not quietly count a whole campaign as one delivery or charge multiple deliveries for repeated export of one version.
- Test expired/unconfirmed offers, wrong-market currency, prohibited claims, location access, changed offer facts and a reused historical approved output. A changed source offer never mutates an immutable prior output.

### P4.2 — Create work packs on the existing approval ledger · NEW + REPAIR

**Sources:** E3; F-30 and remaining F-29.

The audit's Fix Pack surface is disconnected from a generator. Do not create a second competing output/approval/billing system simply to fill that card.

- Define a pack as a grouping of ordinary evidence-linked actions and their existing immutable versions. Inspect whether an existing grouping field suffices; use new association tables only when necessary.
- Add a pack generator that creates permitted tasks through existing services. Record idempotency so a retry does not duplicate every task in the pack.
- Adapt/retire the disconnected legacy Fix Pack presentation with an explicit migration/compatibility decision. Preserve reachable historical records and review audit events; do not pretend legacy `agent_runs` rows were already populated by the new model.
- Keep approval and export per exact version. A “review pack” view may simplify navigation but must not approve unseen mutable content or collapse location permissions.
- Show partial completion and per-item failure. Retrying one item must not regenerate or recount successful items.

**Example owner pack:** reply to selected reviews + export missing FAQ content + export website basics. Its value is a coherent set of work, not “three more agents.”

### P4.3 — Make the assistant contextual, without adding authority · NEW

**Sources:** Capability Matrix §2 supporting mechanisms; existing read-only assistant boundary.

- Derive suggested questions from authorized current findings, selected action, missing inputs, approval queue and integration state instead of fixed per-surface text alone.
- Answer “Why this task?”, “What detail do you need?”, “What changed?” and “Where do I continue?” using authorized evidence and persisted versions.
- Suggest the correct existing application action rather than requiring owner prompt-writing. Preserve the allowlisted intent/response contract; do not add arbitrary tools, SQL execution or cross-workspace retrieval.
- Where a suggested draft is saved, route the owner's explicit action through the existing authorized mutation path. The assistant still cannot approve, export, publish, change billing or claim a business independently.
- Audit assistant interactions through the host service with appropriate minimized metadata, without copying secrets or unnecessary customer content into logs.

### P4.4 — Standardize a reusable workflow contract · NEW

Use one typed internal definition for capability key, owner outcome, availability evidence, permitted template/agent mapping, required confirmed facts, evidence resolver, output validation, review/delivery unit, expected measurement and failure handling.

Keep actual authorization, SQL approval/export and provider permission checks centralized. Registry metadata must not grant permissions. Add contract tests so a new workflow cannot claim unsupported publishing, bypass required inputs or choose any arbitrary agent.

Create a fixed regression corpus of approved test cases for the supported workflows: malicious review instructions, missing facts, locale/market mismatch, fabricated business claims, uncertain evidence, provider failure and invalid output. Separate deterministic local tests from authorized real-model evaluations; report the latter's exact model/config/date and results. Do not claim a mocked evaluation demonstrates a model will never fail.

### P4.5 — Conditional acquisition preview · NEW, OFF BY DEFAULT

**Source:** Blueprint §5 proposed `/{locale}/start/[jobId]`.

Implement only as a separately enabled experiment after the main join path works:

- Require evidence of a completed scan via an authorized, purpose-limited server-issued capability/grant; a guessed job ID is not enough.
- Use **only owner-supplied text**, no protected scan evidence and no account access. Checking eligibility does not authorize retrieving hidden report content.
- Produce one unsaved preview, labelled “未認領草稿 · 未儲存,” with no version number, approval or export control.
- Do not create `actions`, `action_runs` or `output_versions`, or touch approved-delivery usage. Minimal abuse/cost events may exist separately without protected evidence.
- Enforce per-job, per-identity/session where available, per-IP and global generation budgets atomically, fail closed and make repeat requests deterministic/idempotent where appropriate.
- Preserving/editing/approving/exporting requires verified ownership and an explicit transfer into the normal workflow, not silently migrating an unverified preview as an approved version.

The purpose is to test whether a safe taste of output improves legitimate activation. It is not a bypass for the ownership model.

### P4.6 — Conditional single publishing connector · NEW, SEPARATE AUTHORIZATION

**Source:** E4; Blueprint §2.3 keeps publishing restricted in v1.

Do not activate or claim direct publishing as part of general phase approval. A later explicit decision must name **one** provider, operation, account scope, test target, budget and revocation/retry policy.

A connector sub-release must have: least-privilege authorization; encrypted token storage; server-verified account/location binding; explicit user confirmation for the exact approved immutable version and destination; idempotent dispatch; provider result/receipt; honest uncertain/failure reconciliation; audited revocation and role checks; no duplicate posts when a response is lost.

Exported, user-marked-applied and provider-verified-published remain separate states. Publishing cannot overwrite the existing export accounting semantics. Any new delivery-counting rule requires a commercial and SQL-contract decision, not an application-side increment.

Do not add image generation, an omnichannel sender or an agent marketplace as incidental scope. These need their own validated owner demand, contracts and provider verification.

### 7.2 Phase 4 acceptance gate

Core release: a confirmed offer produces reusable, correctly scoped promotion drafts; pack generation is idempotent; pack review preserves exact-version approval and per-version delivery counting; the assistant provides authorized context without mutation authority; existing three workflows still pass.

The preview and publishing sub-releases each need their own privacy/security/hosted acceptance record. A disabled adapter, label, mock receipt or empty button is not a delivered connector. Phase 4 core may release without them, accurately labelled and with no advertised functionality that remains gated.

## 8. Shared engineering contract

### 8.1 Change existing seams before introducing new architecture

The following domains already exist in the audited repository. Verify paths against current HEAD before editing.

| Domain | Existing source anchors | Expected approach |
|---|---|---|
| Scan and report | `lib/scan/*`, `lib/report/*`, `lib/website/checks.ts`, `components/scanning-page.tsx`, `components/report-view.tsx`, scan-engine package | Retain collectors, scoring and evidence passport. Repair safety, lifecycle, authorization and rendering at their real seams. |
| Identity and claim | `lib/identity/*`, `app/auth/callback/route.ts`, Google sign-in/claim routes, sign-in/onboarding components | Preserve current diagnostic/parser improvements. Prove identity separately from business ownership. |
| Workflows | `lib/workspace/{templates,actions,runs,entitlement}.ts`, `lib/agents/*`, `lib/llm.ts`, action/run APIs | Reuse actions, template mapping, run persistence and typed output contracts. |
| Versions and delivery | Current Neon SQL functions, including `approve_output_version` and `export_output_version` | SQL remains authoritative for exact approval, permission and atomic delivery usage. |
| Assistant | `components/pocket-assistant/*`, `lib/repositories/artifacts.ts`, existing closed intents | Keep read-only context; host routes own explicit authorized mutations. |
| Operations and communication | Existing access requests, notifications, membership and audit services | Extend current Neon records; add a real protected operator boundary and sender where explicitly scoped. |
| Recurrence and measurement | Existing leases/schedules, `recordMeasurements`, report comparison and analytics paths | One executor, scoped comparison, explicit outcome definitions and reliable events. |

### 8.2 Migration rules

- Discover the latest migration number before creating a migration. Never edit previously applied/immutable migrations or quietly reorder them.
- Include fresh-database, migration-from-prior-state and replay/catalog checks where the repository supports them.
- Review functions, indexes, constraints, triggers and runtime-role grants together. New tables are not automatically authorized just because the API checks membership.
- Rehearse on the repository's owned test database and then an explicitly approved isolated hosted target. Do not point test suites at production because Docker or credentials are unavailable.
- Prefer additive compatibility. Preserve existing output, audit, billing and consent records. Backfills need bounded batches, idempotency and a verified scope.
- A rollback plan is normally “old UI/feature disabled, data retained” or a forward fix. Do not assume dropping new tables/functions is safe once live work has used them.
- Respect the existing privileged SQL function security model, including role, parameter, search-path and authorization checks as applicable. Do not introduce a powerful bypass for operators or agents.

### 8.3 Honest state model

Use actual server/persisted states and typed response contracts. Do not infer success from an HTTP 201 alone. Separate:

**job accepted → execution running → result saved → exact version approved → export succeeded → user says applied → independently verified application/change.**

Some of these already have database states; some are owner-facing derived labels. Inspect before adding enums. An empty result is not a successful draft. A queued mail is not a delivered mail. A scheduled date is not an executed scan. A registered agent is not a complete workflow. A provider connection is not a publishing feature.

### 8.4 Inputs and evidence

Prompt instructions are not a security boundary for access. Server authorization occurs before gathering context and after any client request. Treat reviews, scraped pages, uploads and owner free text as untrusted data. Bound size and allowed types; use persisted references for evidence. Missing facts produce a targeted question instead of invented content.

Do not add synthetic reports, testimonials, reviews, improvements, revenue claims or fake output receipts to improve a production screen. Keep fixtures and demos visibly separate from real owner data and analytics.

### 8.5 Cost and execution boundaries

Preflight provider configuration, identity/entitlement, rate limits and budgets before spending. Preserve approved-delivery semantics while enforcing separate abuse/compute protections. Estimate costs only when labelled as estimates; record actual provider usage when available.

On exhaustion or timeout, save a truthful bounded state and a recovery action. Never silently loop, create a new paid scan on every refresh, or launch detached work that has no durable execution guarantee.

## 9. Verification and release gates

### 9.1 Historical evidence is not this release's result

The audit reported passing typecheck, lint, unit tests, retired-transport and secret-boundary checks; Docker-dependent gates were blocked; multiple hosted journeys were not run. Those results belong to the audit's exact commit/environment. They must not be copied as candidate results.

Use four statuses exactly: **passed**, **failed**, **blocked**, **not run**. A command pass means it actually executed successfully on the named candidate. Store read-only manual observations separately; do not rename them suite passes.

### 9.2 Discover and execute the current gate inventory

The following are the named offline commands in the supplied verification table. Confirm current scripts/CI, dependencies and fixture ownership before executing; reconcile its separate “ten gates” wording.

| Gate from supplied audit | Candidate evidence required |
|---|---|
| `corepack pnpm typecheck` | Exit, commit, runtime and exact package scope. |
| `corepack pnpm lint` | Exit, errors, warning count and new-versus-existing warnings. |
| `corepack pnpm test` | Exact files/tests, failures/skips; record worker settings. |
| `corepack pnpm test:no-supabase` | Retired-transport boundary retained, approved pinned exception only. |
| `corepack pnpm test:secret-boundary` | Artifacts inspected and embedded build result; do not leak sentinel/real credentials. |
| `corepack pnpm db:verify` | Owned fixture, migration/catalog/replay results. |
| `corepack pnpm test:integration` | Owned fixture and required explicit integration enablement; exact files/tests/skips. |
| `corepack pnpm e2e` | Browser projects, cases and environment. |
| `corepack pnpm e2e:acceptance` | Full acceptance cases and exact candidate. |

The audit's R1 example enables `NEON_INTEGRATION=1` for integration tests and uses an owned `postgres:16` fixture. Follow the **current repository's documented harness**, not an ad hoc substitute. If its image cannot be pulled, record the blocker and use an appropriate authorized runner; do not test against a random PostgreSQL instance or production.

Any separate required build/runtime/security gate discovered in CI must be added by its real command. Do not remove failing guards, replace real integration suites with mocks, or report setup failure plus “no tests found” as a passing zero-test run.

### 9.3 New regression families

Every phase must maintain preceding tests. At minimum cover:

| Family | Critical cases |
|---|---|
| Public fetch safety | Unsafe scheme/address, IPv4/IPv6/private redirects, DNS behavior, oversized/non-HTML response, timeout; request not dispatched unsafely. |
| Workspace integrity | Last-owner API refusal and DB guard, concurrent removals, scoped membership mutation, preserved audit/billing records. |
| Auth and ownership | Completed sign-in versus completed claim; invalid state/callback, eligible WhatsApp/LINE unlock, expired/reused/cross-device links, wrong manager, already-claimed business, slug `_`/`-`, denied report access. |
| Scan honesty | Correct percentage, per-module states, partial/null score, persisted consent, deadline/stale lease, refresh/resume deduplication. |
| Output workflow | Targeted missing facts, provider failure on all entry surfaces, compatible agent, input boundaries, exact immutable version approval, edited draft denial, idempotent export and allowance. |
| Assisted operations | Request privacy, reviewer permission, verified assignment, rejection/no membership, concurrent conflict, idempotent notifications. |
| Recurrence | Single lease and scheduler, checkpoint/retry/fencing, budgets, repeated ticks, disabled schedules and killed workers. |
| Commercial | Public/server/SQL contract agreement, current-period upgrade, rollover/downgrade policy, seat/invite concurrency if applicable, signed/duplicate/out-of-order billing events. |
| Measurement | Both snapshots authorized, incompatible versions, insufficient evidence, no accessible pair, successful pair, timing without causal claims, demo/repeat-export exclusion. |
| Mobile/accessibility | 375×812 and desktop, visible sign-in, focus and keyboard operation, localized labels, touch targets, loading/empty/error states across the whole loop. |

### 9.4 Hosted test matrix mapped to the supplied R1–R11

| Reference | Earliest phase | Required handling |
|---|---|---|
| R1 Owned Docker gates | 1; rerun each phase | Resolve runner limitation or report blocked. Never substitute another unapproved database. |
| R2 Environment inventory | 1; refresh per release | Names/presence and target only; validate required fail-closed configuration without exposing values. |
| R3 Named HK/TW live scans | 1 and 3 | Explicit provider budget and named businesses; module states, terminal result, coverage and elapsed time. |
| R4 Real hosted magic link | 1 | Authorized recipient, delivery/redemption, expiry/replay/logout behavior; fixture mail is insufficient. |
| R5 Completed Google sign-in | 1 | Complete consent, resolve failure stage/root cause and record correlation ID safely. |
| R6 Ownership claim | 1; assisted expansion in 2 | Positive verified business and negative non-manager with visible explanation. |
| R7 Hosted work loop | 1 for reviews; 2 for three workflows; 3 for upgrades | Real generation, saved exact version, approval, repeat export counted once, allowance behavior. |
| R8 Stripe test mode | 3; unsigned boundary repaired in 1 | Explicit test-event permission, verified transitions and duplicate handling. |
| R9 Security regressions | 1; rerun each phase | Add and execute missing security/coverage/prompt tests. |
| R10 Mobile | 1; expand in 2 and later | Dedicated mobile project, not only existing report assertions. |
| R11 Successful comparison | 3 | Authorized successful pair in a browser, not just a no-pair fixture. |

Hosted Blob, assisted assignment, application mail, scheduler, promotions and conditional connector tests are **additional proposed acceptance**, not claims already covered by the original R list.

### 9.5 Evidence package and release decision

For every candidate, record in the phase report and actual repository `LAUNCH-REPORT.md`:

- Commit/tree state, environment, deployment ID, immutable origin, relevant alias and runtime.
- Exact commands, exit codes, counts, failures/skips and artifact paths.
- Test identities/businesses as non-sensitive references; authorization and bounded provider/mail/billing scope.
- Job, run, output-version and delivery IDs needed to trace real outcomes; redact tokens and personal details.
- Usage before/after duplicate export and commercial transitions; observed provider receipts only when real.
- Mobile/desktop screenshots or traces with private information redacted.
- What is implemented, what passed locally, what was observed hosted, what remains blocked/not run, rollout flags and data-preserving rollback.

A release can be **implemented but hosted-unverified**. Do not compress that into “ready.” Production rollout remains a separately authorized action. A read-only page load is not a completed owner acceptance journey.

## 10. How Claude Code should execute

### 10.1 Working sequence for each phase

1. Read this plan, the matching phase prompt, the original sources and current repository instructions. Inspect the existing implementation before adding replacements.
2. Establish a cleanly understood working tree and branch. Preserve unrelated edits and identify the current base; do not reset or discard work.
3. Reproduce the relevant defects with focused tests/controlled observations. Skip duplicate repairs only with code/test evidence and record them as already fixed.
4. Implement the phase's full vertical outcome through existing services, including data/permissions, real UI states, tests and documentation.
5. Run focused tests during changes and the complete applicable gate inventory on the final phase candidate. Include a diff/security/migration review.
6. Execute only authorized hosted acceptance; record unavailable credentials/budgets as blockers. Continue safe independent code/tests behind disabled features rather than manufacturing a bypass.
7. Produce the phase evidence/report and update the traceability register. Do not declare success because the development server renders or a button exists.

### 10.2 Parallelism and change boundaries

Where Claude Code supports parallel working sessions, isolate independent areas: fetch/rate-limit tests, identity flow, interface composition and verification. Keep schema/SQL authority, shared types, package lock and auth contract under one integration owner. Do not run concurrent migrations or have multiple workers edit the same foundational service unsupervised.

Use multiple reviewable commits inside one phase. A feature cannot be marked complete in the phase tracker before its tests and truthful interface states exist. No “tests later” release and no opportunistic dependency upgrades or authentication replacements.

### 10.3 Continuation rule

Do not stop after a fresh audit, a TODO document, a homepage redesign, the claim href, an empty operations queue or an agent registry. The requested unit of work is the **whole selected phase**.

When an external dependency blocks part of a phase, finish safe local work, add a precise blocker and retain the default-off boundary. Independent later-phase code may proceed when requested, but unfinished gates cannot be relabelled passed and a dependent feature cannot be exposed prematurely.

### 10.4 Required per-phase deliverables

Use the repository's existing documentation conventions. Suggested path: `docs/implementation/owner-platform-v1/`.

- `PHASE-N-REPORT.md`: objective, current baseline, changes, findings/backlog IDs, evidence and unresolved blockers.
- `PHASE-N-TEST-RESULTS.md`: commands, exact results, environment/commit and artifacts.
- Updated traceability register and decision records, including any source/spec conflict resolved.
- Additive migration and rollback notes when data/functions/permissions change.
- Updated product capability labels and copy that match the implemented/verified state.
- Reviewable diff/commits or PRs created only within the session's permission; no automatic merge/deploy.

Use [`RELEASE-EVIDENCE-TEMPLATE.md`](RELEASE-EVIDENCE-TEMPLATE.md) and [`BUSINESS-AND-HOSTED-DECISIONS.md`](BUSINESS-AND-HOSTED-DECISIONS.md). All new evidence cells begin **not run** or **blocked** where a real blocker is known.

## 11. Definition of the larger development effort

The four phases are complete only when the owner can:

**Join legitimately → understand one next action → produce grounded work → approve the exact version → export with correct usage → return → see an authorized, comparable observation of change → reuse business context for the next task.**

The platform must also be operable: failures recover honestly, providers cannot spend without limits, tenant/location scope holds, billing matches the product promise, operators have controlled tools, and every readiness statement points to actual evidence.

Do not measure completion by pages redesigned, agents registered, tasks checked off or total lines of code. Measure it by the protected owner journeys delivered and verified.
