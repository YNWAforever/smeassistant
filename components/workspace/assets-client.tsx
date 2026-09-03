"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { BadgeCheck, LoaderCircle, Plus, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PrototypeLocale } from "@/lib/copy"
import type { AssetKind } from "@/lib/workspace/assets"
import { setAssetRights, uploadAsset, type ClientResult } from "@/lib/workspace/client"

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf"

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, isChinese: boolean): string {
  if (result.error === "offline" || result.error === "network") return isChinese ? "無法連接伺服器，請稍後再試。" : "The server could not be reached; try again shortly."
  if (result.status === 403) return isChinese ? "你的角色或地點範圍不允許此操作。" : "Your role or location scope does not allow this."
  if (result.status === 413 || result.error === "file_too_large") return isChinese ? "檔案超過 5 MB 上限。" : "The file exceeds the 5 MB limit."
  if (result.status === 415 || result.error === "unsupported_type") return isChinese ? "只接受 JPEG、PNG、WebP 或 PDF。" : "Only JPEG, PNG, WebP or PDF files are accepted."
  if (result.status === 429) return isChinese ? "上載過於頻繁，請稍後再試。" : "Too many uploads; try again shortly."
  return isChinese ? `操作失敗（${result.error}）。` : `The request failed (${result.error}).`
}

export function AssetUploadDialog({ locale, workspaceId, locations, defaultLocationId, disabled }: { locale: PrototypeLocale; workspaceId: string; locations: Array<{ id: string; name: string }>; defaultLocationId: string | null; disabled: boolean }) {
  const isChinese = locale !== "en"
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<AssetKind>("image")
  const [locationId, setLocationId] = useState<string>(defaultLocationId ?? "all")
  const [altText, setAltText] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error(isChinese ? "請先選擇檔案。" : "Choose a file first."); return }
    if (file.size > MAX_BYTES) { toast.error(isChinese ? "檔案超過 5 MB 上限。" : "The file exceeds the 5 MB limit."); return }
    setBusy(true)
    const result = await uploadAsset(workspaceId, { file, kind, location_id: locationId === "all" ? null : locationId, alt_text: altText.trim() || undefined })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, isChinese)); return }
    toast.success(isChinese ? "素材已上載；請確認使用權後才可用於帖文。" : "Asset uploaded; confirm its rights before it can be used in a post.")
    setOpen(false)
    setAltText("")
    if (fileRef.current) fileRef.current.value = ""
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" disabled={disabled}><Plus /> {isChinese ? "加入素材" : "Add asset"}</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="field-stack">
          <DialogHeader><DialogTitle>{isChinese ? "上載素材" : "Upload an asset"}</DialogTitle><DialogDescription>{isChinese ? "JPEG、PNG、WebP 或 PDF，最大 5 MB。上載不等於可安全發佈；使用權需另行確認。" : "JPEG, PNG, WebP or PDF up to 5 MB. Upload is not permission to publish; rights are confirmed separately."}</DialogDescription></DialogHeader>
          <div className="field-stack"><Label htmlFor="asset-file">{isChinese ? "檔案" : "File"}</Label><Input id="asset-file" type="file" ref={fileRef} accept={ACCEPT} required /></div>
          <div className="field-stack"><Label htmlFor="asset-kind">{isChinese ? "類型" : "Kind"}</Label><Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}><SelectTrigger id="asset-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="image">{isChinese ? "相片" : "Image"}</SelectItem><SelectItem value="menu">{isChinese ? "餐牌" : "Menu"}</SelectItem><SelectItem value="document">{isChinese ? "文件" : "Document"}</SelectItem></SelectContent></Select></div>
          <div className="field-stack"><Label htmlFor="asset-location">{isChinese ? "地點" : "Location"}</Label><Select value={locationId} onValueChange={setLocationId}><SelectTrigger id="asset-location"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{isChinese ? "所有地點" : "All locations"}</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="field-stack"><Label htmlFor="asset-alt">{isChinese ? "替代文字" : "Alt text"}</Label><Textarea id="asset-alt" rows={2} value={altText} onChange={(event) => setAltText(event.target.value)} placeholder={isChinese ? "描述相片內容，供無障礙匯出使用" : "Describe the image for accessible export"} /></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{isChinese ? "取消" : "Cancel"}</Button></DialogClose><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Upload />} {isChinese ? "上載" : "Upload"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AssetRightsControls({ locale, workspaceId, assetId, rightsStatus, altText, canDecide }: { locale: PrototypeLocale; workspaceId: string; assetId: string; rightsStatus: "approved" | "needs_review" | "rejected"; altText: string | null; canDecide: boolean }) {
  const isChinese = locale !== "en"
  const router = useRouter()
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null)
  const [alt, setAlt] = useState(altText ?? "")

  async function decide(status: "approved" | "rejected") {
    if (!canDecide) return
    setBusy(status)
    const result = await setAssetRights(workspaceId, assetId, { rights_status: status, ...(alt.trim() !== (altText ?? "") ? { alt_text: alt.trim() } : {}) })
    setBusy(null)
    if (!result.ok) { toast.error(failureMessage(result, isChinese)); return }
    toast.success(status === "approved" ? (isChinese ? "已確認使用權；此素材現可用於草稿。" : "Rights confirmed; this asset can now be used in drafts.") : (isChinese ? "已拒絕此素材的使用權。" : "Rights rejected for this asset."))
    router.refresh()
  }

  return (
    <div className="field-stack">
      <Label htmlFor={`alt-${assetId}`}>{isChinese ? "替代文字" : "Alt text"}</Label>
      <Textarea id={`alt-${assetId}`} rows={2} value={alt} onChange={(event) => setAlt(event.target.value)} disabled={!canDecide} />
      <div className="draft-editor-actions">
        <Button className="w-full" variant={rightsStatus === "approved" ? "outline" : "default"} disabled={!canDecide || busy !== null} onClick={() => void decide("approved")}>{busy === "approved" ? <LoaderCircle className="animate-spin" /> : <BadgeCheck />} {rightsStatus === "approved" ? (isChinese ? "重新確認使用權" : "Re-confirm rights") : (isChinese ? "確認使用權" : "Confirm rights")}</Button>
        <Button className="w-full" variant="ghost" disabled={!canDecide || busy !== null || rightsStatus === "rejected"} onClick={() => void decide("rejected")}>{busy === "rejected" ? <LoaderCircle className="animate-spin" /> : <X />} {isChinese ? "拒絕" : "Reject"}</Button>
      </div>
    </div>
  )
}
