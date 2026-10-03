import type { LocalizedText } from "@/lib/domain"

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
  "explain_missing_inputs",
  "where_to_continue",
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

/** Where a deterministic answer can send the owner next. Navigation only; nothing here writes. */
export const nextStepKinds = ["provide_inputs", "review_version", "open_integrations", "open_action", "open_actions"] as const

export type NextStepKind = (typeof nextStepKinds)[number]

export type AssistantNextStep = { kind: NextStepKind; actionId?: string; versionId?: string }

/** Whether the owner picked a suggested question or one of the fixed intents. */
export type AssistantOrigin = "suggested" | "fixed"

export type DemoAssistantRunRequest = {
  questionId: DemoQuestionId
  locale: "zh-HK" | "zh-TW" | "en"
  sampleId: "demo-kam-man-house"
}

export type DemoAssistantRunResponse = {
  runId: string
  /**
   * Live drafts only: the `action_runs` row where the server kept this body.
   * "Create a new version" sends this id and no text, so the version records
   * what the model wrote, attributed to the model. Absent in demo mode, on
   * template answers, and when the draft could not be persisted -- in each of
   * those cases there is nothing the log could vouch for, so no version is
   * offered.
   */
  draftRunId?: string
  state: "needs_approval" | "completed"
  answer: string
  nextAction: string
  evidenceRefs: EvidenceReference[]
  output?: AssistantArtifact
  warnings: string[]
  requiresApproval: boolean
  demoBoundary: string
  /** Live, deterministic answers only: where to go next. Absent in demo mode and when the flag is off. */
  nextStep?: AssistantNextStep
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
  origin?: AssistantOrigin
}

/** A question the sheet offers on its own, derived from the workspace's current state. */
export type AssistantSuggestion = {
  id: string
  /** Lets the sheet pick a label without parsing `id`. */
  kind: "missing_inputs" | "review_version" | "google"
  intentId: "explain_missing_inputs" | "where_to_continue"
  label: { actionTitle?: LocalizedText }
  context: AssistantContext
  nextStep?: AssistantNextStep
}
