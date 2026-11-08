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
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { AssetKind } from "@/lib/workspace/assets"
import { setAssetRights, uploadAsset, type ClientResult } from "@/lib/workspace/client"
import { fill } from "@/lib/copy-ui"
import type { WorkspaceBusinessCopy } from "@/lib/copy-workspace-business"

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf"

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, text: WorkspaceBusinessCopy["assets"]): string {
  if (result.error === "offline" || result.error === "network") return text.unreachable
  if (result.status === 403) return text.forbidden
  if (result.status === 413 || result.error === "file_too_large") return text.tooLarge
  if (result.status === 415 || result.error === "unsupported_type") return text.unsupportedType
  if (result.status === 429) return text.tooManyUploads
  return fill(text.theRequestFailed, { error: result.error })
}

export function AssetUploadDialog({ locale, workspaceId, locations, defaultLocationId, disabled, triggerLabel }: { locale: PrototypeLocale; workspaceId: string; locations: Array<{ id: string; name: string }>; defaultLocationId: string | null; disabled: boolean; triggerLabel?: string }) {
  const pc = copy[locale].workspaceBusiness.assets
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
    if (!file) { toast.error(pc.chooseAFileFirst); return }
    if (file.size > MAX_BYTES) { toast.error(pc.theFileExceedsThe); return }
    setBusy(true)
    const result = await uploadAsset(workspaceId, { file, kind, location_id: locationId === "all" ? null : locationId, alt_text: altText.trim() || undefined })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, pc)); return }
    toast.success(pc.assetUploadedConfirmIts)
    setOpen(false)
    setAltText("")
    if (fileRef.current) fileRef.current.value = ""
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" disabled={disabled}><Plus /> {triggerLabel ?? pc.addAsset}</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="field-stack">
          <DialogHeader><DialogTitle>{pc.uploadAnAsset}</DialogTitle><DialogDescription>{pc.jpegPngWebpOr}</DialogDescription></DialogHeader>
          <div className="field-stack"><Label htmlFor="asset-file">{pc.file}</Label><Input id="asset-file" type="file" ref={fileRef} accept={ACCEPT} required /></div>
          <div className="field-stack"><Label htmlFor="asset-kind">{pc.kind}</Label><Select value={kind} onValueChange={(value) => setKind(value as AssetKind)}><SelectTrigger id="asset-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="image">{pc.image}</SelectItem><SelectItem value="menu">{pc.menu}</SelectItem><SelectItem value="document">{pc.document}</SelectItem></SelectContent></Select></div>
          <div className="field-stack"><Label htmlFor="asset-location">{pc.location}</Label><Select value={locationId} onValueChange={setLocationId}><SelectTrigger id="asset-location"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{pc.allLocations}</SelectItem>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="field-stack"><Label htmlFor="asset-alt">{copy[locale].workspace.inputs.alt_text}</Label><Textarea id="asset-alt" rows={2} value={altText} onChange={(event) => setAltText(event.target.value)} placeholder={pc.describeTheImageFor} /></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">{copy[locale].workspace.offers.actions.cancel}</Button></DialogClose><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Upload />} {pc.upload}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AssetRightsControls({ locale, workspaceId, assetId, rightsStatus, altText, canDecide }: { locale: PrototypeLocale; workspaceId: string; assetId: string; rightsStatus: "approved" | "needs_review" | "rejected"; altText: string | null; canDecide: boolean }) {
  const pc = copy[locale].workspaceBusiness.assets
  const router = useRouter()
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null)
  const [alt, setAlt] = useState(altText ?? "")

  async function decide(status: "approved" | "rejected") {
    if (!canDecide) return
    setBusy(status)
    const result = await setAssetRights(workspaceId, assetId, { rights_status: status, ...(alt.trim() !== (altText ?? "") ? { alt_text: alt.trim() } : {}) })
    setBusy(null)
    if (!result.ok) { toast.error(failureMessage(result, pc)); return }
    toast.success(status === "approved" ? pc.rightsConfirmedThisAsset : pc.rightsRejectedForThis)
    router.refresh()
  }

  return (
    <div className="field-stack">
      <Label htmlFor={`alt-${assetId}`}>{copy[locale].workspace.inputs.alt_text}</Label>
      <Textarea id={`alt-${assetId}`} rows={2} value={alt} onChange={(event) => setAlt(event.target.value)} disabled={!canDecide} />
      <div className="draft-editor-actions">
        <Button className="w-full" variant={rightsStatus === "approved" ? "outline" : "default"} disabled={!canDecide || busy !== null} onClick={() => void decide("approved")}>{busy === "approved" ? <LoaderCircle className="animate-spin" /> : <BadgeCheck />} {rightsStatus === "approved" ? pc.reConfirmRights : pc.confirmRights}</Button>
        <Button className="w-full" variant="ghost" disabled={!canDecide || busy !== null || rightsStatus === "rejected"} onClick={() => void decide("rejected")}>{busy === "rejected" ? <LoaderCircle className="animate-spin" /> : <X />} {pc.reject}</Button>
      </div>
    </div>
  )
}
