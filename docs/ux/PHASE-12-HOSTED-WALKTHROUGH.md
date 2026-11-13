# Phase 12 — signed-in hosted walkthrough

Date: 2026-11-13. The recorded page sweep started at 05:25 UTC (13:25 Asia/Singapore).

## Target and method

- Production origin: https://smeassistant.vercel.app.
- Workspace: Eldage (`eldage`), using the owner's interactive login and an owner membership.
- Local source at verification: `9d7bb408` (PR #173). This is the local release reference, not an independent attestation of the serving deployment SHA.
- Browser: installed Chrome controlled through Playwright. DSH in-app browser controls were unavailable to this session. The owner completed sign-in in the opened Chrome window; the walkthrough reused that session.
- English desktop: 1440 × 900. Cantonese mobile viewport: 390 × 900. Additional Taiwanese mobile dark-theme spot check: 390 × 900.
- Read-only walkthrough. The main sweep and interaction checks refused application mutation requests; authentication traffic was exempt. No chat message, generation, scan, save, approval, export, publishing, import or business-setting mutation was submitted. The dark-theme spot check set only the browser theme preference.
- Session state remains outside the repository in the temporary walkthrough directory and is not included in evidence or this document.

## Results

18 recorded page visits returned HTTP 200 with no horizontal document overflow and no JavaScript page errors:

| Destination | English desktop | Cantonese mobile |
| --- | --- | --- |
| Today | Pass | Pass |
| Tasks | Pass | Pass |
| Kinnso chat | Pass | Pass |
| Results | Pass | Pass |
| Business | Pass | Pass |
| Settings | Pass | Pass |
| Browser-local notes | Pass | Pass |
| Legacy chat URL, redirected to canonical chat | Pass | Pass |
| Existing task detail | Pass | Pass after readiness retry |

11 additional checks passed:

- Settings is reachable by opening the account menu and clicking its Settings link at desktop and mobile widths.
- Switching the task into edit mode exposes the Kinnso revision link with the action, immutable version, location and allowlisted `ask=revise_action` context at both widths. The link was inspected; it was not followed because that can start work.
- `/conversation/studio?location=eldage&foo=walkthrough` redirects to `/conversation` while retaining both query values at both widths.
- The existing conversation text remains the same after reload at both widths. This checks readback of a previously saved conversation; it does not exercise saving a new message.
- The immersive chat hides workspace navigation at both widths.
- The Taiwanese Today page renders with explicit `data-theme="dark"` and no horizontal overflow on the mobile viewport.

Today's Why disclosure was opened and reviewed. The full-width layout and evidence source/time are present. Existing drafts and prior conversation history load from the real workspace. Task pages show Back to Tasks, and the edit-mode revision action says Ask Kinnso to revise.

## Open content finding

The existing priority task's saved evidence detail is rendered under the Observed label, but combines measured-looking review counts with unverified competitive targets and causal business claims. In English it includes “Too few reviews deter new customers and directly hurts your Google local ranking and click-through rate.” The Cantonese detail makes the corresponding direct-impact claim.

The walkthrough does not establish those effects. The recorded detail should distinguish source observations from recommendations/inferences, and should not assert customer or ranking causation without evidence. The observation is a content/guardrail finding, not a layout or navigation failure. No live record was edited during this walkthrough.

Follow-up tracing found that action derivation copied `audit_findings.owner_message_*` into `evidence.detail` while assigning Observed, and the action read model trusted that stored prose. The guardrail change uses controlled, translated finding labels for newly derived finding tasks and recomputes those descriptions when reading existing finding tasks. Unknown finding keys use an Unknown/unavailable description. Values, sources, timestamps, priorities and original stored rows are retained. Today separately labels customer/ranking/click effects as Unknown. Hosted verification of this change is recorded below when completed.

## Execution notes and limits

- One mobile task visit exceeded the 90-second `networkidle` wait. Retrying with DOM readiness and visible task controls returned 200, rendered the task and produced a screenshot without page errors or overflow. This is recorded as a readiness retry, not hidden as a first-attempt pass.
- An interaction-script locator initially matched both a button and disclosure with the same text. Selecting the exact button role resolved the test ambiguity.
- Screenshot review caught a saved light preference overriding the dark OS setting. The final dark-mode check explicitly sets the theme preference and verifies the rendered theme before capture.
- This is a signed-in hosted read-only visual/navigation walkthrough, not the complete mutation-based Studio acceptance checklist. New message streaming, new draft persistence, approval/export, model quality, roles other than owner, real mobile browser/keyboard behaviour, and provider operations were not exercised.
- The fresh automated browser has no pre-existing browser-local notes. Loading the notes route confirms availability, not preservation of another browser's local notes or successful import.

## Local evidence

Artifacts remain in the ignored `test-results/hosted-owner-ia/` directory:

- `report.json`: 18 page records, routes, headings, navigation, error/overflow observations and screenshot filenames.
- `interactions.json`: 11 passing interaction/theme checks.
- Screenshots: Today, Tasks, Kinnso, Results, Business, Settings, notes, redirect result, task detail, edit mode and the Taiwanese dark-theme spot check.

The screenshots contain the owner's real workspace and existing conversation content. They were not pushed to GitHub or published externally.
