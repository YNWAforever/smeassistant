"use client"

import { PanelRightClose, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef } from "react"

import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioContextSummary } from "@/lib/studio/types"

/**
 * Read-only mirror of the server briefing (design §3 "Context rail").
 *
 * Every value was formatted on the server with the request locale, so this
 * component only lays it out: it never recomputes a score, coverage or date and
 * it has no control that writes. On tablet/mobile the same element is the
 * drawer; on wide screens it is the third column and can be collapsed.
 * `focusOnOpen` moves focus to the close control when the drawer is opened, so
 * a keyboard user is not left behind the overlay.
 */
export function StudioContextPanel({
  locale,
  summary,
  open,
  onClose,
  focusOnOpen = false,
  newActionHref,
  actionHrefBase,
  actionLocation,
}: {
  locale: PrototypeLocale
  summary: StudioContextSummary
  open: boolean
  onClose: () => void
  focusOnOpen?: boolean
  /** Safe navigation to the existing action-creation page; omitted for viewers. */
  newActionHref?: string
  /** Safe navigation to each open action's existing detail page; omitted when links are not available. */
  actionHrefBase?: string
  actionLocation?: string
}) {
  const t = studioText(locale)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (focusOnOpen) closeButton.current?.focus()
  }, [focusOnOpen])

  const scan = summary.latestScan
  return (
    <aside className="studio-context" data-open={open ? "true" : "false"} aria-label={t.context.title} role={open ? "dialog" : undefined} aria-modal={open ? true : undefined}>
      <header className="studio-context-head">
        <h2>{t.context.title}</h2>
        <button ref={closeButton} type="button" className="studio-icon-button" onClick={onClose} aria-label={t.header.hideContext} title={t.header.hideContext}>
          <PanelRightClose aria-hidden="true" />
        </button>
      </header>
      <div className="studio-context-body">
        <section className="studio-context-scan" aria-label={t.context.latestScan}>
          <h3>{t.context.latestScan}</h3>
          {scan ? (
            <>
              <p className="studio-context-score">
                <strong>{scan.score ?? "—"}</strong>
                <span>{t.context.score}</span>
              </p>
              <dl>
                <div><dt>{t.context.coverage}</dt><dd>{scan.coverage}</dd></div>
                <div><dt>{t.context.observed}</dt><dd>{scan.observedLabel}</dd></div>
                <div><dt>{t.context.location}</dt><dd>{summary.locationName ?? t.context.none}</dd></div>
              </dl>
            </>
          ) : (
            <p className="studio-context-muted">{t.context.noScan}</p>
          )}
        </section>

        <section className="studio-context-actions" aria-label={t.context.openActions}>
          <h3>{t.context.openActions}</h3>
          {summary.openActions.length > 0 ? (
            <ul>
              {summary.openActions.map((action) => (
                <li key={action.id}>
                  {actionHrefBase ? (
                    <Link href={`${actionHrefBase}/${encodeURIComponent(action.id)}${actionLocation && actionLocation !== "all" ? `?location=${encodeURIComponent(actionLocation)}` : ""}`}>{action.title}</Link>
                  ) : (
                    <span>{action.title}</span>
                  )}
                  <small>{action.priority} · {action.state}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="studio-context-muted">{t.context.none}</p>
          )}
          {newActionHref && <Link className="studio-context-new-action" href={newActionHref}>{t.context.newAction}<ArrowRight aria-hidden="true" /></Link>}
        </section>

        <dl className="studio-context-facts">
          <div><dt>{t.context.waitingReview}</dt><dd>{summary.waitingVersions}</dd></div>
          <div><dt>{t.context.pendingInputs}</dt><dd>{summary.pendingInputs}</dd></div>
          <div><dt>{t.context.brandFacts}</dt><dd>{summary.brandFactCount}</dd></div>
          <div><dt>{t.context.google}</dt><dd>{summary.google ?? t.context.none}</dd></div>
        </dl>

        <p className="studio-context-limit">{t.context.limit}</p>
      </div>
    </aside>
  )
}
