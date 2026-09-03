import { ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { BrandSettingsForm } from "@/components/workspace/brand-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { BrandProfile } from "@/lib/workspace/brand"
import { roleLabel } from "@/lib/workspace/shell"

/**
 * Brand settings page (CLAUDE.md §3.1, §3.9): owners edit; managers and
 * viewers get the same layout read-only behind the prototype's permission
 * banner. The PUT route enforces owner-only server-side.
 */
export function BrandView({ locale, workspaceId, role, brand }: { locale: PrototypeLocale; workspaceId: string; role: WorkspaceRole; brand: BrandProfile }) {
  const isChinese = locale !== "en"
  const owner = role === "owner"
  const banner = owner ? null : (
    <div className="permission-banner"><ShieldAlert /><div><strong>{isChinese ? `${roleLabel(role, locale)}權限` : `${roleLabel(role, locale)} access`}</strong><span>{isChinese ? "品牌資料只供查看；只有店主可以儲存新版本。" : "The brand profile is read-only; only the owner can save a new version."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>
  )
  return <BrandSettingsForm locale={locale} workspaceId={workspaceId} brand={brand} readOnly={!owner} banner={banner} />
}
