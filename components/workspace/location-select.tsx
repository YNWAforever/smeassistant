"use client"

import { MapPin } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PrototypeLocale } from "@/lib/copy"

/**
 * The prototype's location `Select`, bound to the `?location=` query param so
 * every workspace page (and the shell's scoped links) share one scope
 * (CLAUDE.md §3.1 "Location scoping stays a query param").
 */
export function LocationSelect({
  locale,
  value,
  locations,
  includeAll = true,
  className = "location-select",
  ariaLabel,
}: {
  locale: PrototypeLocale
  value: string
  locations: Array<{ slug: string; name: string }>
  includeAll?: boolean
  className?: string
  ariaLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const isChinese = locale !== "en"
  const allLabel = isChinese ? "所有地點" : "All locations"
  const current = value === "all" ? allLabel : (locations.find((l) => l.slug === value)?.name ?? value)
  function change(next: string) {
    const query = new URLSearchParams(params.toString())
    query.set("location", next)
    router.push(`${pathname}?${query.toString()}`)
  }
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger className={className} aria-label={ariaLabel ?? (isChinese ? "選擇地點" : "Choose location")}>
        <MapPin />
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {locations.map((location) => <SelectItem key={location.slug} value={location.slug}>{location.name}</SelectItem>)}
        {includeAll && <SelectItem value="all">{allLabel}</SelectItem>}
      </SelectContent>
    </Select>
  )
}
