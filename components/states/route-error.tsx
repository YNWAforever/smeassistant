"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect } from "react"

import { ErrorState } from "@/components/kinnso/states"
import { Button } from "@/components/ui/button"
import { copy, normaliseLocale } from "@/lib/copy"

export type RouteErrorProps = { error: Error & { digest?: string }; unstable_retry: () => void }

/**
 * The body of every `error.tsx`: the shared error state in the page's
 * language, a retry that re-fetches the segment (server components included),
 * Next's digest as a reference the owner can quote, and one way out. The
 * digest is a hash of the server error; the message itself never reaches
 * the browser in production. Inside the workspace the shell already owns
 * `<main>`, so the state renders in a plain section there.
 */
export function RouteError({ error, unstable_retry, home }: RouteErrorProps & { home: "site" | "today" }) {
  const params = useParams<{ locale?: string; workspaceSlug?: string }>()
  const locale = normaliseLocale(params.locale)
  const t = copy[locale].ui.states
  useEffect(() => { console.error("[route-error]", error.digest ?? error.message) }, [error])
  const href = home === "today" && params.workspaceSlug ? `/${locale}/owner/${params.workspaceSlug}` : `/${locale}`
  const body = (
      <ErrorState
        locale={locale}
        level={1}
        onRetry={() => unstable_retry()}
        reference={error.digest}
        secondary={<Button asChild variant="outline" className="min-h-11"><Link href={href}>{home === "today" ? t.today : t.home}</Link></Button>}
      />
  )
  return home === "today" ? <div className="route-state">{body}</div> : <main id="main-content" className="route-state">{body}</main>
}
