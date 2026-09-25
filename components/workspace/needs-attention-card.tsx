import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { SectionCard } from "@/components/product-ui"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import type { OwnerProblem } from "@/lib/ops/failure-types"
import { ProblemItem, type ProblemSurfaceProps } from "@/components/workspace/problem-item"

/** Home: up to two open problems for the current location. Nothing at all when there are none. */
export function NeedsAttentionCard({ problems, ...surface }: ProblemSurfaceProps & { problems: OwnerProblem[] }) {
  if (problems.length === 0) return null
  const { locale, workspaceSlug } = surface
  return (
    <SectionCard>
      <div className="section-card-heading">
        <div><h2>{t(locale, "problems.homeTitle")}</h2></div>
        <Button asChild variant="ghost"><Link href={`/${locale}/owner/${workspaceSlug}/activity`}>{t(locale, "problems.homeMore")} <ArrowRight /></Link></Button>
      </div>
      {problems.slice(0, 2).map((problem) => <ProblemItem key={`${problem.kind}:${problem.id}`} problem={problem} {...surface} />)}
    </SectionCard>
  )
}
