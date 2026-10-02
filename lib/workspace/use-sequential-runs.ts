"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { runAction, type ClientResult, type RunActionResult } from "@/lib/workspace/client"

/**
 * One-at-a-time draft runs, shared by the offer promotion panel and the starter
 * pack. Each run is its own request through the ordinary run route, so spend
 * budgets, the AI pause and the pre-model gate apply per item, unchanged.
 *
 * `runAll` runs the given actions in order and, when a run is refused because AI
 * is paused or the spend budget is reached, stops: no later action is run, later
 * rows stay `idle`, the refused row is `paused` (never `failed`: nothing went
 * wrong with that draft, it can be continued later), and `onStop` is called once
 * with the reason. A panel that wants every row attempted regardless (the P4.1
 * offer panel treats a refusal as that one draft failing) passes
 * `stopOnRefusal: false`; its refused rows stay `failed`.
 *
 * When the loop reaches an action whose row is no longer idle (a Retry already
 * ran it, or is running it), the loop skips it, so one action is never run twice
 * by the same browser. A `paused` row counts as idle: continuing runs it again.
 */
export type RowState = "idle" | "generating" | "draft_ready" | "needs_input" | "failed" | "paused"
export type StopReason = "ai_paused" | "ai_budget_reached"

export interface SequentialRunsOptions {
  onStop?: (reason: StopReason) => void
  /** Default true. */
  stopOnRefusal?: boolean
}

export interface SequentialRuns {
  rows: Record<string, RowState>
  /** The last answer each action's run got, for callers that explain a row in words. */
  results: Record<string, ClientResult<RunActionResult> | undefined>
  /** A `runAll` or `retry` is in flight. */
  running: boolean
  runAll(actionIds: string[]): Promise<void>
  retry(actionId: string): Promise<void>
}

/** The run's outcome as a row state. A needs-facts answer is a normal outcome, not a failure. */
export function classifyRun(result: ClientResult<RunActionResult>): Exclude<RowState, "idle" | "generating" | "paused"> {
  if (!result.ok) return "failed"
  if (result.data.factsNeeded?.length) return "needs_input"
  if (result.data.state === "failed") return "failed"
  return "draft_ready"
}

function refusalReason(result: ClientResult<RunActionResult>): StopReason | null {
  if (result.ok) return null
  return result.error === "ai_paused" || result.error === "ai_budget_reached" ? result.error : null
}

export function useSequentialRuns(opts: SequentialRunsOptions = {}): SequentialRuns {
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [results, setResults] = useState<SequentialRuns["results"]>({})
  const [inFlight, setInFlight] = useState(0)
  // The latest callback, so a render between two runs never calls a stale onStop.
  const options = useRef(opts)
  useEffect(() => {
    options.current = opts
  })
  // The rows as of now, read by the loop between runs (state would be a render behind).
  const current = useRef<Record<string, RowState>>({})

  const setRow = useCallback((actionId: string, state: RowState) => {
    current.current = { ...current.current, [actionId]: state }
    setRows(current.current)
  }, [])

  const tracked = useCallback(async (work: () => Promise<void>) => {
    setInFlight((count) => count + 1)
    try {
      await work()
    } finally {
      setInFlight((count) => count - 1)
    }
  }, [])

  /** Runs one action; returns the refusal reason when the refusal stops the caller. */
  const runOne = useCallback(
    async (actionId: string): Promise<StopReason | null> => {
      setRow(actionId, "generating")
      const result = await runAction(actionId)
      const refused = options.current.stopOnRefusal !== false ? refusalReason(result) : null
      setRow(actionId, refused ? "paused" : classifyRun(result))
      setResults((latest) => ({ ...latest, [actionId]: result }))
      return refused
    },
    [setRow],
  )

  const runAll = useCallback(
    (actionIds: string[]) =>
      tracked(async () => {
        for (const actionId of actionIds) {
          const row = current.current[actionId]
          if (row !== undefined && row !== "idle" && row !== "paused") continue
          const refused = await runOne(actionId)
          if (refused) {
            options.current.onStop?.(refused)
            return
          }
        }
      }),
    [runOne, tracked],
  )

  const retry = useCallback(
    (actionId: string) =>
      tracked(async () => {
        const refused = await runOne(actionId)
        if (refused) options.current.onStop?.(refused)
      }),
    [runOne, tracked],
  )

  return { rows, results, running: inFlight > 0, runAll, retry }
}
