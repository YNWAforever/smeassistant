"use client"

import Link from "next/link"
import { Check, FileText, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioArtifactPart } from "@/lib/studio/types"
import { saveAssistantVersion } from "@/lib/workspace/client"

import { studioErrorText } from "./studio-errors"

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; versionId: string; versionNo: number }
  | { kind: "error"; code: string }

/**
 * A draft the Studio produced, shown inline in the thread (design §3, §9).
 *
 * The card deliberately has NO approve, export or publish control: the Studio
 * gains no authority. "Save as a version" redeems the `draftRunId` the server
 * holds, so the version records the model's own text under `author_type =
 * 'agent'`; the owner then reviews and approves on the existing action page.
 * A viewer sees the same card without the save control plus the role boundary.
 */
export function StudioArtifactCard({
  locale,
  workspaceSlug,
  locationSlug,
  part,
  canSave,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  locationSlug: string
  part: StudioArtifactPart
  canSave: boolean
}) {
  const t = studioText(locale)
  const [state, setState] = useState<SaveState>({ kind: "idle" })

  const base = `/${locale}/owner/${workspaceSlug}`
  const location = locationSlug && locationSlug !== "all" ? `location=${encodeURIComponent(locationSlug)}` : ""
  const withLocation = (path: string, params: string[] = []) => {
    const query = [...params, location].filter(Boolean).join("&")
    return `${path}${query ? `?${query}` : ""}`
  }
  const actionHref = withLocation(`${base}/actions/${encodeURIComponent(part.actionId)}`)
  const reviewHref = state.kind === "saved"
    ? withLocation(`${base}/actions/${encodeURIComponent(part.actionId)}`, [`version=${encodeURIComponent(state.versionId)}`, "from=studio"])
    : null

  async function saveVersion() {
    if (!part.draftRunId || state.kind === "saving" || state.kind === "saved") return
    setState({ kind: "saving" })
    const result = await saveAssistantVersion(part.actionId, { assistant_run_id: part.draftRunId })
    if (!result.ok) {
      setState({ kind: "error", code: result.error })
      return
    }
    setState({ kind: "saved", versionId: result.data.versionId, versionNo: result.data.versionNo })
  }

  const saved = state.kind === "saved"

  return (
    <article className="studio-artifact-card" aria-label={t.message.artifactReady}>
      <header className="studio-artifact-head">
        <span className="studio-artifact-kicker">
          <FileText aria-hidden="true" />
          {t.message.artifactReady}
        </span>
        <Badge variant="outline">{part.actionTitle}</Badge>
      </header>
      <h3>{part.title}</h3>
      <div className="studio-artifact-body" dir="auto">{part.body}</div>
      {part.acceptanceCriteria.length > 0 && (
        <ul className="studio-artifact-acceptance">
          {part.acceptanceCriteria.map((criterion) => (
            <li key={criterion}><Check aria-hidden="true" /> <span>{criterion}</span></li>
          ))}
        </ul>
      )}
      <p className="studio-artifact-boundary"><ShieldCheck aria-hidden="true" /> {t.notices.boundary}</p>
      <div className="studio-artifact-actions">
        {canSave && part.draftRunId && !saved && (
          <Button type="button" size="sm" onClick={saveVersion} disabled={state.kind === "saving"}>
            {state.kind === "saving" ? t.message.savingVersion : t.message.saveVersion}
          </Button>
        )}
        {saved && reviewHref && (
          <Button asChild size="sm">
            <Link href={reviewHref}>{t.message.reviewVersion}</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{t.message.openAction}</Link>
        </Button>
        {saved && (
          <p className="studio-artifact-saved" role="status">
            {t.message.versionSaved}
            <span className="studio-artifact-version">v{state.versionNo}</span>
          </p>
        )}
        {state.kind === "error" && <p className="studio-artifact-error" role="alert">{studioErrorText(t, state.code)}</p>}
        {!canSave && <p className="studio-artifact-role">{t.notices.viewer}</p>}
        {canSave && !part.draftRunId && <p className="studio-artifact-role">{t.notices.noDraftTarget}</p>}
      </div>
    </article>
  )
}
