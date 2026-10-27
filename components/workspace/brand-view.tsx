import { RoleNotice } from "@/components/states/role-notice"
import { BrandSettingsForm } from "@/components/workspace/brand-client"
import type { PrototypeLocale } from "@/lib/copy"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import type { BrandProfile } from "@/lib/workspace/brand"

/**
 * Brand settings page (CLAUDE.md §3.1, §3.9): owners edit; managers and
 * viewers get the same layout read-only behind the prototype's permission
 * banner. The PUT route enforces owner-only server-side.
 */
export function BrandView({ locale, workspaceId, actorId, role, brand, timezone }: { locale: PrototypeLocale; workspaceId: string; actorId: string; role: WorkspaceRole; brand: BrandProfile; timezone?: string }) {
  const owner = role === "owner"
  const banner = owner ? null : (
    <RoleNotice kind={role === "viewer" ? "viewer" : "brand"} role={role} locale={locale} />
  )
  return <BrandSettingsForm locale={locale} workspaceId={workspaceId} actorId={actorId} brand={brand} readOnly={!owner} banner={banner} timezone={timezone} />
}
