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

## Still pending (owner/operator)

1. **15-point hosted browser acceptance** with a signed-in owner: owner/member roles, three locales, mobile, import, evidence, draft→version, privacy, limits, audit. Record the result here.
2. A live Studio turn from the owner account after the model switch (the latest production POST returned 200; the full UI flow needs the browser check).
3. `pnpm neon:readiness` against production requires the operator `DATABASE_URL`/`DATABASE_URL_UNPOOLED` pair; it has not been run from the local machine because the Vercel runtime URL is sensitive and cannot be decrypted locally.
4. Rotate/remove `STUDIO_HEALTH_TOKEN` after the release checks, or keep it only if a scheduled probe is intended.

## Rollback

Unset `CONVERSATION_STUDIO_ENABLED` and redeploy; the workbench reverts to local notes and the Studio routes 404. Conversations and migrations remain in place; no other feature reads them.
