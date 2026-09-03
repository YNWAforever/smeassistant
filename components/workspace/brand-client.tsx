"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Check, LoaderCircle, Plus, X, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PageIntro, SectionCard } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"
import type { BrandLanguage, BrandProfile, BrandVoice } from "@/lib/workspace/brand"
import { saveBrand, type ClientResult } from "@/lib/workspace/client"

/**
 * Brand profile form (CLAUDE.md §3.1 `settings/brand`, Phase 6): the
 * prototype `BrandSettingsPage` layout bound to `brand_profiles`. Owners
 * edit and PUT the whole profile (the route audits `brand.updated`);
 * everyone else sees the same layout read-only. Lists are one item per
 * line; facts are key/value rows agents may cite without asking again.
 */
const VOICES: BrandVoice[] = ["warm", "professional", "playful", "direct"]
const LANGUAGES: BrandLanguage[] = ["zh-HK", "zh-TW", "en"]

type FactRow = { key: string; value: string }

function toLines(list: string[]): string { return list.join("\n") }
function fromLines(text: string): string[] { return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, t: (typeof COPY)[PrototypeLocale]): string {
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.status === 403) return t.forbidden
  if (result.status === 400) return `${t.invalid} ${result.error}`
  return t.failed
}

export function BrandSettingsForm({ locale, workspaceId, brand, readOnly, banner }: { locale: PrototypeLocale; workspaceId: string; brand: BrandProfile; readOnly: boolean; banner?: React.ReactNode }) {
  const router = useRouter()
  const t = COPY[locale]
  const [voice, setVoice] = useState<BrandVoice>(brand.voice)
  const [claims, setClaims] = useState(toLines(brand.approvedClaims))
  const [prohibited, setProhibited] = useState(toLines(brand.prohibitedTerms))
  const [languages, setLanguages] = useState<BrandLanguage[]>(brand.languages)
  const [facts, setFacts] = useState<FactRow[]>(Object.entries(brand.facts).map(([key, value]) => ({ key, value })))
  const [busy, setBusy] = useState(false)

  function setFact(index: number, patch: Partial<FactRow>) {
    setFacts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || busy) return
    if (languages.length === 0) { toast.error(t.languageRequired); return }
    const factRecord: Record<string, string> = {}
    for (const row of facts) {
      const key = row.key.trim()
      if (!key) continue
      factRecord[key] = row.value.trim()
    }
    setBusy(true)
    const result = await saveBrand(workspaceId, { voice, approved_claims: fromLines(claims), prohibited_terms: fromLines(prohibited), languages, facts: factRecord })
    setBusy(false)
    if (!result.ok) { toast.error(failureMessage(result, t)); return }
    toast.success(t.saved)
    router.refresh()
  }

  return (
    <form className="settings-page brand-page" onSubmit={(event) => void submit(event)}>
      <PageIntro
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={readOnly ? null : <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {t.save}</Button>}
      />
      {banner}
      <div className="settings-grid">
        <SectionCard>
          <p className="eyebrow">{t.voiceEyebrow}</p>
          <h2>{t.voiceTitle}</h2>
          <div className="field-stack">
            <Label htmlFor="brand-voice">{t.voiceLabel}</Label>
            <Select value={voice} onValueChange={(value) => setVoice(value as BrandVoice)} disabled={readOnly}>
              <SelectTrigger id="brand-voice"><SelectValue>{t.voices[voice]}</SelectValue></SelectTrigger>
              <SelectContent>{VOICES.map((option) => <SelectItem key={option} value={option}>{t.voices[option]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <fieldset className="field-stack settings-checkboxes">
            <legend>{t.languagesLabel}</legend>
            {LANGUAGES.map((language) => (
              <Label key={language}><Checkbox checked={languages.includes(language)} disabled={readOnly} onCheckedChange={(checked) => setLanguages((current) => (checked === true ? Array.from(new Set([...current, language])) : current.filter((l) => l !== language)))} /> <span>{t.languages[language]}</span></Label>
            ))}
          </fieldset>
          <div className="field-stack">
            <Label htmlFor="approved-claims">{t.claimsLabel}</Label>
            <Textarea id="approved-claims" rows={4} value={claims} onChange={(event) => setClaims(event.target.value)} readOnly={readOnly} placeholder={t.claimsPlaceholder} />
          </div>
        </SectionCard>
        <SectionCard>
          <p className="eyebrow">{t.factsEyebrow}</p>
          <h2>{t.factsTitle}</h2>
          <div className="field-stack">
            {facts.length === 0 && <p className="limitation-note">{t.factsEmpty}</p>}
            {facts.map((row, index) => (
              <div key={index} className="fact-row plan-actions">
                <Input aria-label={t.factKey} value={row.key} onChange={(event) => setFact(index, { key: event.target.value })} readOnly={readOnly} placeholder={t.factKey} />
                <Input aria-label={t.factValue} value={row.value} onChange={(event) => setFact(index, { value: event.target.value })} readOnly={readOnly} placeholder={t.factValue} />
                {!readOnly && <Button type="button" variant="ghost" size="sm" aria-label={t.removeFact} onClick={() => setFacts((rows) => rows.filter((_, i) => i !== index))}><X /></Button>}
              </div>
            ))}
            {!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => setFacts((rows) => [...rows, { key: "", value: "" }])}><Plus /> {t.addFact}</Button>}
          </div>
        </SectionCard>
        <SectionCard>
          <p className="eyebrow">{t.prohibitedEyebrow}</p>
          <h2>{t.prohibitedTitle}</h2>
          <div className="guardrail-list">
            <span><XCircle /> {t.guardrail1}</span>
            <span><XCircle /> {t.guardrail2}</span>
            <span><XCircle /> {t.guardrail3}</span>
          </div>
          <div className="field-stack">
            <Label htmlFor="prohibited-terms">{t.prohibitedLabel}</Label>
            <Textarea id="prohibited-terms" rows={4} value={prohibited} onChange={(event) => setProhibited(event.target.value)} readOnly={readOnly} placeholder={t.prohibitedPlaceholder} />
          </div>
        </SectionCard>
        <SectionCard>
          <p className="eyebrow">{t.versionEyebrow}</p>
          <h2>{t.versionTitle}</h2>
          <p>{t.versionBody}</p>
          <Badge variant="outline">{brand.updatedAt ? `${t.updated} ${brand.updatedAt.slice(0, 10)}` : t.neverSaved}</Badge>
        </SectionCard>
      </div>
    </form>
  )
}

const COPY = {
  en: {
    eyebrow: "Versioned workspace guardrails", title: "Brand profile",
    description: "Agents may use only approved voice, facts and assets; missing facts trigger an owner question.",
    save: "Save new version", saved: "Brand profile saved as a new version.",
    voiceEyebrow: "Voice and language", voiceTitle: "Brand voice", voiceLabel: "Choose voice",
    voices: { warm: "Warm, local and sincere", professional: "Clear and professional", playful: "Friendly and lively", direct: "Short and direct" },
    languagesLabel: "Languages agents may draft in", languages: { "zh-HK": "Traditional Chinese (Hong Kong)", "zh-TW": "Traditional Chinese (Taiwan)", en: "English" },
    languageRequired: "Choose at least one language.",
    claimsLabel: "Approved claims (one per line)", claimsPlaceholder: "Warm local food, sincerely served",
    factsEyebrow: "Owner-confirmed facts", factsTitle: "Facts available before generation", factsEmpty: "No confirmed facts yet; agents will ask before citing seats, prices or allergens.",
    factKey: "Fact", factValue: "Value", addFact: "Add fact", removeFact: "Remove fact",
    prohibitedEyebrow: "Prohibited claims", prohibitedTitle: "Agents never infer these",
    guardrail1: "Best, number one or guaranteed outcomes", guardrail2: "Unconfirmed prices, ingredients or allergens", guardrail3: "Causal claims from correlated change",
    prohibitedLabel: "Prohibited terms (one per line)", prohibitedPlaceholder: "best in town",
    versionEyebrow: "Versioning", versionTitle: "Every save is a new version", versionBody: "Drafts cite the profile that was current when they were generated; an audit event records each change.",
    updated: "Updated", neverSaved: "Defaults · not saved yet",
    invalid: "The profile was rejected:", forbidden: "Only the owner can edit the brand profile.",
    network: "The server could not be reached; try again shortly.", failed: "The profile could not be saved.",
  },
  "zh-HK": {
    eyebrow: "版本化工作台保障", title: "品牌資料",
    description: "Agent 只可使用已核准語氣、事實與素材；缺少資料時必須停下並向店主提問。",
    save: "儲存新版本", saved: "品牌資料已儲存為新版本。",
    voiceEyebrow: "語氣及語言", voiceTitle: "品牌語氣", voiceLabel: "選擇語氣",
    voices: { warm: "溫暖、本地及真誠", professional: "清晰專業", playful: "親切活潑", direct: "簡短直接" },
    languagesLabel: "Agent 可用於草稿的語言", languages: { "zh-HK": "繁體中文（香港）", "zh-TW": "繁體中文（台灣）", en: "英文" },
    languageRequired: "請選擇至少一種語言。",
    claimsLabel: "已核准字句（每行一項）", claimsPlaceholder: "家常滋味，真誠款待",
    factsEyebrow: "店主確認資料", factsTitle: "生成前可使用的事實", factsEmpty: "尚未有已確認事實；Agent 在引用座位、價格或致敏原前會先提問。",
    factKey: "事實", factValue: "內容", addFact: "新增事實", removeFact: "移除事實",
    prohibitedEyebrow: "禁用內容", prohibitedTitle: "Agent 不會自行推斷",
    guardrail1: "最好、第一或保證成效", guardrail2: "未確認價格、食材或致敏原", guardrail3: "把相關變化寫成因果證明",
    prohibitedLabel: "禁用詞語（每行一項）", prohibitedPlaceholder: "全港最好",
    versionEyebrow: "版本", versionTitle: "每次儲存都是新版本", versionBody: "草稿會引用生成當時的品牌資料；每次更改都會記錄審計事件。",
    updated: "更新於", neverSaved: "預設值 · 尚未儲存",
    invalid: "品牌資料未獲接受：", forbidden: "只有店主可以編輯品牌資料。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存品牌資料。",
  },
  "zh-TW": {
    eyebrow: "版本化工作台保障", title: "品牌資料",
    description: "Agent 只能使用已核准的語氣、事實與素材；缺少資料時必須停下並向店家提問。",
    save: "儲存新版本", saved: "品牌資料已儲存為新版本。",
    voiceEyebrow: "語氣及語言", voiceTitle: "品牌語氣", voiceLabel: "選擇語氣",
    voices: { warm: "溫暖、在地及真誠", professional: "清晰專業", playful: "親切活潑", direct: "簡短直接" },
    languagesLabel: "Agent 可用於草稿的語言", languages: { "zh-HK": "繁體中文（香港）", "zh-TW": "繁體中文（台灣）", en: "英文" },
    languageRequired: "請選擇至少一種語言。",
    claimsLabel: "已核准字句（每行一項）", claimsPlaceholder: "家常滋味，真誠款待",
    factsEyebrow: "店家確認資料", factsTitle: "生成前可使用的事實", factsEmpty: "尚未有已確認事實；Agent 在引用座位、價格或過敏原前會先提問。",
    factKey: "事實", factValue: "內容", addFact: "新增事實", removeFact: "移除事實",
    prohibitedEyebrow: "禁用內容", prohibitedTitle: "Agent 不會自行推斷",
    guardrail1: "最好、第一或保證成效", guardrail2: "未確認價格、食材或過敏原", guardrail3: "把相關變化寫成因果證明",
    prohibitedLabel: "禁用詞語（每行一項）", prohibitedPlaceholder: "全台最好",
    versionEyebrow: "版本", versionTitle: "每次儲存都是新版本", versionBody: "草稿會引用生成當時的品牌資料；每次更改都會記錄稽核事件。",
    updated: "更新於", neverSaved: "預設值 · 尚未儲存",
    invalid: "品牌資料未獲接受：", forbidden: "只有店家負責人可以編輯品牌資料。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存品牌資料。",
  },
} as const
