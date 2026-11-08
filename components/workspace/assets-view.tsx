"use client"

import { useState } from "react"

import { EmptyState } from "@/components/kinnso/states"
import { PageIntro, SectionCard } from "@/components/product-ui"
import { RoleNotice } from "@/components/states/role-notice"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AssetRightsControls, AssetUploadDialog } from "@/components/workspace/assets-client"
import {AssetPreview} from './asset-preview'
import { LocationSelect } from "@/components/workspace/location-select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { AssetItem } from "@/lib/workspace/assets"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { formatDateTime } from "@/lib/workspace/format"

export interface AssetsViewProps {
  locale: PrototypeLocale
  workspaceId: string
  timezone: string
  role: WorkspaceRole
  location: string
  locations: Array<{ id: string; slug: string; name: string }>
  /** Rows with 60 s signed URLs and a per-row scope decision from the page (§3.9). */
  assets: Array<AssetItem & { inScope: boolean }>
  canUpload: boolean
}

export function AssetsView({ locale, workspaceId, timezone, role, location, locations, assets, canUpload }: AssetsViewProps) {
  const pc = copy[locale].workspaceBusiness.assets
  const [tab, setTab] = useState("all")
  const scoped = location === "all" ? assets : assets.filter((asset) => !asset.location_id || locations.find((l) => l.slug === location)?.id === asset.location_id)
  const rows = tab === "all" ? scoped : tab === "approved" ? scoped.filter((row) => row.rights_status === "approved") : scoped.filter((row) => row.rights_status !== "approved")
  const rightsLabel = (status: AssetItem["rights_status"]) => status === "approved" ? (copy[locale].workspace.packs.states.approved) : status === "rejected" ? (copy[locale].workspace.states.rejected) : pc.needsReview
  const kindLabel = (kind: AssetItem["kind"]) => kind === "image" ? pc.image : kind === "menu" ? pc.menu : pc.document
  const defaultLocationId = locations.find((l) => l.slug === location)?.id ?? null

  return (
    <div className="assets-page">
      <PageIntro
        eyebrow={pc.approvedInputsAndUsage}
        title={pc.brandAssets}
        description={pc.everyAssetShowsProvenance}
        actions={<><LocationSelect locale={locale} value={location} locations={locations} className="location-select" /><AssetUploadDialog locale={locale} workspaceId={workspaceId} locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultLocationId={defaultLocationId} disabled={!canUpload} triggerLabel={role === "viewer" ? copy[locale].shell.access.askOwnerAction : undefined} /></>}
      />
      {role === "viewer" && <RoleNotice kind="viewerAssets" locale={locale} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line"><TabsTrigger value="all">{pc.allAssets} <span>{scoped.length}</span></TabsTrigger><TabsTrigger value="approved">{copy[locale].workspace.packs.states.approved} <span>{scoped.filter((r) => r.rights_status === "approved").length}</span></TabsTrigger><TabsTrigger value="review">{pc.needsReview} <span>{scoped.filter((r) => r.rights_status !== "approved").length}</span></TabsTrigger></TabsList>
        <TabsContent value={tab}>
          {rows.length === 0 ? <EmptyState locale={locale} kind="noData" title={copy[locale].shell.empty.assets.title} body={copy[locale].shell.empty.assets.body} /> : (
            <div className="asset-grid">{rows.map((asset) => (
              <SectionCard key={asset.id}>
                <div className="asset-preview"><AssetPreview asset={asset} workspaceId={workspaceId} locale={locale}/></div>
                <div className="section-card-heading"><div><p className="eyebrow">{kindLabel(asset.kind)}</p><h2>{asset.filename}</h2></div><Badge variant="outline">{rightsLabel(asset.rights_status)}</Badge></div>
                <dl className="asset-meta"><div><dt>{pc.rights}</dt><dd>{asset.rights_confirmed_at ? `${rightsLabel(asset.rights_status)} · ${formatDateTime(asset.rights_confirmed_at, locale, timezone)}` : pc.notConfirmedYet}</dd></div><div><dt>{copy[locale].workspace.offers.fields.location}</dt><dd>{asset.locationName ?? (copy[locale].workspace.packs.allLocations)}</dd></div><div><dt>{pc.uploaded}</dt><dd>{formatDateTime(asset.created_at, locale, timezone)}</dd></div></dl>
                <AssetRightsControls locale={locale} workspaceId={workspaceId} assetId={asset.id} rightsStatus={asset.rights_status} altText={asset.alt_text} canDecide={role !== "viewer" && asset.inScope} />
              </SectionCard>
            ))}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
