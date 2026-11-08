"use client"

import { Archive, Check, MessagesSquare, Pencil, Plus, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioConversation } from "@/lib/studio/types"

import { studioConversationLabel, studioErrorText } from "./studio-errors"

const DAY_MS = 86_400_000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function recencyBucket(iso: string, now: Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (diff <= 0) return "today"
  if (diff === 1) return "yesterday"
  return iso.slice(0, 10)
}

/**
 * Recency headers are derived with Intl rather than hard-coded words, so the
 * three served locales get "Today" / "今日" / "今天" without a copy key. The
 * date fallback is the ISO day; it is stable between server and browser.
 */
function bucketLabel(bucket: string, locale: PrototypeLocale, fallback: string): string {
  try {
    if (bucket === "today" || bucket === "yesterday") {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(bucket === "today" ? 0 : -1, "day")
    }
    const [year, month, day] = bucket.split("-").map(Number)
    if (!year || !month || !day) return fallback
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)))
  } catch {
    return fallback
  }
}

/**
 * Persistent conversation list (design §3 "Conversation rail"): recency
 * grouping, search, new conversation, rename and archive. Every row belongs to
 * the signed-in member; selecting one loads it through the API rather than
 * trusting the client-side list. On narrow screens the same element is the
 * full-height drawer opened from the header.
 */
export function StudioConversationRail({
  locale,
  conversations,
  activeId,
  disabled,
  open,
  onClose,
  onSelect,
  onNew,
  onArchive,
  onRename,
}: {
  locale: PrototypeLocale
  conversations: StudioConversation[]
  activeId: string | null
  disabled: boolean
  open: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onArchive: (id: string) => void
  onRename: (id: string, title: string) => Promise<boolean>
}) {
  const t = studioText(locale)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && closeButton.current) closeButton.current.focus()
  }, [open])

  const groups = useMemo(() => {
    const now = new Date()
    const needle = query.trim().toLocaleLowerCase(locale)
    const filtered = conversations
      .filter((conversation) => (needle ? studioConversationLabel(t, conversation.title).toLocaleLowerCase(locale).includes(needle) : true))
      .slice()
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || b.id.localeCompare(a.id))
    const result: Array<{ bucket: string; label: string; items: StudioConversation[] }> = []
    for (const conversation of filtered) {
      const bucket = recencyBucket(conversation.lastMessageAt, now)
      const last = result[result.length - 1]
      if (last && last.bucket === bucket) last.items.push(conversation)
      else result.push({ bucket, label: bucketLabel(bucket, locale, t.rail.untitled), items: [conversation] })
    }
    return result
  }, [conversations, query, locale, t])

  async function submitRename() {
    if (!editing) return
    const title = editing.value.trim()
    if (title.length === 0 || renameBusy) {
      setEditing(null)
      return
    }
    setRenameBusy(true)
    setRenameError(false)
    const ok = await onRename(editing.id, title)
    setRenameBusy(false)
    if (ok) setEditing(null)
    else setRenameError(true)
  }

  return (
    <aside className="studio-rail" data-open={open ? "true" : "false"} aria-label={t.rail.listLabel}>
      <header className="studio-rail-head">
        <h2>{t.rail.title}</h2>
        <div className="studio-rail-head-actions">
          <button type="button" className="studio-icon-button" onClick={onNew} disabled={disabled} aria-label={t.rail.newChat} title={t.rail.newChat}>
            <Plus aria-hidden="true" />
          </button>
          <button ref={closeButton} type="button" className="studio-icon-button studio-drawer-close" onClick={onClose} aria-label={t.rail.close}>
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="studio-rail-search">
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="studio-rail-search">{t.rail.search}</label>
        <input
          id="studio-rail-search"
          ref={search}
          type="search"
          value={query}
          placeholder={t.rail.search}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>
      {groups.length === 0 ? (
        <div className="studio-rail-empty">
          <MessagesSquare aria-hidden="true" />
          <p><strong>{t.rail.emptyTitle}</strong><span>{t.rail.emptyBody}</span></p>
        </div>
      ) : (
        <nav className="studio-rail-list" aria-label={t.rail.listLabel}>
          {groups.map((group) => (
            <section key={group.bucket} className="studio-rail-group">
              <h3 suppressHydrationWarning>{group.label}</h3>
              <ul>
                {group.items.map((conversation) => {
                  const active = conversation.id === activeId
                  const title = studioConversationLabel(t, conversation.title)
                  if (editing?.id === conversation.id) {
                    return (
                      <li key={conversation.id} className="studio-rail-item is-editing">
                        <form
                          className="studio-rail-rename"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void submitRename()
                          }}
                        >
                          <label className="sr-only" htmlFor={`studio-rename-${conversation.id}`}>{t.rail.rename}</label>
                          <input
                            id={`studio-rename-${conversation.id}`}
                            autoFocus
                            value={editing.value}
                            maxLength={80}
                            onChange={(event) => setEditing({ id: conversation.id, value: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setEditing(null)
                            }}
                          />
                          <button type="submit" className="studio-icon-button" aria-label={t.rail.rename} disabled={renameBusy}>
                            <Check aria-hidden="true" />
                          </button>
                          <button type="button" className="studio-icon-button" aria-label={t.rail.close} onClick={() => setEditing(null)}>
                            <X aria-hidden="true" />
                          </button>
                        </form>
                      </li>
                    )
                  }
                  return (
                    <li key={conversation.id} className="studio-rail-item" data-active={active ? "true" : undefined} data-archived={conversation.status === "archived" ? "true" : undefined}>
                      <button
                        type="button"
                        className="studio-rail-select"
                        onClick={() => onSelect(conversation.id)}
                        disabled={disabled}
                        aria-current={active ? "page" : undefined}
                        title={title}
                      >
                        <MessagesSquare aria-hidden="true" />
                        <span>{title}</span>
                      </button>
                      <span className="studio-rail-item-actions">
                        <button
                          type="button"
                          className="studio-icon-button"
                          disabled={disabled}
                          aria-label={`${t.rail.rename}: ${title}`}
                          title={t.rail.rename}
                          onClick={() => {
                            setRenameError(false)
                            setEditing({ id: conversation.id, value: conversation.title })
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="studio-icon-button"
                          disabled={disabled}
                          aria-label={`${t.rail.archive}: ${title}`}
                          title={t.rail.archive}
                          onClick={() => onArchive(conversation.id)}
                        >
                          <Archive aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
      )}
      {renameError && <p className="studio-rail-error" role="alert">{studioErrorText(t, "unavailable")}</p>}
    </aside>
  )
}
