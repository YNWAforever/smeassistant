import Link from "next/link"
import { ArrowRight, MapPin, ScanSearch } from "lucide-react"

import { AuthFrame } from "@/components/auth/auth-frame"
import { RoleNotice } from "@/components/states/role-notice"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyIllustration } from "@/components/visual/illustrations"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import type { WorkspaceCard } from "@/lib/workspace/queries"
import { noWorkspaceCopy } from "@/lib/workspace/no-workspace-copy"
import { avatarInitial, formatCoverage, roleLabel } from "@/lib/workspace/shell"

function plural(forms: { one: string; other: string }, n: number) {
  return fill(n === 1 ? forms.one : forms.other, { n })
}

function urgentLabel(t: SelectCopy, n: number) {
  return n === 0 ? t.urgent.zero : plural(t.urgent, n)
}

type SelectCopy = (typeof copy)["en"]["shell"]["select"]

/**
 * Accepted memberships after sign-in (CLAUDE.md Phase 2 item 5, Phase 5
 * layout): one card per workspace that opens all locations, listing each
 * location with its latest score (or "No score yet"), coverage and urgent
 * count. Scores are never combined across locations. Server component: the only interaction is the sign-out form, which
 * posts to a server action.
 */
export function SelectWorkspacePage({
  locale,
  cards,
  email,
  denied,
  signOutAction,
  accessRequest,
  oauthClaimEnabled = false,
}: {
  locale: PrototypeLocale
  cards: WorkspaceCard[]
  email: string
  denied?: string
  signOutAction: () => Promise<void>
  /**
   * The caller's own ownership-request status, when they have one (P2.4 item
   * 22). Passed as a node so this component stays unaware of how the status is
   * derived, and optional so every existing call site is unaffected. This is
   * where a memberless signed-in user lands, which is exactly who has a request
   * outstanding.
   */
  accessRequest?: React.ReactNode
  /** WORKSPACE_CLAIM_VIA_OAUTH_ENABLED, read by the page; decides which claim control the empty state names. */
  oauthClaimEnabled?: boolean
}) {
  const t = copy[locale].shell.select
  const empty = noWorkspaceCopy(locale, oauthClaimEnabled)
  const accountExit = <form action={signOutAction}><Button variant="outline" type="submit">{t.signOut}</Button></form>
  return (
    <AuthFrame locale={locale}>
      <main className="select-workspace-page">
        <header><Badge variant="outline">{fill(t.signedInAs, { email })}</Badge><h1>{t.title}</h1><p>{t.lead}</p></header>
        {denied && <RoleNotice kind="notMember" name={denied} locale={locale} />}
        {accessRequest}
        {cards.length === 0 ? (
          <div className="empty-state">
            <EmptyIllustration kind="noData" />
            <h2>{t.emptyTitle}</h2>
            <p>{empty.lead}</p>
            <Button asChild className="min-h-11"><Link href={`/${locale}/scan`}><ScanSearch />{empty.scanCta}<ArrowRight /></Link></Button>
            {/* The two real paths for someone who already scanned or works for an owner; text only, so the scan stays the one link out. */}
            <details className="select-empty-paths">
              <summary>{t.alreadyScanned}</summary>
              <p>{empty.owner}</p>
              <p>{empty.colleague}</p>
            </details>
            <div className="flow-card-footer">{accountExit}</div>
          </div>
        ) : (
          <div className="ws-card-list">
            {cards.map((card) => {
              const base = `/${locale}/owner/${card.workspace.slug}`
              // Two workspaces can share a business name (e.g. an earlier claim); the slug tells them apart.
              const sameName = cards.filter((other) => other.workspace.name === card.workspace.name).length > 1
              return (
                <section key={card.workspace.id} className="ws-card" aria-label={card.workspace.name}>
                  <Link className="ws-card-head" href={`${base}?location=all`} aria-label={fill(t.open, { name: card.workspace.name })}>
                    <span className="workspace-choice-icon" aria-hidden="true">{avatarInitial(card.workspace.name)}</span>
                    <span className="ws-card-title">
                      <strong>{card.workspace.name}</strong>
                      <small>{[plural(t.locations, card.locations.length), t.markets[card.workspace.market], sameName ? `/${card.workspace.slug}` : null].filter(Boolean).join(" · ")}</small>
                    </span>
                    <Badge>{roleLabel(card.role, locale)}</Badge>
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <ul className="ws-card-locations">
                    {card.locations.map((location) => {
                      const coverage = formatCoverage(location.latestCoverage)
                      const scanned = location.lastScanAt !== null
                      return (
                        <li key={location.id}>
                          <Link href={`${base}?location=${location.slug}`}>
                            <MapPin aria-hidden="true" />
                            <span className="ws-loc-name">{location.name}</span>
                            <span className="ws-loc-score">{!scanned ? t.noScan : location.latestScore === null ? t.noScore : fill(t.score, { n: Math.round(location.latestScore) })}</span>
                            <span className="ws-loc-coverage">
                              {scanned && coverage !== null && <span className="ws-loc-bar" aria-hidden="true"><span style={{ width: `${coverage}%` }} /></span>}
                              <small>{!scanned ? "" : coverage === null ? t.noCoverage : fill(t.coverage, { n: coverage })}</small>
                            </span>
                            <span className="ws-loc-urgent" data-urgent={location.urgentActions > 0 ? "" : undefined}>{urgentLabel(t, location.urgentActions)}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
        {cards.length > 0 && <div className="flow-card-footer">{accountExit}</div>}
      </main>
    </AuthFrame>
  )
}
