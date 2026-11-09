"use client"

import { X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import {
  addStudioConversationMember,
  listStudioConversationMembers,
  removeStudioConversationMember,
} from "@/lib/studio/client"
import { studioText } from "@/lib/studio/copy"
import type { StudioConversationMemberRole, StudioConversationMembersResponse } from "@/lib/studio/types"

/**
 * Owner-only sharing dialog for a persistent Studio conversation (v1.1 P1.3).
 * Members are resolved by the API from accepted workspace members; the dialog
 * never sends emails or invites. Viewers can read the thread, editors can
 * continue it.
 */
export function StudioShareDialog({
  locale,
  workspaceId,
  conversationId,
  onClose,
}: {
  locale: PrototypeLocale
  workspaceId: string
  conversationId: string
  onClose: () => void
}) {
  const t = studioText(locale)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [data, setData] = useState<StudioConversationMembersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [candidateId, setCandidateId] = useState("")
  const [role, setRole] = useState<StudioConversationMemberRole>("editor")

  // Dialog hygiene: focus the close button on open and let Escape dismiss it
  // from anywhere inside the dialog. No focus trap dependency is required for
  // this small owner-only surface; the backdrop blocks pointer interaction.
  useEffect(() => {
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function reload(): Promise<void> {
    const result = await listStudioConversationMembers(workspaceId, conversationId)
    if (result.ok) {
      setData(result.data)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    listStudioConversationMembers(workspaceId, conversationId)
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setData(result.data)
          setFailed(false)
        } else {
          setFailed(true)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setFailed(true)
        setLoading(false)
      })
    return () => { active = false }
  }, [workspaceId, conversationId])

  async function add(): Promise<void> {
    if (!candidateId || busy) return
    setBusy(true)
    const result = await addStudioConversationMember(workspaceId, conversationId, candidateId, role)
    setBusy(false)
    if (!result.ok) {
      setFailed(true)
      return
    }
    setCandidateId("")
    await reload()
  }

  async function remove(userId: string): Promise<void> {
    if (busy) return
    setBusy(true)
    const result = await removeStudioConversationMember(workspaceId, conversationId, userId)
    setBusy(false)
    if (!result.ok) {
      setFailed(true)
      return
    }
    await reload()
  }

  const candidates = data?.candidates ?? []

  return (
    <div className="studio-share-backdrop" role="presentation">
      <section className="studio-share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="studio-share-head">
          <h2 id={titleId}>{t.share.title}</h2>
          <button ref={closeRef} type="button" className="studio-icon-button" onClick={onClose} aria-label={t.share.close} title={t.share.close}>
            <X aria-hidden="true" />
          </button>
        </header>
        <p className="studio-share-hint">{t.share.hint}</p>
        {loading ? <p>{t.share.loading}</p> : null}
        {failed ? <p role="alert">{t.share.failed}</p> : null}
        {!loading && (
          <>
            <section aria-label={t.share.members}>
              <h3>{t.share.members}</h3>
              {data && data.members.length === 0 ? <p>{t.share.empty}</p> : null}
              <ul className="studio-share-members">
                {data?.members.map((member) => (
                  <li key={member.userId}>
                    <span><strong>{member.email}</strong><small>{member.role === "viewer" ? t.share.roleViewer : t.share.roleEditor}</small></span>
                    {data.canManage && <Button type="button" size="sm" variant="ghost" onClick={() => void remove(member.userId)} disabled={busy}>{t.share.remove}</Button>}
                  </li>
                ))}
              </ul>
            </section>
            {data?.canManage && candidates.length > 0 && (
              <section aria-label={t.share.candidates}>
                <h3>{t.share.candidates}</h3>
                <div className="studio-share-add">
                  <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} aria-label={t.share.candidates} disabled={busy}>
                    <option value="">{t.share.candidates}</option>
                    {candidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.email}</option>)}
                  </select>
                  <select value={role} onChange={(event) => setRole(event.target.value === "viewer" ? "viewer" : "editor")} aria-label={t.share.roleEditor} disabled={busy}>
                    <option value="editor">{t.share.roleEditor}</option>
                    <option value="viewer">{t.share.roleViewer}</option>
                  </select>
                  <Button type="button" size="sm" onClick={() => void add()} disabled={!candidateId || busy}>{t.share.add}</Button>
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </div>
  )
}
