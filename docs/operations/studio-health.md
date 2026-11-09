# Studio provider health probe (production)

`POST /api/ops/studio-health` is the operator-gated production probe for the real LLM gateway. It performs the two shapes a Studio turn needs:

1. a strict JSON classifier completion (`response_format: json_object`);
2. a streamed plain-text answer.

It runs with the deployment's own `LLM_*` variables, touches no database, and returns only shape metadata — never prompt or answer text.

## Why it exists

The browser acceptance suite uses a fixture model, so it cannot prove the deployed gateway accepts the Studio shapes. In November 2026 production was configured with `LLM_MODEL=longcat-2.5-preview-free`; the gateway answered **HTTP 400 `server_error`** and owners saw “this turn could not answer”. A production probe makes that configuration failure visible without a second merchant report.

**Run it after any change to `LLM_MODEL`, `LLM_BASE_URL`, provider keys or gateway routing.** Treat a non-200 response as a blocked release.

## Setup

1. Generate a random token and add it as `STUDIO_HEALTH_TOKEN` to the **Production** environment only. Never expose it to the browser, never commit it, and rotate it after operator use if it was pasted anywhere.
2. Redeploy so the function receives the variable.
3. Call it from a trusted machine:

```powershell
$token = Read-Host -MaskInput "STUDIO_HEALTH_TOKEN"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method Post -Uri "https://smeassistant.vercel.app/api/ops/studio-health" -Headers $headers | ConvertTo-Json -Depth 5
```

Without the correct bearer token the route answers **404** before any gateway call.

## Response

```json
{
  "ok": true,
  "model": "deepseek-v4.1-flash",
  "latencyMs": 1234,
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
  "stream": { "ok": true, "streamed": true, "characters": 27 }
}
```

- `200` — both shapes pass.
- `502` — one shape failed; `classifier.code` / `stream.code` identify the shape, and `model` shows the configured model. Check the production function log for the safe `[llm] API error` diagnostic (`providerCode` / `providerType`), then fix the model/gateway configuration.
- `503` — the deployment has no configured gateway (`LLM_*`).
- `404` — missing/wrong token or `STUDIO_HEALTH_TOKEN` unset.

## Guardrails

- The token is the only authority; there is no session requirement and no user data involved.
- The probe uses small fixed prompts and does not select owner content or DB rows.
- The route is intentionally not linked from the UI.
- Rotate the token and remove it when no longer needed; a deployment without it answers 404.
