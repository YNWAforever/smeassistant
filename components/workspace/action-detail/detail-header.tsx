import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { resolveText } from "@/lib/domain"
import { withLocation } from "@/lib/workspace/format"
import type { ActionEditor } from "./use-action-editor"

export function DetailHeader({ ed }: { ed: ActionEditor }) {
  const { ac, action, base, embedded, locale, location } = ed
  return <>
    {!embedded && <div className="action-detail-toolbar"><Link href={withLocation(`${base}/actions`, location)} className="back-link"><ArrowLeft /> {ac.toolbar.back}</Link></div>}
    <header className="action-detail-header"><div>
      {embedded ? <h2>{resolveText(action.title, locale)}</h2> : <h1>{resolveText(action.title, locale)}</h1>}
      <p>{resolveText(action.summary, locale)}</p>
    </div></header>
  </>
}
