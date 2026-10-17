# Review source and provider usage reliability implementation plan

> Execute inline with systematic debugging, test-driven development and verification-before-completion. Preserve the existing worktree and all earlier acceptance receipts.

**Goal:** Do not ask for a review already available in the authorized action context; retain each provider attempt and any late measured usage without reviving timed-out output or treating unknown usage as zero.

**Baseline:** `6b293eca02b5c8ae5a0f5e1ad51994719d4cbfa5`.

**Architecture:** Reuse review grounding and the existing `action_runs` input/usage fields. Record an attempt before outbound work, settle its metadata atomically and idempotently, and derive the run totals from those observations. Keep the existing user-visible deadline; a bounded usage-only settlement can run within the existing route lifetime. Unresolved attempts remain explicit and prevent another generation for the same action. Late text never becomes an output or version.

**Constraints:** Local source and owned disposable Docker fixtures only. Real regression uses the same user-provided key, OpenCode Go, exact `longcat-2.5-preview-free`, current official zero pricing and no fallback. No production data/Auth/configuration changes, Eldage, mail, approval, export, publishing, scheduling, push or deployment.

## Tasks

- [x] Add RED cases for saved owner review, authorized selected/rating-only scan review, absent/blank/mixed questions, empty and unsafe output. Correct the prompt source and narrow normalization; keep genuinely missing facts.
- [x] Add RED cases for an attempt before effect, logical timeout with late usage, unknown/partial counters, duplicate/conflicting settlements, stale finalization and cross-workspace/actor refusal.
- [x] Add per-attempt observations to the existing run repository. Derive known subtotals and nullable totals under row locks; never overwrite versions/action state from a late observation. Block ambiguous automatic retry.
- [x] Wire the existing Next post-response lifetime to bounded usage-only settlement. Keep the generation deadline and existing maximum route duration.
- [x] Run focused tests, owned PostgreSQL integration, affected browser checks, full unit/typecheck/lint/static/build checks. Default Turbopack failure remains recorded; the existing explicit Webpack option passed.
- [x] Run bounded real Go regression on isolated merchants, including an intentionally delayed real response. Record provider observations, saved versions, readback, unknowns and exact cleanup. The first fact-guard refusal is preserved, followed by a controlled continuation after complete usage reconciliation.
- [x] Bind application commit d153c4a and diagnostic-only runner bb3f48a to receipts. Deliver remaining provider/human/hosted limitations without relabeling older evidence.

## Review focus

- Missing review and optional facts must remain distinguishable; no public-preview rule weakening.
- A rating-only review is usable evidence without invented written text.
- Late telemetry cannot create/approve/export a version or change a terminal run state.
- Unknown transport outcomes cannot start an automatic second inference or silently count as zero.
- Accounting remains safe under replay, revocation, concurrent finalization and worker/host termination; outside the bounded observation window remains unknown until a provider-supported reconciliation.
