import { describe, expect, it } from "vitest";
import {
  CONVERSATION_IMPORT_LIMIT,
  conversationImportsKey,
  readConversationImports,
  saveConversationImports,
} from "./conversation-imports";

const SCOPE = { userId: "u1", workspaceId: "w1", locationId: "l1" };
const OTHER = { ...SCOPE, locationId: "l2" };

function memory(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    entries,
  };
}

describe("conversation imports map", () => {
  it("namespaces the map per account, workspace and location", () => {
    expect(conversationImportsKey(SCOPE)).not.toBe(conversationImportsKey(OTHER));
    const storage = memory({ [conversationImportsKey(SCOPE)]: JSON.stringify({ "thread-1": "conv-1" }) });
    expect(readConversationImports(storage, SCOPE)).toEqual({ "thread-1": "conv-1" });
    expect(readConversationImports(storage, OTHER)).toEqual({});
  });

  it("merges new imports without losing earlier ones", () => {
    const storage = memory({ [conversationImportsKey(SCOPE)]: JSON.stringify({ "thread-1": "conv-1" }) });
    expect(saveConversationImports(storage, SCOPE, { "thread-2": "conv-2" })).toEqual({
      "thread-1": "conv-1",
      "thread-2": "conv-2",
    });
    expect(readConversationImports(storage, SCOPE)).toEqual({ "thread-1": "conv-1", "thread-2": "conv-2" });
  });

  it("treats corrupt or blocked storage as nothing imported yet", () => {
    expect(readConversationImports(memory({ [conversationImportsKey(SCOPE)]: "{not json" }), SCOPE)).toEqual({});
    expect(readConversationImports(memory({ [conversationImportsKey(SCOPE)]: "[]" }), SCOPE)).toEqual({});
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readConversationImports(blocked, SCOPE)).toEqual({});
    expect(saveConversationImports(blocked, SCOPE, { "thread-1": "conv-1" })).toBeNull();
  });

  it("caps the map so local storage cannot grow without bound", () => {
    const storage = memory();
    const entries: Record<string, string> = {};
    for (let index = 0; index < CONVERSATION_IMPORT_LIMIT + 10; index += 1) entries[`thread-${index}`] = `conv-${index}`;
    const saved = saveConversationImports(storage, SCOPE, entries);
    expect(Object.keys(saved ?? {})).toHaveLength(CONVERSATION_IMPORT_LIMIT);
  });
});
