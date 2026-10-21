import Link from "next/link"
import { History, PlugZap, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CapabilityBadge, PageIntro, ProviderBadge, SectionCard } from "@/components/product-ui"
import { GoogleDisconnectButton, InstagramHandleForm } from "@/components/workspace/integrations-client"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { Capability } from "@/lib/domain"
import { limitationLabel } from "@/lib/funnel/report-labels"
import { formatDateTime } from "@/lib/workspace/format"
import type { IntegrationsModel } from "@/lib/workspace/queries-pages"
import { fill } from "@/lib/copy-ui"

/**
 * Evidence reads, draft generation and external publishing are separate
 * capabilities; every card shows the real scope and recovery path. The Google
 * connect link starts the OAuth flow for this workspace (Phase 2 route); an
 * expired, revoked or errored connection carries a "requires re-authorisation"
 * note. The Instagram card confirms the public handle inline (Phase 6).
 */
export function IntegrationsView({ locale, workspaceSlug, workspaceId, timezone, model, googleConfigured = true }: { locale: PrototypeLocale; workspaceSlug: string; workspaceId: string; timezone: string; model: IntegrationsModel; googleConfigured?: boolean }) {
  const pc = copy[locale].workspaceBusiness.integrations
  const base = `/${locale}/owner/${workspaceSlug}`
  const googleOk = model.google.status === "active"
  const googleNeedsReauth = model.google.status === "expired" || model.google.status === "revoked" || model.google.status === "error"
  // "evidence reads from Google stop until the owner reconnects" was false: the
  // scan engine never reads oauth_connections. GBP evidence comes from Google
  // Places New and SerpApi, keyed by GOOGLE_PLACES_KEY / SERPAPI_API_KEY, so
  // nothing about collection changes when this connection lapses. Now that a
  // Disconnect button sits beside it, an owner would have acted on that.
  const reauthNote = pc.reauthNote
  const googleUnavailableNote = pc.googleUnavailableNote
  const googleConnectLabel = googleOk || googleNeedsReauth ? pc.reAuthorise : pc.connectGoogle
  const googleCapability: Capability = googleOk ? "Live" : "Requires connection"
  const googleStatus = pc.googleStatus[model.google.status]
  const igState = model.instagram.state === "unknown" ? "unavailable" : model.instagram.state
  const webState = model.website.state === "unknown" ? "unavailable" : model.website.state
  const cards = [
    {
      key: "google",
      name: pc.googleBusinessProfile,
      status: googleStatus,
      capability: googleCapability,
      lastSync: model.google.updatedAt ? formatDateTime(model.google.updatedAt, locale, timezone) : "—",
      scope: pc.readProfileAndReviews,
      // Disconnect is offered only while a connection is actually active:
      // there is nothing to withdraw from an expired or revoked one, and the
      // route would answer `disconnected: false` anyway.
      // Without OAuth configuration the start route answers 503 JSON, so the
      // link would strand the owner on a raw error body; say so here instead.
      action: <>{googleNeedsReauth && googleConfigured && <p className="limitation-note" role="status"><TriangleAlert /> {reauthNote}</p>}{!googleConfigured && <p className="limitation-note" role="status"><TriangleAlert /> {googleUnavailableNote}</p>}{googleConfigured ? <Button asChild variant={googleOk ? "outline" : "default"}><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{googleConnectLabel}</a></Button> : <Button variant="outline" disabled>{googleConnectLabel}</Button>}{googleOk && <GoogleDisconnectButton locale={locale} workspaceId={workspaceId} />}</>,
      badge: null,
    },
    {
      key: "instagram",
      name: pc.instagramPublicEvidence,
      status: model.instagram.handle ? `@${model.instagram.handle}` : pc.noHandleProvided,
      capability: "Beta" as Capability,
      lastSync: model.website.observedAt ? formatDateTime(model.website.observedAt, locale, timezone) : "—",
      scope: pc.publicEvidenceNoPublishing,
      // Item 18: this was loaded and never shown, so an owner had no way to
      // learn why Instagram was not measured -- only that it was not.
      action: <>{model.instagram.state !== "measured" && model.instagram.limitationCode && <p className="limitation-note" role="status"><TriangleAlert /> {limitationLabel(locale, model.instagram.limitationCode)}</p>}<InstagramHandleForm locale={locale} workspaceId={workspaceId} handle={model.instagram.handle} /></>,
      badge: <ProviderBadge state={igState} locale={locale} />,
    },
    {
      key: "website",
      name: pc.publicWebsite,
      status: model.website.checksEvaluated ? (fill(pc.ofChecksPassed, { checksPassed: String(model.website.checksPassed), checksEvaluated: model.website.checksEvaluated })) : pc.notEvaluated,
      capability: "Live" as Capability,
      lastSync: model.website.observedAt ? formatDateTime(model.website.observedAt, locale, timezone) : "—",
      scope: pc.publicPagesOnly,
      action: null,
      badge: <ProviderBadge state={webState} locale={locale} />,
    },
  ]
  return (
    <div className="settings-page integrations-page">
      <PageIntro eyebrow={pc.connectionScopeAndProvider} title={pc.integrations} description={pc.evidenceReadsDraftGeneration} actions={<Button asChild variant="outline"><Link href={`${base}/settings/activity`}><History /> {pc.viewRecoveryLog}</Link></Button>} />
      <div className="integration-grid">
        {cards.map((card) => (
          <SectionCard key={card.key}>
            <div className="integration-head"><span><PlugZap /></span><div><h2>{card.name}</h2><p>{card.status}</p></div>{card.badge ?? <CapabilityBadge value={card.capability} />}</div>
            <dl className="integration-meta"><div><dt>{pc.lastSync}</dt><dd>{card.lastSync}</dd></div><div><dt>{pc.scope}</dt><dd>{card.scope}</dd></div><div><dt>{pc.capability}</dt><dd><Badge variant="outline">{card.capability}</Badge></dd></div></dl>
            {card.action && <div className="integration-actions">{card.action}</div>}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
