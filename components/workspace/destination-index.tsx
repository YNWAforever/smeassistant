import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronRight, LockKeyhole, type LucideIcon } from "lucide-react"

import { PageIntro } from "@/components/product-ui"

export type DestinationLink = { key: string; title: string; body: string; icon: LucideIcon; href: string; locked?: boolean }

/**
 * The landing page of a destination (Business, Settings): one row per section.
 * A section the viewer's role cannot open is a locked row with its reason,
 * never a link that bounces them (target IA "Role visibility"); the page
 * itself still enforces the role on the server.
 */
export function DestinationIndex({ title, lead, links, lockedLabel, header }: { title: string; lead: string; links: DestinationLink[]; lockedLabel: string; header?: ReactNode }) {
  return (
    <div className="destination-page">
      <PageIntro title={title} description={lead} />
      {header}
      <ul className="destination-list">
        {links.map(({ key, title: label, body, icon: Icon, href, locked }) => (
          <li key={key}>
            {locked ? (
              <div className="destination-row" data-locked="true">
                <span className="destination-icon" aria-hidden="true"><Icon /></span>
                <span className="destination-text"><strong>{label}</strong><small>{body}</small></span>
                <span className="destination-lock"><LockKeyhole aria-hidden="true" />{lockedLabel}</span>
              </div>
            ) : (
              <Link className="destination-row" href={href}>
                <span className="destination-icon" aria-hidden="true"><Icon /></span>
                <span className="destination-text"><strong>{label}</strong><small>{body}</small></span>
                <ChevronRight aria-hidden="true" className="destination-chevron" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
