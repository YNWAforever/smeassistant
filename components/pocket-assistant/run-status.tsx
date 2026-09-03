import { CircleAlert, LoaderCircle } from "lucide-react"

export function AssistantRunStatus({ state, isChinese, mode = "demo" }: { state: "idle" | "running" | "failed"; isChinese: boolean; mode?: "demo" | "live" }) {
  if (state === "idle") return null
  return (
    <div className={`assistant-run-status is-${state}`} role={state === "failed" ? "alert" : "status"}>
      {state === "running" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <div>
        <strong>{state === "running" ? (mode === "live" ? (isChinese ? "正在讀取工作台證據快照" : "Reading the workspace evidence snapshot") : (isChinese ? "正在讀取固定示範證據" : "Reading the fixed demo evidence")) : (isChinese ? "暫時未能完成" : "The run could not complete")}</strong>
        <span>{state === "running" ? (isChinese ? "按 scan_id 保持 snapshot 分開，不會提交任意商戶資料。" : "Snapshots stay separated by scan ID; no arbitrary business data is submitted.") : (isChinese ? "現有內容仍保留，失敗不會扣除交付額。" : "Existing work is preserved and no delivery is consumed.")}</span>
      </div>
    </div>
  )
}
