import Link from "next/link"
import { History, PlugZap, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CapabilityBadge, PageIntro, ProviderBadge, SectionCard } from "@/components/product-ui"
import { InstagramHandleForm } from "@/components/workspace/integrations-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { Capability } from "@/lib/domain"
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
  const reauthNote = locale === "en" ? "Requires re-authorisation: evidence reads from Google stop until the owner reconnects." : locale === "zh-TW" ? "需要重新授權：在店家負責人重新連接前，Google 證據讀取會暫停。" : "需要重新授權：在店主重新連接前，Google 證據讀取會暫停。"
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
      action: <>{googleNeedsReauth && <p className="limitation-note" role="status"><TriangleAlert /> {reauthNote}</p>}<Button asChild variant={googleOk ? "outline" : "default"}><a href={`/api/oauth/google/start?workspace=${encodeURIComponent(workspaceSlug)}&locale=${locale}`}>{googleOk || googleNeedsReauth ? (isChinese ? "重新授權" : "Re-authorise") : (isChinese ? "連接 Google" : "Connect Google")}</a></Button></>,
      badge: null,
    },
    {
      key: "instagram",
      name: isChinese ? "Instagram 公開證據" : "Instagram public evidence",
      status: model.instagram.handle ? `@${model.instagram.handle}` : (isChinese ? "未提供帳號" : "No handle provided"),
      capability: "Beta" as Capability,
      lastSync: model.website.observedAt ? formatDateTime(model.website.observedAt, locale, timezone) : "—",
      scope: isChinese ? "公開證據；不會發佈" : "Public evidence; no publishing",
      action: <InstagramHandleForm locale={locale} workspaceId={workspaceId} handle={model.instagram.handle} />,
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
