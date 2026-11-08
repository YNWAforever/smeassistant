import type { ReactNode } from "react"

/**
 * CSS-only page entrance (decided 2026-10-20: no experimental View
 * Transitions). Use it in a route `template.tsx`, which Next.js remounts on
 * every navigation, so the fade plays per page without remounting layouts.
 * Opacity only (no layout shift), tablet and up only, skipped under reduced
 * motion; on phones the page appears at once to protect responsiveness.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="k-page-enter">{children}</div>
}
