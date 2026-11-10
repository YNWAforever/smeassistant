# Conversation Studio — production evidence (2026-11-10)

This records the Phase A production checks after the Studio was enabled. It is evidence, not an authorization to change hosted configuration.

## Configuration

| Item | Value |
|---|---|
| Production deployment | `smeassistant.vercel.app` (latest `main`; branch deploy during the provider fix, replaced by the merged main deployment) |
| Hosted Neon project / branch | `morning-hill-92255530` / `production` |
| Journal | **22** — `0022_studio_conversation_members.sql` |
| `CONVERSATION_HOME_ENABLED` | `true` |
| `CONVERSATION_STUDIO_ENABLED` | `true` |
| `LLM_MODEL` | `deepseek-v4.1-flash` |
| `STUDIO_HEALTH_TOKEN` | set in Production only (operator probe; not in the browser) |

The LLM model was changed from `longcat-2.5-preview-free`, which the OpenCode gateway rejected with **HTTP 400 `server_error`**; every Studio turn failed before the change.

## Provider probe

`POST /api/ops/studio-health` with the operator token (see `docs/operations/studio-health.md`). Final call:

```json
{
  "ok": true,
  "model": "deepseek-v4.1-flash",
  "checks": {
    "classifierCompleted": true,
    "classifierJsonParsed": true,
    "classifierIntentAnswer": true,
    "streamCompleted": true,
    "streamUsedDeltas": true,
    "streamTextNonEmpty": true,
    "deltasMatchText": true
  },
  "classifier": { "ok": true },
  "stream": { "ok": true, "streamed": true, "characters": 32 }
}
```

One earlier probe returned `classifierJsonParsed: false` while the streamed answer succeeded; the next probe returned a strict `{"intent":"answer"}`. Treat intermittent classifier JSON as a prompt/model robustness follow-up (the orchestrator already degrades to a grounded answer).

## Route / auth checks

- `POST /api/studio/conversations/import` with an empty body → **400 invalid_input** (flags pass; no 404).
- Signed-out `/api/studio/conversations` → **401 unauthenticated**.
- Signed-out `/zh-HK/owner/eldage/conversation` and `/conversation/studio` → **307 to sign-in** (routes exist).

## Database checks (owner read-only)

- journal 22 with the exact 0022 name/checksum.
- `studio_conversation_members`: RLS true, one `server_application` policy, two indexes, expected FKs + editor/viewer check, `sme_app_runtime` DML.
- `docs/operations/check-missing-columns.sql` → 0 rows.

## Readiness (executed)

- Result: **ready** against `production` / `neondb` (journal, schema, runtime role and privileges all passed).
- Method: temporary least-privilege login role, dropped immediately; no Vercel secret changed.

## Hosted acceptance (owner-reported 2026-11-11)

- The owner ran the §5 15-point hosted browser checklist against production with a signed-in owner account and reported **all checks correct** ("all correct" in the release thread).
- The owner's post-apply read-only check returned `[{"last_migration":22}]`: journal max ordinal 22 and no missing-column rows.
- The checklist covered Today/workbench entry, the Studio shell, a streamed evidence-grounded turn, reload persistence, the absence of Studio approve/export/publish controls, the IG starter, save-as-version, exact-version review/approval, delivery, locales, roles, mobile, import, privacy and limits.
- No failure was reported; the automated isolated acceptance loop and the production probe were already green before this confirmation.


## Rollback

Unset `CONVERSATION_STUDIO_ENABLED` and redeploy; the workbench reverts to local notes and the Studio routes 404. Conversations and migrations remain in place; no other feature reads them.

## Phase B — IG draft handoff

- The IG starter asks for a caption + carousel outline, offers save-as-version and action-page approval, and requires confirmed facts only.
- Studio context links each open action to its action detail page and offers owners/managers a Create a new action link (location-scoped), so a missing social action is one click away.
- The orchestrator covers a `generate_social` draft producing a `social_post` artifact with its action, version, run id and acceptance criteria; saving remains an explicit action-page step and Studio never approves or exports.
- After saving, the review link carries `?version=<id>&from=studio`; the action page shows a trilingual handoff banner ("Studio draft saved") that points the owner at editing, approving the exact version, and returning to the Studio. The banner adds no authority and never publishes.
- Redeeming the same assistant draft twice (reload, retry) returns the version it already became; the route is idempotent and creates no duplicate versions.
- The isolated acceptance suite covers the full option-B loop end to end: IG starter -> fixture draft -> Save as a version -> exact-version handoff banner -> approve -> Copy-text delivery -> return to the same conversation (local run 21.6s; runs in the CI acceptance stage).
- Owner-confirmed on the hosted app as part of the 2026-11-11 acceptance above.
- The action detail header now links in-scope owners/managers to `conversation/studio?location=…&action=…` while the action is open; the Studio re-validates the id against its authorised briefing and starts a fresh context-scoped conversation.

