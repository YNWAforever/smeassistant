# Phase 17 — Manual accessibility runbook (tester-ready)

Status: **preparation only.** No NVDA, VoiceOver, TalkBack, real-device or microphone observation is recorded here, and none is claimed. Every journey below starts as **Not tested** until an equipped tester executes it and records the result. Automated keyboard, DOM/focus and responsive checks from earlier releases do not substitute for this runbook.

Baseline for execution: production `https://smeassistant.vercel.app` serving commit **`b7e0d3917c81104a2de0ac519055b71551bf7802`** when this runbook and [results record](PHASE-17-MANUAL-RESULTS.md) were prepared (main, 2026-11-17; docs-only changes since then do not alter application behavior). Re-check the deployment before starting; record the commit actually served. Testing a different commit is allowed — record it and keep treating this runbook's expected observations as the criteria.

## 1. Required and optional combinations

Run each required combination against the read-only journeys first. Mutations (sending a turn, uploading a document, saving a draft, sharing) need an authorized isolated test workspace with fixture content; model spend needs separate authorization.

| # | Platform | Screen reader | Browser | Input | Required? |
|---|---|---|---|---|---|
| C1 | Windows 11 current | NVDA current stable | Chrome current | Physical keyboard | Required |
| C2 | Windows 11 current | NVDA current stable | Firefox current | Physical keyboard | Required |
| C3 | macOS current | VoiceOver | Safari current | Physical keyboard | Required |
| C4 | iOS current (real device) | VoiceOver | Safari | Touch + software keyboard | Required |
| C5 | Windows 11 current | none | Chrome current | Keyboard only (no AT) | Required (focus-order baseline) |
| C6 | Real touch device, 390 px class | any available | any | Software keyboard, 200% text | Optional |
| C7 | Android current | TalkBack | Chrome | Touch | Optional |

Additional parameters to vary at least once: **200% browser zoom** on C1/C3, each locale (**en**, **zh-HK**, **zh-TW**), and **reduced motion** if the device offers it.

For each run record: tester, date and time, OS version, browser and version, assistive-technology and version, device model, viewport/zoom, input mode, locale, workspace type (fixture), and the commit actually served.

## 2. Setup and safety

1. Confirm the served commit (section 1). Do not proceed if the deployment is mid-rollout.
2. Sign in to an **authorized isolated test workspace**. Do not test against a real merchant workspace, and do not paste customer or business material into prompts, uploads or screenshots.
3. Use fixture business names, locations and documents. Where a journey needs an existing answer, prefer conversation history created for the test; do not trigger paid model calls unless that spend is explicitly authorized.
4. Keep production checks read-only where the runbook says read-only. Mutations belong to the isolated workspace only.
5. Keep evidence free of business/customer data. Record redacted notes and, if screenshots are needed, crop to the control under discussion and store them outside the repository; the record keeps only the observation text and non-sensitive paths.
6. Dictation uses the browser's speech recognition, which may send audio to the browser vendor. Use the microphone only if that is acceptable for the test device and workspace; otherwise mark the dictation checks **Not tested** and say why.

## 3. Journey scripts

Each journey lists the entry area, steps, expected observation and the fields to record. Result values are **Pass**, **Fail** or **Not tested**. A Fail needs reproduction steps, expected vs observed, and the AT settings active at the time.

Entry area for all journeys unless stated: `/{locale}/owner/{workspaceSlug}/conversation` (the canonical Studio; `/conversation/studio` redirects there), with locations selectable in the workspace shell. Use the filtered/read-only checks where no mutation is authorized.

### J1 — Open Kinnso and choose a conversation

1. Start at the workspace entry surface in the target locale.
2. Move through the conversation rail with the screen reader's navigation and with Tab.
3. Activate a conversation; then activate a second one.

Expected: page and section titles are understandable; the current conversation is announced as selected; rail controls have useful names and state; focus order matches the visible interface; switching conversations announces the change and keeps focus usable.

Retest from Phase 17A: no duplicate/ambiguous names in the rail.

### J2 — Read older history

1. Open a conversation with several turns.
2. Navigate by headings or message structure (screen-reader quick nav), then by plain reading.
3. While a new answer streams, re-read older content.

Expected: heading/message structure supports navigation; class/role of user vs assistant content is distinguishable; streaming does not yank the reading position away from older content; the live region does not re-announce the whole history.

### J3 — Compose, edit and dictate

1. Focus the composer; type text; add and remove characters; move the caret within the text.
2. Trigger and resolve a validation/error condition (for example send with an empty draft).
3. Dictate text where the browser supports it, then stop dictation; dictate again and immediately navigate away or switch location/new chat.

Expected: composer label and send availability are announced; typed text survives navigation/error recovery as designed; dictation appends final phrases without replacing typed text; dictation **never** sends automatically; a stopped recognizer's delayed result cannot land in another draft or after a location/new-chat change; the microphone control's state is announced.

Retest from Phase 17A: delayed dictation results after New chat/location change; microphone availability while streaming.

### J4 — Stream an answer

1. Send a fixture-safe prompt (only with spend authorization; otherwise play back an existing generated answer and skip the send).
2. Listen from the moment the answer starts through its completion, including the final receipt.

Expected: status and completion are conveyed without announcing every token or repeating the whole history; “working”, final receipt and “done” are distinguishable; the stream does not trap the screen reader; saved vs partial/error states are distinguishable.

Retest from Phase 17A: the announcement interval between final answer receipt and stream completion (progress text must not fall back to “reading” after the final message).

### J5 — Cancel or retry a turn

1. Send a turn (if authorized) and activate Cancel while it is running.
2. Start another turn and let it fail or cancel; activate Retry/Continue if offered.

Expected: cancel/stop control is reachable and identifiable; focus remains usable after cancellation; cancellation is announced; error/retry feedback is understandable without sight; retry does not duplicate the previous answer or leave an ambiguous state.

### J6 — Context, evidence and sharing dialogs

1. Open the context/evidence surface and the sharing dialog from the conversation header.
2. Navigate inside each dialog; attempt to Tab past the end; close with Escape and with the Close control.
3. In the sharing dialog, change one member's role, remove a member, add a candidate, and cancel a pending change.

Expected: each dialog has a clear accessible name and is announced as a dialog; focus enters the dialog and stays contained where modal; focus returns to the trigger after close/Escape; busy states are announced; each removal action has a distinct name (member-specific); after a removal/addition the focus lands somewhere predictable and is announced.

Retest from Phase 17A: member-specific removal names; focus after removing a focused row; permission selector naming after a role change.

### J7 — Attach evidence

1. Open the evidence picker; navigate the list of existing documents/briefs.
2. Select and remove attachments; where authorized, upload a small TXT/MD/CSV fixture document.
3. Trigger a permission/provenance error with a disallowed member or oversized file.

Expected: selected items and removal controls are identifiable and announced with context; upload progress/completion announced; provenance and permission errors are readable and actionable; server re-read of the selected evidence is reflected in the answer's citations without inventing evidence.

### J8 — Saved draft → exact-version task review and return

1. Save a draft as an exact version (authorized workspace).
2. Continue to the task review page; inspect the version context; return to the originating conversation.

Expected: the task context (exact version, workspace, location) is clear without sight; returning reaches the originating conversation with usable focus; refresh/recovery during the round trip does not lose the context; no extra unsaved version is silently created.

### J9 — Zoom, narrow layout and mobile keyboard

1. On C1/C3 set 200% browser zoom; repeat J1, J3 and J6 at that zoom.
2. On the real touch device at its narrow width, open the composer and software keyboard; scroll through the thread; open a dialog.

Expected: essential controls remain reachable without overlapping text or a hidden composer; focus is not obscured by the software keyboard; dialog content remains scrollable at zoom; no content is clipped to the point of being unusable.

### J10 — Switch language

1. Switch between **en**, **zh-HK** and **zh-TW** on the same surface.
2. In each locale, repeat one navigation step, one compose step and one dialog open/close.
3. For dictation, record the actual speech-recognition language behavior (rather than inferring from dictionary parity).

Expected: labels, status messages and error text remain understandable in each locale; the announcement language matches or is intelligibly handled; dictation uses the locale's speech language as designed (`en-US`, `zh-HK`, `zh-TW`); switching language does not drop the draft, conversation or current task context.

## 4. Pass/fail rules

- **Pass**: the expected observation is achieved on that combination.
- **Fail**: a journey step is blocked, an announcement is materially misleading or excessive, or focus/ownership is lost as described. Record severity:
  - **Blocker** — cannot complete the journey with the assistive technology.
  - **Misleading/excessive** — journey completes but feedback is wrong, duplicated or overwhelming.
  - **Presentation** — visible or spoken presentation issue that does not block the journey.
- **Not tested**: not executed, unsupported hardware, unavailable tester, or withheld authorization (state which).
- A missing observation is never inferred from another combination. One passing combination does not close the phase.

## 5. Evidence record template

Copy one block per executed combination into the [results record](PHASE-17-MANUAL-RESULTS.md) (not this runbook), and one row per journey. The results record is pre-seeded with every combination and journey as **Not tested** so a run only changes what was observed:

```text
Combination: C1  |  Tester: ____  |  Date/time: ____
OS: ____  |  Browser: ____  |  AT: ____  |  Device: ____
Viewport/zoom: ____  |  Input: ____  |  Locale: ____  |  Workspace: fixture
Served commit: ____  |  Build/URL: ____

J1 Pass | J2 Pass | J3 Fail(Blocker) | J4 Pass | J5 Not tested (no send authorization)
J6 Pass | J7 Pass | J8 Pass | J9 Pass | J10 Pass
Notes:
Defect D-01: journey, step, expected, observed, severity, AT settings, repro.
```

Summary table for the results record:

| Combination | Executed | Pass | Fail | Not tested | Blockers |
|---|---|---|---|---|---|
| C1 | | | | | |
| C2 | | | | | |
| C3 | | | | | |
| C4 | | | | | |
| C5 | | | | | |
| C6 | | | | | |
| C7 | | | | | |

## 6. Acceptance boundary

The phase can move from **Not tested** only when the required combinations have been executed and recorded in the [results record](PHASE-17-MANUAL-RESULTS.md), every failure is triaged with a reproduction, and no unresolved blocker remains in the core journey. Unavailable hardware or testers stay explicitly **Not tested**. No WCAG conformance or compliance certification follows from this runbook, and automated tests remain the regression net for the observations that automation can represent.
