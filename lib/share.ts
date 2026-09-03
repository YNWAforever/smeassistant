import type { AuditJobRow } from "@sme-scanner/contracts";

/** Absolute origin for canonical + OG/share URLs. No trailing slash. */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Report path. localePrefix is 'as-needed' so zh-HK (default) has no prefix. */
export function reportPath(locale: string, slug: string): string {
  return `/${locale}/r/${slug}`;
}

export function absoluteReportUrl(locale: string, slug: string): string {
  return `${getSiteUrl()}${reportPath(locale, slug)}`;
}

/** Replace {token} placeholders from a vars map; unknown tokens become "". */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export function whatsappHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

/** LINE share (LineIt). LINE's share endpoint takes only the URL. */
export function lineHref(url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
}

export function facebookHref(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export type ScoreBand = "good" | "warn" | "critical";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "good";
  if (score >= 50) return "warn";
  return "critical";
}

export interface ShareCardData {
  businessName: string;
  score: number;
  band: ScoreBand;
  found: boolean;
  modules: { key: "ig" | "gbp" | "aeo"; score: number }[];
}

type JobCardInput = Pick<AuditJobRow, "business_name" | "overall_score" | "module_scores"> | null;

export function buildShareCardData(job: JobCardInput): ShareCardData {
  if (!job || job.overall_score == null) {
    return { businessName: "", score: 0, band: "critical", found: false, modules: [] };
  }
  const ms = job.module_scores ?? {};
  const modules = (["ig", "gbp", "aeo"] as const).map((key) => ({
    key,
    score: Math.round((ms[key]?.score as number) ?? 0),
  }));
  const score = Math.round(job.overall_score);
  return { businessName: job.business_name, score, band: scoreBand(score), found: true, modules };
}
