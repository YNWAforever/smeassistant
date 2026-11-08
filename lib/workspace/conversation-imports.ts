import type { ConversationScope } from "./conversation-store";

/**
 * Local map from a browser-local workbench thread id to the persistent Studio
 * conversation it was promoted into. Keeping the mapping beside the local
 * notes lets the workbench show “Open persistent copy” and prevents the same
 * thread being imported twice; the server never needs to know local ids.
 *
 * Failure semantics mirror the note store: a blocked or corrupt record is
 * treated as "nothing imported yet" and can be rewritten on the next save.
 */
export type ConversationImports = Record<string, string>;

export const CONVERSATION_IMPORT_LIMIT = 50;
const MAX_ID_LENGTH = 100;

function shortId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

export function conversationImportsKey(scope: ConversationScope): string {
  return `kinnso:conversation:v1:studio-imports:${JSON.stringify([scope.userId, scope.workspaceId, scope.locationId])}`;
}

export function readConversationImports(storage: Pick<Storage, "getItem">, scope: ConversationScope): ConversationImports {
  try {
    const raw = storage.getItem(conversationImportsKey(scope));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const imports: ConversationImports = {};
    for (const [threadId, conversationId] of Object.entries(parsed as Record<string, unknown>)) {
      if (shortId(threadId) && shortId(conversationId) && Object.keys(imports).length < CONVERSATION_IMPORT_LIMIT) {
        imports[threadId] = conversationId;
      }
    }
    return imports;
  } catch {
    return {};
  }
}

/** Merge new thread→conversation pairs and return the stored map, or null when storage refused. */
export function saveConversationImports(
  storage: Pick<Storage, "getItem" | "setItem">,
  scope: ConversationScope,
  entries: ConversationImports,
): ConversationImports | null {
  const merged: ConversationImports = { ...readConversationImports(storage, scope), ...entries };
  const bounded: ConversationImports = {};
  for (const [threadId, conversationId] of Object.entries(merged)) {
    if (!shortId(threadId) || !shortId(conversationId)) return null;
    if (Object.keys(bounded).length >= CONVERSATION_IMPORT_LIMIT) break;
    bounded[threadId] = conversationId;
  }
  try {
    storage.setItem(conversationImportsKey(scope), JSON.stringify(bounded));
    return bounded;
  } catch {
    return null;
  }
}
