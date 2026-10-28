/** Local notes only: this namespace separates UI scopes; it is not a security/ACL boundary. */
export interface ConversationScope { userId: string; workspaceId: string; locationId: string }
export interface LocalThread {
  id: string;
  title: string;
  notes: string[];
  /** References only. Action contents and approved versions remain in their existing store. */
  actionIds: string[];
  /** Immutable server version IDs only; local notes never grant access to documents. */
  documentVersionIds?: string[];
  createdAt: string;
  updatedAt: string;
}
export type ConversationStorage = Pick<Storage, "getItem" | "setItem">;
export type ConversationLoad = { status: "ready" | "unavailable" | "corrupt"; threads: LocalThread[] };
export const CONVERSATION_LIMITS = { threads: 50, notes: 40, noteLength: 4000, titleLength: 140, actionIds: 20, bytes: 500_000 } as const;

export function conversationScopeKey(scope: ConversationScope): string {
  return `kinnso:conversation:v1:${JSON.stringify([scope.userId, scope.workspaceId, scope.locationId])}`;
}
function validScope(scope: ConversationScope): boolean {
  return [scope.userId, scope.workspaceId, scope.locationId].every(value => typeof value === "string" && value.length > 0 && value.length <= 200);
}
function shortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function validThreads(value: unknown): value is LocalThread[] {
  if (!Array.isArray(value) || value.length > CONVERSATION_LIMITS.threads) return false;
  const ids = new Set<string>();
  return value.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const t = item as Record<string, unknown>;
    if (!shortText(t.id, 100) || ids.has(t.id) || !shortText(t.title, CONVERSATION_LIMITS.titleLength)) return false;
    ids.add(t.id);
    return Array.isArray(t.notes) && t.notes.length > 0 && t.notes.length <= CONVERSATION_LIMITS.notes && t.notes.every(note => shortText(note, CONVERSATION_LIMITS.noteLength))
      && Array.isArray(t.actionIds) && t.actionIds.length <= CONVERSATION_LIMITS.actionIds && t.actionIds.every(id => shortText(id, 100)) && new Set(t.actionIds).size === t.actionIds.length
      && (t.documentVersionIds === undefined || (Array.isArray(t.documentVersionIds) && t.documentVersionIds.length <= 20 && t.documentVersionIds.every(id => shortText(id,100)) && new Set(t.documentVersionIds).size === t.documentVersionIds.length))
      && typeof t.createdAt === "string" && Number.isFinite(Date.parse(t.createdAt)) && typeof t.updatedAt === "string" && Number.isFinite(Date.parse(t.updatedAt));
  });
}
export function readConversationThreads(storage: ConversationStorage, scope: ConversationScope): ConversationLoad {
  if (!validScope(scope)) return { status: "unavailable", threads: [] };
  try {
    const raw = storage.getItem(conversationScopeKey(scope));
    if (raw === null) return { status: "ready", threads: [] };
    if (raw.length > CONVERSATION_LIMITS.bytes) return { status: "corrupt", threads: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 || !("threads" in parsed) || !validThreads(parsed.threads)) return { status: "corrupt", threads: [] };
    return { status: "ready", threads: parsed.threads };
  } catch (error) {
    return { status: error instanceof SyntaxError ? "corrupt" : "unavailable", threads: [] };
  }
}
export function writeConversationThreads(storage: ConversationStorage, scope: ConversationScope, threads: LocalThread[]): "saved" | "unavailable" | "invalid" {
  if (!validScope(scope) || !validThreads(threads)) return "invalid";
  const raw = JSON.stringify({ version: 1, threads });
  if (raw.length > CONVERSATION_LIMITS.bytes) return "invalid";
  try { storage.setItem(conversationScopeKey(scope), raw); return "saved"; }
  catch { return "unavailable"; }
}

export type ConversationSave = { status: "saved"; threads: LocalThread[] } | { status: "unavailable" | "corrupt" | "invalid" };
/** Merge only pending/changed records with the latest store; never replace unrelated threads from a stale tab. */
export function saveConversationChanges(storage: ConversationStorage, scope: ConversationScope, changed: LocalThread[]): ConversationSave {
  if (!validThreads(changed)) return { status: "invalid" };
  const latest = readConversationThreads(storage, scope);
  if (latest.status !== "ready") return { status: latest.status };
  const changedIds = new Set(changed.map(thread => thread.id));
  const threads = [...changed, ...latest.threads.filter(thread => !changedIds.has(thread.id))];
  const result = writeConversationThreads(storage, scope, threads);
  return result === "saved" ? { status: "saved", threads } : { status: result };
}
