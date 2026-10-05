import Link from "next/link"
import { ArrowRight, Building2, MapPin, ScanSearch, TriangleAlert } from "lucide-react"

import { PublicPageFrame } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import type { WorkspaceCard } from "@/lib/workspace/queries"
import { avatarInitial, formatCoverage, roleLabel } from "@/lib/workspace/shell"

function marketLabel(market: "hk" | "tw", isChinese: boolean) {
  if (market === "tw") return isChinese ? "台灣市場" : "Taiwan market"
  return isChinese ? "香港市場" : "Hong Kong market"
}

/**
 * FA-03: the one real path to a workspace for a memberless signed-in user. An
 * owner gets there by claiming a report; a colleague by being added under
 * Team & roles. Unlocking alone never creates a workspace, and invitation mail
 * is not built, so neither is offered. The owner step names the control that
 * actually renders: "Verify ownership with Google" only exists while the OAuth
 * claim flag is on; otherwise the claim continues through Fimmick assignment.
 */
export function emptyStateCopy(locale: PrototypeLocale, oauthClaimEnabled: boolean): { lead: string; owner: string; colleague: string } {
  if (locale === "zh-TW") {
    return {
      lead: "您的電子郵件尚未連結任何工作台。",
      owner: oauthClaimEnabled
        ? "如果您是店家負責人：先免費掃描您的店家，解鎖報告後按「以 Google 驗證擁有權」。"
        : "如果您是店家負責人：先免費掃描您的店家，解鎖報告後按「登入認領此店家」，再依指示請 Fimmick 核實並指派。",
      colleague: "如果您是同事：請店家負責人在「團隊與權限」加入您的電子郵件，然後用同一個電子郵件重新登入。",
    }
  }
  if (locale === "en") {
    return {
      lead: "Your email isn’t linked to a workspace yet.",
      owner: oauthClaimEnabled
        ? "If you own the business: run a free scan, unlock the report, then choose “Verify ownership with Google”."
        : "If you own the business: run a free scan, unlock the report, choose “Sign in to claim this business”, then follow the steps to have Fimmick verify and assign it.",
      colleague: "If you’re a colleague: ask the owner to add your email under “Team & roles”, then sign in again with that same email.",
    }
  }
  return {
    lead: "你的電郵尚未連結任何工作台。",
    owner: oauthClaimEnabled
      ? "如你是店主：先免費掃描你的商戶，解鎖報告後按「以 Google 驗證擁有權」。"
      : "如你是店主：先免費掃描你的商戶，解鎖報告後按「登入認領此商戶」，再按指示請 Fimmick 核實並指派。",
    colleague: "如你是同事：請店主在「團隊與權限」加入你的電郵，然後用同一電郵再登入。",
  }
}

function urgentCopy(count: number, isChinese: boolean) {
  if (count === 0) return isChinese ? "沒有緊急行動" : "No urgent actions"
  if (isChinese) return `${count} 項緊急行動`
  return count === 1 ? "1 urgent action" : `${count} urgent actions`
}

/**
 * The prototype's select-workspace design bound to accepted memberships
 * (CLAUDE.md Phase 2 item 5): one card per workspace (all locations) and one
 * per location with the latest snapshot's score / coverage and open urgent
 * count. Server component: the only interaction is the sign-out form, which
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
  const isChinese = locale !== "en"
  const empty = emptyStateCopy(locale, oauthClaimEnabled)
  return (
    <PublicPageFrame locale={locale}>
      <main className="select-workspace-page">
        <header><Badge variant="outline">{isChinese ? `已登入 · ${email}` : `Signed in as ${email}`}</Badge><h1>{isChinese ? "選擇工作台或地點" : "Choose a workspace or location"}</h1><p>{isChinese ? "選擇後會再次檢查你的角色及地點範圍。" : "Your role and location scope are re-checked after selection."}</p></header>
        {denied && <div className="permission-note" role="alert"><TriangleAlert /><span>{isChinese ? `你不是「${denied}」工作台的成員，或成員資格已被撤銷。請從下方選擇你有權限的工作台。` : `You are not a member of the “${denied}” workspace, or the membership was revoked. Choose one you have access to below.`}</span></div>}
        {accessRequest}
        {cards.length === 0 ? (
          <div className="empty-state">
            <span><Building2 /></span>
            <h2>{isChinese ? "尚未連結任何工作台" : "No workspace linked yet"}</h2>
            <p>{empty.lead}</p>
            <p>{empty.owner}</p>
            <p>{empty.colleague}</p>
            <div className="flow-card-footer">
              <form action={signOutAction}><Button variant="outline" type="submit">{isChinese ? "登出並用另一個電郵登入" : "Sign out and use another email"}</Button></form>
              <Button asChild><Link href={`/${locale}/scan`}><ScanSearch />{isChinese ? "先免費掃描" : "Start with a free scan"}<ArrowRight /></Link></Button>
            </div>
          </div>
        ) : (
          <div className="workspace-choice-grid">
            {cards.map((card) => {
              const base = `/${locale}/owner/${card.workspace.slug}`
              const count = card.locations.length
              const locationsCopy = isChinese ? `${count} 個地點 · ${marketLabel(card.workspace.market, true)}` : `${count} ${count === 1 ? "location" : "locations"} · ${marketLabel(card.workspace.market, false)}`
              return [
                <Link key={card.workspace.id} href={`${base}?location=all`}><span className="workspace-choice-icon">{avatarInitial(card.workspace.name)}</span><div><Badge>{roleLabel(card.role, locale)}</Badge><h2>{card.workspace.name}</h2><p>{locationsCopy}</p><small>{isChinese ? "所有地點存取" : "All-locations access"}</small></div><ArrowRight /></Link>,
                ...card.locations.map((location) => {
                  const score = location.latestScore === null ? "—" : String(Math.round(location.latestScore))
                  const coverage = formatCoverage(location.latestCoverage)
                  const summary = location.lastScanAt === null
                    ? (isChinese ? "尚未有掃描" : "No scan yet")
                    : isChinese
                      ? `評分 ${score} · 覆蓋率 ${coverage === null ? "—" : `${coverage}%`}`
                      : `Score ${score} · Coverage ${coverage === null ? "—" : `${coverage}%`}`
                  return (
                    <Link key={location.id} href={`${base}?location=${location.slug}`}><span className="workspace-choice-icon"><MapPin /></span><div><Badge variant="outline">{isChinese ? "地點" : "Location"}</Badge><h2>{location.name}</h2><p>{summary}</p><small>{urgentCopy(location.urgentActions, isChinese)}</small></div><ArrowRight /></Link>
                  )
                }),
              ]
            })}
          </div>
        )}
      </main>
    </PublicPageFrame>
  )
}
