import { SectionCard } from "@/components/product-ui"
import { t } from "@/lib/i18n"
import type { OwnerProblem } from "@/lib/ops/failure-types"
import { ProblemItem, type ProblemSurfaceProps } from "@/components/workspace/problem-item"

/** Activity: every open problem. "No open problems" only when the list was read and is empty. */
export function ProblemsList({ problems, ...surface }: ProblemSurfaceProps & { problems: OwnerProblem[] }) {
  const { locale } = surface
  return (
    <SectionCard>
      <div className="section-card-heading"><div><h2>{t(locale, "problems.activityTitle")}</h2></div></div>
      {problems.length === 0 ? <p>{t(locale, "problems.activityEmpty")}</p> : problems.map((problem) => <ProblemItem key={`${problem.kind}:${problem.id}`} problem={problem} {...surface} />)}
    </SectionCard>
  )
}
