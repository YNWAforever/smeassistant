"use client"

import { usePathname } from "next/navigation"
import { Check, CircleAlert, CircleDashed, Minus, TrendingDown, TrendingUp, X } from "lucide-react"
import { type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { copy, normaliseLocale, type PrototypeLocale } from "@/lib/copy"
import type { Capability, ProviderState } from "@/lib/domain"

/**
 * Demo-surface only (CLAUDE.md §5 "Global"): /sample-report, /demo-workspace and
 * workspaces with `is_demo`. `show` defaults to false so every production surface
 * renders no bar; the markup and the `.prototype-bar` CSS are unchanged.
 */
export function EnvironmentBar({ locale, show = false }: { locale: PrototypeLocale; show?: boolean }) {
  const bar = copy[locale].funnel.demoBar
  if (!show) return null
  return (
    <div className="prototype-bar" role="status" aria-label={`${bar.title}, ${bar.body}`}>
      <span className="prototype-dot" aria-hidden="true" />
      <strong>{bar.title}</strong>
      <span aria-hidden="true">·</span>
      <span>{bar.body}</span>
      <span className="ml-auto hidden sm:inline">{bar.note}</span>
    </div>
  )
}

export function CapabilityBadge({ value, context }: { value: Capability; context?: "action" }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  const className = {
    Live: "cap-live",
    Beta: "cap-beta",
    Demo: "cap-demo",
    "Requires connection": "cap-connection",
    Planned: "cap-planned",
  }[value]
  return (
    <Badge variant="outline" className={className} title={context === "action" ? copy[locale].workspace.verification.featureHelp : undefined}>
      {value === "Live" && context === "action" ? copy[locale].workspace.verification.featureAvailable : copy[locale].product.capability[value]}
    </Badge>
  )
}

export function ProviderBadge({ state, locale = "en" }: { state: ProviderState; locale?: PrototypeLocale }) {
  const t = copy[locale].common
  const labels: Record<ProviderState, string> = {
    measured: t.measured,
    unavailable: t.unavailable,
    unsupported: t.unsupported,
    failed: t.failed,
    pending: t.pending,
  }
  const icons: Record<ProviderState, ReactNode> = {
    measured: <Check aria-hidden="true" />,
    unavailable: <CircleDashed aria-hidden="true" />,
    unsupported: <X aria-hidden="true" />,
    failed: <CircleAlert aria-hidden="true" />,
    pending: <CircleDashed aria-hidden="true" />,
  }
  return (
    <Badge variant="outline" className={`provider-${state}`}>
      {icons[state]}
      {labels[state]}
    </Badge>
  )
}

export function DemoBadge({ locale = "en" }: { locale?: PrototypeLocale }) {
  return <Badge className="demo-badge">{copy[locale].common.demo}</Badge>
}


/** Direction glyph for a change. No comparable change (null) or no movement is flat, never an up-trend. */
export function TrendIcon({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0 || !Number.isFinite(delta)) return <Minus aria-hidden="true" data-trend="flat" />
  return delta < 0 ? <TrendingDown aria-hidden="true" data-trend="down" /> : <TrendingUp aria-hidden="true" data-trend="up" />
}

export function FactType({ type }: { type: "Observed" | "Inference" | "Recommended" | "Attributed" | "Estimated" | "Unknown" }) {
  const pathname = usePathname()
  const locale = normaliseLocale(pathname.split("/").filter(Boolean)[0])
  return <span className={`fact-type fact-${type.toLowerCase()}`}>{copy[locale].product.factType[type]}</span>
}
