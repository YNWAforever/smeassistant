import { Skeleton } from "@/components/ui/skeleton"

/** Loading placeholders sized like the real cards, so content does not jump (no CLS). */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="kinnso-card grid gap-3 p-5" aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-2/3" />
      {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className="h-3.5 w-full" />)}
    </div>
  )
}

export function SkeletonList({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => <SkeletonCard key={index} lines={2} />)}
      <span className="sr-only">{label}</span>
    </div>
  )
}
