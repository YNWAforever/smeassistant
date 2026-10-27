import Link from "next/link"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"

import { PageIntro } from "@/components/product-ui"
import { RoleNotice } from "@/components/states/role-notice"
import { Button } from "@/components/ui/button"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { withLocation } from "@/lib/workspace/format"

export type QueueView = "all" | "needs_input" | "drafts" | "awaiting_approval" | "completed" | "due" | "fixpack"

/**
 * The Actions queue chrome shared by the list, Due and Fix Pack views: one
 * header, one New button and a secondary More menu, so the old Calendar and the Home
 * Fix Pack card read as views of the same queue (docs/ux target IA §2).
 * Legacy status URLs stay addressable; the default face is one waiting list.
 */
export function ActionsQueueFrame({
  locale,
  workspaceSlug,
  role,
  view,
  tabHref,
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
  const base = `/${locale}/owner/${workspaceSlug}`
  const tabs: Array<{ key: QueueView; label: string }> = [
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
          {role === "viewer" ? <Button disabled>{t.access.askOwnerAction}</Button> : <Button asChild><Link href={withLocation(`${base}/actions/new`, location)}><Plus aria-hidden="true" />{t.queue.newAction}</Link></Button>}
          {tools}
        </>}
      />
      {role === "viewer" && <RoleNotice kind="viewer" locale={locale} />}
      <div className="action-tabs">
        {view !== "all" && <Link href={tabHref("all")}>{t.queue.title}</Link>}
        <details className="queue-more owner-disclosure">
          <summary>{t.queue.more}</summary>
          <nav aria-label={t.queue.navLabel}>
            {tabs.map((tab) => <Link key={tab.key} href={tabHref(tab.key)} aria-current={view === tab.key ? "page" : undefined}>{tab.label}</Link>)}
          </nav>
        </details>
        <div className="action-tab-content">{children}</div>
      </div>
    </div>
  )
}
