# Phase 17 — Manual accessibility validation plan

Status: preparation only. No NVDA, VoiceOver or real-device results are claimed. Automated keyboard and responsive checks from prior releases do not substitute for this phase.

The [automated accessibility follow-up](PHASE-17-AUTOMATED-ACCESSIBILITY.md) records reproduced keyboard-focus, accessible-name, dictation ownership and progress-text defects. Those checks do not change the manual status or acceptance criteria below.

## Test environments

Record exact OS, browser, screen-reader version, device, viewport/zoom, input mode, locale, deployed commit and test date for each run. Primary combinations are Windows with NVDA and a supported browser, macOS/iOS with VoiceOver and Safari, and a real touch device with its software keyboard. The current agent tools cannot establish these manual observations; an equipped tester must execute them.

Use an authorized isolated test workspace for any turn, upload, share, approval or export. Read-only production checks must remain read-only. Fixture-generated content is sufficient; model spend is not required for accessibility validation.

## Journey checklist

| Journey | Expected observation |
|---|---|
| Open Kinnso and choose a conversation | Page/title and current conversation are understandable; rail controls have useful names and state; focus order follows the visible interface. |
| Read older history | Heading/message structure supports navigation; new output does not force the reading position away from older content. |
| Compose and edit | Input label and send availability are announced; typed text survives navigation/error recovery as designed; dictation never sends automatically. |
| Stream an answer | Status and completion are conveyed without announcing every token or repeating the whole history; saved and partial/error states are distinguishable. |
| Cancel or retry a turn | Controls are reachable; focus remains usable; error/retry feedback is understandable without sight. |
| Open context, evidence and sharing dialogs | Accessible name is clear; focus enters the dialog, stays contained where modal, and returns to the trigger after close/Escape. |
| Attach evidence | Selected items and removal controls are identifiable; provenance and permission errors are readable. |
| Review a saved draft and return | Exact-version task context remains clear; returning reaches the originating conversation with usable focus. |
| Zoom and mobile keyboard | At 200% zoom and a narrow real-device layout, essential controls remain reachable without overlapping text or a hidden composer. |
| Switch language | English, Hong Kong Chinese and Taiwan Chinese labels/status messages remain understandable; record actual speech-language behavior rather than inferring it from dictionary parity. |

## Reporting and fixes

For each item record Pass, Fail or Not tested, reproduction steps, expected/observed behavior and relevant assistive-technology settings. Avoid screenshots or recordings containing business/customer material. Prioritize blockers to completing the journey, then misleading or excessive announcements, then presentation issues. Add focused automated regressions for defects that automation can represent, while retaining the manual retest evidence.

Release acceptance requires actual execution of the supported combinations, recorded limitations and no unresolved blocker to the core journey. Unavailable hardware or testers remain explicitly Not tested; no completion or compliance certification follows from this plan.
