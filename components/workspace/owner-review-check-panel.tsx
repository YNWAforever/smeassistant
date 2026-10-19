"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordOwnerCheck } from "@/lib/workspace/client";
import { ownerCheckBusinessLink, ownerCheckNextStep, parseOwnerCheck, type OwnerCheckContext, type OwnerCheckDecision, type OwnerCheckRecord } from "@/lib/workspace/owner-review-check";
import { formatDateTime } from "@/lib/workspace/format";
import type { PrototypeLocale } from "@/lib/copy";
import { zhFor } from "@/lib/zh-tw";
import { resolveText } from "@/lib/domain";

export interface OwnerReviewCheckPanelProps {
  locale: PrototypeLocale;
  workspaceId: string;
  actionId: string;
  version: { id: string; version_no: number; body: string };
  latestVersionId: string;
  identity: string;
  timezone: string;
  mapsUrl: string | null;
  context: OwnerCheckContext;
  approvedAssets: Array<{ id: string; filename: string }>;
  canEdit: boolean;
  offline: boolean;
  dirty: boolean;
  onSaved(): void;
  onReload(): void;
}

export function OwnerReviewCheckPanel(props: OwnerReviewCheckPanelProps) {
  return <OwnerReviewCheckEditor key={`${props.workspaceId}:${props.actionId}:${props.version.id}`} {...props} />;
}

function OwnerReviewCheckEditor(props: OwnerReviewCheckPanelProps) {
  const { version, context, locale } = props;
  const fieldId = useId();
  const text = (en: string, zh: string) => locale === "en" ? en : zhFor(locale, zh);
  const label = (decision: OwnerCheckDecision) => ({
    checked: text("Owner checked · statement only", "店主已核對 · 店主聲明"),
    not_found: text("Not found / content differs", "未找到／內容不符"),
    later: text("Check deferred", "稍後再核對"),
    retracted: text("Owner check withdrawn", "店主核對已撤回"),
  })[decision];
  const [decision, setDecision] = useState<OwnerCheckDecision>("checked");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [assetId, setAssetId] = useState("");
  const [confirmed, setConfirmed] = useState([false, false, false]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<OwnerCheckRecord | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const acceptingRefresh = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const currentServerRecord = context.records.find(record => record.versionId === version.id);
  const baseline = useRef({ latestVersionId: props.latestVersionId, recordId: currentServerRecord?.id ?? null });
  useEffect(() => {
    if (!acceptingRefresh.current) return;
    baseline.current = { latestVersionId: props.latestVersionId, recordId: currentServerRecord?.id ?? null };
    acceptingRefresh.current = false;
    setError(null); // Only explicit refresh adopts a new base; entered notes remain.
  }, [props.latestVersionId, currentServerRecord?.id, context]);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const rows = [...new Map([...(saved ? [saved] : []), ...context.records].map(row => [row.id, row])).values()]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const current = rows.find(row => row.versionId === version.id);
  const appliedVersion = context.appliedVersionIds.includes(version.id);
  const data = { decision, reviewReference: reference, note, evidenceAssetId: assetId || null,
    confirmBusiness: confirmed[0], confirmReview: confirmed[1], confirmReply: confirmed[2] };
  const fingerprint = JSON.stringify(data);
  const stale = error === "stale_check" || error === "stale_version" || error === "idempotency_conflict";
  const allowed = props.canEdit && !props.offline && !props.dirty && (appliedVersion || decision === "retracted" && Boolean(current)) && !context.unavailable && !stale;
  const mapsLink = ownerCheckBusinessLink(props.mapsUrl);
  const errorMessage = (code: string) => {
    if (["stale_check", "stale_version", "idempotency_conflict"].includes(code)) return text("Another tab or a newer version changed the saved records. Your input is retained; reload saved records before retrying.", "其他分頁或新版本已更新紀錄。你的輸入已保留；請先重新讀取已儲存紀錄。");
    if (code === "confirm_all") return text("Confirm the business, specified review and saved reply first.", "請先確認商戶、指定評論及已儲存回覆。");
    if (code === "review_reference_required") return text("Enter a reference that identifies the review.", "請填寫可識別指定評論的資料。");
    if (code === "note_required" || code === "previous_check_required") return text("Explain what was not found or why this check is being withdrawn.", "請說明未找到／不符之處，或撤回這項核對的原因。");
    if (code === "invalid_evidence") return text("The existing evidence is no longer available for this branch. Choose another reference.", "這項既有證據不再適用於此分店，請重新選擇。");
    if (code === "not_applied") return text("This saved version is no longer marked as applied. Reload its history.", "這個已儲存版本已沒有有效的已套用聲明，請重新讀取歷史。");
    if (code === "forbidden" || code === "not_found") return text("You cannot record a check for this action. Your input is retained.", "你沒有此行動的核對記錄權限。輸入已保留。");
    return text("Check not saved. Your input is retained; retry when available.", "核對未儲存。輸入已保留，請稍後重試。");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !allowed || fingerprint === savedFingerprint) return;
    const fullFingerprint = JSON.stringify({ ...data, ...baseline.current });
    if (request.current?.fingerprint !== fullFingerprint) request.current = { fingerprint: fullFingerprint, id: crypto.randomUUID() };
    const parsed = parseOwnerCheck({ ...data, versionId: version.id, latestVersionId: baseline.current.latestVersionId,
      expectedRecordId: baseline.current.recordId, requestId: request.current.id });
    if (!parsed.ok) { setError(parsed.error); return; }
    pending.current = true; setSaving(true); setError(null);
    const result = await recordOwnerCheck(props.actionId, { ...parsed.command, locale });
    pending.current = false;
    if (!active.current) return;
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    if (!result.data?.record?.id || result.data.record.versionId !== version.id || result.data.record.independent !== false) {
      setError("unavailable"); return;
    }
    setSaved(result.data.record); setSavedFingerprint(fingerprint);
    baseline.current.recordId = result.data.record.id;
    props.onSaved();
  }

  return <section className="owner-review-check mt-5 border-t pt-5" aria-label={text("Owner check", "店主核對")}>
    <h3 className="font-semibold">{text("Owner check", "店主核對")} · {text(`Version ${version.version_no}`, `第 ${version.version_no} 版`)}</h3>
    <p>{text("This is your statement, not independent verification. A screenshot also remains owner-provided evidence.", "這是你的聲明，並非獨立驗證。截圖同樣只屬店主提供的證據。")}</p>
    <p className="font-medium" data-testid="current-owner-check">{current ? label(current.decision) : text("No owner check for this version.", "此版本尚未有店主核對。")}</p>
    {current && <p>{text("Next:", "下一步：")} {resolveText(ownerCheckNextStep(current.decision), locale)}</p>}
    <ol className="my-3 list-decimal space-y-2 pl-5">
      <li>{text("Match the business and branch:", "核對商戶及分店：")} {props.identity}</li>
      <li>{text("Find the specified review. No exact review link is available; manual location is required.", "定位指定評論。沒有精確評論連結，必須人工定位。")}
        {mapsLink && <p><a href={mapsLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">{text("Open business Maps page (not the exact review)", "開啟商戶 Maps 頁（並非指定評論）")}</a></p>}
      </li>
      <li>{text("Compare the reply with this saved version. Do not change it here.", "將回覆與這個已儲存版本比對；此處不修改草稿。")}
        <details><summary>{text("View saved reply", "查看已儲存回覆")}</summary><pre className="whitespace-pre-wrap break-words rounded border p-3">{version.body}</pre></details>
      </li>
    </ol>
    {!appliedVersion && <p>{text("This version has no active applied statement. Select the version that was applied; older checks never apply to a new draft.", "此版本未有有效的已套用聲明。請選擇已套用的版本；舊版核對不會套用到新草稿。")}</p>}
    {!props.canEdit && <p>{text("Your current role can read checks but cannot record them.", "你目前的權限可查看核對紀錄，但不能新增。")}</p>}
    {props.dirty && <p>{text("Save or discard draft edits before checking a saved version.", "請先儲存或放棄草稿修改，再核對已儲存版本。")}</p>}
    {context.unavailable && <p role="alert">{text("Saved checks could not be read. Reload before recording a check.", "無法讀取已儲存核對，請先重新讀取。")}</p>}
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-1"><label htmlFor={`${fieldId}-result`}>{text("Check result", "核對結果")}</label>
        <select id={`${fieldId}-result`} value={decision} onChange={e => setDecision(e.target.value as OwnerCheckDecision)} className="rounded-md border bg-transparent p-2" disabled={saving}>
          <option value="checked">{text("Owner checked", "店主已核對")}</option>
          <option value="not_found">{text("Not found / content differs", "未找到／內容不符")}</option>
          <option value="later">{text("Check later", "稍後再核對")}</option>
          {current && <option value="retracted">{text("Withdraw the previous check", "撤回上一筆核對")}</option>}
        </select>
      </div>
      <div className="grid gap-1"><label htmlFor={`${fieldId}-reference`}>{text("Review reference", "評論識別資料")}</label><Input id={`${fieldId}-reference`} value={reference} maxLength={500} required={decision === "checked"} onChange={e => setReference(e.target.value)} disabled={saving} /></div>
      <small>{text("For example, reviewer, date and the opening words. This is a manual reference, not a verified review ID.", "例如作者、日期及原文開首。這是人工識別資料，並非已驗證評論 ID。")}</small>
      <fieldset className="grid gap-2" disabled={saving}>
        <legend>{text("Confirm before recording an owner check", "記錄已核對前請逐項確認")}</legend>
        {[text("Business and branch match", "商戶及分店相符"), text("I found and matched the specified review", "已找到並比對指定評論"), text("The reply matches this saved version", "回覆與此已儲存版本相符")].map((item, index) =>
          <label key={index} className="flex items-start gap-2"><input type="checkbox" required={decision === "checked"} checked={confirmed[index]} onChange={e => setConfirmed(current => current.map((value, i) => i === index ? e.target.checked : value))} />{item}</label>)}
      </fieldset>
      <div className="grid gap-1"><label htmlFor={`${fieldId}-note`}>{text("Notes (optional)", "備註（可選）")}</label><Textarea id={`${fieldId}-note`} value={note} required={decision === "not_found" || decision === "retracted"} maxLength={2000} onChange={e => setNote(e.target.value)} disabled={saving} /></div>
      <small>{text("Explain a missing/mismatched reply or a withdrawal. Those outcomes require a note. Later records a deferral, not a schedule.", "未找到／內容不符或撤回時，必須填寫說明。「稍後」只記錄選擇，不會建立排程。")}</small>
      {props.approvedAssets.length > 0 && <div className="grid gap-1"><label htmlFor={`${fieldId}-evidence`}>{text("Existing evidence reference (optional)", "既有證據參照（可選）")}</label>
        <select id={`${fieldId}-evidence`} className="rounded-md border bg-transparent p-2" value={assetId} onChange={e => setAssetId(e.target.value)} disabled={saving}>
          <option value="">{text("No attachment", "不附加")}</option>
          {props.approvedAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
        </select>
      </div>}
      <p className="text-sm">{text("Recording a check does not generate, approve, export, copy or publish content and consumes no delivery allowance. Recording time is saved by the server.", "記錄核對不會生成、核准、匯出、複製或發佈內容，亦不扣交付用量。記錄時間由伺服器保存。")}</p>
      {error && <p role="alert">{errorMessage(error)}</p>}
      <p role="status" aria-live="polite">{saving ? text("Saving…", "儲存中…") : saved && fingerprint === savedFingerprint ? text("Saved", "已儲存") : text("New check entry not saved", "新核對紀錄尚未儲存")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!allowed || saving || fingerprint === savedFingerprint}>{text("Save check", "儲存核對")}</Button>
        {(stale || context.unavailable || error === "not_applied") && <Button type="button" variant="outline" onClick={() => { acceptingRefresh.current = true; props.onReload(); }}>{text("Reload saved records", "重新讀取已儲存紀錄")}</Button>}
      </div>
    </form>
    <details className="mt-4">
      <summary>{text("Owner check history (recent records and each version's latest check)", "店主核對歷史（最近紀錄及各版最新核對）")}</summary>
      <ol className="grid gap-3 pt-3">{rows.map(row => <li key={row.id} className="rounded border p-3">
        <strong>{label(row.decision)}</strong><p>{formatDateTime(row.recordedAt, locale, props.timezone)} · {row.versionId === version.id ? text(`Version ${version.version_no}`, `第 ${version.version_no} 版`) : text("Another saved version — not applied here", "其他已儲存版本，不套用於此版")}</p>
        {row.previousId && <small>{text("New record corrects or withdraws the earlier check; the original is retained.", "此筆更正或撤回較早核對；原紀錄仍保留。")}</small>}
        {row.reviewReference && <p>{row.reviewReference}</p>}{row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
        {row.evidenceAssetId && <p>{text("Owner evidence reference:", "店主證據參照：")} {row.evidenceLabel ?? text("Existing asset (currently unavailable)", "既有素材（目前不可用）")}</p>}
      </li>)}</ol>
    </details>
  </section>;
}
