"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { SectionCard } from "@/components/product-ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copy, type PrototypeLocale } from "@/lib/copy";
import { fill } from "@/lib/copy-ui";
import { formatDay } from "@/lib/workspace/format";
import type { InstagramInsightsPanel, InstagramInsightsValue } from "@/lib/publishing/instagram-insights-state";

const METRIC_KEYS = ["impressions", "reach", "profile_views", "likes", "comments", "shares", "saved"] as const;

/**
 * The Results-page Instagram insights panel (P20.3). Server-loaded values are
 * platform-reported observations; `value: null` always renders "Unavailable"
 * with the stored reason and never becomes zero. Pulling is an explicit
 * owner/manager action that refreshes the server data on success; a refusal
 * keeps the existing rows visible.
 */
export function InstagramInsightsCard({
  locale,
  workspaceId,
  workspaceSlug,
  timezone,
  panel,
  canPull,
}: {
  locale: PrototypeLocale;
  workspaceId: string;
  workspaceSlug: string;
  timezone: string;
  panel: InstagramInsightsPanel;
  canPull: boolean;
}) {
  const pc = copy[locale].workspaceHome.instagramInsights;
  const router = useRouter();
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metricCopy = (metric: string): { label: string; definition: string } | null => {
    if (!(METRIC_KEYS as readonly string[]).includes(metric)) return null;
    return pc.metrics[metric as (typeof METRIC_KEYS)[number]];
  };
  const reasonText = (reason: string | null): string => {
    if (reason && reason in pc.unavailableReasons) return pc.unavailableReasons[reason as keyof typeof pc.unavailableReasons];
    return pc.unavailable;
  };
  const numberText = (value: number): string => new Intl.NumberFormat(locale).format(value);

  async function pull() {
    if (pulling) return;
    setPulling(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/instagram-insights/pull`, { method: "POST" });
      if (response.ok) {
        router.refresh();
        return;
      }
      setError(response.status === 429 ? pc.rateLimited : pc.pullFailed);
    } catch {
      setError(pc.pullFailed);
    } finally {
      setPulling(false);
    }
  }

  const accountValues = panel.values.filter((value) => value.scope === "account");
  const mediaGroups = new Map<string, InstagramInsightsValue[]>();
  for (const value of panel.values) {
    if (value.scope !== "media" || !value.mediaRef) continue;
    const rows = mediaGroups.get(value.mediaRef) ?? [];
    rows.push(value);
    mediaGroups.set(value.mediaRef, rows);
  }

  const valueTable = (rows: InstagramInsightsValue[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{pc.metric}</TableHead>
          <TableHead>{pc.value}</TableHead>
          <TableHead>{pc.observed}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const metric = metricCopy(row.metric);
          if (!metric) return null;
          return (
            <TableRow key={`${row.scope}-${row.mediaRef ?? ""}-${row.metric}`}>
              <TableCell>
                <strong>{metric.label}</strong>
                <small>{metric.definition}</small>
                {row.periodEnd && <small>{fill(pc.windowEnd, { time: formatDay(row.periodEnd, locale, timezone) })}</small>}
              </TableCell>
              <TableCell>
                {row.value === null ? (
                  <span>{reasonText(row.unavailableReason)}</span>
                ) : (
                  <strong>{numberText(row.value)}</strong>
                )}
              </TableCell>
              <TableCell>{formatDay(row.observedAt, locale, timezone)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="instagram-insights-card" data-testid="instagram-insights-card">
      <SectionCard>
        <div className="instagram-insights-head">
        <div>
          <p className="eyebrow">{pc.title}</p>
          <p>{pc.intro}</p>
        </div>
        {canPull && panel.connectionActive && (
          <Button type="button" variant="outline" onClick={pull} disabled={pulling} data-testid="instagram-insights-pull">
            <RefreshCw aria-hidden="true" /> {pulling ? pc.pulling : panel.values.length > 0 ? pc.pullAgain : pc.pull}
          </Button>
        )}
      </div>
      {!panel.connectionActive && (
        <p className="instagram-insights-notice" data-testid="instagram-insights-not-connected">
          {pc.notConnected}{" "}
          <Link href={`/${locale}/owner/${workspaceSlug}/settings/integrations`}>{pc.connect}</Link>
        </p>
      )}
      {!canPull && panel.connectionActive && <p className="instagram-insights-notice">{pc.viewerNotice}</p>}
      {error && <p className="instagram-insights-error" role="alert">{error}</p>}
      {panel.values.length === 0 && panel.connectionActive && <p className="instagram-insights-empty">{pc.empty}</p>}
      {accountValues.length > 0 && (
        <div className="instagram-insights-scope">
          <p className="eyebrow">{pc.accountSection}</p>
          {valueTable(accountValues)}
        </div>
      )}
      {[...mediaGroups.entries()].map(([mediaRef, rows]) => (
        <details key={mediaRef} className="instagram-insights-media">
          <summary>{pc.mediaSection} · {fill(pc.mediaItem, { id: mediaRef.slice(-8) })}</summary>
          {valueTable(rows)}
        </details>
      ))}
      </SectionCard>
    </div>
  );
}
