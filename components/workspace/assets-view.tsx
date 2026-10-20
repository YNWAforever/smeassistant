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
import { zhFor } from "@/lib/zh-tw"

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
  const isChinese = locale !== "en"
  const [tab, setTab] = useState("all")
  const scoped = location === "all" ? assets : assets.filter((asset) => !asset.location_id || locations.find((l) => l.slug === location)?.id === asset.location_id)
  const rows = tab === "all" ? scoped : tab === "approved" ? scoped.filter((row) => row.rights_status === "approved") : scoped.filter((row) => row.rights_status !== "approved")
  const rightsLabel = (status: AssetItem["rights_status"]) => status === "approved" ? (isChinese ? "已核准" : "Approved") : status === "rejected" ? (isChinese ? "已拒絕" : "Rejected") : (isChinese ? "需要審閱" : "Needs review")
  const kindLabel = (kind: AssetItem["kind"]) => kind === "image" ? (isChinese ? "相片" : "Image") : kind === "menu" ? (isChinese ? "餐牌" : "Menu") : (isChinese ? "文件" : "Document")
  const defaultLocationId = locations.find((l) => l.slug === location)?.id ?? null

  return (
    <div className="assets-page">
      <PageIntro
        eyebrow={isChinese ? "已核准輸入及使用權" : "Approved inputs and usage rights"}
        title={isChinese ? "品牌素材" : "Brand assets"}
        description={isChinese ? zhFor(locale, "每項素材都顯示來源、權利、地點與目前用途；不會把上載等同可安全發佈。") : "Every asset shows provenance, rights, location and current use; upload is not treated as permission to publish."}
        actions={<><LocationSelect locale={locale} value={location} locations={locations} className="location-select" /><AssetUploadDialog locale={locale} workspaceId={workspaceId} locations={locations.map((l) => ({ id: l.id, name: l.name }))} defaultLocationId={defaultLocationId} disabled={!canUpload} /></>}
      />
      {role === "viewer" && <RoleNotice kind="viewerAssets" locale={locale} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line"><TabsTrigger value="all">{isChinese ? "所有素材" : "All assets"} <span>{scoped.length}</span></TabsTrigger><TabsTrigger value="approved">{isChinese ? "已核准" : "Approved"} <span>{scoped.filter((r) => r.rights_status === "approved").length}</span></TabsTrigger><TabsTrigger value="review">{isChinese ? "需要審閱" : "Needs review"} <span>{scoped.filter((r) => r.rights_status !== "approved").length}</span></TabsTrigger></TabsList>
        <TabsContent value={tab}>
          {rows.length === 0 ? <EmptyState locale={locale} kind="noData" title={copy[locale].shell.empty.assets.title} body={copy[locale].shell.empty.assets.body} /> : (
            <div className="asset-grid">{rows.map((asset) => (
              <SectionCard key={asset.id}>
                <div className="asset-preview"><AssetPreview asset={asset} workspaceId={workspaceId} locale={locale}/></div>
                <div className="section-card-heading"><div><p className="eyebrow">{kindLabel(asset.kind)}</p><h2>{asset.filename}</h2></div><Badge variant="outline">{rightsLabel(asset.rights_status)}</Badge></div>
                <dl className="asset-meta"><div><dt>{isChinese ? "使用權" : "Rights"}</dt><dd>{asset.rights_confirmed_at ? `${rightsLabel(asset.rights_status)} · ${formatDateTime(asset.rights_confirmed_at, locale, timezone)}` : (isChinese ? "尚未確認" : "Not confirmed yet")}</dd></div><div><dt>{isChinese ? zhFor(locale, "地點") : "Location"}</dt><dd>{asset.locationName ?? (isChinese ? zhFor(locale, "所有地點") : "All locations")}</dd></div><div><dt>{isChinese ? zhFor(locale, "上載時間") : "Uploaded"}</dt><dd>{formatDateTime(asset.created_at, locale, timezone)}</dd></div></dl>
                <AssetRightsControls locale={locale} workspaceId={workspaceId} assetId={asset.id} rightsStatus={asset.rights_status} altText={asset.alt_text} canDecide={role !== "viewer" && asset.inScope} />
              </SectionCard>
            ))}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
