import Link from "next/link"
import { Plus, ShieldAlert } from "lucide-react"
import type { ReactNode } from "react"

import { PageIntro } from "@/components/product-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { withLocation } from "@/lib/workspace/format"
import { zhFor } from "@/lib/zh-tw"

export type QueueView = "all" | "needs_input" | "drafts" | "awaiting_approval" | "completed" | "due" | "fixpack"

const STATUS_VIEWS = ["all", "needs_input", "drafts", "awaiting_approval", "completed"] as const

/**
 * The Actions queue chrome shared by the list, Due and Fix Pack views: one
 * header, one New button and one tab row, so the old Calendar and the Home
 * Fix Pack card read as views of the same queue (docs/ux target IA §2).
 * Counts appear only on the status tabs, where the list query computed them.
 */
export function ActionsQueueFrame({
  locale,
  workspaceSlug,
  role,
  view,
  tabHref,
  counts,
  location,
  tools,
  children,
}: {
  locale: PrototypeLocale
  workspaceSlug: string
  role: WorkspaceRole
  view: QueueView
  tabHref: (view: QueueView) => string
  counts?: Partial<Record<QueueView, number>>
  location: string
  tools?: ReactNode
  children: ReactNode
}) {
  const t = copy[locale].shell
  const isChinese = locale !== "en"
  const base = `/${locale}/owner/${workspaceSlug}`
  const tabs: Array<{ key: QueueView; label: string }> = [
    ...STATUS_VIEWS.map((key) => ({ key, label: t.queue.tabs[key] })),
    { key: "due", label: t.views.due },
    { key: "fixpack", label: t.views.fixPack },
  ]
  return (
    <div className="actions-page">
      <PageIntro
        eyebrow={t.queue.eyebrow}
        title={t.queue.title}
        description={t.queue.lead}
        actions={<>
          {role !== "viewer" && <Button asChild><Link href={withLocation(`${base}/actions/new`, location)}><Plus aria-hidden="true" />{t.queue.newAction}</Link></Button>}
          {tools}
        </>}
      />
      {role === "viewer" && <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? "檢視者權限" : "Viewer access"}</strong><span>{isChinese ? zhFor(locale, "你可查看證據及已量度成效，但不能生成、編輯、審批、送出或管理帳單。") : "You can inspect evidence and measured outcomes, but cannot generate, edit, approve, deliver or manage billing."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      <div className="action-tabs">
        <nav className="action-tab-list" aria-label={t.queue.navLabel}>
          {tabs.map((tab) => (
            <Link key={tab.key} href={tabHref(tab.key)} aria-current={view === tab.key ? "page" : undefined} className={view === tab.key ? "is-active" : ""}>
              {tab.label}{counts?.[tab.key] !== undefined && <> <span>{counts[tab.key]}</span></>}
            </Link>
          ))}
        </nav>
        <div className="action-tab-content">{children}</div>
      </div>
    </div>
  )
}
