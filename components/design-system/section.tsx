import type { ReactNode } from "react"

/** Gallery section with a heading (dev route only). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `ds-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  return (
    <section className="grid gap-4 border-t border-line pt-8" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}
