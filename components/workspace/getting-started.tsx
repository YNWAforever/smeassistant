import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"

import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { GettingStartedItem } from "@/lib/workspace/getting-started"

/**
 * Today's getting-started checklist. Done items show a tick; open items link
 * to where the step happens when the role may go there. Progress is a count
 * of real steps, never a score.
 */
export function GettingStarted({ items, locale }: { items: GettingStartedItem[]; locale: PrototypeLocale }) {
  const t = copy[locale].shell.gettingStarted
  const done = items.filter((item) => item.done).length
  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <div className="getting-started-head">
        <h2 id="getting-started-title">{t.title}</h2>
        <span className="getting-started-progress">{fill(t.progress, { done, total: items.length })}</span>
      </div>
      <p>{t.lead}</p>
      <span className="getting-started-bar" aria-hidden="true"><span style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></span>
      <ol>
        {items.map((item) => {
          const label = t.items[item.key]
          return (
            <li key={item.key} data-done={item.done ? "" : undefined}>
              <span className="getting-started-mark" aria-hidden="true">{item.done ? <Check /> : null}</span>
              {item.done || !item.href
                ? <span>{label}{item.done && <span className="sr-only"> · {t.done}</span>}</span>
                : <Link href={item.href}>{label}<ArrowRight aria-hidden="true" /></Link>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
