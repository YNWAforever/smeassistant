"use client"

import type { Market } from "@sme-scanner/region"
import { ArrowRight, CircleAlert, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { copy, type PrototypeLocale } from "@/lib/copy"

import { HeroLoop } from "./hero-loop"
import { useLandingMarket } from "./market-context"

/**
 * One value line, one field, an explicit market and one primary button. The
 * scan starts with no sign-up and hands off to /scan?market=&business=
 * exactly as before; the market is the visitor's choice, never the language.
 */
export function LandingHero({ locale, market: fallback, headline }: { locale: PrototypeLocale; market: Market; headline?: string[] }) {
  const t = copy[locale].site.hero
  const router = useRouter()
  const { market, setMarket } = useLandingMarket(fallback)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) {
      setError(t.error)
      inputRef.current?.focus()
      return
    }
    router.push(`/${locale}/scan?${new URLSearchParams({ market, business: query.trim() }).toString()}`)
  }

  return (
    <section className="pl-hero" aria-labelledby="pl-hero-title">
      <div className="pl-hero-copy">
        <h1 id="pl-hero-title" className="pl-display">
          {headline && headline.length > 1 ? headline.map((phrase, index) => <span key={index} className="pl-phrase">{phrase}</span>) : t.title}
        </h1>
        <p className="pl-lead">{t.lead}</p>
        <form className="pl-scan" onSubmit={submit} noValidate>
          <div className="pl-field">
            <Label htmlFor="business-search" className="sr-only">{t.fieldLabel}</Label>
            <Search className="pl-field-icon" aria-hidden="true" />
            <Input
              ref={inputRef}
              id="business-search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setError("") }}
              placeholder={t.placeholder}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "business-search-error" : undefined}
              autoComplete="organization"
            />
          </div>
          {error && <p id="business-search-error" className="pl-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p>}
          <fieldset className="pl-market">
            <legend>{t.marketLabel}</legend>
            <RadioGroup className="pl-market-options" value={market} onValueChange={(value) => setMarket(value as Market)}>
              {(["hk", "tw"] as const).map((option) => (
                <Label key={option} className="pl-market-choice" htmlFor={`market-${option}`}>
                  <RadioGroupItem id={`market-${option}`} value={option} />
                  <span>{option === "hk" ? t.hk : t.tw}<small>{option === "hk" ? t.hkMeta : t.twMeta}</small></span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <button className="pl-cta" type="submit">{t.start}<ArrowRight aria-hidden="true" /></button>
          <p className="pl-note">{t.note}</p>
          <p className="pl-locale-note">{t.localeNote}</p>
        </form>
      </div>
      <HeroLoop locale={locale} />
    </section>
  )
}
