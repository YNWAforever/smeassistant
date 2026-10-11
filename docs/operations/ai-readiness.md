# AI / Auth readiness — 2026-10-12 remediation (T06 / T18)

This is a release preparation packet. It does not authorize configuration writes, migration, deployment, paid calls or email. Main `ca9ecb34138aa3e0f3f330e5c03727ce4c4a9746` and production `301be115702c313bdf0a3cfa984518a00b6d98da` differ. Production alias readback was READY on `dpl_4H8u4jXti2KHdT2HAVGCEYm1SMmz`.

## Read-only evidence

Connector env metadata returned 403. The authenticated local CLI succeeded against the exact project. Only key/type/target/decrypted metadata is retained in `docs/audits/2026-10-12-remediation/evidence/T06-T18-env-metadata.json`. No values are retained. OPENCODE_API_KEY, LLM_API_KEY, OPENROUTER_KEY, LLM_BASE_URL and LLM_MODEL have production and preview entries. Their existence proves neither a nonempty selected credential nor its binding to this deployed build, provider health, budget or runtime success. `llmConfigured()` is unknown on the current deployment; the audit's failed generation is historical evidence, not a new live test.

APP_ORIGIN has separate production and preview entries. DATABASE_URL, NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET were listed for production only. Preview Auth/DB prerequisites therefore remain unknown, not ready. CRON_SECRET exists for both targets; that does not activate scheduling. No contextual/AI-pause/budget entry was returned in the selected metadata. Defaults and deployment bindings must still be confirmed.

## Exact configuration contract

Keep `@neondatabase/auth` at 0.5.0-beta. Auth URL must be the selected branch's Auth endpoint, cookie secret at least 32 characters, APP_ORIGIN the exact callback origin registered with that provider, and DATABASE_URL the same authorized branch with the restricted runtime role and migration journal. Never mix a production Auth session with a disposable database branch. Do not expose a DB URL or credential in browser props or logs.

LLM configuration is captured when the server module loads. A configuration change requires an explicitly authorized matching deployment; a project entry alone is insufficient. Resolution in `lib/llm.ts`: OpenCode base selects OPENCODE_API_KEY then LLM_API_KEY; OpenRouter base selects OPENROUTER_KEY; another explicit base uses those aliases in that order. Default base/model follow the selected gateway. Validate only presence, allowlisted hostname and approved model ID in a secure operator session. Never print key contents, key length, hashes, prompts or provider response bodies. Unknown token usage/cost stays null.

## Operator execution packet

1. Name the authorized environment/branch, candidate SHA, deployment, fixture workspace/action/actor and time window; approve separate scope for any secret write, migration or deployment. Save the previous deployment and configuration in the operator's secure vault.
2. Check branch host/database/runtime role and journal read-only with existing `neon:readiness`; apply only separately approved new migrations. Confirm matching Auth callback and verified owner membership with a foreign-denial control. Billing, publishing and cron gates remain under their existing contracts.
3. Confirm AI pause/budget and selected provider locally on that deployed process using a privileged server-only presence check, without exporting values. Refuse generation while configuration is unknown or unconfigured.
4. Separately authorize one exact fixture action/model call and maximum budget, with no mail or publishing. Confirm queue/start precede the call, one terminal run, reported usage or null, immutable brand revision, preview retained server-side and owner-selected version creation. A lost response requires read-only reconciliation before any second paid request.
5. Complete daily-workflow and PR63/64/65 cases on the matching candidate deployment, retaining every blocked/not-tested case. Do not translate local fixtures or HTTP 200 into hosted acceptance.

Rollback: restore the prior explicitly approved deployment/configuration. Pause AI if the provider is unhealthy using the existing authorized switch. Retain action_runs, usage, previews, versions and audit events; do not erase evidence or retry uncertain provider work. Hosted T06/T18 remain blocked pending branch/configuration validation and scoped change/call authorization.
