import type { Finding } from "@sme-scanner/scoring";
import { weightedImpact } from "./weighted-impact";

/**
 * Resolves the AI executive summary for an authorized report, generating and
 * caching it on first view.
 *
 * History matters here. Generation was never part of the scan: `summary_zh` has
 * never been written by any commit, and `summary_en` / `summary_tw` were produced
 * lazily on report render and cached back. Commit 6c264ba collapsed the 1527-line
 * report page into the view-model architecture and removed all three call sites,
 * so from 2026-07-16 every English and Taiwan full report fell through to the
 * template. Cantonese always did, by design.
 *
 * 2026-08-02 took that separate product decision: zh-HK now generates too, into
 * `summary_zh`. Production verification found the primary market's own locale was
 * the one still shipping a templated cover on the Fimmick print artifact — the
 * same outcome as the 2026-07-16 regression, reached by a different route. This
 * does put an LLM call on the primary market's main path for the first time, so
 * the prompt and guardrails in `llm-summary.ts` now carry the highest-volume
 * locale and warrant review on their own terms.
 *
 * Every dependency is injected so the policy is testable without a request
 * context, an LLM key, or a database.
 */

export type SummaryLocale = "zh-HK" | "en" | "zh-TW";
export type SummaryColumn = "summary_zh" | "summary_en" | "summary_tw";

export interface ExecutiveSummarySource {
  jobId: string;
  businessName: string;
  industry: string | null;
  district: string | null;
  overallScore: number | null;
  cached: { summary_zh: string | null; summary_en: string | null; summary_tw: string | null };
  findings: Array<{ module: string; owner_message_zh?: string | null; score_impact: number | null }>;
}

export interface ExecutiveSummaryDeps {
  configured: () => boolean;
  generate: (
    input: {
      business_name: string;
      industry: string;
      district: string;
      overall_score: number;
      top_findings: Array<{
        module: string;
        message: string;
        score_impact: number;
        /** Same finding's effect on the headline: score_impact x the module weight. */
        overall_impact: number;
      }>;
    },
    locale: SummaryLocale,
  ) => Promise<string | null>;
  /** Persist the generated value. Fire-and-forget: never awaited on the render path. */
  cache: (jobId: string, column: SummaryColumn, value: string) => void;
}

/**
 * Which column a locale caches into. Total, not partial: zh-HK — and any locale
 * the router ever adds without touching this file — falls to the base zh column,
 * which is also what `cachedSummaryFor` reads back for them. Returning null here
 * used to mean "never generate", and that silent opt-out is precisely how the
 * primary market went without a diagnosis; a total function cannot express it.
 */
function columnFor(locale: string): SummaryColumn {
  if (locale === "en") return "summary_en";
  if (locale === "zh-TW") return "summary_tw";
  return "summary_zh";
}

/** The cached value for this locale, falling back to zh the way the report always has. */
export function cachedSummaryFor(cached: ExecutiveSummarySource["cached"], locale: string): string | null {
  if (locale === "en") return cached.summary_en ?? cached.summary_zh ?? null;
  if (locale === "zh-TW") return cached.summary_tw ?? cached.summary_zh ?? null;
  return cached.summary_zh ?? null;
}

export async function resolveExecutiveSummary(
  source: ExecutiveSummarySource,
  locale: string,
  deps: ExecutiveSummaryDeps,
): Promise<string | null> {
  const existing = cachedSummaryFor(source.cached, locale);
  if (existing) return existing;

  const column = columnFor(locale);

  // A summary about a score we could not compute would be fabrication.
  if (source.overallScore === null) return null;

  // No LLM configured is a normal deployment state, not an error.
  if (!deps.configured()) return null;

  const generated = await deps.generate(
    {
      business_name: source.businessName,
      industry: source.industry ?? "Other",
      district: source.district ?? "",
      overall_score: source.overallScore,
      top_findings: source.findings.slice(0, 5).map((finding) => {
        const score_impact = finding.score_impact ?? 0;
        return {
          module: finding.module,
          message: finding.owner_message_zh ?? "",
          score_impact,
          overall_impact: weightedImpact(score_impact, finding.module),
        };
      }),
    },
    locale as SummaryLocale,
  );

  // llmComplete returns null on every failure — timeout, bad key, malformed
  // response. The report must render regardless; the template is the fallback.
  if (!generated) return null;

  deps.cache(source.jobId, column, generated);
  return generated;
}

export type { Finding };
