# Phase 17 — Manual accessibility results record

Status: **no results recorded.** Every combination and journey below is **Not tested**. This file is the record a tester fills in while executing the [manual accessibility runbook](PHASE-17-MANUAL-RUNBOOK.md) against the release baseline. Do not mark a row Pass/Fail unless the runbook step was actually executed on that combination; do not infer one combination from another.

Baseline: application code was `b7e0d3917c81104a2de0ac519055b71551bf7802` when this record was prepared; the docs-only changes that added it do not alter application behavior. Before testing, record the exact commit actually served by `https://smeassistant.vercel.app`; that recorded commit is the one the results apply to. Record the exact OS, browser, assistive-technology version, device, viewport/zoom, input mode and locale for each run.

Rules: keep records free of business/customer material; mutating journeys need the authorized isolated test workspace; dictation checks need the browser speech-upload decision; unavailable hardware, testers or authorizations stay **Not tested** with the reason stated. Severities: **Blocker** (cannot complete the journey), **Misleading/excessive** (completes but feedback is wrong/duplicated/overwhelming), **Presentation** (non-blocking presentation issue). No WCAG conformance claim follows from any result here.

## Summary

| Combination | Executed | Pass | Fail | Not tested | Blockers |
|---|---|---|---|---|---|
| C1 — Windows, NVDA, Chrome, keyboard | No | 0 | 0 | 10 | 0 |
| C2 — Windows, NVDA, Firefox, keyboard | No | 0 | 0 | 10 | 0 |
| C3 — macOS, VoiceOver, Safari, keyboard | No | 0 | 0 | 10 | 0 |
| C4 — iOS, VoiceOver, Safari, touch | No | 0 | 0 | 10 | 0 |
| C5 — Windows, keyboard-only, Chrome | No | 0 | 0 | 10 | 0 |
| C6 — real touch device, narrow, optional | No | 0 | 0 | 10 | 0 |
| C7 — Android, TalkBack, Chrome, optional | No | 0 | 0 | 10 | 0 |

## C1 — Windows 11, NVDA, Chrome, physical keyboard

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  NVDA version: ____
Device: ____  |  Viewport/zoom: ____  |  Input mode: physical keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture  |  Spend/mutation authorization: ____
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard (200% here) | Not tested | |
| J10 Switch language | Not tested | |

## C2 — Windows 11, NVDA, Firefox, physical keyboard

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  NVDA version: ____
Device: ____  |  Viewport/zoom: ____  |  Input mode: physical keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture  |  Spend/mutation authorization: ____
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard | Not tested | |
| J10 Switch language | Not tested | |

## C3 — macOS, VoiceOver, Safari, physical keyboard

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  VoiceOver version: ____
Device: ____  |  Viewport/zoom: ____  |  Input mode: physical keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture  |  Spend/mutation authorization: ____
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard (200% here) | Not tested | |
| J10 Switch language | Not tested | |

## C4 — iOS, VoiceOver, Safari, touch and software keyboard

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  VoiceOver: enabled
Device: ____ (real device)  |  Viewport: device width  |  Input: touch + software keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture  |  Spend/mutation authorization: ____
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard | Not tested | |
| J10 Switch language | Not tested | |

## C5 — Windows, keyboard-only, no assistive technology

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  AT: none (keyboard-only baseline)
Device: ____  |  Viewport/zoom: ____  |  Input mode: physical keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture  |  Spend/mutation authorization: ____
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard | Not tested | |
| J10 Switch language | Not tested | |

## C6 — Optional: real touch device, narrow layout

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  AT (if any): ____
Device: ____  |  Viewport: 390 px class  |  Zoom/text size: 200%  |  Input: software keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard | Not tested | |
| J10 Switch language | Not tested | |

## C7 — Optional: Android, TalkBack, Chrome

```text
Tester: ____  |  Date/time: ____  |  Served commit: ____
OS: ____  |  Browser/version: ____  |  TalkBack version: ____
Device: ____  |  Viewport: device width  |  Input: touch + software keyboard
Locale(s): ____  |  Workspace: authorized isolated fixture
```

| Journey | Result | Notes |
|---|---|---|
| J1 Open Kinnso and choose a conversation | Not tested | |
| J2 Read older history | Not tested | |
| J3 Compose, edit and dictate | Not tested | |
| J4 Stream an answer | Not tested | |
| J5 Cancel or retry a turn | Not tested | |
| J6 Context, evidence and sharing dialogs | Not tested | |
| J7 Attach evidence | Not tested | |
| J8 Saved draft → exact-version review and return | Not tested | |
| J9 Zoom, narrow layout and mobile keyboard | Not tested | |
| J10 Switch language | Not tested | |

## Defect log

Add one row per distinct failure with reproduction, expected vs observed, severity and the combination/AT settings. Leave empty until a run produces a defect.

| ID | Journey | Combination | Expected | Observed | Severity | Status |
|---|---|---|---|---|---|---|

## Phase 17A retest checklist

These fixed/regressed behaviors from the automated follow-up must be re-observed manually; record the result next to the journey row above (J3, J4, J6) or as defect rows:

| Retest | Journey | Result |
|---|---|---|
| Member-specific removal action names | J6 | Not tested |
| Focus after removing a focused member row or adding a candidate | J6 | Not tested |
| Permission selector naming after a role change | J6 | Not tested |
| Delayed dictation result cannot land in another draft after New chat/location change | J3 | Not tested |
| Microphone availability/state while streaming | J3 | Not tested |
| Final receipt clears progress without falling back to "reading" | J4 | Not tested |

## Acceptance decision

Not tested yet: no required combination has been executed. The phase can move from **Not tested** only when the required combinations (C1–C5) are recorded above, every failure is triaged with a reproduction, and no unresolved blocker remains. Unavailable hardware, testers or authorizations stay **Not tested** with the reason stated. No WCAG conformance or compliance certification follows from this record.
