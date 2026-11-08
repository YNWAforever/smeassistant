import { AlertTriangle, LoaderCircle, MessageSquare, Save, WandSparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FactType } from "@/components/product-ui"
import { resolveText } from "@/lib/domain"
import { formatDateTime } from "@/lib/workspace/format"
import { sourceLabel } from "@/lib/workspace/source-label"
import type { ActionEditor } from "@/components/workspace/action-detail/use-action-editor"

/** The scanned reviews the next draft uses and the form for owner facts the agent asked for; it never guesses them. */
export function DraftInputs({ ed }: { ed: ActionEditor }) {
  const {
    ac, action, addOwnerReviewNote, approvedAssets, busy, canEdit, checklistCopy, checklistSteps, dirty,
    faqQuestionByKey, hydrated, inputs, inputValues, locale, neededKeys, reviewEvidence, scanInputCopy, selectedReviews,
    setInputValues, showInputForm, submitInputs, timezone, toggleReview
  } = ed
  return (
    <>
      {/* The scan already collected these; showing them is what replaces
          the blank "retype your reviews" form. Owner-typed text stays a
          clearly-labelled fallback below, never collected evidence. */}
      {reviewEvidence && (
        <div className="brand-check-panel">
          <div className="brand-check-head">
            <FactType type={reviewEvidence.factType} />
            <div>
              <strong>{scanInputCopy.heading}</strong>
              <span>{sourceLabel(action.evidence.source, locale)} · {formatDateTime(reviewEvidence.observedAt, locale, timezone)}</span>
            </div>
            <Badge variant="outline">{scanInputCopy.fromScan}</Badge>
          </div>
          <div className="version-list">
            {reviewEvidence.reviews.map((review) => (
              <div key={review.key}>
                <span>{canEdit
                  ? <Checkbox
                      checked={selectedReviews.includes(review.key)}
                      disabled={busy === "inputs"}
                      aria-label={`${scanInputCopy.include}: ${review.excerpt.slice(0, 60) || `★ ${review.rating}`}`}
                      onCheckedChange={(checked) => void toggleReview(review.key, checked === true)}
                    />
                  : <MessageSquare />}</span>
                <div>
                  <strong>{review.rating != null ? `★ ${review.rating}` : scanInputCopy.noOwnerReply}</strong>
                  <small>{review.excerpt}</small>
                  <small>{review.time ? formatDateTime(review.time, locale, timezone) : ""}</small>
                </div>
              </div>
            ))}
          </div>
          <p className="limitation-note">
            {scanInputCopy.selectedNote
              .replace("{n}", String(selectedReviews.length))
              .replace("{total}", String(reviewEvidence.reviews.length))}
          </p>
          <p className="limitation-note">
            <AlertTriangle />{" "}
            {scanInputCopy.limitation
              .replace("{inspected}", String(reviewEvidence.inspected))
              .replace("{unanswered}", String(reviewEvidence.available))}
            {reviewEvidence.populationCount != null
              ? scanInputCopy.population.replace("{total}", String(reviewEvidence.populationCount))
              : ""}
          </p>
          {canEdit && (
            <details>
              <summary>{scanInputCopy.addOwn}</summary>
              <div className="field-stack">
                <Textarea
                  id="input-owner-review"
                  rows={3}
                  value={inputValues.reviews_without_response ?? ""}
                  onChange={(event) => setInputValues((prev) => ({ ...prev, reviews_without_response: event.target.value }))}
                  disabled={!canEdit}
                />
                <small>{scanInputCopy.addOwnNote}</small>
                <div className="draft-editor-actions">
                  <Button
                    variant="outline"
                    onClick={() => void addOwnerReviewNote()}
                    disabled={!canEdit || dirty || !(inputValues.reviews_without_response ?? "").trim()}
                  >
                    {busy === "inputs" || busy === "run" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {scanInputCopy.addOwnSubmit}
                  </Button>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
      {showInputForm && (
        <form id="inputs" className="field-stack input-form" onSubmit={(event) => { event.preventDefault(); void submitInputs() }} aria-label={ac.editor.inputsAria}>
          <p className="limitation-note"><AlertTriangle /> {ac.editor.neverGuesses}</p>
          {neededKeys.map((key) => key === "asset_or_text_only" ? (
            <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{inputs[key] ?? key}</Label>
              <Select disabled={!hydrated} value={inputValues[key] ?? ""} onValueChange={(value) => setInputValues((prev) => ({ ...prev, [key]: value }))}>
                <SelectTrigger id={`input-${key}`} aria-label={inputs[key] ?? key}><SelectValue placeholder={ac.editor.assetPlaceholder} /></SelectTrigger>
                <SelectContent><SelectItem value="text_only">{ac.editor.textOnly}</SelectItem>{approvedAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}</SelectContent>
              </Select>
              {approvedAssets.length === 0 && <small>{ac.editor.noAssets} {ac.editor.textOnly}</small>}
            </div>
          ) : (
            <div key={key} className="field-stack"><Label htmlFor={`input-${key}`}>{faqQuestionByKey.get(key) ? resolveText(faqQuestionByKey.get(key)!.question, locale) : (inputs[key] ?? key)}</Label>{key.startsWith("owner_fact") || key === "menu_items" || key === "reviews_without_response" ? <Textarea id={`input-${key}`} rows={3} value={inputValues[key] ?? faqQuestionByKey.get(key)?.prefill ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} /> : <Input id={`input-${key}`} value={inputValues[key] ?? ""} onChange={(event) => setInputValues((prev) => ({ ...prev, [key]: event.target.value }))} disabled={!canEdit} />}{faqQuestionByKey.get(key)?.prefill && <small>{ac.editor.prefilled}</small>}</div>
          ))}
          <div className="draft-editor-actions"><Button type="submit" disabled={!canEdit || (!checklistSteps && dirty)}>{busy === "inputs" || busy === "run" ? <LoaderCircle className="animate-spin" /> : checklistSteps ? <Save /> : <WandSparkles />} {checklistSteps ? checklistCopy.saveInputs : ac.editor.saveAndGenerate}</Button></div>
        </form>
      )}
    </>
  )
}
