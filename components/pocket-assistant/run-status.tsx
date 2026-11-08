import { CircleAlert, LoaderCircle } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"

export function AssistantRunStatus({ state, locale, mode = "demo" }: { state: "idle" | "running" | "failed"; locale: PrototypeLocale; mode?: "demo" | "live" }) {
  if (state === "idle") return null
  const t = copy[locale].assistantSheet.runStatus
  return (
    <div className={`assistant-run-status is-${state}`} role={state === "failed" ? "alert" : "status"}>
      {state === "running" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <div>
        <strong>{state === "running" ? (mode === "live" ? t.readingLive : t.readingDemo) : t.failed}</strong>
        <span>{state === "running" ? t.runningNote : t.failedNote}</span>
      </div>
    </div>
  )
}
