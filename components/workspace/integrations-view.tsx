import Link from "next/link"
import { History, PlugZap, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CapabilityBadge, PageIntro, ProviderBadge, SectionCard } from "@/components/product-ui"
import { GoogleDisconnectButton, InstagramHandleForm } from "@/components/workspace/integrations-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { Capability } from "@/lib/domain"
import { limitationLabel } from "@/lib/funnel/report-labels"
import { formatDateTime } from "@/lib/workspace/format"
import type { IntegrationsModel } from "@/lib/workspace/queries-pages"

/**
 * Evidence reads, draft generation and external publishing are separate
 * capabilities; every card shows the real scope and recovery path. The Google
 * connect link starts the OAuth flow for this workspace (Phase 2 route); an
 * expired, revoked or errored connection carries a "requires re-authorisation"
 * note. The Instagram card confirms the public handle inline (Phase 6).
 */
export function IntegrationsView({ locale, workspaceSlug, workspaceId, timezone, model }: { locale: PrototypeLocale; workspaceSlug: string; workspaceId: string; timezone: string; model: IntegrationsModel }) {
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const googleOk = model.google.status === "active"
  const googleNeedsReauth = model.google.status === "expired" || model.google.status === "revoked" || model.google.status === "error"
  // "evidence reads from Google stop until the owner reconnects" was false: the
  // scan engine never reads oauth_connections. GBP evidence comes from Google
  // Places New and SerpApi, keyed by GOOGLE_PLACES_KEY / SERPAPI_API_KEY, so
  // nothing about collection changes when this connection lapses. Now that a
  // Disconnect button sits beside it, an owner would have acted on that.
  const reauthNote = locale === "en" ? "Requires re-authorisation before this connection can be used again. Scans are unaffected: evidence comes from public sources, not from this connection." : locale === "zh-TW" ? "需要重新授權後，這個連接才能再次使用。掃描不受影響：證據來自公開來源，而非這個連接。" : "需要重新授權後，這個連接先可以再次使用。掃描不受影響：證據來自公開來源，而唔係這個連接。"
  const googleCapability: Capability = googleOk ? "Live" : "Requires connection"
  const googleStatus = isChinese
    ? { active: "已連接", expired: "連接已過期", revoked: "權限已撤銷", error: "連接錯誤", not_connected: "尚未連接" }[model.google.status]
    : { active: "Connected", expired: "Connection expired", revoked: "Access revoked", error: "Connection error", not_connected: "Not connected" }[model.google.status]
  const igState = model.instagram.state === "unknown" ? "unavailable" : model.instagram.state
  const webState = model.website.state === "unknown" ? "unavailable" : model.website.state
  const cards = [
    {
      key: "google",
      name: isChinese ? "Google 商戶檔案" : "Google Business Profile",
      status: googleStatus,
      capability: googleCapability,
      lastSync: model.google.updatedAt ? formatDateTime(model.google.updatedAt, locale, timezone) : "—",
      scope: isChinese ? "只讀取商戶檔案及評論" : "Read profile and reviews only",
      // Disconnect is offered only while a connection is actually active:
      // there is nothing to withdraw from an expired or revoked one, and the
      // route would answer `disconnected: false` anyway.
      action: <>{googleNeedsReauth && <p className="limitation-note" role="status"><TriangleAlert /> {reauthNote}</p>}<Button asChild variant={googleOk ? "outline" : "default"}><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{googleOk || googleNeedsReauth ? (isChinese ? "重新授權" : "Re-authorise") : (isChinese ? "連接 Google" : "Connect Google")}</a></Button>{googleOk && <GoogleDisconnectButton locale={locale} workspaceId={workspaceId} />}</>,
      badge: null,
    },
    {
      key: "instagram",
      name: isChinese ? "Instagram 公開證據" : "Instagram public evidence",
      status: model.instagram.handle ? `@${model.instagram.handle}` : (isChinese ? "未提供帳號" : "No handle provided"),
      capability: "Beta" as Capability,
      lastSync: model.website.observedAt ? formatDateTime(model.website.observedAt, locale, timezone) : "—",
      scope: isChinese ? "公開證據；不會發佈" : "Public evidence; no publishing",
      // Item 18: this was loaded and never shown, so an owner had no way to
      // learn why Instagram was not measured -- only that it was not.
      action: <>{model.instagram.state !== "measured" && model.instagram.limitationCode && <p className="limitation-note" role="status"><TriangleAlert /> {limitationLabel(locale, model.instagram.limitationCode)}</p>}<InstagramHandleForm locale={locale} workspaceId={workspaceId} handle={model.instagram.handle} /></>,
      badge: <ProviderBadge state={igState} locale={locale} />,
    },
    {
      key: "website",
      name: isChinese ? "公開網站" : "Public website",
      status: model.website.checksEvaluated ? (isChinese ? `${model.website.checksPassed} / ${model.website.checksEvaluated} 項檢查通過` : `${model.website.checksPassed} of ${model.website.checksEvaluated} checks passed`) : (isChinese ? "未能評估" : "Not evaluated"),
      capability: "Live" as Capability,
      lastSync: model.website.observedAt ? formatDateTime(model.website.observedAt, locale, timezone) : "—",
      scope: isChinese ? "只讀取公開頁面" : "Public pages only",
      action: null,
      badge: <ProviderBadge state={webState} locale={locale} />,
    },
  ]
  return (
    <div className="settings-page integrations-page">
      <PageIntro eyebrow={isChinese ? "連接權限範圍及來源狀態" : "Connection scope and provider health"} title={isChinese ? "連接與整合" : "Integrations"} description={isChinese ? "讀取證據、生成草稿與外部發佈是不同能力；每項連接都顯示實際權限及復原路徑。" : "Evidence reads, draft generation and external publishing are separate capabilities with explicit scope and recovery."} actions={<Button asChild variant="outline"><Link href={`${base}/activity`}><History /> {isChinese ? "查看復原紀錄" : "View recovery log"}</Link></Button>} />
      <div className="integration-grid">
        {cards.map((card) => (
          <SectionCard key={card.key}>
            <div className="integration-head"><span><PlugZap /></span><div><h2>{card.name}</h2><p>{card.status}</p></div>{card.badge ?? <CapabilityBadge value={card.capability} />}</div>
            <dl className="integration-meta"><div><dt>{isChinese ? "最近同步" : "Last sync"}</dt><dd>{card.lastSync}</dd></div><div><dt>{isChinese ? "權限範圍" : "Scope"}</dt><dd>{card.scope}</dd></div><div><dt>{isChinese ? "能力" : "Capability"}</dt><dd><Badge variant="outline">{card.capability}</Badge></dd></div></dl>
            {card.action && <div className="integration-actions">{card.action}</div>}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
