import type { ReactNode } from "react"

/**
 * Page title block. Text budget (docs/ux brief): title ≤ 8 words, supporting
 * line ≤ 20 words; anything longer belongs behind an InlineExplainer.
 */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="kinnso-page-header flex flex-wrap items-end justify-between gap-4">
      <div className="grid max-w-2xl gap-2">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-brand-text">{eyebrow}</p>}
        <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="text-base text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
