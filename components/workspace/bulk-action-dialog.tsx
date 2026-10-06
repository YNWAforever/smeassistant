"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PrototypeLocale } from "@/lib/copy";
import type { AssignmentPatch, BulkActionItem } from "@/lib/workspace/action-assignment";
import type { AssignmentResult } from "@/lib/workspace/bulk-action-updates";
import { workspaceDueTimestamp } from "@/lib/workspace/workspace-due-time";
import { formatDateTime } from "@/lib/workspace/format";
export interface SelectedAction extends BulkActionItem { title: string; closed: boolean }
export interface AssignmentMember { id: string; name: string }
const completed = (r: AssignmentResult) => r.status === "updated" || r.status === "no_change";
export function BulkActionSelection({ locale, workspaceId, timezone, items, cards, members }: {
  locale: PrototypeLocale; workspaceId: string; timezone: string; items: SelectedAction[]; cards: ReactNode[]; members: AssignmentMember[];
}) {
  const en = locale === "en";
  const text = (english: string, chinese: string) => en ? english : chinese;
  const [selected, setSelected] = useState<Map<string, SelectedAction>>(() => new Map());
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState("unchanged"), [due, setDue] = useState("unchanged"), [dueInput, setDueInput] = useState("");
  const [preview, setPreview] = useState<AssignmentResult[]>([]), [results, setResults] = useState<AssignmentResult[]>([]), [error, setError] = useState("");
  const resetPreview = () => { setPreview([]); setError(""); };
  const patch = (): AssignmentPatch => {
    const value: AssignmentPatch = {};
    if (assignee !== "unchanged") value.assignee_user_id = assignee === "clear" ? null : assignee;
    if (due !== "unchanged") value.due_at = due === "clear" ? null : workspaceDueTimestamp(dueInput, timezone);
    if (!Object.keys(value).length) throw new Error("empty_patch");
    return value;
  };
  async function request(mode: "preview" | "apply", selections: BulkActionItem[]) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/actions/bulk`, { method: "POST", headers: { "Content-Type": "application/json", "x-sme-locale": locale }, body: JSON.stringify({ mode, items: selections.map(i => ({ actionId: i.actionId, expectedUpdatedAt: i.expectedUpdatedAt })), patch: patch() }) });
      if (!response.ok) throw new Error("request_failed");
      const data = await response.json() as { results: AssignmentResult[] };
      if (!Array.isArray(data.results) || data.results.length !== selections.length || new Set(data.results.map(r => r.actionId)).size !== selections.length || data.results.some(r => !selections.some(i => i.actionId === r.actionId) || !["updated","no_change","forbidden","not_found","conflict","failed"].includes(r.status))) throw new Error("request_failed");
      if (mode === "preview") setPreview(data.results);
      else {
        setResults(previous => { const byId = new Map([...previous, ...preview, ...data.results].map(r => [r.actionId, r])); return [...selected.keys()].map(id => byId.get(id)!).filter(Boolean); });
        setPreview([]);
      }
    } catch (cause) {
      setPreview([]);
      setError(cause instanceof Error && ["invalid_workspace_due_time", "empty_patch"].includes(cause.message)
        ? text("Choose a change and a valid, unambiguous workspace time.", "請選擇變更及有效的工作台時間；不存在或重複的時間需重新選擇。")
        : text("The result is unknown. Read again and preview failed items before retrying.", "結果未能確認。重試前請重新讀取並預覽失敗項。"));
      if (mode === "apply") setResults(previous => { const byId = new Map(previous.map(r => [r.actionId, r])); for (const i of selections) byId.set(i.actionId, { actionId: i.actionId, status: "failed", eligible: false, reason: "unknown_result" }); return [...selected.keys()].map(id => byId.get(id) ?? { actionId: id, status: "forbidden" as const, eligible: false }); });
    } finally { setBusy(false); }
  }
  const ready = preview.filter(r => r.eligible && r.expectedUpdatedAt);
  const failures = results.filter(r => !completed(r));
  const status = (r: AssignmentResult) => ({ updated: text("Updated", "已更新"), no_change: text("Already set; no change", "設定相同，無需更改"), forbidden: text("Not eligible in current scope", "目前權限範圍不適用"), not_found: text("Unavailable", "無法存取"), conflict: text("Changed since preview; read again", "預覽後已變更，請重新讀取"), failed: text("Could not confirm; read again", "未能確認，請重新讀取") })[r.status];
  const valueText = (value: { assignee_user_id: string | null; due_at: string | null }) => `${members.find(m => m.id === value.assignee_user_id)?.name ?? (value.assignee_user_id ? text("Assigned member", "已指派成員") : text("Unassigned", "未指派"))} · ${value.due_at ? formatDateTime(value.due_at, locale, timezone) : text("No due date", "沒有到期日")}`;
  return <>
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span role="status">{text(`${selected.size} selected (maximum 50)`, `已選 ${selected.size} 項（最多 50 項）`)}</span>
      <Button variant="outline" disabled={!selected.size || busy} onClick={() => setSelected(new Map())}>{text("Clear selection", "清除選取")}</Button>
      <Dialog open={open} onOpenChange={next => { if (busy) return; setOpen(next); if (next) { setPreview([]); setResults([]); setError(""); } }}>
        <DialogTrigger asChild><Button disabled={!selected.size}>{text("Assign selected", "分派已選行動")}</Button></DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
          <DialogTitle>{text("Assign selected actions", "分派已選行動")}</DialogTitle>
          <DialogDescription>{text(`Review ${selected.size} selected items. Times use ${timezone}.`, `請審閱已選 ${selected.size} 項。時間使用 ${timezone}。`)}</DialogDescription>
          <label className="grid gap-1">{text("Assignee change", "負責人變更")}<select value={assignee} disabled={busy || results.length > 0} onChange={e => { setAssignee(e.target.value); resetPreview(); }} className="w-full rounded border p-2"><option value="unchanged">{text("Keep assignee", "保留負責人")}</option><option value="clear">{text("Clear assignee", "清除負責人")}</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="grid gap-1">{text("Due date change", "到期日變更")}<select value={due} disabled={busy || results.length > 0} onChange={e => { setDue(e.target.value); resetPreview(); }} className="w-full rounded border p-2"><option value="unchanged">{text("Keep due date", "保留到期日")}</option><option value="clear">{text("Clear due date", "清除到期日")}</option><option value="set">{text("Set due date", "設定到期日")}</option></select></label>
          {due === "set" && <label className="grid gap-1">{text(`Due time (${timezone})`, `到期時間（${timezone}）`)}<input type="datetime-local" value={dueInput} disabled={busy || results.length > 0} onChange={e => { setDueInput(e.target.value); resetPreview(); }} className="min-w-0 w-full rounded border p-2" /></label>}
          {error && <p role="alert">{error}</p>}
          {results.length > 0 && <p role="status">{text(`${results.filter(completed).length} of ${selected.size} completed. Review each result.`, `${selected.size} 項中 ${results.filter(completed).length} 項完成，請查看逐筆結果。`)}</p>}
          <ul className="grid gap-3 break-words">{(preview.length ? preview : results).map(r => <li key={r.actionId}><strong>{selected.get(r.actionId)?.title ?? text("Selected action", "已選行動")}</strong><p>{preview.length && r.eligible ? text("Eligible after review", "審閱後可變更") : status(r)}</p>{r.before && r.after && <p>{valueText(r.before)} → {valueText(r.after)}</p>}</li>)}</ul>
          <div className="flex flex-wrap gap-2">
            {!results.length && <Button variant="outline" disabled={busy} onClick={() => void request("preview", [...selected.values()])}>{text("Preview changes", "預覽變更")}</Button>}
            {failures.length > 0 && <Button variant="outline" disabled={busy} onClick={() => void request("preview", failures.map(r => selected.get(r.actionId)!))}>{text("Read again and preview failed items", "重新讀取並預覽失敗項")}</Button>}
            <Button disabled={busy || !ready.length} onClick={() => void request("apply", ready.map(r => ({ actionId: r.actionId, expectedUpdatedAt: r.expectedUpdatedAt! })))}>{text("Confirm changes", "確認變更")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    <div className="action-list">{items.length ? items.map((item, index) => <div key={item.actionId}><label className="flex min-h-11 items-center gap-2 py-2"><input type="checkbox" checked={selected.has(item.actionId)} disabled={item.closed || (!selected.has(item.actionId) && selected.size >= 50)} onChange={e => { setSelected(previous => { const next = new Map(previous); if (e.target.checked) next.set(item.actionId, item); else next.delete(item.actionId); return next; }); }} />{text(`Select ${item.title}`, `選取 ${item.title}`)}</label>{cards[index]}</div>) : <p>{text("No actions on this page. Change the filters or refresh the list.", "本頁沒有行動，請更改篩選或重新載入清單。")}</p>}</div>
  </>;
}
