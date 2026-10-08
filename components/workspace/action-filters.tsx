"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

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
    query.delete("cursor")
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

export function ActionSearch({ value, label, submitLabel }: { value: string; label: string; submitLabel: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [draft, setDraft] = useState(value);
  return <form className="flex min-w-0 flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const query = new URLSearchParams(params.toString()); query.delete("cursor"); if (draft.trim()) query.set("q", draft.trim()); else query.delete("q"); router.push(`${pathname}${query.size ? `?${query}` : ""}`); }}><label>{label}<input type="search" value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} className="min-w-0 w-full rounded border p-2" /></label><button type="submit">{submitLabel}</button></form>;
}
