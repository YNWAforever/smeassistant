/** Closed vocabularies the component kit labels (CLAUDE.md §0 guardrails 1, 2 and 4). */
export const factTypeNames = ["Observed", "Inference", "Recommended", "Attributed", "Estimated", "Unknown"] as const
export type FactTypeName = (typeof factTypeNames)[number]

export const providerStateNames = ["measured", "pending", "unavailable", "unsupported", "failed"] as const
export type ProviderStateName = (typeof providerStateNames)[number]
