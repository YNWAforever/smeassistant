/**
 * Barrel for the shared product chrome, split by concern in components/product/
 * (docs/ux Phase 1). Import from here; the modules stay small.
 */
export type { ShellWorkspace } from "@/components/product/types"
export { CapabilityBadge, DemoBadge, EnvironmentBar, FactType, ProviderBadge, TrendIcon } from "@/components/product/badges"
export { LoopRibbon, ScoreDial } from "@/components/product/score"
export { LocaleSelect, PublicHeader, PublicPageFrame } from "@/components/product/public-frame"
export { PageIntro, SectionCard, workspaceIcons } from "@/components/product/layout"
