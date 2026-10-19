"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { copy, type PrototypeLocale } from "@/lib/copy"

export type CommandItem = { id: string; label: string; group: string; href?: string; onSelect?: () => void; keywords?: string }

export function matchCommands(items: CommandItem[], query: string): CommandItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(needle))
}

/**
 * Ctrl/⌘+K jump list built on Radix Dialog with an ARIA combobox + listbox
 * (no cmdk dependency, docs/ux Phase 1 decision). Items are navigation only;
 * nothing here mutates data.
 */
export function CommandPalette({ items, locale, open: controlledOpen, onOpenChange }: { items: CommandItem[]; locale: PrototypeLocale; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const t = copy[locale].ui.command
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const setOpen = useCallback((next: boolean) => {
    if (!next) { setQuery(""); setActive(0) }
    onOpenChange?.(next)
    if (controlledOpen === undefined) setUncontrolledOpen(next)
  }, [controlledOpen, onOpenChange])
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => matchCommands(items, query), [items, query])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(!open) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  const choose = (item: CommandItem | undefined) => {
    if (!item) return
    setOpen(false)
    if (item.onSelect) item.onSelect()
    else if (item.href) router.push(item.href)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (results.length ? (i + 1) % results.length : 0)) }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0)) }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[active]) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="kinnso-command gap-0 overflow-hidden p-0" showCloseButton={false} onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus() }}>
        <DialogTitle className="sr-only">{t.label}</DialogTitle>
        <DialogDescription className="sr-only">{t.shortcut}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search aria-hidden="true" className="size-4 text-ink-3" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-label={t.label}
            placeholder={t.placeholder}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            className="min-h-12 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <ul id={listId} role="listbox" aria-label={t.label} className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3" role="presentation">{t.empty}</li>}
          {results.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-sm ${index === active ? "bg-brand-soft text-ink" : "text-ink-2"}`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-ink-3">{item.group}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
