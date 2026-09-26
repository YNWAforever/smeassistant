import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { FactType } from "@/components/product-ui"
import { Button } from "@/components/ui/button"
import type { PrototypeLocale } from "@/lib/copy"
import { t } from "@/lib/i18n"

/**
 * P3.5b: a scan past its three attempts. Resume cannot help (the lease will
 * never claim it again), so this replaces the stalled card's Resume button
 * with the honest outcome and a new scan. Reuses .partial-result-card.
 */
export function ScanStuckCard({ locale, reference }: { locale: PrototypeLocale; reference: string }) {
  return (
    <div className="partial-result-card" role="status">
      <div>
        <FactType type="Unknown" />
        <h2>{t(locale, "problems.scanStuck.title")}</h2>
        <p>{t(locale, "problems.scanStuck.body")}</p>
        <small>{t(locale, "problems.reference", { reference })}</small>
      </div>
      <Button asChild>
        <Link href={`/${locale}/scan`}>
          {t(locale, "problems.scanStuck.button")} <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}
