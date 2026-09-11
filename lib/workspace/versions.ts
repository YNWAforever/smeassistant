import type { ArtifactRepository } from "@/lib/repositories/artifacts";
import type { Json } from "@/lib/repositories/workflow";

/**
 * Thin wrappers over the atomic RPCs in 20260903000001_workspace_rpcs.sql.
 * The RPCs own the state machine, the usage count and their audit rows; this
 * module only names the arguments and maps the raised `message` to a typed
 * error the routes turn into 409s.
 */
export type VersionErrorCode =
  | "version_conflict"
  | "not_approved"
  | "allowance_exceeded"
  | "version_closed"
  | "version_not_found"
  | "invalid_decision"
  | "invalid_mode"
  /** Raised here, never by SQL, so it is deliberately absent from KNOWN_CODES. */
  | "assistant_draft_not_found";

const KNOWN_CODES: VersionErrorCode[] = [
  "version_conflict",
  "not_approved",
  "allowance_exceeded",
  "version_closed",
  "version_not_found",
  "invalid_decision",
  "invalid_mode",
];

export class VersionError extends Error {
  constructor(public readonly code: VersionErrorCode) {
    super(code);
    this.name = "VersionError";
  }
}

async function call<T>(fn: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = KNOWN_CODES.find((known) => message === known);
    if (code) throw new VersionError(code);
    throw new Error(`${fn} failed`);
  }
}

export interface CreateVersionInput {
  actionId: string;
  actorId: string;
  authorType: "user" | "agent";
  runId?: string | null;
  body: string;
  altText?: string | null;
  meta?: Record<string, unknown>;
  baseVersionId?: string | null;
}

export async function createVersion(
  db: ArtifactRepository,
  input: CreateVersionInput,
): Promise<{ versionId: string; versionNo: number }> {
  const row = await call("create_output_version", () =>
    db.createOutputVersion({
      actionId: input.actionId,
      actor: input.actorId,
      authorType: input.authorType,
      actionRunId: input.runId ?? null,
      body: input.body,
      alt: input.altText ?? null,
      meta: (input.meta ?? {}) as Json,
      baseVersionId: input.baseVersionId ?? null,
    }),
  );
  return { versionId: row.version_id, versionNo: Number(row.version_no) };
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Turn an assistant draft the server is holding into a version.
 *
 * The caller sends only the run id. The body comes from `action_runs.output`,
 * so the text that gets recorded as agent-authored is exactly the text the
 * model produced -- a client cannot post its own prose and have the
 * append-only log attribute it to a model, and cannot post the model's prose
 * and have it attributed to a member. That mislabelling is what this replaces:
 * the operator's output went through the ordinary body route, which hard-codes
 * `author_type: 'user'`.
 *
 * `runId` also becomes `output_versions.action_run_id`, which is what ties the
 * version to the run's token usage and cost.
 */
export async function createAssistantVersion(
  db: ArtifactRepository,
  input: {
    actionId: string;
    workspaceId: string;
    actorId: string;
    runId: string;
    baseVersionId?: string | null;
  },
): Promise<{ versionId: string; versionNo: number }> {
  let draft;
  try {
    draft = await db.assistantDraft(input.runId, input.actionId, input.workspaceId);
  } catch {
    throw new Error("assistant_draft_lookup failed");
  }
  const output = draft && typeof draft.output === "object" && draft.output !== null && !Array.isArray(draft.output)
    ? (draft.output as Record<string, unknown>)
    : null;
  const body = typeof output?.body === "string" ? output.body : "";
  // A draft with no usable body is not a version. It is also not a conflict:
  // there is nothing to supersede, so the route answers 404.
  if (!draft || !body.trim()) throw new VersionError("assistant_draft_not_found");

  const intent = draft.input && typeof draft.input === "object" && !Array.isArray(draft.input)
    ? (draft.input as Record<string, unknown>).intent
    : undefined;

  return createVersion(db, {
    actionId: input.actionId,
    actorId: input.actorId,
    authorType: "agent",
    runId: input.runId,
    body,
    altText: typeof output?.alt_text === "string" ? output.alt_text : null,
    meta: {
      // Read back by parseVersionMeta, which already understood "assistant"
      // and had no writer: the detail panel shipped a "Drafted by the operator"
      // label that nothing could ever produce.
      origin: "assistant",
      agent_key: draft.agent_key,
      prompt_version: draft.prompt_version,
      ...(typeof intent === "string" ? { intent } : {}),
      title: typeof output?.title === "string" ? output.title : "",
      acceptance_criteria: strings(output?.acceptance_criteria),
      warnings: strings(output?.warnings),
      facts_used: strings(output?.facts_used),
    },
    baseVersionId: input.baseVersionId ?? null,
  });
}

export async function approveVersion(
  db: ArtifactRepository,
  input: { versionId: string; actorId: string; comment?: string | null },
) {
  const row = await call("approve_output_version", () =>
    db.approveOutputVersion(
      input.versionId,
      input.actorId,
      input.comment ?? null,
    ),
  );
  return {
    kind: row.kind,
    versionId: row.version_id,
    versionNo: Number(row.version_no),
  };
}
export async function decideVersion(
  db: ArtifactRepository,
  input: {
    versionId: string;
    actorId: string;
    decision: "changes_requested" | "rejected";
    comment?: string | null;
  },
) {
  const row = await call("decide_output_version", () =>
    db.decideOutputVersion(
      input.versionId,
      input.actorId,
      input.decision,
      input.comment ?? null,
    ),
  );
  return {
    kind: row.kind,
    versionId: row.version_id,
    versionNo: Number(row.version_no),
    decision: input.decision,
  };
}
export async function exportVersion(
  db: ArtifactRepository,
  input: {
    versionId: string;
    actorId: string;
    mode: "export" | "copy";
    idempotencyKey: string;
  },
) {
  const row = await call("export_output_version", () =>
    db.exportOutputVersion(
      input.versionId,
      input.actorId,
      input.mode,
      input.idempotencyKey,
    ),
  );
  return {
    kind: row.kind,
    deliveryId: row.delivery_id,
    versionId: row.version_id,
    counted: row.counted === true,
  };
}

// ---------------------------------------------------------------------------
// Scope lookups the routes authorize against (workspace + location of the entity)
// ---------------------------------------------------------------------------

export interface ActionScope {
  actionId: string;
  workspaceId: string;
  locationId: string | null;
}

export interface VersionScope extends ActionScope {
  versionId: string;
}

export async function loadActionScope(
  db: ArtifactRepository,
  actionId: string,
): Promise<ActionScope | null> {
  return db.actionScope(actionId);
}
export async function loadVersionScope(
  db: ArtifactRepository,
  versionId: string,
): Promise<VersionScope | null> {
  return db.versionScope(versionId);
}
