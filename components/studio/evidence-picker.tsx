"use client"

import { FileText, Paperclip, Search, X } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioCitationRef } from "@/lib/studio/types"

type DocumentWire = { id: string; title: string; truncated: boolean }
type BriefWire = {
  id: string
  approvedAt: string | null
  brief: Record<string, { title?: string }> | null
}

const DOCUMENTS_URL = (workspaceId: string, locationId: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/conversation/documents?location_id=${encodeURIComponent(locationId)}`
const BRIEFS_URL = (workspaceId: string, locationId: string) =>
  `/api/workspaces/${encodeURIComponent(workspaceId)}/conversation/search?location_id=${encodeURIComponent(locationId)}`

function refKey(ref: StudioCitationRef): string {
  return ref.source === "document" ? `document:${ref.documentVersionId}` : `search_brief:${ref.searchBriefId}`
}

/**
 * v1.1 evidence picker: attach workbench documents and approved search briefs
 * to the next Studio turn. The server re-reads every selected item in scope; the
 * picker only carries identity and title. Selection is capped at five items.
 */
export function StudioEvidencePicker({
  locale,
  workspaceId,
  locationId,
  selected,
  onChange,
  disabled = false,
}: {
  locale: PrototypeLocale
  workspaceId: string
  locationId: string | null
  selected: StudioCitationRef[]
  onChange: (refs: StudioCitationRef[]) => void
  disabled?: boolean
}) {
  const t = studioText(locale)
  const [open, setOpen] = useState(false)
  const [loadedLocation, setLoadedLocation] = useState<string | null>(null)
  const [failedLocation, setFailedLocation] = useState<string | null>(null)
  const [documents, setDocuments] = useState<DocumentWire[]>([])
  const [briefs, setBriefs] = useState<Array<{ id: string; title: string }>>([])
  const panelId = useId()
  const atLimit = selected.length >= 5

  const loading = open && locationId !== null && loadedLocation !== locationId && failedLocation !== locationId
  const failed = locationId !== null && failedLocation === locationId
  const ready = locationId !== null && loadedLocation === locationId

  useEffect(() => {
    if (!open || !locationId) return
    const controller = new AbortController()
    let active = true
    Promise.all([
      fetch(DOCUMENTS_URL(workspaceId, locationId), { credentials: "same-origin", signal: controller.signal })
        .then(async (response) => (response.ok ? (await response.json()) as { versions?: unknown } : null))
        .then((data) => (Array.isArray(data?.versions) ? (data!.versions as DocumentWire[]).filter((item) => item && typeof item.id === "string" && typeof item.title === "string") : [])),
      fetch(BRIEFS_URL(workspaceId, locationId), { credentials: "same-origin", signal: controller.signal })
        .then(async (response) => (response.ok ? (await response.json()) as { records?: unknown } : null))
        .then((data) => (Array.isArray(data?.records) ? (data!.records as BriefWire[]) : []))
        .then((records) => records
          .filter((record) => record && typeof record.id === "string" && record.approvedAt && record.brief && typeof record.brief === "object")
          .map((record) => {
            const localized = record.brief?.[locale] ?? record.brief?.en ?? null
            const title = localized && typeof localized.title === "string" ? localized.title : ""
            return title ? { id: record.id, title } : null
          })
          .filter((item): item is { id: string; title: string } => item !== null)),
    ])
      .then(([nextDocuments, nextBriefs]) => {
        if (!active) return
        setDocuments(nextDocuments)
        setBriefs(nextBriefs)
        setLoadedLocation(locationId)
        setFailedLocation(null)
      })
      .catch((error) => {
        if (!active) return
        if ((error as { name?: string }).name !== "AbortError") setFailedLocation(locationId)
      })
    return () => { active = false; controller.abort() }
  }, [open, locationId, workspaceId, locale])

  function toggle(ref: StudioCitationRef) {
    const key = refKey(ref)
    const existing = selected.some((item) => refKey(item) === key)
    if (existing) {
      onChange(selected.filter((item) => refKey(item) !== key))
      return
    }
    if (atLimit) return
    onChange([...selected, ref])
  }

  function isSelected(ref: StudioCitationRef): boolean {
    const key = refKey(ref)
    return selected.some((item) => refKey(item) === key)
  }

  return (
    <div className="studio-evidence">
      <div className="studio-evidence-head">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled || !locationId}
        >
          <Paperclip aria-hidden="true" />
          {t.evidence.title}
          {selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
        {selected.map((ref) => (
          <span className="studio-evidence-chip" key={refKey(ref)}>
            {ref.source === "document" ? <FileText aria-hidden="true" /> : <Search aria-hidden="true" />}
            <span>{ref.title}</span>
            <button type="button" aria-label={`${t.evidence.remove}: ${ref.title}`} onClick={() => toggle(ref)} disabled={disabled}>
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      {open && (
        <div className="studio-evidence-panel" id={panelId} role="group" aria-label={t.evidence.title}>
          {!locationId ? <p>{t.evidence.hint}</p> : null}
          {locationId && loading ? <p>{t.evidence.loading}</p> : null}
          {locationId && failed ? <p role="alert">{t.evidence.failed}</p> : null}
          {ready && documents.length === 0 && briefs.length === 0 ? <p>{t.evidence.empty}</p> : null}
          {ready && documents.length > 0 && (
            <section aria-label={t.evidence.documents}>
              <p className="studio-evidence-group">{t.evidence.documents}</p>
              <ul>
                {documents.map((document) => {
                  const ref: StudioCitationRef = { source: "document", documentVersionId: document.id, title: document.title, truncated: document.truncated };
                  return (
                    <li key={document.id}>
                      <label>
                        <input type="checkbox" checked={isSelected(ref)} onChange={() => toggle(ref)} disabled={disabled || (atLimit && !isSelected(ref))} />
                        <span>{document.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {ready && briefs.length > 0 && (
            <section aria-label={t.evidence.briefs}>
              <p className="studio-evidence-group">{t.evidence.briefs}</p>
              <ul>
                {briefs.map((brief) => {
                  const ref: StudioCitationRef = { source: "search_brief", searchBriefId: brief.id, title: brief.title, truncated: false };
                  return (
                    <li key={brief.id}>
                      <label>
                        <input type="checkbox" checked={isSelected(ref)} onChange={() => toggle(ref)} disabled={disabled || (atLimit && !isSelected(ref))} />
                        <span>{brief.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <p className="studio-evidence-limit">{t.evidence.limit}</p>
        </div>
      )}
    </div>
  )
}
