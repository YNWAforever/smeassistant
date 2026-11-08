import { Check, CircleAlert, CircleDashed, CircleHelp, Eye, Lightbulb, Link2, Loader2, Sigma, Sparkles, X, type LucideIcon } from "lucide-react"

import type { FactTypeName, ProviderStateName } from "@/lib/domain-labels"

/** One icon per evidence state, so state never relies on colour alone. */
export const PROVIDER_STATE_ICONS: Record<ProviderStateName, LucideIcon> = {
  measured: Check,
  pending: Loader2,
  unavailable: CircleDashed,
  unsupported: X,
  failed: CircleAlert,
}

/** One icon per fact type (CLAUDE.md §0 guardrail 4). */
export const FACT_TYPE_ICONS: Record<FactTypeName, LucideIcon> = {
  Observed: Eye,
  Inference: Lightbulb,
  Recommended: Sparkles,
  Attributed: Link2,
  Estimated: Sigma,
  Unknown: CircleHelp,
}
