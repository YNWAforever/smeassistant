"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
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
import { copy, type PrototypeLocale } from "@/lib/copy"
import type { BrandLanguage, BrandProfile, BrandVoice } from "@/lib/workspace/brand"
import { saveBrand, type ClientResult } from "@/lib/workspace/client"
import { formatDateTime } from "@/lib/workspace/format"

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
type FormProps = { locale: PrototypeLocale; workspaceId: string; actorId: string; brand: BrandProfile; readOnly: boolean; banner?: React.ReactNode; timezone?: string }
type FormError = { message: string; conflict?: boolean; voice?: boolean }

function toLines(list: string[]): string { return list.join("\n") }
function fromLines(text: string): string[] { return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }

function failureMessage(result: Extract<ClientResult<unknown>, { ok: false }>, t: (typeof COPY)[PrototypeLocale]): string {
  if (result.error === "offline" || result.error === "network") return t.network
  if (result.status === 403) return t.forbidden
  if(result.status===409)return t.conflict
  if (result.status === 400) return `${t.invalid} ${result.error}`
  return t.failed
}

function validProfile(value: unknown, workspaceId: string): value is BrandProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.workspaceId === workspaceId
    && VOICES.includes(row.voice as BrandVoice)
    && (row.voiceConfigured === undefined || typeof row.voiceConfigured === "boolean")
    && Array.isArray(row.approvedClaims) && row.approvedClaims.every(item => typeof item === "string")
    && Array.isArray(row.prohibitedTerms) && row.prohibitedTerms.every(item => typeof item === "string")
    && Array.isArray(row.languages) && row.languages.length > 0 && row.languages.every(item => LANGUAGES.includes(item as BrandLanguage))
    && !!row.facts && typeof row.facts === "object" && !Array.isArray(row.facts) && Object.values(row.facts).every(item => typeof item === "string")
    && (row.updatedAt === null || (typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt))))
    && (row.revisionId === null || (typeof row.revisionId === "string" && /^[0-9a-f-]{36}$/i.test(row.revisionId)))
}

/** Remount drafts when the server-authorized actor, workspace or permission changes. */
export function BrandSettingsForm(props: FormProps) {
  if (props.brand.workspaceId !== props.workspaceId) return <p role="alert">{COPY[props.locale].failed}</p>
  return <ScopedBrandSettingsForm key={JSON.stringify([props.actorId, props.workspaceId, props.readOnly])} {...props} />
}

function ScopedBrandSettingsForm({ locale, workspaceId, brand, readOnly, banner, timezone = "Asia/Hong_Kong" }: FormProps) {
  const router = useRouter()
  const t = COPY[locale]
  const [voice, setVoice] = useState<BrandVoice | "">(brand.voiceConfigured === false ? "" : brand.voice)
  const [claims, setClaims] = useState(toLines(brand.approvedClaims))
  const [prohibited, setProhibited] = useState(toLines(brand.prohibitedTerms))
  const [languages, setLanguages] = useState<BrandLanguage[]>(brand.languages)
  const [facts, setFacts] = useState<FactRow[]>(Object.entries(brand.facts).map(([key, value]) => ({ key, value })))
  const [busy, setBusy] = useState(false)
  const [revisionId,setRevisionId]=useState(brand.revisionId ?? null)
  const [savedProfile, setSavedProfile] = useState(brand)
  const [error, setError] = useState<FormError | null>(null)
  const [latest, setLatest] = useState<BrandProfile | null>(null)
  const active = useRef(false)
  const pending = useRef(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const currentRevision = brand.revisions?.find((revision) => revision.id === revisionId) ?? null

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  function fail(nextError: FormError) {
    setError(nextError)
    toast.error(nextError.message)
  }

  function replaceDraft(next: BrandProfile) {
    setVoice(next.voiceConfigured === false ? "" : next.voice)
    setClaims(toLines(next.approvedClaims))
    setProhibited(toLines(next.prohibitedTerms))
    setLanguages(next.languages)
    setFacts(Object.entries(next.facts).map(([key, value]) => ({ key, value })))
    setRevisionId(next.revisionId ?? null)
    setSavedProfile(next)
    setLatest(null)
    setError(null)
  }

  async function reviewLatest() {
    if (pending.current || readOnly) return
    pending.current = true
    setBusy(true)
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/brand`, { credentials: "same-origin", cache: "no-store" })
      const body: unknown = await response.json()
      if (!active.current) return
      const candidate = body && typeof body === "object" ? (body as { brand?: unknown }).brand : null
      if (!response.ok || !validProfile(candidate, workspaceId)) {
        fail({ message: t.latestFailed, conflict: true })
        return
      }
      setLatest(candidate)
    } catch {
      if (active.current) fail({ message: t.latestFailed, conflict: true })
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  function setFact(index: number, patch: Partial<FactRow>) {
    setFacts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || pending.current || error?.conflict) return
    if (!voice || !VOICES.includes(voice)) { fail({ message: t.voiceRequired, voice: true }); return }
    if (languages.length === 0) { fail({ message: t.languageRequired }); return }
    const factRecord: Record<string, string> = {}
    for (const row of facts) {
      const key = row.key.trim()
      if (!key) continue
      factRecord[key] = row.value.trim()
    }
    pending.current = true
    setBusy(true)
    setError(null)
    const result = await saveBrand(workspaceId, { voice, approved_claims: fromLines(claims), prohibited_terms: fromLines(prohibited), languages, facts: factRecord,expectedRevisionId:revisionId })
    pending.current = false
    if (!active.current) return
    setBusy(false)
    if (!result.ok) { fail({ message: failureMessage(result, t), conflict: result.status === 409 }); return }
    const saved: unknown = result.data && typeof result.data === "object" ? result.data.brand : null
    if (!validProfile(saved, workspaceId) || saved.voiceConfigured === false || !saved.revisionId || saved.revisionId === revisionId || !saved.updatedAt || saved.voice !== voice) {
      fail({ message: t.invalidResponse })
      return
    }
    setRevisionId(result.data.brand.revisionId ?? null)
    setSavedProfile(result.data.brand)
    toast.success(t.saved)
    router.refresh()
  }

  return (
    <form className="settings-page brand-page" onSubmit={(event) => void submit(event)}>
      <PageIntro
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={readOnly ? <Button type="button" disabled>{copy[locale].shell.access.askOwnerAction}</Button> : <Button type="submit" disabled={busy || error?.conflict}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} {t.save}</Button>}
      />
      {banner}
      {error && <div role="alert" tabIndex={-1} ref={errorRef} className="permission-banner">
        <p>{error.message}</p>
        {!readOnly && (error.conflict
          ? <Button type="button" variant="outline" disabled={busy} onClick={() => void reviewLatest()}>{t.reviewLatest}</Button>
          : <Button type="submit" variant="outline" disabled={busy}>{t.retry}</Button>)}
      </div>}
      {latest && <section role="region" aria-label={t.latestTitle} className="section-card">
        <h2>{t.latestTitle}</h2>
        <dl>
          <dt>{t.voiceLabel}</dt><dd>{latest.voiceConfigured === false ? t.voiceUnset : t.voices[latest.voice]}</dd>
          <dt>{t.languagesLabel}</dt><dd>{latest.languages.map(language => t.languages[language]).join(", ")}</dd>
          <dt>{t.claimsLabel}</dt><dd>{latest.approvedClaims.join("\n")}</dd>
          <dt>{t.prohibitedLabel}</dt><dd>{latest.prohibitedTerms.join("\n")}</dd>
          <dt>{t.factsTitle}</dt><dd>{Object.entries(latest.facts).map(([key, value]) => <p key={key}>{key}: {value}</p>)}</dd>
        </dl>
        <p>{t.replaceWarning}</p>
        <Button type="button" variant="outline" onClick={() => replaceDraft(latest)}>{t.replaceDraft}</Button>
      </section>}
      {/* The revision id stays in state for conflict fencing; owners see when it was saved, not the uuid. */}
      {currentRevision && <p>{locale==='en'?'Current version saved':locale==='zh-TW'?'目前版本儲存於':'目前版本儲存於'} {formatDateTime(currentRevision.createdAt, locale, timezone)}</p>}
      {brand.revisions?.length ? <details><summary>{locale==='en'?'Saved profile history':locale==='zh-TW'?'品牌儲存紀錄':'品牌儲存記錄'}</summary><ol>{brand.revisions.map(revision=><li key={revision.id}><details><summary>{formatDateTime(revision.createdAt, locale, timezone)} · {revision.source==='baseline'?(locale==='en'?'Known current baseline':'已知目前資料基線'):(locale==='en'?'Saved revision':'已儲存版本')}{revision.id===revisionId?(locale==='en'?' · current':' · 目前版本'):''}</summary><code>{revision.id}</code>{revision.profile ? <dl>
        <dt>{t.voiceLabel}</dt><dd>{t.voices[revision.profile.voice]}</dd>
        <dt>{t.languagesLabel}</dt><dd>{revision.profile.languages.map(language=>t.languages[language]).join(', ')}</dd>
        <dt>{t.claimsLabel}</dt><dd><ul>{revision.profile.approved_claims.map((claim,i)=><li key={i}>{claim}</li>)}</ul></dd>
        <dt>{t.prohibitedLabel}</dt><dd><ul>{revision.profile.prohibited_terms.map((term,i)=><li key={i}>{term}</li>)}</ul></dd>
        <dt>{t.factsTitle}</dt><dd><dl>{Object.entries(revision.profile.facts).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></dd>
      </dl>:<p>{locale==='en'?'Historical content cannot be read.':'未能讀取這項歷史資料。'}</p>}</details></li>)}</ol></details>:null}
      <div className="settings-grid">
        <SectionCard>
          <p className="eyebrow">{t.voiceEyebrow}</p>
          <h2>{t.voiceTitle}</h2>
          <div className="field-stack">
            <Label htmlFor="brand-voice">{t.voiceLabel}</Label>
            <Select value={voice} onValueChange={(value) => { if (VOICES.includes(value as BrandVoice)) setVoice(value as BrandVoice) }} disabled={readOnly}>
              <SelectTrigger id="brand-voice" aria-invalid={error?.voice || undefined}><SelectValue placeholder={t.voiceUnset}>{voice ? t.voices[voice] : t.voiceUnset}</SelectValue></SelectTrigger>
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
          <Badge variant="outline">{savedProfile.updatedAt ? `${t.updated} ${savedProfile.updatedAt.slice(0, 10)}` : t.neverSaved}</Badge>
        </SectionCard>
      </div>
    </form>
  )
}

const COPY = {
  en: {
    eyebrow: "What Kinnso may say", title: "Brand profile",
    description: "Kinnso writes only with the voice, facts and photos you confirm here. If a fact is missing, it asks you first.",
    save: "Save", saved: "Saved.",
    retry: "Retry save", voiceUnset: "Choose a voice", voiceRequired: "Choose a voice before saving.",
    invalidResponse: "We couldn't check that it saved. Your text is still here; check it and try again.",
    reviewLatest: "Review latest profile", latestTitle: "Latest saved profile",
    latestFailed: "The latest profile could not be loaded. Your input is retained; try reviewing it again.",
    replaceWarning: "Review this saved version before replacing your unsaved draft. Copy any edits you want to keep first.",
    replaceDraft: "Use latest profile and replace my draft",
    voiceEyebrow: "Voice and language", voiceTitle: "Brand voice", voiceLabel: "Choose voice",
    voices: { warm: "Warm, local and sincere", professional: "Clear and professional", playful: "Friendly and lively", direct: "Short and direct" },
    languagesLabel: "Languages Kinnso may write in", languages: { "zh-HK": "Traditional Chinese (Hong Kong)", "zh-TW": "Traditional Chinese (Taiwan)", en: "English" },
    languageRequired: "Choose at least one language.",
    claimsLabel: "Lines you're happy to say (one per line)", claimsPlaceholder: "Warm local food, sincerely served",
    factsEyebrow: "Facts you've confirmed", factsTitle: "What Kinnso can use when writing", factsEmpty: "No confirmed facts yet. Kinnso will ask before mentioning seats, prices or allergens.",
    factKey: "Detail", factValue: "Value", addFact: "Add a detail", removeFact: "Remove this detail",
    prohibitedEyebrow: "Never say", prohibitedTitle: "Kinnso never guesses these",
    guardrail1: "Best, number one or guaranteed outcomes", guardrail2: "Unconfirmed prices, ingredients or allergens", guardrail3: "Saying something happened because of us when it only came after",
    prohibitedLabel: "Words never to use (one per line)", prohibitedPlaceholder: "best in town",
    versionEyebrow: "Last saved", versionTitle: "Your saved profile", versionBody: "Saving replaces the current profile. Each change is kept in your activity log.",
    updated: "Updated", neverSaved: "Defaults · not saved yet",
    conflict:"Someone else saved this profile just now. Your text is still here; load their version, then add your changes.",
    invalid: "The profile was rejected:", forbidden: "Only the owner can edit the brand profile.",
    network: "The server could not be reached; try again shortly.", failed: "The profile could not be saved.",
  },
  "zh-HK": {
    eyebrow: "Kinnso 可以講咩", title: "品牌資料",
    description: "Kinnso 只會用你喺度確認咗嘅語氣、資料同相片寫稿；欠資料就會先問你。",
    save: "儲存", saved: "已儲存。",
    retry: "重試儲存", voiceUnset: "請選擇語氣", voiceRequired: "儲存前請選擇語氣。",
    invalidResponse: "未能確認儲存咗。你寫嘅嘢仲喺度，睇一睇再試。",
    reviewLatest: "查看最新品牌資料", latestTitle: "最新已儲存品牌資料",
    latestFailed: "未能載入最新資料。你的輸入仍然保留；請再次查看。",
    replaceWarning: "取代未儲存草稿前，請先檢查這個版本。請先複製要保留的修改。",
    replaceDraft: "使用最新資料並取代我的草稿",
    voiceEyebrow: "語氣及語言", voiceTitle: "品牌語氣", voiceLabel: "選擇語氣",
    voices: { warm: "溫暖、本地及真誠", professional: "清晰專業", playful: "親切活潑", direct: "簡短直接" },
    languagesLabel: "Kinnso 可以用嘅語言", languages: { "zh-HK": "繁體中文（香港）", "zh-TW": "繁體中文（台灣）", en: "英文" },
    languageRequired: "請選擇至少一種語言。",
    claimsLabel: "你肯講嘅句子（每行一句）", claimsPlaceholder: "家常滋味，真誠款待",
    factsEyebrow: "店主確認資料", factsTitle: "寫稿時可以用嘅資料", factsEmpty: "未有確認資料。Kinnso 講到座位、價錢或致敏原之前會先問你。",
    factKey: "項目", factValue: "內容", addFact: "加資料", removeFact: "移除呢項",
    prohibitedEyebrow: "唔好講", prohibitedTitle: "Kinnso 唔會自己估",
    guardrail1: "最好、第一或保證成效", guardrail2: "未確認價格、食材或致敏原", guardrail3: "講到好似一定係因為我哋先有效果",
    prohibitedLabel: "唔想用嘅字眼（每行一個）", prohibitedPlaceholder: "全港最好",
    versionEyebrow: "上次儲存", versionTitle: "你儲存咗嘅品牌資料", versionBody: "每次儲存都會取代舊嘅，改過咩都記低喺活動紀錄。",
    updated: "更新於", neverSaved: "預設值 · 尚未儲存",
    conflict:"啱啱有人儲存咗品牌資料。你寫嘅嘢仲喺度；先載入佢嗰版，再加返你嘅修改。",
    invalid: "品牌資料未獲接受：", forbidden: "只有店主可以編輯品牌資料。",
    network: "無法連接伺服器，請稍後再試。", failed: "未能儲存品牌資料。",
  },
  "zh-TW": {
    eyebrow: "Kinnso 可以說什麼", title: "品牌資料",
    description: "Kinnso 只會用你在這裡確認的語氣、資料和照片寫稿；缺少資料時會先問你。",
    save: "儲存", saved: "已儲存。",
    retry: "重試儲存", voiceUnset: "請選擇語氣", voiceRequired: "儲存前請選擇語氣。",
    invalidResponse: "無法確認已經儲存。你寫的內容還在，請檢查後再試。",
    reviewLatest: "查看最新品牌資料", latestTitle: "最新已儲存品牌資料",
    latestFailed: "無法載入最新資料。你的輸入仍然保留；請再次查看。",
    replaceWarning: "取代未儲存草稿前，請先檢查這個版本。請先複製要保留的修改。",
    replaceDraft: "使用最新資料並取代我的草稿",
    voiceEyebrow: "語氣及語言", voiceTitle: "品牌語氣", voiceLabel: "選擇語氣",
    voices: { warm: "溫暖、在地及真誠", professional: "清晰專業", playful: "親切活潑", direct: "簡短直接" },
    languagesLabel: "Kinnso 可以使用的語言", languages: { "zh-HK": "繁體中文（香港）", "zh-TW": "繁體中文（台灣）", en: "英文" },
    languageRequired: "請選擇至少一種語言。",
    claimsLabel: "你願意說的句子（每行一句）", claimsPlaceholder: "家常滋味，真誠款待",
    factsEyebrow: "店家確認資料", factsTitle: "寫稿時可以使用的資料", factsEmpty: "還沒有確認的資料。Kinnso 提到座位、價格或過敏原之前會先問你。",
    factKey: "項目", factValue: "內容", addFact: "新增資料", removeFact: "移除這項",
    prohibitedEyebrow: "不要說", prohibitedTitle: "Kinnso 不會自己猜",
    guardrail1: "最好、第一或保證成效", guardrail2: "未確認價格、食材或過敏原", guardrail3: "說得好像一定是因為我們才有效果",
    prohibitedLabel: "不想使用的字詞（每行一個）", prohibitedPlaceholder: "全台最好",
    versionEyebrow: "上次儲存", versionTitle: "你儲存的品牌資料", versionBody: "每次儲存都會取代舊的，改過什麼都會記在活動紀錄。",
    updated: "更新於", neverSaved: "預設值 · 尚未儲存",
    conflict:"剛剛有人儲存了品牌資料。你寫的內容還在；先載入他的版本，再加回你的修改。",
    invalid: "品牌資料未獲接受：", forbidden: "只有店家負責人可以編輯品牌資料。",
    network: "無法連線至伺服器，請稍後再試。", failed: "無法儲存品牌資料。",
  },
} as const
