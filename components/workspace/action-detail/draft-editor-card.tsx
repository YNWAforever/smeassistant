import Link from "next/link"
import { AlertTriangle, Check, CheckCircle2, CircleAlert, FileImage, LoaderCircle, RefreshCw, Save, ShieldAlert, ShieldCheck, Tag, WandSparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { FactType, SectionCard } from "@/components/product-ui"
import { copy } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import { t } from "@/lib/i18n"
import { fill } from "@/lib/copy-ui"
import { runErrorLabel } from "@/lib/assistant/draft-failure"
import { formatOfferDate } from "@/lib/workspace/offer-format"
import { effortLabel, formatDateTime, stateLabel } from "@/lib/workspace/format"
import { originLabel } from "@/components/workspace/action-detail/helpers"
import { guardrailText } from "@/lib/workspace/guardrail-text"
import { DraftInputs } from "@/components/workspace/action-detail/draft-inputs"
import { editorStep } from "./owner-steps"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** The draft card: source context, inputs, the editor with its guardrail check, and the owner's applied assertion. */
export function DraftEditorCard({ ed }: { ed: ActionEditor }) {
  const {
    ac, action, altText, approvedAssets, base, businessContext, busy, canEdit, canGenerate,
    checklistCopy, checklistSteps, comparing, conflict, content, createAssistantVersion, dirty, generate, guardrailBadge,
    guardrailFlags, lastRunError, loadLatest, locale, location, needsRunReconciliation, offer, offersCopy,
    pendingSelect, resolveConflict, router, saveBeforeGenerationMessage, saveDraft, saveFailed,
    selectedVersion, setAltText, setContent, showInputForm, social, timezone, verified, verifiedOn, versionId, versionName,
    versions, workspaceId
  } = ed
  const step = editorStep(ed)
  return (
    <SectionCard className="draft-editor-card">
      <div className="section-card-heading"><div>{checklistSteps && <p className="eyebrow">{checklistSteps.where}</p>}<h2>{checklistSteps ? checklistCopy.heading : step === 0 ? ac.ownerSteps.edit : step === 1 ? ac.ownerSteps.confirm : ac.ownerSteps.send}</h2></div><details><summary>{copy[locale].ownerFocus.why}</summary><Badge variant="outline">{checklistSteps ? stateLabel(action.actionState, locale) : versionName}</Badge>{!checklistSteps && selectedVersion && <Badge variant="outline">{originLabel(selectedVersion.origin, locale)}</Badge>}</details></div>
      {social && approvedAssets.length > 0 && <div className="asset-reference"><span><FileImage /></span><div><strong>{approvedAssets[0].filename}</strong><small>{fill(ac.editor.approvedAsset, { n: approvedAssets.length })}</small></div><Badge variant="outline">{ac.editor.approved}</Badge></div>}
      <details className="owner-disclosure"><summary>{copy[locale].ownerFocus.why}</summary><div className="original-context"><FactType type={action.evidence.factType} /><div><strong>{ac.editor.sourceFinding}</strong><p>{resolveText(action.evidence.detail, locale)}</p><small>{formatDateTime(action.evidence.observedAt, locale, timezone)} · {ac.editor.sourcePreserved}</small></div></div></details>
      {offer && (
        <div className="brand-check-panel" data-testid="offer-card">
          <div className="brand-check-head">
            <Tag />
            <div><strong>{offersCopy.card.heading}</strong><span>{offer.title}</span></div>
            <Badge variant="outline">{offer.expired ? offersCopy.status.expired : offersCopy.status[offer.status]}</Badge>
          </div>
          <dl className="asset-meta">
            <div><dt>{offersCopy.meta.price}</dt><dd>{offer.priceText ?? offersCopy.meta.noPrice}</dd></div>
            <div><dt>{offersCopy.meta.valid}</dt><dd>{offersCopy.meta.range.replace("{from}", formatOfferDate(offer.validFrom, locale)).replace("{until}", formatOfferDate(offer.validUntil, locale))}</dd></div>
            <div><dt>{offersCopy.meta.revision}</dt><dd>{offer.revision}</dd></div>
          </dl>
        </div>
      )}
      {/* P2.3 item 17: what the NEXT draft will be grounded in, shown
          before generation -- not only the guardrail badge that judges
          a draft after the fact. Collapsed by default to stay compact. */}
      {businessContext.length > 0 && (
        <details className="brand-check-panel">
          <summary><strong>{ac.editor.businessDetails}</strong> <span>{ac.editor.businessDetailsHint}</span></summary>
          <dl className="asset-meta">
            {businessContext.map((row) => (
              <div key={row.key}>
                <dt>{resolveText(row.label, locale)}</dt>
                <dd>{resolveText(row.value, locale)} <small>({resolveText(row.origin, locale)})</small></dd>
              </div>
            ))}
          </dl>
          <p className="limitation-note"><Link href={`${base}/business/profile`}>{ac.editor.editInBrand}</Link></p>
        </details>
      )}
      {checklistSteps && (
        <div className="brand-check-panel">
          <div className="brand-check-head"><Check /><div><strong>{checklistCopy.heading}</strong><span>{checklistSteps.where}</span></div><Badge variant="outline">{effortLabel(action.effortMinutes, locale)}</Badge></div>
          <ol className="evidence-list">{checklistSteps.steps.map((step) => <li key={step}><CheckCircle2 /> <span>{step}</span></li>)}</ol>
          <p className="limitation-note"><AlertTriangle /> {checklistCopy.note}</p>
        </div>
      )}
      {step === 0 && <DraftInputs ed={ed} />}
      {!checklistSteps && (<>
      <div className="field-stack"><Label htmlFor="draft-content">{social ? ac.editor.caption : ac.editor.draft}</Label><Textarea id="draft-content" value={content} onChange={(event) => setContent(event.target.value)} readOnly={step !== 0} rows={social ? 8 : 7} disabled={step === 0 && !canEdit} placeholder={selectedVersion ? undefined : ac.editor.placeholder} /><div className="field-helper-row"><span>{content.length} {ac.editor.characters}</span><span>{selectedVersion ? formatDateTime(selectedVersion.created_at, locale, timezone) : ""}</span></div></div>
      {step !== 0 && altText && <details><summary>{copy[locale].ownerFocus.why}</summary><p>{ac.editor.altText}: {altText}</p></details>}
      {step === 0 && (social || altText) && <div className="field-stack"><Label htmlFor="alt-text">{ac.editor.altText}</Label><Textarea id="alt-text" value={altText} onChange={(event) => setAltText(event.target.value)} rows={3} disabled={!canEdit} /><small>{ac.editor.altTextNote}</small></div>}
      {/* The agents compute guardrail violations and artifacts.ts
          persists them into meta.warnings, but nothing ever read them
          back: this panel showed a hard-coded "1 reminder" on every
          draft, so a prohibited brand term or a compensation promise
          looked exactly like a clean one to the person approving it. */}
      <details className="owner-disclosure"><summary>{copy[locale].ownerFocus.why}</summary><div className="brand-check-panel"><div className="brand-check-head"><ShieldCheck /><div><strong>{ac.editor.guardrailTitle}</strong><span>{ac.editor.guardrailSubtitle}</span></div><Badge variant="outline">{guardrailBadge}</Badge></div>
        {guardrailFlags.length > 0
          ? <ul className="evidence-list">{guardrailFlags.map((flag, index) => <li key={`${flag.code}-${index}`}><AlertTriangle /> <span>{guardrailText(flag, locale)}</span></li>)}</ul>
          : <p><ShieldCheck /> {selectedVersion?.checked
              ? ac.editor.checkedClean
              : ac.editor.notAgentChecked}</p>}
        {(selectedVersion?.agentNotes ?? []).map((note) => <p key={note} className="limitation-note"><AlertTriangle /> {note}</p>)}
        <p className="limitation-note">{ac.editor.noInventedFacts}</p></div></details>
      {needsRunReconciliation && <div className="conflict-state" role="alert"><CircleAlert /><div><strong>{ac.editor.reconcileTitle}</strong><p>{ac.editor.reconcileBody}</p><Button variant="outline" onClick={() => window.location.reload()}>{ac.editor.reconcileReload}</Button></div></div>}
      {lastRunError && <p className="limitation-note" role="alert"><CircleAlert /> {ac.editor.lastRunFailed}{runErrorLabel(locale, lastRunError)}</p>}
      {pendingSelect && <div className="draft-editor-actions" role="status"><span>{t(locale, "editor.waitingForVersion")}</span><Button variant="outline" onClick={() => router.refresh()}>{t(locale, "editor.retryVersion")}</Button></div>}
      {step === 0 && <><div className="draft-editor-actions"><ContextualAssistant locale={locale} surface={social ? "create" : "action"} triggerLabel={ac.editor.reviseWithOperator} mode="live" context={{ workspaceId, locationId: action.location.id ?? undefined, actionId: action.id, versionId: selectedVersion?.id }} basePath={base} locationParam={location} reviewDraft={action.templateKey === "review-response"} onCreateVersion={dirty ? undefined : createAssistantVersion} disabled={!canEdit || dirty} /><Button variant="outline" onClick={() => void generate()} disabled={!canGenerate || showInputForm}>{busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {selectedVersion ? ac.editor.regenerate : ac.editor.generate}</Button><Button onClick={() => void saveDraft()} disabled={!canEdit || !dirty}>{busy === "save" ? <LoaderCircle className="animate-spin" /> : <Save />} {ac.editor.saveManual}</Button></div>
      {selectedVersion && ed.editingVersionId === selectedVersion.id && <Button variant="ghost" disabled={dirty || !canEdit} onClick={() => ed.setEditingVersionId(null)}>{locale === "zh-HK" ? "睇返儲存嗰版" : "Review saved text"}</Button>}
      <p role="status" aria-live="polite">{busy === "save" ? ac.editor.saving : pendingSelect ? t(locale, "editor.waitingForVersion") : saveFailed ? ac.editor.saveFailed : dirty ? ac.editor.unsaved : selectedVersion ? fill(ac.editor.saved, { version: versionName }) : ac.editor.noSavedDraft}</p>
      {comparing && <section className="field-stack" aria-label={ac.editor.compareAria}>
        {versions[0] && versions[0].id !== versionId ? <>
          <Label htmlFor="latest-saved-draft">{ac.editor.latestSaved}</Label>
          <Textarea id="latest-saved-draft" value={versions[0].body} readOnly rows={7} />
          {versions[0].alt_text && <p>{ac.editor.altTextPrefix}{versions[0].alt_text}</p>}
          <p>{ac.editor.compareHelp}</p>
          <div className="draft-editor-actions">
            <Button onClick={() => resolveConflict(true)}>{fill(ac.editor.keepEdits, { n: versions[0].version_no })}</Button>
            <Button variant="outline" onClick={() => resolveConflict(false)}>{ac.editor.discardEdits}</Button>
          </div>
        </> : <p role="status">{ac.editor.waitingLatest}</p>}
      </section>}
      {dirty && <p className="limitation-note">{saveBeforeGenerationMessage}</p>}
      {conflict && <div className="conflict-state" role="alert"><ShieldAlert /><div><strong>{ac.editor.conflictTitle}</strong><p>{ac.editor.conflictBody}</p><Button size="sm" onClick={loadLatest}><RefreshCw /> {ac.editor.loadLatest}</Button></div></div>}
      </>}
      </>)}
      {/* The assertion control, offered for checklist and drafted
          actions alike. Before: an offer to record what the owner tells
          us. After: the date they said it, and that nobody verified it. */}
      {/* Visibility is role-and-scope only, deliberately not `canEdit`:
          that also carries hydration and busy state, so gating the
          markup on it would make the control vanish server-side and
          mid-request. A viewer has nothing to assert, so they get no
          control at all rather than a disabled one. */}
      {!checklistSteps && <details className="owner-disclosure"><summary>{copy[locale].ownerFocus.why}</summary>
        <AppliedAssertion ed={ed} />
      </details>}
      {checklistSteps && <AppliedAssertion ed={ed} />}
      {verified && <p className="limitation-note">{t(locale, "verified.confirmedOn", { date: verifiedOn })}</p>}
    </SectionCard>
  )
}

function AppliedAssertion({ ed }: { ed: ActionEditor }) {
  const { canAssert, applied, appliedOn, locale, canEdit, retractApplied, markApplied, busy } = ed
  return <>
      {!canAssert ? null : applied ? (
        <div className="approved-state">
          <CheckCircle2 />
          <div>
            <strong>{t(locale, "applied.assertedOn", { date: appliedOn })}</strong>
            <span>{t(locale, "applied.retractHint")}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void retractApplied()} disabled={!canEdit}>{busy === "applied" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {t(locale, "applied.retract")}</Button>
        </div>
      ) : (
        <div className="draft-editor-actions">
          <Button onClick={() => void markApplied()} disabled={!canEdit}>{busy === "applied" ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />} {locale === "zh-HK" ? "我做完" : t(locale, "applied.markButton")}</Button>
          <p className="limitation-note">{t(locale, "applied.markHint")}</p>
        </div>
      )}
    </>
}
