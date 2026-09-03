"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** One query-param-bound filter `Select` (channel, status) for the actions page. */
export function ActionFilterSelect({
  param,
  value,
  options,
  allLabel,
  ariaLabel,
}: {
  param: string
  value: string
  options: Array<{ value: string; label: string }>
  allLabel: string
  ariaLabel: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  function change(next: string) {
    const query = new URLSearchParams(params.toString())
    if (next === "all") query.delete(param)
    else query.set(param, next)
    const qs = query.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  const current = options.find((o) => o.value === value)?.label ?? allLabel
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger aria-label={ariaLabel}><SelectValue>{current}</SelectValue></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
