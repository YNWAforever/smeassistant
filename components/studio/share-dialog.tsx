"use client"

import { X } from "lucide-react"
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { useStudioOverlay } from "./use-studio-overlay"

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
  returnFocusRef,
}: {
  locale: PrototypeLocale
  workspaceId: string
  conversationId: string
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
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

  const dialogRef = useRef<HTMLElement>(null)
  const candidateRef = useRef<HTMLSelectElement>(null)
  const memberButtons = useRef(new Map<string, HTMLButtonElement>())
  const mutationFocus = useRef<{ trigger: HTMLButtonElement; kind: "add" | "remove"; index: number; accepted: boolean } | null>(null)
  useStudioOverlay({ active: true, rootRef: dialogRef, initialFocusRef: closeRef, returnFocusRef, onClose })

  // Resolve focus after the refreshed rows and enabled controls have committed.
  // A user who moved to another control while waiting keeps that focus.
  useLayoutEffect(() => {
    if (busy) return
    const pending = mutationFocus.current
    if (!pending) return
    mutationFocus.current = null
    if (document.activeElement !== document.body && document.activeElement !== pending.trigger) return
    const buttons = (data?.members ?? []).flatMap(member => {
      const button = memberButtons.current.get(member.userId)
      return button ? [button] : []
    })
    const target = !pending.accepted && pending.trigger.isConnected
      ? pending.trigger
      : pending.kind === "remove"
        ? buttons[Math.min(pending.index, buttons.length - 1)] ?? candidateRef.current ?? closeRef.current
        : candidateRef.current ?? closeRef.current
    target?.focus({ preventScroll: true })
  }, [busy, data])

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

  async function add(trigger: HTMLButtonElement): Promise<void> {
    if (!candidateId || busy) return
    const focus = document.activeElement === trigger ? { trigger, kind: "add" as const, index: 0, accepted: false } : null
    mutationFocus.current = focus
    setBusy(true)
    try {
      const result = await addStudioConversationMember(workspaceId, conversationId, candidateId, role)
      if (!result.ok) {
        setFailed(true)
        return
      }
      if (focus) focus.accepted = true
      setCandidateId("")
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string, trigger: HTMLButtonElement): Promise<void> {
    if (busy) return
    const index = data?.members.findIndex(member => member.userId === userId) ?? 0
    const focus = document.activeElement === trigger ? { trigger, kind: "remove" as const, index: Math.max(0, index), accepted: false } : null
    mutationFocus.current = focus
    setBusy(true)
    try {
      const result = await removeStudioConversationMember(workspaceId, conversationId, userId)
      if (!result.ok) {
        setFailed(true)
        return
      }
      if (focus) focus.accepted = true
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const candidates = data?.candidates ?? []

  return (
    <div className="studio-share-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="studio-share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
                    {data.canManage && (
                      <Button
                        ref={button => {
                          if (button) memberButtons.current.set(member.userId, button)
                          else memberButtons.current.delete(member.userId)
                        }}
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`${t.share.remove}: ${member.email}`}
                        onClick={event => void remove(member.userId, event.currentTarget)}
                        disabled={busy}
                      >
                        {t.share.remove}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            {data?.canManage && candidates.length > 0 && (
              <section aria-label={t.share.candidates}>
                <h3>{t.share.candidates}</h3>
                <div className="studio-share-add">
                  <select ref={candidateRef} value={candidateId} onChange={(event) => setCandidateId(event.target.value)} aria-label={t.share.candidates} disabled={busy}>
                    <option value="">{t.share.candidates}</option>
                    {candidates.map((candidate) => <option key={candidate.userId} value={candidate.userId}>{candidate.email}</option>)}
                  </select>
                  <select value={role} onChange={(event) => setRole(event.target.value === "viewer" ? "viewer" : "editor")} aria-label={t.share.permission} disabled={busy}>
                    <option value="editor">{t.share.roleEditor}</option>
                    <option value="viewer">{t.share.roleViewer}</option>
                  </select>
                  <Button type="button" size="sm" onClick={event => void add(event.currentTarget)} disabled={!candidateId || busy}>{t.share.add}</Button>
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </div>
  )
}
