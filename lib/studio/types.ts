import type { PrototypeLocale } from "@/lib/copy"
import type {
  AssistantArtifact,
  AssistantCarouselSlide,
  AssistantIntentId,
  AssistantNextStep,
  EvidenceReference,
} from "@/lib/pocket-assistant/contracts"

/**
 * Conversation Studio wire contract (docs/superpowers/specs/2026-11-08-conversation-studio-design.md).
 *
 * This module is the single source of truth shared by the server orchestrator,
 * the route handlers and the client. It is deliberately type-only plus literal
 * constants: no database, React or environment imports, so it is safe to import
 * from a route handler, a client component and a pure unit test alike.
 *
 * The Studio is a persistent, continuous conversation. A message is a row plus
 * an ordered list of `parts`; `content` mirrors the readable text so the log
 * stays useful without understanding the part union. Every part is
 * JSON-serialisable and persisted in `studio_messages.parts`.
 */

/** Server-side limit: one turn's owner text. */
export const STUDIO_MESSAGE_MAX = 4_000
/** Server-side limit: a stored conversation title. */
export const STUDIO_TITLE_MAX = 80
/** How many conversations the rail lists in one read. */
export const STUDIO_CONVERSATION_PAGE = 40
/** How many messages a conversation read returns by default. */
export const STUDIO_MESSAGE_PAGE = 50
/** History the model sees, newest last. */
export const STUDIO_HISTORY_TURNS = 20
/** Maximum evidence chips a single assistant message carries. */
export const STUDIO_EVIDENCE_LIMIT = 4

export type StudioLocale = PrototypeLocale

export const studioConversationStatuses = ["active", "archived"] as const
export type StudioConversationStatus = (typeof studioConversationStatuses)[number]

export const studioConversationAccessRoles = ["owner", "editor", "viewer"] as const
export type StudioConversationAccessRole = (typeof studioConversationAccessRoles)[number]

export const studioConversationMemberRoles = ["editor", "viewer"] as const
export type StudioConversationMemberRole = (typeof studioConversationMemberRoles)[number]

export type StudioConversationMember = {
  conversationId: string
  userId: string
  role: StudioConversationMemberRole
  email: string
  addedBy: string | null
  createdAt: string
}

export type StudioShareCandidate = { userId: string; email: string; workspaceRole: string }

export type StudioConversationMembersResponse = {
  members: StudioConversationMember[]
  candidates: StudioShareCandidate[]
  canManage: boolean
  accessRole: StudioConversationAccessRole
}

export type StudioConversation = {
  id: string
  /** Empty until the first message derives one; the client shows a localised fallback. */
  title: string
  status: StudioConversationStatus
  locationId: string | null
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  /** The caller's access to this conversation (creator = owner). */
  accessRole: StudioConversationAccessRole
  /** True when the caller is not the creator. */
  shared: boolean
}

export const studioMessageRoles = ["user", "assistant"] as const
export type StudioMessageRole = (typeof studioMessageRoles)[number]

/** The prose answer. An assistant message always carries exactly one text part. */
export type StudioTextPart = { kind: "text"; text: string }

/**
 * Evidence the answer used, already authorised and sanitised on the server.
 * Grouped so one message costs one part rather than one part per chip.
 */
export type StudioEvidencePart = { kind: "evidence"; refs: EvidenceReference[] }

/**
 * A draft the server is holding in `action_runs`. `draftRunId` is the only way
 * to redeem it: the client never re-sends the body, so the eventual version
 * records the model's own text under `author_type = 'agent'`.
 */
export type StudioArtifactPart = {
  kind: "artifact"
  actionId: string
  actionTitle: string
  artifactType: AssistantArtifact["type"]
  title: string
  body: string
  acceptanceCriteria: string[]
  /** Studio planning outline. It is shown next to the caption and is not saved into the version. */
  carousel?: AssistantCarouselSlide[]
  draftRunId: string | null
  /** Always true: the Studio never approves, exports or publishes. */
  requiresApproval: true
  /** Set when this turn is revising an existing version. */
  revisedFromVersionId?: string | null
}

/** Navigation only; the client maps `kind` to a URL with `lib/assistant/next-step`. */
export type StudioNextStepPart = { kind: "next_step"; step: AssistantNextStep }

/** A refusal or limitation that must stay visible next to the answer. */
export type StudioWarningPart = { kind: "warning"; code: string; text: string }

/**
 * A workbench item the owner attached to a turn (convergence slice 3, extended
 * in v1.1): a document version or an approved search brief. The persisted part
 * carries only the authorised identity and title: the text is re-read with the
 * same scope for each answer, so a revoked document cannot be replayed.
 */
export type StudioCitationRef =
  | { source: "document"; documentVersionId: string; title: string; truncated: boolean }
  | { source: "search_brief"; searchBriefId: string; title: string; truncated: boolean }

export type StudioCitationPart = { kind: "citation"; refs: StudioCitationRef[] }

export type StudioMessagePart =
  | StudioTextPart
  | StudioEvidencePart
  | StudioArtifactPart
  | StudioNextStepPart
  | StudioWarningPart
  | StudioCitationPart

export type StudioMessage = {
  id: string
  conversationId: string
  seq: number
  role: StudioMessageRole
  content: string
  parts: StudioMessagePart[]
  /** The assistant intent behind this message, when it was not a plain answer. */
  intent: AssistantIntentId | null
  createdAt: string
}

/** One starting suggestion rendered above the composer. */
export type StudioPromptChip = {
  id: string
  label: string
  message: string
}

/**
 * Read-only facts the right-hand context rail shows. Formatted on the server
 * with the request locale, so the client never re-implements score/coverage
 * formatting.
 */
export type StudioContextSummary = {
  locationName: string | null
  latestScan: {
    score: string | null
    coverage: string
    observedAt: string
    observedLabel: string
  } | null
  openActions: Array<{ id: string; title: string; priority: string; state: string }>
  waitingVersions: number
  google: string | null
  pendingInputs: number
  brandFactCount: number
}

export type StudioConversationListResponse = { conversations: StudioConversation[] }

export type StudioConversationDetailResponse = {
  conversation: StudioConversation
  messages: StudioMessage[]
  hasMore: boolean
}

export type StudioCreateConversationRequest = {
  workspaceId: string
  locationId?: string | null
  title?: string
}

export type StudioRenameConversationRequest = {
  title?: string
  status?: StudioConversationStatus
}

export type StudioSendMessageRequest = {
  text: string
  locationId?: string | null
  /** Workbench document versions attached to this turn (≤5). */
  documentVersionIds?: string[]
  /** Approved search briefs attached to this turn (≤3). */
  searchBriefIds?: string[]
}

export const studioStreamStages = ["reading", "thinking", "drafting", "finishing"] as const
export type StudioStreamStage = (typeof studioStreamStages)[number]

export const studioErrorCodes = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_input",
  "rate_limited",
  "ai_paused",
  "ai_budget_reached",
  "ai_unavailable",
  "archived",
  "conversation_busy",
  "unavailable",
] as const
export type StudioErrorCode = (typeof studioErrorCodes)[number]

/**
 * Server-sent events for `POST /api/studio/conversations/[id]/messages`.
 *
 * Order on success: `status*` → `user` → (`status*` | `delta*`) → `message` →
 * `done`. `delta` events, when present, concatenate to the assistant message's
 * text part; a client must still treat the final `message` as authoritative.
 * A failure after the user message was accepted ends with `message` (a stored
 * assistant warning) and `done`; a failure before that is a JSON HTTP error.
 */
export type StudioStreamEvent =
  | { type: "status"; stage: StudioStreamStage }
  | { type: "user"; message: StudioMessage }
  | { type: "delta"; text: string }
  | { type: "message"; message: StudioMessage; conversation: StudioConversation }
  | { type: "error"; code: StudioErrorCode; message: string; retryable: boolean }
  | { type: "done" }

export type StudioStreamStageEvent = Extract<StudioStreamEvent, { type: "status" }>
export type StudioStreamMessageEvent = Extract<StudioStreamEvent, { type: "message" }>
