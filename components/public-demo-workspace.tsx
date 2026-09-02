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

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DemoBadge, FactType, PublicPageFrame, ScoreDial } from "@/components/product-ui"
import type { PrototypeLocale } from "@/lib/copy"

export function PublicDemoWorkspacePage({ locale }: { locale: PrototypeLocale }) {
  const isChinese = locale !== "en"
  return (
    <PublicPageFrame locale={locale}>
      <main className="public-demo-workspace">
        <header className="public-demo-head">
          <div>
            <div className="public-demo-badges"><DemoBadge locale={locale} /><Badge variant="outline"><Eye />{isChinese ? "公開唯讀" : "Public read-only"}</Badge></div>
            <h1>{isChinese ? "錦汶館 · 今日能見度焦點" : "Kam Man House · Today’s visibility focus"}</h1>
            <p>{isChinese ? "固定、已清理的示範資料。你可以理解證據、查看下一步及預覽草稿，但不能在公開頁審批、匯出或發佈。" : "Fixed, sanitised demo data. Understand the evidence, inspect the next step and preview a draft—without approval, export or publishing controls."}</p>
          </div>
          <div className="public-demo-actions">
            <ContextualAssistant locale={locale} surface="home" />
            <Button asChild variant="outline"><Link href={`/${locale}/owner/sign-in`}>{isChinese ? "登入後使用工作台" : "Sign in to use the workspace"}</Link></Button>
          </div>
        </header>

        <div className="public-demo-snapshot">
          <ShieldCheck aria-hidden="true" />
          <div><strong>{isChinese ? "Snapshot 不會混合" : "Snapshots stay separate"}</strong><span>{isChinese ? "目前顯示 scan_kmh_20260825 · 觀察於 2026-08-25 09:42 HKT。8 月 5 日及 20 日的歷史數據只在比較卡中引用。" : "Showing scan_kmh_20260825 · observed 25 Aug 2026, 09:42 HKT. Historical 5 and 20 August data appears only in the comparison card."}</span></div>
          <code>scan_kmh_20260825</code>
        </div>

        <section className="public-demo-grid" aria-label={isChinese ? "公開示範營運摘要" : "Public demo operating brief"}>
          <article className="public-demo-priority">
            <div className="card-label-row"><span><Sparkles />{isChinese ? "今日首要行動" : "Today’s priority"}</span><Badge className="priority-urgent">{isChinese ? "緊急" : "Urgent"}</Badge></div>
            <h2>{isChinese ? "回覆 7 則未回覆的 Google 評論" : "Reply to seven unanswered Google reviews"}</h2>
            <p>{isChinese ? "草稿已按品牌語氣及評論內容準備，等待店主在登入後審閱指定版本。" : "Drafts are prepared from the brand voice and review context, ready for exact-version owner review after sign-in."}</p>
            <div className="public-demo-evidence"><FactType type="Observed" /><div><strong>31% → 18%</strong><span>{isChinese ? "同一 Google 商戶及奕蔭街 · 7 則待回覆" : "Same Google Business profile and Yik Yam Street · seven unanswered"}</span><small>scan_kmh_20260825 · 2026-08-25 09:42 HKT</small></div></div>
            <ContextualAssistant locale={locale} surface="home" triggerLabel={isChinese ? "問助理：為何先做這項？" : "Ask why this comes first"} />
          </article>

          <article className="public-demo-score">
            <div className="card-label-row"><span><TrendingDown />{isChinese ? "最新可比較變化" : "Latest comparable change"}</span><Badge variant="outline">{isChinese ? "覆蓋率 78%" : "78% coverage"}</Badge></div>
            <ScoreDial score={62} coverage={78} delta={-4} />
            <p>{isChinese ? "評分由 66 降至 62。Instagram 來源未能取得完整快照，因此被排除，不會當成零分。" : "The score moved from 66 to 62. Incomplete Instagram evidence is excluded rather than scored as zero."}</p>
            <Button asChild variant="outline"><Link href={`/${locale}/sample-report`}>{isChinese ? "查看完整示範報告" : "View the full sample report"}<ArrowRight /></Link></Button>
          </article>

          <article className="public-demo-proof">
            <div className="card-label-row"><span><RefreshCw />{isChinese ? "歷史行動後觀察" : "Historical post-action observation"}</span><Badge variant="outline">{isChinese ? "時間關聯" : "Temporal association"}</Badge></div>
            <strong className="public-demo-proof-value">+9 <small>{isChinese ? "個百分點" : "points"}</small></strong>
            <h2>{isChinese ? "評論回覆率曾由 22% 升至 31%" : "Review response rate moved from 22% to 31%"}</h2>
            <p>{isChinese ? "來自 8 月 5 日及 20 日兩個可比較 snapshot。不能證明帶來收入、排名或訂座因果。" : "From comparable 5 and 20 August snapshots. It does not prove revenue, ranking or booking causation."}</p>
            <div className="public-demo-scan-pair"><code>scan_kmh_20260805</code><ArrowRight /><code>scan_kmh_20260820</code></div>
          </article>
        </section>

        <section className="public-demo-flow">
          <div>
            <p className="eyebrow">Visibility Operator</p>
            <h2>{isChinese ? "由問題開始，不用選擇十個 AI 工具。" : "Start from the problem, not a grid of ten AI tools."}</h2>
            <p>{isChinese ? "助理按目前證據選擇評論回覆能力，解釋優先原因，預覽一則草稿，再清楚停在審批界線。" : "The operator selects the review-response capability from the evidence, explains the priority, previews a draft and stops at the approval boundary."}</p>
          </div>
          <ol>
            {(isChinese ? ["解釋最新退步", "引用 scan_id 證據", "建議一項行動", "預覽新草稿", "登入後審批及重掃"] : ["Explain the regression", "Cite scan-ID evidence", "Recommend one action", "Preview a new draft", "Sign in to approve and re-scan"]).map((item, index) => <li key={item}><span>{index < 4 ? <Check /> : <LockKeyhole />}</span><strong>{item}</strong></li>)}
          </ol>
          <div className="public-demo-flow-actions"><ContextualAssistant locale={locale} surface="sample" /><Button asChild><Link href={`/${locale}/scan`}>{isChinese ? "掃描我的公司" : "Scan my business"}<ArrowRight /></Link></Button></div>
        </section>

        <div className="public-demo-footer-note"><FileClock /><span>{isChinese ? "公開頁不提供審批或發佈 controls。登入後仍需重新驗證真正 membership、角色及分店範圍；介面上的 demo role 不構成權限。" : "This public page exposes no approval or publishing controls. After sign-in, production must still re-authorise membership, role and location scope; a demo role in the UI is not authority."}</span></div>
      </main>
    </PublicPageFrame>
  )
}
