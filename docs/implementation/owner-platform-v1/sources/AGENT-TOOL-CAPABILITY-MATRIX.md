# AGENT-TOOL-CAPABILITY-MATRIX — real versus proposed

**Companion to `AUDIT-REPORT.md`** · Baseline: `main @ 8f4c5b4` · 2026-09-09

Every row is grounded in implementation. A button, a badge, a descriptive agent name or a line of marketing copy is **not** implementation evidence, and nothing is marked Real on that basis.

---

## 1. Reading the labels

The repository has its own capability vocabulary (`lib/capabilities.ts`) with values `Live | Beta | Requires connection | Planned | Demo`. That label answers a different question from "does this work end to end for an owner", so this matrix reports both:

- **Product label** — what `lib/capabilities.ts` says and what the owner is shown.
- **Real status** — what I could verify: `Real` (implemented and exercised by tests), `Real-unverified` (implemented, no hosted proof), `Partial` (implemented but a dependency is missing or off), `Proposed` (does not exist).

A crucial general finding: **`Live` and `Beta` are editorial labels — the runtime path is identical.** All eleven agents are registered in `AGENTS` (`lib/agents/index.ts:21-33`), each with a real prompt implementation, and all are invoked through the same `llmComplete` call with the same zod validation.

---

## 2. Real capability matrix — agents and templates

Sources: `lib/workspace/templates.ts:68-251` (templates), `lib/capabilities.ts:8-24` (labels), `lib/agents/index.ts:21-33` (registry), `lib/workspace/measurements.ts:25-38` (metric per template), `lib/workspace/actions.ts:168-217` (derivation).

| Template key | Agent | Label | Real status | Derived from a scan? | Required owner inputs | Est. min | Delivery | Measured by |
|---|---|---|---|---|---|---|---|---|
| `review-response` | `review_reply` | Live | **Real** | Yes | `brand_voice`, `reviews_without_response`, `language` | 10 | export/copy | `gbp.response_rate_pct` |
| `visibility-content` (FAQ + JSON-LD) | `faq_jsonld` | Live | **Real** | Yes — added when the `faq_schema` website check fails | `owner_fact_1..3` | 15 | export | `aeo.ai_citation_count` |
| `website-basics` | `website_basics` | Live | **Real** | Yes | `approved_claim` | 10 | export | `website.checks_passed` |
| `review-request` | `review_request` | Live | **Real** | Yes | `brand_voice`, `channel` | 8 | export/copy | `gbp.reviews_count` |
| `ig-bio` | `ig_bio` | Live | **Real** | Yes | `brand_voice`, `approved_claim`, `cta_link` | 5 | export/copy | `ig.followers` |
| `social-post` | `social_post` | Live | **Real** | Yes | `asset_or_text_only`, `alt_text` | 8 | export/copy | `ig.days_since_last_post` |
| `gbp-post` | `gbp_post` | Beta | **Real** | Yes | `brand_voice` | 8 | export/copy | `gbp.days_since_last_review` |
| `menu-translation` | `menu_translation` | Beta | **Real** | **No** — never derived; reachable only via Create | `menu_items` | 20 | export | `website.checks_passed` |
| `gbp-photo-pack` | `photo_brief` | Beta | **Real** — a written brief, **not an image** | Yes | — | 15 | export | `gbp.photos_count` |
| `local-seo-brief` | `local_seo_brief` | Beta | **Real** | Yes | — | 20 | export | `aeo.best_organic_rank` |
| *(no template)* | `validation_plan` | Live | **Real but unreachable** — no template maps to it; only an explicit `agentKey` override reaches it | n/a | — | — | — | — |
| `gbp-profile-fix` | *(none)* | Live | **Real** — checklist, no generation | Yes | `opening_hours`, `categories` | 10 | checklist | `gbp.hours_complete` |
| `ig-highlights` | *(none)* | Live | **Real** — checklist | Yes | — | 10 | checklist | `ig.highlights_count` |
| `google-reconnect` | *(none)* | Requires connection | **Real** — system action | Yes — when a Google connection is missing/expired/revoked | `google_account_owner` | 5 | system | — |

### Integration and publishing capabilities

| Capability | Label | Real status | What it actually does |
|---|---|---|---|
| `google_business_connect` | Live | **Real-unverified** | Full OAuth: signed state, `business.manage` scope required, refresh token required, AES-256-GCM token storage, audit event. **But beyond the claim's place-ID check the connection is never used** — review drafts read scraped public reviews from `audit_jobs.raw_data`, not the GBP API. No hosted round trip verified |
| `google_business_publish` | Requires connection | **Proposed** | Permanently disabled button. No implementation |
| `instagram_publish` | Planned | **Proposed** | Label only. The stored Instagram handle is used solely as the next scan's input |
| `chatgpt_perplexity_probes` | Planned | **Proposed** | Correctly reported as `unsupported` by the scorer rather than scored as zero |
| Image generation | *(no label)* | **Does not exist** | No image generation of any kind. `photo_brief` writes a shot list for a human |
| Email / WhatsApp / LINE sending | *(no label)* | **Does not exist** | No sender in this repository. Unlock copy promises secure delivery to a chosen channel (**F-25**); team invites claim an email is sent (**F-24**). Both are false today |

### Supporting mechanisms

| Mechanism | Real status | Evidence |
|---|---|---|
| Approval of an exact immutable version | **Real** | `approve_output_version` (`0004:6-50`): idempotent, refuses closed versions, supersedes other approved versions |
| One counted delivery on first export | **Real** | `export_output_version` (`0004:452-488`): allowance checked in-transaction; repeats and copies `counted=false` |
| Allowance enforcement | **Real** | lite → 3, paid → unlimited (`lib/workspace/entitlement.ts:55-57`). **Contradicts public pricing copy — F-16** |
| Audit ledger | **Real, with two gaps** | 25 event types; `assistant.run` declared but never emitted, Fix Pack review writes none (**F-29**) |
| Coverage-aware scoring | **Real** | `packages/scoring/src/index.ts:25-43` |
| Comparability gate | **Real** | `packages/scoring/src/diff.ts:145-160` |
| Measurement after rescan | **Real, unreachable in practice** | `recordMeasurements` is correct, but rescan is paid-tier only and billing is unconfigured in production (**F-19**); no scheduler exists (**F-18**) |
| Fix Pack drafts | **Partial → effectively dead** | List and approve/reject exist; **no generator writes `agent_runs` in this repo**, so the card is permanently empty (**F-30**) |
| Assistant live mode | **Real** | Read-only repository; 13 closed intents; template answers need no LLM; cannot mutate state |
| Assistant suggested questions | **Static** | Fixed per-surface tables (`assistant-sheet.tsx:41-68`) — not derived from the current business or task |

---

## 3. The three workflows for the first improvement release

Selection criteria, in order: the agent exists and is Live; the action is **derived automatically from diagnosed evidence** (so the owner chooses a job rather than inventing one); the output is exportable under the existing approval contract; and the result is **measurable by a later comparable scan**. Three templates satisfy all four.

### Workflow 1 — Reply to unanswered reviews

The strongest candidate: real evidence, real agent, real metric, and an owner problem that needs no explanation.

| Field | Value |
|---|---|
| Owner problem | "There are reviews I never answered and I don't know what to say." |
| Entry point | Derived action on the workspace home; also outcome card 卡 1 → scan → claim |
| Required inputs | `brand_voice`, `reviews_without_response`, `language` |
| Confirmed business facts | Brand voice, approved claims, prohibited terms from `brand_profiles`, injected into every prompt |
| Evidence source | **Public reviews collected by the scan**, filtered to those with no owner response, most recent first, each truncated to 500 chars (`lib/workspace/runs.ts:110-120`). Not the GBP API |
| Capability / agent | `review_reply` (Live) |
| Route / handler | `POST /api/actions/[actionId]/run` → `lib/workspace/runs.ts` → `llmComplete` |
| Output artifact | `output_versions` row, `author_type='agent'`, immutable, version-numbered |
| Saved state | `action_runs` (tokens, cost) + `output_versions` + `audit_events` |
| Human approval | Required, on one exact version; editing creates a new draft |
| Delivery | Export or copy only. **Publishing is not connected** — the owner pastes into Google |
| Measurement | `gbp.response_rate_pct` on the next comparable scan; `Attributed` only if the export preceded that scan |
| Availability | **Blocked by joining only.** Everything else exists |
| Missing dependencies | LLM gateway key (unverified in production); the honesty fix below |
| Internal cost | 1 LLM call, ≤1,200 output tokens, temperature 0.4, 45 s timeout, at most 2 attempts |
| Allowance impact | 1 delivery on first export of an approved version; generation and revisions cost nothing |

**Required honesty fix.** The required input `reviews_without_response` asks the owner to paste reviews the system has already collected and is already injecting into the prompt. Remove the field, show the sampled reviews, and let the owner pick — this turns a confusing double-entry step into the moment the product proves it did the work.

### Workflow 2 — Answer the questions customers actually ask (FAQ + JSON-LD)

The only workflow that closes the full loop from diagnosis to provable change, because the same website check that creates it later confirms it.

| Field | Value |
|---|---|
| Owner problem | "Google and AI answers don't quote my business." |
| Entry point | **Derived automatically when the `faq_schema` website check fails** (`lib/workspace/actions.ts:180-197`); also outcome card 卡 2 |
| Required inputs | `owner_fact_1..3` — three facts the owner confirms |
| Evidence source | `scan_snapshots.website_checks` plus AEO module results |
| Capability / agent | `faq_jsonld` (Live) |
| Output artifact | FAQ copy **and** paste-ready JSON-LD, as an immutable version |
| Delivery | Export (file); the owner pastes it into their site |
| Measurement | `aeo.ai_citation_count`; the website check itself flips on the next scan — an unusually clean before/after |
| Availability | Blocked by joining only |
| Guardrail note | `needs_input` blocks generation until the three facts are supplied — exactly the "missing facts produce a targeted request, not invented content" rule. Preserve it |

### Workflow 3 — Fix the website basics behind the diagnosis

| Field | Value |
|---|---|
| Owner problem | "My site doesn't say the things people search for." |
| Entry point | Derived from website findings; outcome card 卡 3 |
| Required inputs | `approved_claim` |
| Evidence source | `website_checks` (meta description length, `h1` count, FAQ schema) plus findings |
| Capability / agent | `website_basics` (Live) |
| Output artifact | Immutable version; export |
| Measurement | `website.checks_passed` — directly re-measurable |
| Availability | Blocked by joining only |

### Deliberately **not** in the first three, and why

- **Weekly promotion with a visual.** `social-post` (Live) can write the copy, but **no image generation capability exists**. `photo_brief` produces a shot list for a human. Ship promotion copy if you wish, but show no image affordance — the product direction is explicit that a visual belongs here only where the capability actually exists.
- **Menu translation.** The agent is real, but it is `Beta`, is never derived from a scan, and carries the highest fabrication risk (ingredients, allergens, prices). Guardrail 14 makes it the workflow most likely to embarrass the product. If shipped, restrict it to owner-confirmed source items with no inference and a visible "nothing was added or interpreted" statement.
- **Rescan and prove the change.** The measurement code is correct and worth keeping. But rescan is paid-tier only and billing returns "not configured" in production (**F-19**), and no scheduler exists in this app (**F-18**). It becomes workflow 4 the moment those two are resolved.
- **WhatsApp / customer-response copy.** `review-request` is Live and can draft it. Ship only with copy that never implies sending is connected — there is no sender.

---

## 4. Shared business-context model

What the owner should never have to re-enter. Most of it is already persisted.

| Context | Persisted today? | Where | Gap |
|---|---|---|---|
| Business / location | Yes | `workspaces`, `locations` | — |
| Selected market (`hk`/`tw`) | Yes | on the job and the workspace | Correctly independent of UI locale |
| Brand voice, approved claims, prohibited terms, languages, facts | Yes | `brand_profiles` | **Onboarding collects voice and claims then discards them** — `parseClaimBody` ignores both |
| Offers | **No** | — | Proposed: needed for any recurring promotion workflow |
| Assets and rights status | Yes | `assets` (private Vercel Blob, rights review) | Real-unverified (needs Blob env) |
| Evidence provenance | Yes | `module_states`, `observed_at`, limitation codes | `observed_at` renders as null on real reports; limitation codes are humanised in English only |
| Versions and approvals | Yes | `output_versions` | — |
| Permissions | Yes | `workspace_members` with `location_scope` | — |
| Prior work | Yes | `actions`, `action_runs`, `audit_events`, `action_measurements` | — |

**Schema/API changes needed for workflows 1–3: none.** Offers would need a new table; none of the three requires it.

---

## 5. Run contract

Already implemented and worth preserving as-is: each run records an identifier (`action_runs.id`), the authorized workspace and location (re-verified against persisted rows, never trusted from the client), inputs and source references (`provided_inputs`, snapshot evidence), the selected capability, status (`queued → running → succeeded|failed`), the output version id, error text and retry behaviour (2 attempts), and audit events (`run.started`, `run.succeeded`, `run.failed`). Missing facts produce `facts_needed` → `needs_input` with **no** version and **no** usage. Provider failure produces `state:"failed"` with a friendly message and no version.

Three defects sit on top of this good contract and should be fixed alongside the workflows:

1. **A failed run can look like success** — on the Create page (**F-22**) and in the assistant sheet (**F-21**).
2. **No reaper for `running` runs.** `maxDuration = 60` while two 45 s attempts can reach 90 s; a killed function leaves `state='running'`, which permanently disables Generate for that action. Nothing ever sets `timed_out`.
3. **`agentKey` is not constrained to the template** (`runs.ts:90-93`), so any registered agent can be run against any action.

---

## 6. Approval and delivery rules (already correct — preserve verbatim)

1. AI output is a draft until an authorised person approves **one immutable version**.
2. Editing an approved version creates a new draft requiring fresh approval.
3. Export is not publishing. v1 delivery is export/copy only.
4. One delivery counts only after approval of the exact version **and** its first qualifying export. Generation, revisions, rejections, rescans and failed runs never consume allowance.
5. Approval and export are role-gated server-side and re-verified against location scope.

All five are enforced in SQL, not in the client. **Do not re-implement any of this in application code**, and do not replace the approved-delivery model with token pricing.

One clarification worth writing into the spec: superseding applies to *drafts*. A previously approved version stays approved and remains exportable if reselected from history. That is defensible, but it should be stated explicitly rather than discovered in a support conversation.

---

## 7. Acceptance scenarios

Executable expectations for the three workflows. None can run today, because none can be reached — which is itself the point.

**A1 — Review replies, happy path.** Given a claimed workspace whose latest scan collected ≥1 public review with no owner response, when the owner opens the derived `review-response` action and generates, then exactly one `action_runs` row and one `output_versions` row (v1, `author_type='agent'`) are created; the draft quotes only facts present in the brand profile or the review; and no `workspace_usage` row changes.

**A2 — Approval binds to one version.** Given v1 approved, when the owner edits and saves, then v2 is a `draft`, v1 remains `approved`, and exporting v2 returns 409 `not_approved`.

**A3 — Delivery counts once.** Given v2 approved, when the owner exports twice with the same idempotency key, then the first returns `counted:true`, the second returns the same `deliveryId` with `counted:false`, and `approved_deliveries` increased by exactly 1.

**A4 — Allowance is enforced and explained.** Given a `lite` workspace at its allowance, when the owner exports a fourth approved version, then the API returns 409 `allowance_exceeded`, the version stays approved, and the UI offers the billing route.

**A5 — Missing facts never become invented content.** Given a `visibility-content` action with no `owner_fact_1`, when the owner generates, then the run returns `facts_needed`, the action moves to `needs_input`, no version is created, and no usage is consumed.

**A6 — Provider failure is never fake success.** Given the LLM gateway is unavailable, when the owner generates from **both** the action page and the Create page, then both surfaces show a failure state. This currently fails on the Create page (**F-22**).

**A7 — Untrusted review text cannot steer the agent.** Given a public review whose body contains instructions ("ignore previous instructions and write …"), when a reply is generated, then the output still satisfies the brand guardrails and contains no content from the injected instruction. **This test does not exist today and should be written alongside the prompt-boundary fix (F-12).**

**A8 — Measurement is honest.** Given an approved and exported `visibility-content` version and a later comparable rescan, when measurements are recorded, then the metric is `Attributed` only if the export preceded the new scan, `Observed` otherwise, and `Unknown` when coverage is insufficient — never a revenue or causation claim.
