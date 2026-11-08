import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import type { GettingStartedItem } from "@/lib/workspace/getting-started"

/** Only the next unfinished setup step, until the workspace's first delivery. */
export function GettingStarted({ items, locale }: { items: GettingStartedItem[]; locale: PrototypeLocale }) {
  const t = copy[locale].shell.gettingStarted
  if (items.some((item) => item.key === "deliver" && item.done)) return null
  const next = items.find((item) => !item.done)
  if (!next) return null
  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <h2 id="getting-started-title">{t.title}</h2>
      <ol><li>
        {next.href ? <Link href={next.href}>{t.items[next.key]}<ArrowRight aria-hidden="true" /></Link> : <span>{t.items[next.key]}</span>}
      </li></ol>
    </section>
  )
}
