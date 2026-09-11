# SME Assistant — Claude Code Implementation Kit

**Prepared 10 September 2026.** Four larger delivery phases based on the five supplied audit documents.

## Use this kit

1. Extract the ZIP. Copy the **contents** of `smeassistant-implementation-kit/` into `docs/implementation/owner-platform-v1/` inside the existing `YNWAforever/smeassistant` checkout. Preserve the `sources/` and `phase-prompts/` folders. Do not replace the repository's root `CLAUDE.md`.
2. Open [`CLAUDE-CODE-START-HERE.md`](CLAUDE-CODE-START-HERE.md) and paste its implementation prompt into Claude Code working in that repository.
3. Use the individual phase prompts for a scoped phase or a later session. Keep prior phase evidence and blocked hosted gates visible.

No execution, repository modification, deployment or hosted test has occurred in preparing this kit. The original audit describes a historical baseline; Claude Code must preserve newer work and re-baseline first.

## Contents

| File | Purpose |
|---|---|
| [`MASTER-IMPLEMENTATION-PLAN.md`](MASTER-IMPLEMENTATION-PLAN.md) | Complete four-phase plan: scope, actual code seams, acceptance, architecture/data rules, rollout and execution contract. |
| [`CLAUDE-CODE-START-HERE.md`](CLAUDE-CODE-START-HERE.md) | Ready-to-paste master implementation instruction. |
| [`phase-prompts/01-SAFE-OWNER-ACTIVATION.md`](phase-prompts/01-SAFE-OWNER-ACTIVATION.md) | Full first-owner journey, security, sign-in/claim and first approved export. |
| [`phase-prompts/02-COMPLETE-OWNER-WORKSPACE.md`](phase-prompts/02-COMPLETE-OWNER-WORKSPACE.md) | Three complete workflows, simpler daily UX and real assisted assignment. |
| [`phase-prompts/03-RECURRING-COMMERCIAL-SERVICE.md`](phase-prompts/03-RECURRING-COMMERCIAL-SERVICE.md) | Durable execution, re-scan measurement, billing and operations. |
| [`phase-prompts/04-REUSABLE-GROWTH-PLATFORM.md`](phase-prompts/04-REUSABLE-GROWTH-PLATFORM.md) | Offers, promotion copy, work packs and contextual assistant; gated optional publishing/preview. |
| [`IMPLEMENTATION-TRACEABILITY.md`](IMPLEMENTATION-TRACEABILITY.md) | Every supplied finding and backlog item mapped to its phase and closure proof. |
| [`BUSINESS-AND-HOSTED-DECISIONS.md`](BUSINESS-AND-HOSTED-DECISIONS.md) | Decisions and permissions that cannot be silently guessed; safe coding defaults. |
| [`RELEASE-EVIDENCE-TEMPLATE.md`](RELEASE-EVIDENCE-TEMPLATE.md) | Candidate-specific commands, statuses, outcomes, authorization and rollback evidence. |
| [`sources/`](sources/) | Five original audit documents, copied byte-for-byte with normalized filenames. |

## Release sequence

**1. Safe owner activation → 2. Complete owner workspace → 3. Recurring and commercial service → 4. Reusable growth platform.**

One phase means a complete owner outcome with several reviewable changes—not one giant commit. Preserve scanning/evidence, Neon, server-side permissions and SQL exact-version approval/export. Do not add direct publishing, another scheduler, another authentication system or a separate agent marketplace as incidental work.

Original source findings are distinguished from new recommendations throughout. The source documents' “ten offline gates” wording is explicitly reconciled against their nine named offline command entries; no missing gate or passing result has been fabricated.
