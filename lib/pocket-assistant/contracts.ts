export const demoQuestionIds = [
  "explain_priority",
  "explain_change",
  "explain_limits",
  "fallback_plan",
  "draft_review_reply",
  "friendlier_review_reply",
  "compare_priorities",
  "explain_insights",
  "asset_next_step",
  "rescan_validation",
  "generate_social",
  "generate_faq",
  "generate_menu",
] as const

export type DemoQuestionId = (typeof demoQuestionIds)[number]

export type EvidenceReference = {
  evidenceId: string
  scanId: string
  factType: "Observed" | "Inference" | "Recommended" | "Unknown"
  label: string
  value: string
  observedAt: string
  source: string
}

export type AssistantArtifact = {
  type: "review_reply" | "social_post" | "faq" | "menu_translation" | "validation_plan"
  artifactId: string
  version: number
  title: string
  body: string
  acceptanceCriteria: string[]
}

export type DemoAssistantRunRequest = {
  questionId: DemoQuestionId
  locale: "zh-HK" | "zh-TW" | "en"
  sampleId: "demo-kam-man-house"
}

export type DemoAssistantRunResponse = {
  runId: string
  state: "needs_approval" | "completed"
  answer: string
  nextAction: string
  evidenceRefs: EvidenceReference[]
  output?: AssistantArtifact
  warnings: string[]
  requiresApproval: boolean
  demoBoundary: string
}

export function isDemoQuestionId(value: unknown): value is DemoQuestionId {
  return typeof value === "string" && demoQuestionIds.includes(value as DemoQuestionId)
}

/** Where the assistant was opened from; decides which intents are offered (§3.8). */
export type AssistantSurface = "sample" | "report" | "home" | "actions" | "action" | "create" | "insights" | "assets" | "rescan" | "workspace"

export type AssistantMode = "demo" | "live"

/** Live-mode context: which workspace rows the answer may cite. Demo mode ignores it. */
export type AssistantContext = {
  workspaceId: string
  locationId?: string
  snapshotId?: string
  actionId?: string
  versionId?: string
}

/** Request body for `POST /api/assistant/run` (§3.8). */
export type AssistantRunRequest = {
  mode: AssistantMode
  surface: AssistantSurface
  intentId: DemoQuestionId
  locale: "zh-HK" | "zh-TW" | "en"
  context?: AssistantContext
}
