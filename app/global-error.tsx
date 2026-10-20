"use client"

import "./globals.css"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

import { normaliseLocale } from "@/lib/copy"
import { fatalCopy } from "@/lib/copy-fatal"

/**
 * Last resort when the root layout itself fails. It replaces <html>, so it
 * takes the locale from the path and its strings from lib/copy-fatal.ts.
 * Plain buttons and links only: nothing here may depend on providers.
 */
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const locale = normaliseLocale(usePathname()?.split("/")[1])
  const t = fatalCopy[locale]
  useEffect(() => { console.error("[global-error]", error.digest ?? error.message) }, [error])
  return (
    <html lang={locale}>
      <body className="antialiased">
        <title>{t.title}</title>
        <main id="main-content" className="route-state global-error" role="alert">
          <p className="global-error-brand">Kinnso OS</p>
          <h1>{t.title}</h1>
          <p>{t.body}</p>
          <div className="global-error-actions">
            <button type="button" onClick={() => unstable_retry()}>{t.retry}</button>
            <a href={`/${locale}`}>{t.home}</a>
          </div>
          {error.digest && <p className="global-error-reference">{t.reference.replace("{code}", error.digest)}</p>}
        </main>
      </body>
    </html>
  )
}
