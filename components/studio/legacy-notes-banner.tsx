"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { legacyNotesCopy, legacyNotesText } from "@/lib/copy-legacy-notes"
import { importStudioConversationsBulk } from "@/lib/studio/client"
import { readConversationImports, saveConversationImports } from "@/lib/workspace/conversation-imports"
import { readConversationThreads, type LocalThread } from "@/lib/workspace/conversation-store"

/**
 * One-time bridge from the retired workbench. It only reads browser storage
 * after mount, imports on an explicit click and never removes the local copy.
 * The same review/import screen remains at /conversation/notes for anyone who
 * dismisses this banner.
 */
export function LegacyNotesBanner({
  locale,
  workspaceId,
  workspaceSlug,
  userId,
  locationId,
  locationSlug,
}: {
  locale: PrototypeLocale
  workspaceId: string
  workspaceSlug: string
  userId: string
  locationId: string | null
  locationSlug: string
}) {
  const copy = legacyNotesCopy[locale]
  const scope = { userId, workspaceId, locationId: locationId ?? "all" }
  const scopeKey = `${userId}:${workspaceId}:${scope.locationId}`
  const [threads, setThreads] = useState<LocalThread[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [imported, setImported] = useState(0)

  useEffect(() => {
    // Defer the storage read so the first paint is unchanged and the effect
    // does not synchronously enqueue a render during hydration.
    const timer = window.setTimeout(() => {
      try {
        const load = readConversationThreads(window.localStorage, scope)
        if (load.status !== "ready") return
        const imports = readConversationImports(window.localStorage, scope)
        setThreads(load.threads.filter((thread) => !imports[thread.id]))
      } catch {
        // Unreadable storage stays hidden; the notes page still opens normally.
      }
    }, 0)
    return () => window.clearTimeout(timer)
    // The storage key is the identity; the scope object is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  if (threads === null || threads.length === 0) {
    return imported > 0 ? <p className="studio-legacy-note" role="status">{legacyNotesText(copy, "imported", imported)}</p> : null
  }

  async function importAll() {
    if (busy || !threads) return
    setBusy(true)
    setError(false)
    const result = await importStudioConversationsBulk(workspaceId, {
      ...(scope.locationId !== "all" ? { locationId: scope.locationId } : {}),
      threads: threads.map((thread) => ({
        title: thread.title,
        notes: thread.notes,
        ...(thread.documentVersionIds?.length ? { documentVersionIds: thread.documentVersionIds } : {}),
      })),
    })
    setBusy(false)
    if (!result.ok) {
      setError(true)
      return
    }
    const entries = Object.fromEntries(result.data.conversations.map((conversation, index) => [threads[index]?.id, conversation.id]).filter((entry): entry is [string, string] => Boolean(entry[0]) && Boolean(entry[1])))
    try {
      saveConversationImports(window.localStorage, scope, entries)
    } catch {
      // The server copy exists; failing to remember the mapping must not hide it.
    }
    setImported(result.data.conversations.length)
    setThreads([])
  }

  const notesHref = `/${locale}/owner/${workspaceSlug}/conversation/notes?location=${encodeURIComponent(locationSlug)}`
  return (
    <section className="studio-legacy-banner" aria-label={copy.banner.review}>
      <div>
        <strong>{copy.banner.title}</strong>
        <p>{legacyNotesText(copy, "body", threads.length)}</p>
        {error && <p role="alert">{copy.banner.failed}</p>}
      </div>
      <div className="studio-legacy-actions">
        <Button type="button" size="sm" onClick={() => void importAll()} disabled={busy}>
          {busy ? copy.banner.importing : copy.banner.import}
        </Button>
        <Link className="studio-legacy-review" href={notesHref}>{copy.banner.review}</Link>
      </div>
    </section>
  )
}
