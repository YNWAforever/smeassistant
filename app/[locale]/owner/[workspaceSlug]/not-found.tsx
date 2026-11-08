"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

import { EmptyState } from "@/components/kinnso/states"
import { Button } from "@/components/ui/button"
import { copy, normaliseLocale } from "@/lib/copy"

/**
 * An unknown action, version or page inside a workspace the user may open.
 * It renders inside the workspace shell, so the way back is Today, not the
 * public site.
 */
export default function WorkspaceNotFound() {
  const params = useParams<{ locale?: string; workspaceSlug?: string }>()
  const locale = normaliseLocale(params.locale)
  const t = copy[locale].ui.states
  return (
    <div className="route-state">
      <EmptyState
        locale={locale}
        level={1}
        title={t.notFoundTitle}
        body={t.notFoundBody}
        action={<Button asChild className="min-h-11"><Link href={`/${locale}/owner/${params.workspaceSlug ?? ""}`}>{t.today}</Link></Button>}
      />
    </div>
  )
}
