"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { ActionCard } from "@/components/kinnso/action-card"
import { ApprovalBar } from "@/components/kinnso/approval-bar"
import { CommandPalette } from "@/components/kinnso/command-palette"
import { ConfirmDialog } from "@/components/kinnso/confirm-dialog"
import { DataTable } from "@/components/kinnso/data-table"
import { EvidenceBadge } from "@/components/kinnso/evidence-badge"
import { PageHeader } from "@/components/kinnso/page-header"
import { SkeletonList } from "@/components/kinnso/skeletons"
import { StatCard } from "@/components/kinnso/stat-card"
import { EmptyState, ErrorState, PartialDataState, PermissionDenied } from "@/components/kinnso/states"
import { VersionDiff } from "@/components/kinnso/version-diff"
import { Button } from "@/components/ui/button"
import { supportedLocales, type PrototypeLocale } from "@/lib/copy"

import { Section } from "./section"
import { VisualGallery } from "./visual-gallery"

const SWATCHES = [
  ["canvas", "paper", "paper-2", "line"],
  ["ink", "ink-2", "ink-3", "inverse"],
  ["brand", "brand-hover", "brand-text", "brand-soft"],
  ["success", "success-text", "success-soft", "warning"],
  ["warning-text", "warning-soft", "danger", "danger-text"],
  ["danger-soft", "info-soft", "info-text", "violet-soft"],
] as const

const TYPE_SCALE = [
  ["text-xs", "12 px floor"],
  ["text-sm", "14 px"],
  ["text-base", "16 px body"],
  ["text-lg", "18 px"],
  ["text-xl", "20 px"],
  ["text-2xl", "24 px"],
  ["text-3xl", "30 px"],
  ["text-4xl", "36 px"],
] as const

/** Sample values for the gallery only (dev route); never shown to merchants. */
const SAMPLE = {
  sources: [
    { key: "search", label: "Google Search", state: "measured" as const },
    { key: "maps", label: "Google Maps", state: "measured" as const },
    { key: "ai", label: "AI search", state: "pending" as const },
    { key: "ig", label: "Instagram", state: "unavailable" as const },
    { key: "web", label: "Website", state: "failed" as const },
  ],
  observedAt: "2026-10-19T06:00:00Z",
}

export function DesignSystemGallery({ locale }: { locale: PrototypeLocale }) {
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [reduceMotion, setReduceMotion] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    return () => { delete document.documentElement.dataset.theme }
  }, [theme])
  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.motion = "reduce"
    else delete document.documentElement.dataset.motion
    return () => { delete document.documentElement.dataset.motion }
  }, [reduceMotion])

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-8">
        <PageHeader
          eyebrow="Internal · not in production"
          title="Kinnso OS design system"
          description="Tokens and components, in both workspace themes and every locale."
          actions={
            <>
              <Button variant="outline" className="min-h-11" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? "Light preview" : "Dark preview"}
              </Button>
              <Button variant="outline" className="min-h-11" aria-pressed={reduceMotion} onClick={() => setReduceMotion(!reduceMotion)}>
                Reduced motion: {reduceMotion ? "on" : "off"}
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => setPaletteOpen(true)}>Command palette (Ctrl K)</Button>
            </>
          }
        />
        <nav aria-label="Locale" className="flex gap-3 text-sm">
          {supportedLocales.map((code) => (
            <Link key={code} href={`/${code}/dev/design-system`} aria-current={code === locale ? "page" : undefined} className={code === locale ? "font-bold text-brand-text" : "text-ink-2"}>{code}</Link>
          ))}
        </nav>

        <Section title="Colour tokens">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SWATCHES.flat().map((name) => (
              <div key={name} className="flex items-center gap-3">
                <span className="size-10 shrink-0 rounded-md border border-line" style={{ background: `var(--${name})` }} />
                <code className="text-sm">--{name}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="grid gap-2">
            {TYPE_SCALE.map(([cls, note]) => (
              <p key={cls} className={`${cls} text-ink`}>{note} · 證據為先，行動為本 · Evidence first</p>
            ))}
          </div>
        </Section>

        <Section title="Radius and elevation">
          <div className="flex flex-wrap gap-4">
            {["--shadow-xs", "--shadow-sm", "--shadow-md"].map((shadow) => (
              <div key={shadow} className="grid size-28 place-items-center rounded-lg bg-paper text-xs" style={{ boxShadow: `var(${shadow})` }}>{shadow}</div>
            ))}
          </div>
        </Section>

        <VisualGallery locale={locale} />

        <Section title="Evidence badges">
          <div className="flex flex-wrap gap-2">
            <EvidenceBadge source="Google Maps" state="measured" observedAt={SAMPLE.observedAt} locale={locale} />
            <EvidenceBadge source="Instagram" state="unavailable" observedAt={null} locale={locale} />
          </div>
        </Section>

        <Section title="Stat cards">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Google rating" value={4.1} unit="/ 5" factType="Observed" source="Google Maps" observedAt={SAMPLE.observedAt} locale={locale} />
            <StatCard label="Response rate" value={null} factType="Estimated" source="Google Maps" observedAt={SAMPLE.observedAt} locale={locale} />
            <StatCard label="Visibility score" value={62} factType="Observed" source="Scan" observedAt={SAMPLE.observedAt} delta={{ value: 4, comparable: false }} locale={locale} />
          </div>
        </Section>

        <Section title="Actions and approval">
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard title="Reply to 3 reviews" summary="Three of the newest five reviews have no owner reply." impact="high" effort="low" minutes={8} factType="Observed" status="Draft" href="#" locale={locale} />
            <ActionCard title="Add opening hours" impact="medium" effort="low" minutes={10} factType="Recommended" href="#" locale={locale} />
          </div>
          <ApprovalBar versionNo={2} stateLabel="Draft" canApprove onApprove={() => {}} onRequestChanges={() => {}} locale={locale} />
          <ApprovalBar versionNo={2} stateLabel="Draft" canApprove={false} onApprove={() => {}} locale={locale} />
          <VersionDiff before="Thank you for visiting us." after="Thank you so much for visiting us again." beforeNo={1} afterNo={2} locale={locale} />
          <ConfirmDialog trigger={<Button className="min-h-11 justify-self-start">Approve version 2…</Button>} title="Approve version 2?" description="Approval locks this exact version." onConfirm={() => {}} locale={locale} />
        </Section>

        <Section title="States">
          <div className="grid gap-4 md:grid-cols-2">
            <EmptyState locale={locale} />
            <ErrorState onRetry={() => {}} locale={locale} />
            <PartialDataState locale={locale} />
            <PermissionDenied locale={locale} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <EmptyState kind="noData" actionHref={`/${locale}/scan`} locale={locale} />
            <EmptyState kind="noActions" actionHref="#" locale={locale} />
            <EmptyState kind="allDone" actionHref="#" locale={locale} />
          </div>
          <SkeletonList rows={2} label="Loading" />
        </Section>

        <Section title="Data table">
          <DataTable
            caption="Sources in the latest scan"
            locale={locale}
            rowKey={(row) => row.key}
            rows={SAMPLE.sources}
            columns={[
              { key: "source", header: "Source", cell: (row) => row.label },
              { key: "state", header: "State", cell: (row) => row.state },
            ]}
          />
        </Section>
      </div>
      <CommandPalette
        locale={locale}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={[
          { id: "today", label: "Today", group: "Go to", href: `/${locale}/dev/design-system` },
          { id: "actions", label: "Actions", group: "Go to", href: `/${locale}/dev/design-system` },
          { id: "billing", label: "Plan and usage", group: "Settings", keywords: "billing invoice" },
        ]}
      />
    </div>
  )
}
