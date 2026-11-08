# Active checkpoint — 2026-10-17

**Closed after successful continuation.** Session 90480 ended exit 0. Five saved/read-back drafts, the late real-response regression, all 10 provider responses and exact cleanup are reconciled in `final-verification.json`. See `REPORT.md` and `five-drafts-for-user-review.md` for the final outcome. The remaining/active notes below are historical checkpoint context, superseded by those final files. Human quality remains PENDING_USER; nothing was published or deployed.

Current user scope: fix repeated requests for an already available review and missing timeout/late usage accounting. Same approved OpenCode Go endpoint and exact `longcat-2.5-preview-free`, zero budget and no fallback, isolated fixtures only. No Eldage, production data/Auth changes, push, PR, merge, deployment, approval, export, publishing or scheduling.

Repo/worktree: `C:\Users\laich\Documents\smescanner\.worktrees\smeassistant-llm-rate-limit-20261015`, `YNWAforever/smeassistant`, branch `codex/content-approval-journey-20261017`. The adjacent smescanner root is unrelated and dirty; preserve it and all older evidence.

- Baseline commit `6b293eca02b5c8ae5a0f5e1ad51994719d4cbfa5`.
- Application fix commit `d153c4a3e4c614de0377f055ee24b10d7b5cb655`.
- Current HEAD `bb3f48af4ae42a362c3ff58878f74286736e0f40`, adding ONLY isolated relay response capture. `git diff d153c4a HEAD -- app components lib test e2e` is empty.
- Remote main read-only observed at 17:13 HKT: `ae8411f41f95eb53d2caa27ee1621410f8bbfe86`. No push or deployment.
- Final source checks: `candidate-stages.jsonl`, every phase exit 0: full unit 6,209; owned DB 34; typecheck; lint 0 errors/40 warnings; no-Supabase; no-self-service-claim; Webpack build plus secret-boundary 170 public artifacts; browser 4/4.
- Default `pnpm build` and first browser startup FAILED due the existing external node_modules junction/Turbopack root restriction; keep those failure logs. Existing `SME_TEST_WEBPACK=1` opt-in succeeded. Do not claim default Turbopack build passed.
- `candidate-source.json` binds 51 files to the tested dirty tree before commit. `source-and-secret-precommit.json` showed no drift/key literal. The relay-only diagnostic change is the sole intended drift after that binding.

Real AI:

1. `live-2026-10-17T09-50-00-122Z` at application `d153c4a`:
   - Case 1 saved/reloaded/new fixture session PASS, 17,679 ms generation-to-save.
   - Case 2 blocked by existing business fact guard. No version saved. Original provider body was not retained, so do not assert the exact offending phrase or whether false positive.
   - 2 provider calls, both HTTP 200 exact LongCat and complete reported usage; app matched 1,690/239 and 1,713/194. Missing-review gate separately recorded 0/0.
   - No unresolved attempts; no deliveries/approval; exact container cleanup receipt confirmed gone.
2. Current live continuation command:
   `node --import tsx .superpowers/sdd/review-usage-reliability-20261017/run-live-acceptance.ts --from-case=2`
   - Unified exec session **90480**, still active at this checkpoint.
   - Log `real-ai-followup.log`.
   - Directory `live-2026-10-17T09-54-10-647Z`.
   - Same application bytes at HEAD `bb3f48a`; only new fixture-only provider-response JSON capture for diagnosing withheld output.
   - This run should complete cases 2–5 and an induced late real-response test, plus usage reconciliation and cleanup. Do not rerun before reading outcome/ledger/DB receipts.
   - Current script has NO old “repeat the already supplied review” rescue. Known output must generate a version or fail the run.

Remaining:

- Observe session 90480 to terminal. If withheld again, inspect retained provider-response-N.json and actual guard result before changing anything. Never weaken fact checks or hide failure.
- Complete late real-response test: local relay holds a real response beyond 45s; API retry must be 409; release within existing settlement window; late usage must update same attempt while failed run/original version remains unchanged.
- Consolidate case 1 from run 1 and cases 2–5 from successful continuation into a NEW five-draft review pack, with screenshots, facts, source and explicit first failed attempt. Keep prior evidence unchanged. Human 4/5 ratings remain PENDING_USER; no app approval.
- Reconcile ALL real calls across runs, preserving failed-but-metered requests. Free pricing gate is checked before each call; monetary provider invoice is not checked. No unknown may be treated as 0.
- Inspect current final screenshots and five bodies for unsupported facts; this is bounded fact review, not human quality scoring.
- Finalize REPORT.md and final-verification.json with exact commands/exits, source/evidence SHA, receipts, source equivalence, cleanup and limitations. Current REPORT last section is pending.
- Verify selected key literal/real Auth query secrets absent from current artifacts without printing them; .env.ai-uat.local remains ignored.
- Optionally commit this round's evidence/plan locally after scan. No push/PR/merge/deploy. Preserve unrelated untracked folders.

Known limits: missing/unknown/partial usage blocks retries; outside bounded observation window/host death stays pending or unknown, no reconciliation API. Rejected 401/403/429 currently conservatively retain missing counters, not invented zeros. Legacy terminal null costs may block budget during 24h rollout; no production backfill authorized. Google/OTP/legacy magic link/Safari/WebKit/real phone not tested this round. 390px Chromium is viewport only. “firstSaveMs” excludes auth/setup and human actions, so does not prove full 5-minute journey.
