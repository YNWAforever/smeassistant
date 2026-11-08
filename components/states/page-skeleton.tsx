"use client"

import { useParams } from "next/navigation"

import { SkeletonCard } from "@/components/kinnso/skeletons"
import { Skeleton } from "@/components/ui/skeleton"
import { copy, normaliseLocale } from "@/lib/copy"

type Variant = "today" | "list" | "cards" | "report"

/**
 * What a `loading.tsx` shows while a page's data loads: a heading bar and
 * cards roughly the size of the real ones, so the page does not jump when it
 * arrives. One polite status line names it for screen readers.
 */
export function PageSkeleton({ variant }: { variant: Variant }) {
  const locale = normaliseLocale(useParams<{ locale?: string }>().locale)
  const label = copy[locale].ui.states.loading
  return (
    <div className={`page-skeleton page-skeleton-${variant}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="page-skeleton-intro" aria-hidden="true">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {variant === "list" && <div className="page-skeleton-tabs" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-24 rounded-full" />)}</div>}
      <div className="page-skeleton-grid">
        {Array.from({ length: variant === "list" ? 4 : variant === "today" ? 3 : 4 }, (_, i) => <SkeletonCard key={i} lines={variant === "list" ? 2 : 3} />)}
      </div>
    </div>
  )
}
