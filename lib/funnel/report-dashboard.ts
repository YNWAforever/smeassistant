import { copy } from "@/lib/copy";
import type { ReportProofData, ReportProps } from "./report-props";

export type DashboardMetric = {
  key: string;
  label: string;
  source: string;
} & (
  | { state: "measured"; value: number; unit: "count" | "rating" | "percent"; sampleSize: number | null }
  | { state: "unavailable"; reason: string }
);

export interface DashboardComparison {
  query: string;
  engine: string;
  observedAt: string;
  source: string;
  metric: "reviews" | "rating";
  sampleSize: number;
  rows: Array<{ name: string; value: number; currentBusiness: boolean }>;
}

export interface ReportDashboard {
  metrics: DashboardMetric[];
  comparisons: DashboardComparison[];
}

function validNonnegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function measuredMetric(
  key: string,
  label: string,
  source: string,
  value: number | null | undefined,
  unit: "count" | "rating",
  reason: string,
): DashboardMetric {
  const valid = validNonnegative(value) && (unit !== "rating" || value <= 5);
  return valid
    ? { key, label, source, state: "measured", value, unit, sampleSize: null }
    : { key, label, source, state: "unavailable", reason };
}

function isMapsSource(source: string): boolean {
  return source.trim().toLowerCase() === "maps";
}

function comparisons(merchant: ReportProofData["merchant"], businessName: string): DashboardComparison[] {
  if (!merchant) return [];
  const groups: DashboardComparison[] = [];
  for (const run of merchant.runs) {
    for (const metric of ["rating", "reviews"] as const) {
      const currentValue = metric === "rating" ? run.mapsRating : run.mapsReviews;
      if (!validNonnegative(currentValue) || (metric === "rating" && currentValue > 5)) continue;
      const compatible = run.competitors.flatMap((competitor, index, all) => {
        const value = competitor[metric];
        const valid = isMapsSource(competitor.source)
          && validNonnegative(value)
          && (metric !== "rating" || value <= 5);
        const firstValidMatch = all.findIndex((candidate) => {
          const candidateValue = candidate[metric];
          return candidate.name === competitor.name
            && candidate.source === competitor.source
            && isMapsSource(candidate.source)
            && validNonnegative(candidateValue)
            && (metric !== "rating" || candidateValue <= 5);
        });
        return valid && firstValidMatch === index
          ? [{ name: competitor.name, value, currentBusiness: false }]
          : [];
      });
      if (!compatible.length) continue;
      const rows = [{ name: businessName, value: currentValue, currentBusiness: true }, ...compatible];
      groups.push({
        query: run.query,
        engine: run.engine,
        observedAt: merchant.generatedAt,
        source: "Google Maps",
        metric,
        sampleSize: rows.length,
        rows,
      });
    }
  }
  return groups;
}

export function buildReportDashboard(props: ReportProps): ReportDashboard {
  if (props.access === "public" || props.locked) {
    return { metrics: [], comparisons: [] };
  }

  const c = copy[props.locale].funnel.report;
  const reason = c.dashboard.unavailable;
  const proof = props.proof ?? { ig: null, gbp: null, aeo: null, merchant: null, trust: null };
  const moduleMeasured = (key: string) => props.modules.some((module) => module.key === key && module.state === "measured");
  const ig = moduleMeasured("ig") ? proof.ig : null;
  const gbp = moduleMeasured("gbp") ? proof.gbp : null;
  return {
    metrics: [
      measuredMetric("instagram-followers", c.proof.followers, "Instagram", ig?.followers, "count", reason),
      { key: "instagram-engagement", label: c.dashboard.engagement, source: "Instagram", state: "unavailable", reason },
      measuredMetric("google-rating", c.proof.rating, "Google Maps", gbp?.rating, "rating", reason),
      measuredMetric("google-reviews", c.proof.reviews, "Google Maps", gbp?.reviewsCount, "count", reason),
      { key: "search-visibility", label: c.dashboard.searchVisibility, source: "Search / AI", state: "unavailable", reason },
    ],
    comparisons: comparisons(moduleMeasured("aeo") ? proof.merchant : null, props.businessName),
  };
}