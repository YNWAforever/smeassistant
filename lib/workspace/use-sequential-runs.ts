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
 * rows stay `idle`, and `onStop` is called once with the reason. A panel that
 * wants every row attempted regardless (the P4.1 offer panel treats a refusal as
 * that one draft failing) passes `stopOnRefusal: false`.
 */
export type RowState = "idle" | "generating" | "draft_ready" | "needs_input" | "failed"
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
  runAll(actionIds: string[]): Promise<void>
  retry(actionId: string): Promise<void>
}

/** The run's outcome as a row state. A needs-facts answer is a normal outcome, not a failure. */
export function classifyRun(result: ClientResult<RunActionResult>): Exclude<RowState, "idle" | "generating"> {
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
  // The latest callback, so a render between two runs never calls a stale onStop.
  const options = useRef(opts)
  useEffect(() => {
    options.current = opts
  })

  const runOne = useCallback(async (actionId: string): Promise<StopReason | null> => {
    setRows((current) => ({ ...current, [actionId]: "generating" }))
    const result = await runAction(actionId)
    setRows((current) => ({ ...current, [actionId]: classifyRun(result) }))
    setResults((current) => ({ ...current, [actionId]: result }))
    return refusalReason(result)
  }, [])

  const runAll = useCallback(
    async (actionIds: string[]) => {
      for (const actionId of actionIds) {
        const refused = await runOne(actionId)
        if (refused && options.current.stopOnRefusal !== false) {
          options.current.onStop?.(refused)
          return
        }
      }
    },
    [runOne],
  )

  const retry = useCallback(
    async (actionId: string) => {
      const refused = await runOne(actionId)
      if (refused && options.current.stopOnRefusal !== false) options.current.onStop?.(refused)
    },
    [runOne],
  )

  return { rows, results, runAll, retry }
}
