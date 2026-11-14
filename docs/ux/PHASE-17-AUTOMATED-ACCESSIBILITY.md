# Phase 17 — Automated accessibility follow-up

This record covers reproducible DOM, keyboard-focus and speech-session ownership defects found while preparing the remaining accessibility work. It is **not manual screen-reader or real-device acceptance**. Actual NVDA, VoiceOver, touch-device keyboard and audible announcement behavior remain **Not tested**; the [manual checklist](PHASE-17-ACCESSIBILITY-VALIDATION.md) still requires an equipped tester.

## Confirmed behavior and changes

| Boundary | Reproduced problem | Correction |
|---|---|---|
| Sharing action names | Each member's action had the same accessible “Remove” name; the permission selector was named for its editor option even after selecting viewer. | Removal names include the existing member email. A neutral permission label is supplied in English, Hong Kong Chinese and Taiwan Chinese. Visible role options and server authorization remain unchanged. |
| Sharing mutation focus | Removing a focused member row or sharing the last candidate removed the focused control and left focus on the document body. Existing tests returned the same member after deletion, masking this transition. | Keep controls busy through the authoritative list refresh, then move focus to the next/previous removal action, candidate selector or Close. Preserve focus deliberately moved elsewhere while waiting; failed mutations retain the original action. |
| Dictation ownership | A stopped recognizer's delayed result/end/error could append into another draft or overwrite a newer recognizer's state. New chat and location changes kept the same composer mounted without ending the old speech session. | Fence callbacks by recognizer identity and explicit workspace/location/conversation/new-chat context. Invalidate before aborting on replacement, submission, context/language/availability changes or unmount. Ordinary Stop still accepts its owned final phrase; active typing remains supported. |
| Final-message progress | After the final message arrived, `pending` became null while delivery remained open. The announcer fell back to “reading” again until done/EOF. | Progress text follows the explicit pending stage. Final receipt clears progress without prematurely clearing the transport's busy/Stop state or changing recovery logic. |

The new-chat identity also changes when replacing an already-unsaved conversation (`null` to `null`). Ordinary focus restoration is not a speech lifetime boundary. Dictation results continue to update a draft only; sending remains an explicit user action.

## Reproduction and review

The sharing suite reproduced six failures before the fix: three locale-specific action-name cases and three focus-loss schedules. Additional cases cover failed mutations, focus deliberately moved to Close, and keeping controls busy through the list refresh.

The corrected speech/view red suite reproduced 12 failing cases before source changes. The fake recognizer now models asynchronous Stop/end delivery, which the earlier synchronous fake masked. Tests distinguish valid final results after ordinary Stop from stale results after a newer recognizer, draft replacement or context transition. Held final-message-to-done schedules check the progress text in all three locales.

Independent read-only review found a compatibility regression in the initial correction: a standalone Composer with `streaming=true` and `disabled=false` had an enabled microphone whose new guard ignored clicks. A dedicated regression failed with zero recognizers started. The correction preserves that component contract and cancels only the recognizer carried into a new turn; an explicit session started during streaming can survive completion when the caller permits it. StudioView's existing disabled-during-streaming policy remains unchanged.

## Verification checkpoints

- All 77 focused component tests passed: Composer 20, StudioView 31, message thread 12 and sharing 14.
- Scoped lint passed after expressing streaming transition cancellation as idle-lifetime cleanup.
- Strict application TypeScript passed after regenerating a malformed ignored Next.js development validator. The discarded generated file contained duplicated trailing declarations; no application typing, compiler configuration or lint rule was weakened.
- The first targeted Chromium invocation passed Hong Kong Chinese and Taiwan Chinese at 390 and 1440 pixels. Its English case stopped before UI execution because the first owned Next fixture returned repeated sign-in 404s during readiness. That startup failure is retained as evidence; its cause is not established and it is not an English UI finding.
- The complete enabled Chromium suite passed all 20 journeys in one worker (6.5 minutes), with the separate no-skips checker passing. This includes all three new sharing cases at 390 and 1440 pixels and the existing real-API sharing/viewer enforcement journey.
- The complete unit command passed 7,652 tests: 7,065 application cases, 62 isolated media cases and 525 workspace-package cases. An earlier invocation with the local worker setting unset hit the unchanged SDK revocation case's five-second deadline. That file then passed all 29 cases in isolation, and the complete command passed with the repository's CI setting `VITEST_MAX_WORKERS=1`; test deadlines and the pinned SDK were unchanged.
- Repository-wide application/workspace type checks and lint passed (14 existing lint warnings).
- The production build and secret-boundary sweep passed across 109 public artifacts. All 45 route JavaScript budgets passed; Kinnso conversation measured 253 KB against its 300 KB budget. The retired-transport boundary and disabled self-service-claim checks passed.
- The release PR records the exact reviewed commit, CI and deployment identity separately from these local checkpoints.

The new browser sharing cases use actual Chromium focus and accessible-name queries with local member-response fixtures. Separate existing real-API acceptance covers sharing persistence and authorization. Speech lifecycle tests use typed fake recognition events; they access neither a microphone nor a speech provider. No browser/device emulation is reported as actual assistive-technology behavior.

## Manual handoff

An equipped tester should still execute the [manual matrix](PHASE-17-ACCESSIBILITY-VALIDATION.md), recording device/OS/browser/screen-reader versions, locale, input mode, deployed commit, observed speech and Pass/Fail/Not tested for each journey. In addition to the original checklist, verify member-specific action names, focus after sharing changes, delayed dictation results across New chat/location changes, and the announcement interval between final answer receipt and stream completion.

Any mutation during that testing belongs in an authorized isolated workspace with fixture content. Read-only production checks stay read-only. These automated results establish the recorded ownership and DOM/focus contracts; they make no WCAG conformance or production speech-service reliability claim.
