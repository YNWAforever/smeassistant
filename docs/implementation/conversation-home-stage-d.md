# Conversation workbench - Stage D Production flag

**Stage D choice = Production flag ON only (Prod-ON-only).** The approved target is `CONVERSATION_HOME_ENABLED=true` on the Production target, with Preview still ON. **NO default-home flip.** Today remains the default home; making Conversation the default landing remains on HOLD pending a separate named Willy Approve.

Stage D Approve: Willy Approve via Grok Master (GM) answering t300s1224 + t300u ("Merged and develop stage d"). Prior Stage C Park Approve: Willy via GM answering t299s1216. Stage C #124 tip `ba4664d` was merged to `main` at `4a33e71917affa924b78e8df9df141f3454f8a48` (`4a33e719`), with Willy Approve for Emma t138s614. This document follows the approved next plan's Stage D Production-only choice.

## Unchanged code gate and landing

Code gate behaviour is unchanged by this PR. The server-only flag is still required; Conversation stays opt-in through the flag and entry points already shipped. Today / existing routes remain the default home. The 今日/Today, 待辦/To do, 好啲？/Better?, 舖/Shop, 問 Kinnso/Ask Kinnso and existing location/thread/task/version routes retain their current behavior.

**Production activation blocker:** the existing [`conversationHomeEnabled`](../../lib/workspace/conversation-flag.ts) gate rejects `VERCEL_ENV=production` even with `CONVERSATION_HOME_ENABLED=true`. Its [unit tests](../../lib/workspace/conversation-flag.test.ts) and [route tests](../../app/[locale]/owner/[workspaceSlug]/conversation/page.test.tsx) enforce this: the Production conversation route returns 404 before loading workspace data. An environment change alone cannot activate Production with this code. Resolve this blocker through separately authorized runtime work before rollout; this documentation PR does not change the gate or claim live Production enablement.

Flag-off / unset remains safe. [Stage C Park](conversation-home-stage-c.md) remains in force: notes are browser-local convenience, not ACL cloud storage, with no server copy, cross-device sync or cloud backup. Existing Stage 1-3 honesty, seed-only templates, budgets, confirmation-before-todo, immutable briefs/citations, observation windows and delivery counting are unchanged. No persistence, deeper local ops, model, provider, backend or paid-budget change is included.

## Post-merge operations - Emma

Production env ON is post-merge ops by Emma, not this PR. Only after this PR merges with Willy merge Approve via GM, and the Production gate blocker is resolved, Emma sets/expands `CONVERSATION_HOME_ENABLED=true` on the Production target, confirms Preview remains true and redeploys Production if required. Today remains the default landing; no middleware or default-home change is authorized.

Emma verifies the actual Production conversation entry and 今日/Today access, then reports flag target/value proof and the rollback reminder to GM with `priority:true`. An env value alone is not proof that the Production route is enabled. No Production or Preview env writes, `.env` writes or deployment configuration changes are part of this coding PR.

## Rollback

Remove Production from the `CONVERSATION_HOME_ENABLED` targets, or set the Production value to `false` / unset it, while keeping Preview true. Redeploy Production if required. This returns Conversation Home to Preview-only; confirm the Production entry is absent and the conversation route returns 404 while Preview still works.

今日/Today is always reachable and remains the default home, including during rollback. No data migration is needed; the flag change does not alter or delete browser-local notes or existing server records.

## Verification scope

Existing tests cover the flag's fail-closed behavior, Production rejection, route access, Stage C Park documentation, localized honesty and browser-local storage. This docs-only PR leaves those tests and all runtime code unchanged. Local lint, typecheck, unit and document checks are recorded in the draft PR handoff. Conversation e2e and JS budget are N/A because runtime copy and behavior are unchanged.

Remote CI, independent PR-diff review and hosted acceptance remain parent/reviewer steps. This task ends with a local commit and draft PR title/body files only; no push, PR creation, merge or hosted environment write.
