# Phase 14 — Streaming reliability and accessibility

Status: implementation and isolated verification in progress. This document is not release evidence until the PR, CI and hosted results below are populated.

## Scope and decisions

The authorized continuation strengthens Kinnso's existing continuous conversation surface. The server still finishes a durable turn after its browser disconnects. Cancellation therefore stops delivery, while the durable turn retains its advisory lock until persistence and cleanup finish.

Client operations carry ownership tokens. Late stream cleanup, recovery reads, conversation selection and history reads must not overwrite a newer operation. An uncertain transport failure first reads saved history, even when the browser never received the user acknowledgement. The localized **Check response** action performs another read; it does not append the question again. Definite pre-write refusals can retry a submission. Creation, selection, history and archive retries dispatch their original operation.

Open Share/context sheets and the narrow-screen conversation rail contain keyboard focus and isolate the background. Closing returns focus to a usable trigger. Selecting a discussion releases the rail's focus containment before the parent focuses its composer. Rename consumes its own first Escape. Stream completion does not take focus from another control or an open sheet. Removing an evidence chip focuses its next neighbor, previous neighbor or Evidence toggle.

History prepends retain the visible message anchor. Incoming content follows only when the reader was at the bottom. A removed Load earlier button transfers focus to the named log without moving the page. A stable localized progress announcer lives outside the busy log; partial tokens remain visual, while finalized messages remain in the accessible log.

No schema, provider configuration, membership rules, immutable-version approval or delivery accounting change. No publishing action is introduced.

## Reproduced failures and focused evidence

- Late recovery from stopped discussion A replaced a newly selected discussion B. The new deterministic regression failed before ownership tokens and passed afterward.
- A lost user acknowledgement offered resubmission instead of recovering the already saved answer. Creation Retry only dismissed its error. Both regressions failed before the recovery/retry change.
- Response cancellation released the lock while the injected provider was held. Both successful and failing held-turn cases admitted a second POST (200 instead of 409) before the server fix. The route suite then passed 37/37.
- Overlay tests reproduced unstable callback focus resets, missing focus containment/background isolation, missing narrow-rail modal semantics and unconsumed rename Escape. The initial scoped overlay suite passed 14/14 after fixes.
- Thread tests initially had 5 failures / 2 passes. The completed synthetic-geometry suite passed 12/12, covering prepends, simultaneous prepend/append, token growth, optimistic replacement, conversation changes, disappearing history controls and localized live-region structure.
- Evidence removal dropped focus to the document body. Its focused regression failed before moving focus to a surviving control.
- The integrated Studio component suite passed 61/61. TypeScript and scoped ESLint subsequently passed after completing the document-citation test fixture.
- The first real-browser keyboard run failed in all three locales at initial context-sheet focus. A standalone Chromium probe established that `visibility` remained hidden on the opening frame. Making visibility immediate on open while retaining the slide animation changed the probe from unfocused/hidden to focused/visible on that frame.
- Responsive-isolation regressions reproduced both directions of an inert-state change while a sheet stays open. The isolation helper now tracks external changes, maintains isolation and restores the latest intended state on close, including pending observer records.
- Independent review found two P2 issues: that responsive inert-state lifecycle and a successful empty recovery read overwriting a newer draft. Both received red regressions, fixes and a passing 29-test targeted run with strict TypeScript. A separate follow-up review found no remaining concrete issue in those fixes.
- Real Chromium history tests exposed the existing smooth-scroll CSS delaying before-paint anchor corrections. Changing the thread to immediate scroll positioning made the mobile/desktop history checks pass.
- The first full browser attempt also reached an empty attachment list in an existing fixture. A new read-only API precondition now checks that the seeded document is visible before exercising the UI. The focused history/attachment recheck passed, followed by the complete enabled suite: **17 passed (2.2m)**. No product-side document-storage change was made.

## Browser verification plan

The enabled isolated acceptance suite includes English, Hong Kong Chinese and Taiwan Chinese. Keyboard tests exercise 390, 900 and 1440 pixel widths, context/rail/Share dismissal, tab wrapping, same-discussion selection, and completion while focus is inside Share. A held browser SSE response and read-only member fixture make completion timing deterministic; this case does not claim server persistence or share authorization coverage.

History tests exercise actual Chromium layout at 390 and 1440 pixels, preserving the first visible existing message, log focus, composer position and page scroll after prepending older messages. A subsequent appended turn must not pull a reader away from an earlier position. History payloads are isolated browser fixtures; the existing persistence/reload acceptance cases remain enabled alongside them.

All acceptance dependencies are owned disposable fixtures. Tests do not call paid providers. Hosted verification remains read-only.

## Release gates

Root and workspace type checks and repository lint passed. The first unrestricted unit run passed 6,921 tests but timed out in one unchanged Auth SDK cold-import test. That suite passed 2/2 in isolation; a complete rerun with `VITEST_MAX_WORKERS=2` then passed **6,922/6,922 tests in 572 files** (276.95 seconds), without changing Auth code or test timeouts.

Independent review, enabled acceptance and all local repository gates are complete. The isolated safe-media suite passed 62/62; workspace packages passed 525/525 (region 23, scoring 183, contracts 20, scan-engine 299), for **7,509 passing tests** across the required unit commands. Production build and all route JavaScript budgets passed; the conversation route is 253 KB against its 300 KB budget. `git diff --check` passed.

The server lock guardrail landed first through green CI in [PR #179](https://github.com/YNWAforever/smeassistant/pull/179). The client change is [PR #180](https://github.com/YNWAforever/smeassistant/pull/180); its enabled browser CI passed all 17 cases. Its first full CI run exposed an unrelated time-dependent unsubscribe test: changing a final base64url `A` to `B` changes only ignored padding bits, leaving the MAC bytes identical. A fixed-expiry fixture reproduced the failure deterministically; changing the first signature character and asserting different decoded bytes restored the intended invalid-signature check (12/12 route tests passed). Production token verification is unchanged. Independent review approved the test-only repair; all required local gates then passed again, including 6,922 root tests (331.83 seconds), 62 safe-media tests, 525 workspace tests, type checks, lint, production build and route budgets.

Pending: final client CI, guarded merge, deployment identity and read-only hosted verification. Hosted release is not claimed by this pre-merge report.

The prior Phase 13 final-main CI run 43468003695 completed successfully during this work; its quiet monitor exited 0.

## Known limits and follow-up

These checks establish DOM semantics and keyboard behavior, not actual NVDA/VoiceOver speech cadence or full accessibility conformance. Manual assistive-technology, contrast, touch and virtual-keyboard checks remain separate.

The audit also identified a pre-existing aggregate timeout concern: classifier, streaming and fallback budgets can exceed the route's platform duration, and fallback receives a fresh per-call allowance. This phase does not alter shared provider behavior or platform duration. A separate change should use a shared remaining deadline with persistence/cleanup reserve and deterministic elapsed-budget tests.
