import Link from "next/link"
import { Goal, PackageOpen, Tag } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { withLocation } from "@/lib/workspace/format"

export type NewMode = "goal" | "offer" | "pack"

const ICONS = { goal: Goal, offer: Tag, pack: PackageOpen } as const

/** The three ways to start a new action. Links, so each mode has its own URL and works without script. */
export function NewModeTabs({ locale, base, location, modes, current }: { locale: PrototypeLocale; base: string; location: string; modes: NewMode[]; current: NewMode }) {
  const t = copy[locale].shell.newAction
  return (
    <nav className="new-mode-tabs" aria-label={t.label}>
      {modes.map((mode) => {
        const Icon = ICONS[mode]
        const href = withLocation(mode === "goal" ? base : `${base}?mode=${mode}`, location)
        return (
          <Link key={mode} href={href} aria-current={mode === current ? "page" : undefined}>
            <Icon aria-hidden="true" />
            <span><strong>{t[mode].title}</strong><small>{t[mode].body}</small></span>
          </Link>
        )
      })}
    </nav>
  )
}
