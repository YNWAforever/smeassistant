import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";

import { PageIntro, SectionCard } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth";
import { normaliseLocale } from "@/lib/copy";
import { latestWorkspaceReport, listWorkspaceCards } from "@/lib/workspace/queries";
import { formatCoverage, roleLabel } from "@/lib/workspace/shell";

import { firstParam } from "../../_params";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = normaliseLocale((await params).locale);
  return {
    title: locale === "en" ? "Workspace" : "工作台",
    robots: { index: false, follow: false },
  };
}

function formatObserved(iso: string, locale: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "zh-HK", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Honest "workspace ready" home until Phase 3 wires `getHomeBrief`: real
 * name, market, tier, locations with their latest snapshot, and the newest
 * attached report. Every value comes from the database; nothing is sampled
 * from lib/demo-data.ts (guardrail 12).
 */
export default async function WorkspaceHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: rawLocale, workspaceSlug } = await params;
  const locale = normaliseLocale(rawLocale);
  const isChinese = locale !== "en";
  const membership = await requireMembership(workspaceSlug, locale);
  const query = await searchParams;
  const forbidden = firstParam(query.forbidden) === "1";
  const [cards, report] = await Promise.all([listWorkspaceCards(membership.userId), latestWorkspaceReport(membership.workspaceId)]);
  const card = cards.find((item) => item.workspace.id === membership.workspaceId);
  const workspace = card?.workspace;
  const locations = card?.locations ?? [];
  const marketLabel = workspace?.market === "tw" ? (isChinese ? "台灣" : "Taiwan") : (isChinese ? "香港" : "Hong Kong");
  const tierLabel = workspace?.tier === "paid" ? (isChinese ? "增長工作台" : "Growth Workspace") : (isChinese ? "免費方案" : "Free plan");
  const latestScan = locations.map((l) => l.lastScanAt).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;

  return (
    <>
      <PageIntro
        eyebrow={latestScan ? `${isChinese ? "快照" : "Snapshot"} · ${formatObserved(latestScan, locale, workspace?.timezone ?? "Asia/Hong_Kong")}` : (isChinese ? "尚未有快照" : "No snapshot yet")}
        title={workspace?.name ?? workspaceSlug}
        description={isChinese ? "工作台已準備好。每日焦點、行動與成效會在下一階段接上；現時先列出已連結的地點及最新報告。" : "Your workspace is ready. The daily brief, actions and insights are wired next; for now this lists the linked locations and the latest report."}
        actions={report ? <Button asChild><Link href={`/${locale}/r/${report.shareSlug}`}>{isChinese ? "查看最新報告" : "Open latest report"}<ArrowRight /></Link></Button> : undefined}
      />
      {forbidden && <div className="permission-note" role="alert"><TriangleAlert /><span>{isChinese ? "你的角色或地點範圍不允許該操作，已返回工作台首頁。" : "Your role or location scope does not allow that action; you have been returned to the workspace home."}</span></div>}
      <SectionCard>
        <p className="eyebrow">{isChinese ? "工作台" : "Workspace"}</p>
        <h2>{workspace?.name ?? workspaceSlug}</h2>
        <dl className="trust-dl">
          <div><dt>{isChinese ? "市場" : "Market"}</dt><dd>{marketLabel}</dd></div>
          <div><dt>{isChinese ? "方案" : "Plan"}</dt><dd>{tierLabel}</dd></div>
          <div><dt>{isChinese ? "你的角色" : "Your role"}</dt><dd>{roleLabel(membership.role, locale)}</dd></div>
          {workspace?.instagramHandle && <div><dt>Instagram</dt><dd>@{workspace.instagramHandle}</dd></div>}
        </dl>
      </SectionCard>
      <SectionCard>
        <p className="eyebrow">{isChinese ? "地點" : "Locations"}</p>
        <h2>{isChinese ? `${locations.length} 個地點` : `${locations.length} ${locations.length === 1 ? "location" : "locations"}`}</h2>
        {locations.length === 0 ? (
          <p>{isChinese ? "尚未有地點。完成認領後，主要地點會在這裡出現。" : "No locations yet. The primary location appears here once the claim is completed."}</p>
        ) : (
          <div className="workspace-choice-grid">
            {locations.map((location) => {
              const coverage = formatCoverage(location.latestCoverage);
              return (
                <Link key={location.id} href={`/${locale}/owner/${workspaceSlug}?location=${location.slug}`}>
                  <span className="workspace-choice-icon"><MapPin /></span>
                  <div>
                    <Badge variant="outline">{location.isPrimary ? (isChinese ? "主要地點" : "Primary") : (isChinese ? "地點" : "Location")}</Badge>
                    <h2>{location.name}</h2>
                    <p>{location.lastScanAt ? (isChinese ? `評分 ${location.latestScore === null ? "—" : Math.round(location.latestScore)} · 覆蓋率 ${coverage === null ? "—" : `${coverage}%`}` : `Score ${location.latestScore === null ? "—" : Math.round(location.latestScore)} · Coverage ${coverage === null ? "—" : `${coverage}%`}`) : (isChinese ? "尚未有掃描" : "No scan yet")}</p>
                    <small>{location.lastScanAt ? `${isChinese ? "觀察於" : "Observed"} ${formatObserved(location.lastScanAt, locale, workspace?.timezone ?? "Asia/Hong_Kong")}` : (location.address ?? "")}</small>
                  </div>
                  <ArrowRight />
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>
      <SectionCard>
        <p className="eyebrow">{isChinese ? "最新報告" : "Latest report"}</p>
        {report ? (
          <>
            <h2>{report.shareSlug}</h2>
            <p>{isChinese ? `狀態 ${report.status ?? "—"} · 建立於 ${formatObserved(report.createdAt, locale, workspace?.timezone ?? "Asia/Hong_Kong")}` : `Status ${report.status ?? "—"} · created ${formatObserved(report.createdAt, locale, workspace?.timezone ?? "Asia/Hong_Kong")}`}</p>
            <Button asChild variant="outline"><Link href={`/${locale}/r/${report.shareSlug}`}>{isChinese ? "開啟報告" : "Open report"}<ArrowRight /></Link></Button>
          </>
        ) : (
          <p>{isChinese ? "尚未有報告附加到這個工作台。" : "No report is attached to this workspace yet."}</p>
        )}
      </SectionCard>
      <div className="permission-note"><ShieldCheck /><span>{isChinese ? "所有數字均來自已儲存的掃描快照；未量度的來源會降低覆蓋率，不會當成零分。" : "Every number comes from a stored scan snapshot; unmeasured sources lower coverage and are never scored as zero."}</span></div>
    </>
  );
}
