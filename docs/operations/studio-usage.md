# Studio usage and cost telemetry (read-only)

`pnpm ops:studio-usage` prints a JSON report over the persisted Conversation Studio rows. It is the operational view of usage, latency and AI spend; it is **not** a product page.

## Privacy and safety

- Read-only: the script opens a `READ ONLY` transaction and only runs `SELECT`s.
- It never selects message `content` or the readable text inside `parts`. The only part kind it inspects is `warning`, to count failed turns. Workspace ids are optional scope, never printed with secrets.
- Requires the operator `DATABASE_URL` in the environment. Missing URL exits with code 2; a failed query exits 1 with a short message (no SQL, no connection details).

## Command

```powershell
# Last 30 days, all workspaces
pnpm ops:studio-usage

# One workspace, last 7 days
pnpm ops:studio-usage --days 7 --workspace-id <workspace-uuid>
```

Options: `--days` (1–365, default 30), `--workspace-id` (UUID), `--help`.

## Metrics

| Field | Meaning |
|---|---|
| `totals.conversations` | distinct conversations with at least one message in the window |
| `totals.owners` | distinct conversation creators in the window |
| `totals.userMessages` / `assistantMessages` | persisted turns by role |
| `totals.failedTurns` | assistant turns carrying a `warning` part (provider/stream failure) |
| `totals.inputTokens` / `outputTokens` / `costUsd` | sums of reported values; `unknownCostMessages` counts assistant turns with a null cost |
| `latencyMs.samples/average/p50/p95` | assistant reply time after the preceding user turn in the same conversation, by `seq` adjacency |
| `byIntent` | persisted assistant `intent`, `chat` when null |
| `byModel` | persisted model id, `unknown` when null |
| `byDay` | UTC day series of user/assistant turns and cost |

## Caveats

- Latency is **turn adjacency**, not model time: it includes queueing and any pre-answer work between the stored user row and the stored assistant row. It is a service-level signal, not a provider benchmark.
- A conversation whose rows fall outside the window contributes only the rows inside it.
- Costs come from the stored `cost_usd`; an unreported cost stays visible via `unknownCostMessages` and is summed as zero.
- Days are UTC. A workspace timezone report is a follow-up if operators need local-day alignment.
- This is an operator command only; it does not export per-member or per-message usage.

## Verification

- `lib/operations/studio-usage.test.ts` covers argument parsing/bounds.
- `test/integration/studio-usage.integration.test.ts` (owned PostgreSQL fixture, `NEON_INTEGRATION=1`) seeds two workspaces with adjacent turns, a warning part, tokens/costs and asserts scope, totals, latency, intents/models, daily series, the null-latency case and that no message text appears in the report.
