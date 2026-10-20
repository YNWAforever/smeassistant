"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordOwnerCheck } from "@/lib/workspace/client";
import { ownerCheckBusinessLink, ownerCheckNextStep, parseOwnerCheck, type OwnerCheckContext, type OwnerCheckDecision, type OwnerCheckRecord } from "@/lib/workspace/owner-review-check";
import { formatDateTime } from "@/lib/workspace/format";
import { copy, homeReviewCopy, type PrototypeLocale } from "@/lib/copy";
import { resolveText } from "@/lib/domain";
import { fill } from "@/lib/copy-ui";

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
  /** Server-derived owner home URL. A full navigation reads the saved state afresh. */
  returnHomeHref?: string;
}

export function OwnerReviewCheckPanel(props: OwnerReviewCheckPanelProps) {
  return <OwnerReviewCheckEditor key={`${props.workspaceId}:${props.actionId}:${props.version.id}`} {...props} />;
}

function OwnerReviewCheckEditor(props: OwnerReviewCheckPanelProps) {
  const { version, context, locale } = props;
  const fieldId = useId();
  const pc = copy[locale].workspaceBusiness.ownerCheck;
  const label = (decision: OwnerCheckDecision) => ({
    checked: pc.ownerCheckedStatementOnly,
    not_found: pc.notFoundContentDiffers,
    later: pc.checkDeferred,
    retracted: pc.ownerCheckWithdrawn,
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
  const hasInput = reference !== "" || note !== "" || assetId !== "" || confirmed.some(Boolean) || decision !== "checked";
  const returnBlocked = saving || props.dirty || Boolean(error) || hasInput && fingerprint !== savedFingerprint;
  useEffect(() => {
    if (!props.returnHomeHref || !returnBlocked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [props.returnHomeHref, returnBlocked]);
  const stale = error === "stale_check" || error === "stale_version" || error === "idempotency_conflict";
  const allowed = props.canEdit && !props.offline && !props.dirty && (appliedVersion || decision === "retracted" && Boolean(current)) && !context.unavailable && !stale;
  const mapsLink = ownerCheckBusinessLink(props.mapsUrl);
  const errorMessage = (code: string) => {
    if (["stale_check", "stale_version", "idempotency_conflict"].includes(code)) return pc.anotherTabOrA;
    if (code === "confirm_all") return pc.confirmTheBusinessSpecified;
    if (code === "review_reference_required") return pc.enterAReferenceThat;
    if (code === "note_required" || code === "previous_check_required") return pc.explainWhatWasNot;
    if (code === "invalid_evidence") return pc.theExistingEvidenceIs;
    if (code === "not_applied") return pc.thisSavedVersionIs;
    if (code === "forbidden" || code === "not_found") return pc.youCannotRecordA;
    return pc.checkNotSavedYour;
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

  return <section className="owner-review-check mt-5 border-t pt-5" aria-label={pc.ownerCheck}>
    <h3 className="font-semibold">{pc.ownerCheck} · {fill(pc.version, { version_no: version.version_no })}</h3>
    <p>{pc.thisIsYourStatement}</p>
    <p className="font-medium" data-testid="current-owner-check">{current ? label(current.decision) : pc.noOwnerCheckFor}</p>
    {current && <p>{pc.next} {resolveText(ownerCheckNextStep(current.decision), locale)}</p>}
    <ol className="my-3 list-decimal space-y-2 pl-5">
      <li>{pc.matchTheBusinessAnd} {props.identity}</li>
      <li>{pc.findTheSpecifiedReview}
        {mapsLink && <p><a href={mapsLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">{pc.openBusinessMapsPage}</a></p>}
      </li>
      <li>{pc.compareTheReplyWith}
        <details><summary>{pc.viewSavedReply}</summary><pre className="whitespace-pre-wrap break-words rounded border p-3">{version.body}</pre></details>
      </li>
    </ol>
    {!appliedVersion && <p>{pc.thisVersionHasNo}</p>}
    {!props.canEdit && <p>{pc.yourCurrentRoleCan}</p>}
    {props.dirty && <p>{pc.saveOrDiscardDraft}</p>}
    {context.unavailable && <p role="alert">{pc.savedChecksCouldNot}</p>}
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-1"><label htmlFor={`${fieldId}-result`}>{pc.checkResult}</label>
        <select id={`${fieldId}-result`} value={decision} onChange={e => setDecision(e.target.value as OwnerCheckDecision)} className="rounded-md border bg-transparent p-2" disabled={saving}>
          <option value="checked">{pc.ownerChecked}</option>
          <option value="not_found">{pc.notFoundContentDiffers}</option>
          <option value="later">{pc.checkLater}</option>
          {current && <option value="retracted">{pc.withdrawThePreviousCheck}</option>}
        </select>
      </div>
      <div className="grid gap-1"><label htmlFor={`${fieldId}-reference`}>{pc.reviewReference}</label><Input id={`${fieldId}-reference`} value={reference} maxLength={500} required={decision === "checked"} onChange={e => setReference(e.target.value)} disabled={saving} /></div>
      <small>{pc.forExampleReviewerDate}</small>
      <fieldset className="grid gap-2" disabled={saving}>
        <legend>{pc.confirmBeforeRecordingAn}</legend>
        {[pc.businessAndBranchMatch, pc.iFoundAndMatched, pc.theReplyMatchesThis].map((item, index) =>
          <label key={index} className="flex items-start gap-2"><input type="checkbox" required={decision === "checked"} checked={confirmed[index]} onChange={e => setConfirmed(current => current.map((value, i) => i === index ? e.target.checked : value))} />{item}</label>)}
      </fieldset>
      <div className="grid gap-1"><label htmlFor={`${fieldId}-note`}>{pc.notesOptional}</label><Textarea id={`${fieldId}-note`} value={note} required={decision === "not_found" || decision === "retracted"} maxLength={2000} onChange={e => setNote(e.target.value)} disabled={saving} /></div>
      <small>{pc.explainAMissingMismatched}</small>
      {props.approvedAssets.length > 0 && <div className="grid gap-1"><label htmlFor={`${fieldId}-evidence`}>{pc.existingEvidenceReferenceOptional}</label>
        <select id={`${fieldId}-evidence`} className="rounded-md border bg-transparent p-2" value={assetId} onChange={e => setAssetId(e.target.value)} disabled={saving}>
          <option value="">{pc.noAttachment}</option>
          {props.approvedAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
        </select>
      </div>}
      <p className="text-sm">{pc.recordingACheckDoes}</p>
      {error && <p role="alert">{errorMessage(error)}</p>}
      <p role="status" aria-live="polite">{saving ? pc.saving : saved && fingerprint === savedFingerprint ? pc.saved : pc.newCheckEntryNot}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!allowed || saving || fingerprint === savedFingerprint}>{pc.saveCheck}</Button>
        {(stale || context.unavailable || error === "not_applied") && <Button type="button" variant="outline" onClick={() => { acceptingRefresh.current = true; props.onReload(); }}>{pc.reloadSavedRecords}</Button>}
      </div>
    </form>
    {props.returnHomeHref && <div className="mt-4">
      {returnBlocked
        ? <><Button type="button" variant="outline" disabled>{homeReviewCopy[locale].returnHome}</Button>
          <p className="text-sm">{homeReviewCopy[locale].returnBlocked}</p></>
        : <Button asChild variant="outline"><a href={props.returnHomeHref}>{homeReviewCopy[locale].returnHome}</a></Button>}
    </div>}
    <details className="mt-4">
      <summary>{pc.ownerCheckHistoryRecent}</summary>
      <ol className="grid gap-3 pt-3">{rows.map(row => <li key={row.id} className="rounded border p-3">
        <strong>{label(row.decision)}</strong><p>{formatDateTime(row.recordedAt, locale, props.timezone)} · {row.versionId === version.id ? fill(pc.version, { version_no: version.version_no }) : pc.anotherSavedVersionNot}</p>
        {row.previousId && <small>{pc.newRecordCorrectsOr}</small>}
        {row.reviewReference && <p>{row.reviewReference}</p>}{row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
        {row.evidenceAssetId && <p>{pc.ownerEvidenceReference} {row.evidenceLabel ?? pc.existingAssetCurrentlyUnavailable}</p>}
      </li>)}</ol>
    </details>
  </section>;
}
