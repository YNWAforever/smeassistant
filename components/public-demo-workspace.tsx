import Link from "next/link"
import {
  ArrowRight,
  Check,
  Eye,
  FileClock,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react"

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-launcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DemoBadge, FactType, PublicPageFrame, ScoreDial } from "@/components/product-ui"
import { copy, type PrototypeLocale } from "@/lib/copy"

export function PublicDemoWorkspacePage({ locale }: { locale: PrototypeLocale }) {
  const t = copy[locale].demoWorkspace
  return (
    <PublicPageFrame locale={locale} demo>
      <main className="public-demo-workspace">
        <header className="public-demo-head">
          <div>
            <div className="public-demo-badges"><DemoBadge locale={locale} /><Badge variant="outline"><Eye />{t.readOnly}</Badge></div>
            <h1>{t.title}</h1>
            <p>{t.lead}</p>
          </div>
          <div className="public-demo-actions">
            <ContextualAssistant locale={locale} surface="home" />
            <Button asChild variant="outline"><Link href={`/${locale}/owner/sign-in`}>{t.signIn}</Link></Button>
          </div>
        </header>

        <div className="public-demo-snapshot">
          <ShieldCheck aria-hidden="true" />
          <div><strong>{t.snapshot.title}</strong><span>{t.snapshot.body}</span></div>
          <code>scan_kmh_20260825</code>
        </div>

        <section className="public-demo-grid" aria-label={t.gridLabel}>
          <article className="public-demo-priority">
            <div className="card-label-row"><span><Sparkles />{t.priority.label}</span><Badge className="priority-urgent">{t.priority.urgent}</Badge></div>
            <h2>{t.priority.title}</h2>
            <p>{t.priority.body}</p>
            <div className="public-demo-evidence"><FactType type="Observed" /><div><strong>31% → 18%</strong><span>{t.priority.evidence}</span><small>scan_kmh_20260825 · 2026-08-25 09:42 HKT</small></div></div>
            <ContextualAssistant locale={locale} surface="home" triggerLabel={t.priority.ask} />
          </article>

          <article className="public-demo-score">
            <div className="card-label-row"><span><TrendingDown />{t.score.label}</span><Badge variant="outline">{t.score.coverage}</Badge></div>
            <ScoreDial score={62} coverage={78} delta={-4} />
            <p>{t.score.body}</p>
            <Button asChild variant="outline"><Link href={`/${locale}/sample-report`}>{t.score.report}<ArrowRight /></Link></Button>
          </article>

          <article className="public-demo-proof">
            <div className="card-label-row"><span><RefreshCw />{t.proof.label}</span><Badge variant="outline">{t.proof.association}</Badge></div>
            <strong className="public-demo-proof-value">+9 <small>{t.proof.points}</small></strong>
            <h2>{t.proof.title}</h2>
            <p>{t.proof.body}</p>
            <div className="public-demo-scan-pair"><code>scan_kmh_20260805</code><ArrowRight /><code>scan_kmh_20260820</code></div>
          </article>
        </section>

        <section className="public-demo-flow">
          <div>
            <p className="eyebrow">{copy[locale].shell.assistant.name}</p>
            <h2>{t.flow.title}</h2>
            <p>{t.flow.body}</p>
          </div>
          <ol>
            {t.flow.steps.map((item, index) => <li key={item}><span>{index < 4 ? <Check /> : <LockKeyhole />}</span><strong>{item}</strong></li>)}
          </ol>
          <div className="public-demo-flow-actions"><ContextualAssistant locale={locale} surface="sample" /><Button asChild><Link href={`/${locale}/scan`}>{t.flow.scan}<ArrowRight /></Link></Button></div>
        </section>

        <div className="public-demo-footer-note"><FileClock /><span>{t.footer}</span></div>
      </main>
    </PublicPageFrame>
  )
}
