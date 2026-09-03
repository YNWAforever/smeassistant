"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, FileImage, Globe, Image as ImageIcon, Languages, LoaderCircle, MapPinned, MessageSquareText,
  Newspaper, Search, Sparkles, Star, UserRoundPen, WandSparkles, XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { FactType, PageIntro, SectionCard } from "@/components/product-ui"
import { LocationSelect } from "@/components/workspace/location-select"
import { copy, type PrototypeLocale } from "@/lib/copy"
import { resolveText } from "@/lib/domain"
import type { WorkspaceRole } from "@/lib/workspace/authorize-workspace"
import { createObjectiveAction } from "@/lib/workspace/client"
import { effortLabel, withLocation } from "@/lib/workspace/format"
import { TEMPLATES, type TemplateKey } from "@/lib/workspace/templates"

export interface CreateViewProps {
  locale: PrototypeLocale
  workspaceSlug: string
  workspaceId: string
  role: WorkspaceRole
  inScope: boolean
  location: string
  locationId: string | null
  locations: Array<{ slug: string; name: string }>
  /** Open actions in the scoped location: template → { id, evidence detail }. Marks a goal "evidence-led". */
  openActions: Array<{ id: string; templateKey: TemplateKey; evidence: string; freshness: string }>
}

const ICONS: Record<TemplateKey, typeof MessageSquareText> = {
  "review-response": MessageSquareText,
  "review-request": Star,
  "gbp-profile-fix": MapPinned,
  "gbp-photo-pack": ImageIcon,
  "gbp-post": Newspaper,
  "social-post": FileImage,
  "ig-bio": UserRoundPen,
  "ig-highlights": Sparkles,
  "visibility-content": Search,
  "website-basics": Globe,
  "local-seo-brief": Search,
  "menu-translation": Languages,
  "google-reconnect": Globe,
}

/** Goals the owner can start from an objective: every template with an agent (system/checklist templates come from evidence only). */
const GOALS = TEMPLATES.filter((template) => template.agentKey !== null)

export function CreateView({ locale, workspaceSlug, workspaceId, role, inScope, location, locationId, locations, openActions }: CreateViewProps) {
  const isChinese = locale !== "en"
  const router = useRouter()
  const base = `/${locale}/owner/${workspaceSlug}`
  const labels = copy[locale].workspace.templates
  const inputs = copy[locale].workspace.inputs
  const openByTemplate = new Map(openActions.map((a) => [a.templateKey, a]))
  const recommended = GOALS.filter((goal) => openByTemplate.has(goal.key))
  const [tab, setTab] = useState(recommended.length ? "recommended" : "all")
  const [selectedKey, setSelectedKey] = useState<TemplateKey>((recommended[0] ?? GOALS[0]).key)
  const [objective, setObjective] = useState("")
  const [stage, setStage] = useState<"idle" | "queued" | "failed">("idle")
  const [failure, setFailure] = useState<string | null>(null)
  const selected = GOALS.find((goal) => goal.key === selectedKey) ?? GOALS[0]
  const existing = openByTemplate.get(selected.key) ?? null
  const shownGoals = tab === "recommended" ? recommended : GOALS
  const canCreate = role !== "viewer" && inScope
  const objectiveTooShort = objective.trim().length < 8

  async function startDraft() {
    if (!canCreate) return
    if (objectiveTooShort) {
      toast.error(isChinese ? "請用一兩句寫下你想達成的目標。" : "Describe the objective in a sentence or two first.")
      return
    }
    setStage("queued")
    setFailure(null)
    const result = await createObjectiveAction({ workspace_id: workspaceId, template_key: selected.key, location_id: locationId, objective: objective.trim(), run: true })
    if (!result.ok) {
      setStage("failed")
      setFailure(result.error)
      if (result.status === 403) toast.error(isChinese ? "你的角色或地點範圍不允許建立行動。" : "Your role or location scope cannot create actions.")
      else if (result.status === 429) toast.error(isChinese ? "請求過於頻繁，請稍後再試。" : "Too many requests; try again shortly.")
      return
    }
    toast.success(isChinese ? "已建立行動；正在生成第一份草稿。" : "Action created; the first draft is being prepared.")
    router.push(withLocation(`${base}/actions/${result.data.actionId}`, location))
  }

  return (
    <div className="create-page">
      <PageIntro
        eyebrow={isChinese ? "以成果為本的內容建立中心" : "Outcome-led creation centre"}
        title={isChinese ? "你想完成甚麼？" : "What do you want to get done?"}
        description={isChinese ? "先選業務成果；工作台會在背後協調證據、草稿、品牌檢查與審批。你毋須先理解每個 Agent。" : "Choose a business outcome; the workspace coordinates evidence, drafting, brand checks and approval behind the scenes."}
        actions={<><LocationSelect locale={locale} value={location} locations={locations} className="location-select" /><Button asChild variant="outline"><Link href={withLocation(`${base}/actions`, location)}>{isChinese ? "開啟行動清單" : "Open action queue"}<ArrowRight /></Link></Button></>}
      />
      {!canCreate && <div className="permission-banner"><AlertTriangle /><div><strong>{isChinese ? "此角色或地點範圍只可查看" : "Read only for this role or location scope"}</strong><span>{isChinese ? "建立行動需要店主或負責此地點的經理。" : "Creating an action needs an owner or a manager in scope for this location."}</span></div><Badge variant="outline">{isChinese ? "只讀" : "Read only"}</Badge></div>}
      <Tabs value={tab} onValueChange={setTab} className="create-tabs">
        <TabsList variant="line"><TabsTrigger value="recommended">{isChinese ? "根據證據建議" : "Recommended from evidence"} <span>{recommended.length}</span></TabsTrigger><TabsTrigger value="all">{isChinese ? "所有成果" : "All outcomes"}</TabsTrigger></TabsList>
        <TabsContent value={tab}>
          {shownGoals.length === 0 ? <div className="empty-state"><span><CheckCircle2 /></span><h2>{isChinese ? "此地點目前沒有證據建議的目標" : "No evidence-led goals for this location right now"}</h2><p>{isChinese ? "你仍可從「所有成果」以店主目標開始。" : "You can still start from an owner objective under All outcomes."}</p></div> : (
            <div className="goal-card-grid">{shownGoals.map((goal) => { const Icon = ICONS[goal.key]; const open = openByTemplate.get(goal.key); return <button key={goal.key} type="button" className={selectedKey === goal.key ? "goal-card is-selected" : "goal-card"} aria-pressed={selectedKey === goal.key} onClick={() => { setSelectedKey(goal.key); setStage("idle") }}><span><Icon /></span><div><Badge variant="outline">{open ? (isChinese ? "證據建議" : "Evidence-led") : (isChinese ? "店主目標" : "Owner objective")}</Badge><h2>{labels[goal.key].title}</h2><p>{open ? open.evidence : labels[goal.key].summary}</p><small>{isChinese ? `店主約需 ${effortLabel(goal.effortMinutes, locale)}審閱` : `About ${effortLabel(goal.effortMinutes, locale)} to review`}</small></div><ChevronRight /></button> })}</div>
          )}
        </TabsContent>
      </Tabs>
      <div className="create-review-layout">
        <SectionCard>
          <p className="eyebrow">{existing ? (isChinese ? "為何現在建議" : "Why this is suggested") : (isChinese ? "店主目標" : "Owner objective")}</p><h2>{labels[selected.key].title}</h2>
          <div className="fact-stack">{existing ? <div><FactType type="Observed" /><p>{existing.evidence}{existing.freshness ? ` · ${existing.freshness}` : ""}</p></div> : <div><FactType type="Unknown" /><p>{isChinese ? "此目標沒有量度證據支持；它會標示為店主目標，而非發現。" : "No measured evidence backs this goal; it is labelled an owner objective, not a finding."}</p></div>}<div><FactType type="Recommended" /><p>{labels[selected.key].summary}</p></div></div>
          <div className="field-stack"><Label htmlFor="objective">{isChinese ? "你想達成甚麼？" : "What do you want to achieve?"}</Label><Textarea id="objective" rows={4} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder={isChinese ? "例如：本週推廣午市套餐，語氣溫暖，不提及價格。" : "For example: promote this week's lunch set in a warm tone, without mentioning prices."} disabled={!canCreate || stage === "queued"} /><small>{isChinese ? "目標會以「建議」事實類型記錄在行動證據中，店主資料仍由你確認。" : "The objective is recorded on the action as a Recommended fact; owner facts still come from you."}</small></div>
          <div className="required-inputs"><strong>{isChinese ? "開始前所需資料" : "Required before starting"}</strong>{selected.requiredInputs.length === 0 ? <span><CheckCircle2 /> {isChinese ? "不需要額外資料" : "No extra inputs needed"}</span> : selected.requiredInputs.map((key) => <span key={key}><AlertTriangle /> {inputs[key] ?? key}</span>)}<span><CheckCircle2 /> {isChinese ? "事實資料仍由店主確認" : "Owner still confirms factual claims"}</span></div>
          {existing && <p className="limitation-note"><Sparkles /> {isChinese ? "此地點已有一項開啟中的同類行動。" : "An open action of this kind already exists for this location."} <Link href={withLocation(`${base}/actions/${existing.id}`, location)}>{isChinese ? "開啟現有行動" : "Open the existing action"}</Link></p>}
        </SectionCard>
        <SectionCard className="usage-before-generation">
          <p className="eyebrow">{isChinese ? "用量與交付" : "Usage and delivery"}</p><h2>{isChinese ? "生成及修改不扣除用量" : "Generation and revision use no allowance"}</h2>
          <p>{isChinese ? "只有指定版本獲核准並完成匯出或發佈，才計 1 次核准後交付。Agent 只使用你確認的事實；缺少資料時會先要求輸入，而不是猜測。" : "One approved delivery is counted only after an exact version is approved and exported or published. The agent uses only facts you confirmed; when something is missing it asks for input rather than guessing."}</p>
          {stage === "idle" && <Button className="w-full" onClick={() => void startDraft()} disabled={!canCreate}><WandSparkles /> {isChinese ? "建立行動並生成草稿" : "Create the action and draft"}</Button>}
          {stage === "queued" && <div className="run-state-box run-running" role="status"><LoaderCircle className="animate-spin" /><div><strong>{isChinese ? "正在建立行動並準備草稿" : "Creating the action and preparing a draft"}</strong><span>{isChinese ? "同時驗證來源證據、品牌規則及必要資料。" : "Validating source evidence, guardrails and required facts."}</span></div></div>}
          {stage === "failed" && <div className="run-state-box run-failed" role="alert"><XCircle /><div><strong>{isChinese ? "未能建立行動" : "The action could not be created"}</strong><span>{isChinese ? "現有內容已保留，亦不會扣除交付額。" : "Existing work is preserved and no delivery is consumed."}{failure ? ` · ${failure}` : ""}</span></div><Button variant="outline" onClick={() => void startDraft()}>{isChinese ? "重試" : "Retry"}</Button></div>}
          <small>{isChinese ? `範圍：${location === "all" ? "所有地點" : locations.find((l) => l.slug === location)?.name ?? location}` : `Scope: ${location === "all" ? "all locations" : locations.find((l) => l.slug === location)?.name ?? location}`}{existing ? ` · ${resolveText({ en: "evidence-led", "zh-HK": "證據建議", "zh-TW": "證據建議" }, locale)}` : ""}</small>
        </SectionCard>
      </div>
    </div>
  )
}
