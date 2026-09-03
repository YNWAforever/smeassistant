import { llmConfigured } from "@/lib/llm";
import { generateExecutiveSummary } from "@/lib/llm-summary";
import {
  resolveExecutiveSummary,
  type ExecutiveSummaryDeps,
  type ExecutiveSummarySource,
} from "./executive-summary";

export interface ReportLanguageService {
  resolveSummary(
    source: ExecutiveSummarySource,
    locale: string,
    cache: ExecutiveSummaryDeps["cache"],
  ): Promise<string | null>;
}

export function createReportLanguageService(
  deps: Pick<ExecutiveSummaryDeps, "configured" | "generate"> = {
    configured: llmConfigured,
    generate: generateExecutiveSummary,
  },
): ReportLanguageService {
  return {
    resolveSummary(source, locale, cache) {
      return resolveExecutiveSummary(source, locale, {
        configured: deps.configured,
        generate: deps.generate,
        cache,
      });
    },
  };
}

export type { ExecutiveSummaryDeps, ExecutiveSummarySource };
