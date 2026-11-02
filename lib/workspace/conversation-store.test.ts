import { describe, expect, it, vi } from "vitest";
import { conversationScopeKey, readConfirmedPostDrafts, saveConfirmedPostDraft, saveConversationChanges, readConversationThreads, writeConversationThreads, type ConversationScope, type LocalConfirmedPostDraft, type LocalThread } from "./conversation-store";

const scope: ConversationScope = { userId: "u", workspaceId: "w", locationId: "l" };
const thread: LocalThread = { id: "t1", title: "First note", notes: ["First note"], actionIds: ["a1"], createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z" };
function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("browser-local conversation notes", () => {
  it("restores independent threads only in the exact account/workspace/location scope", () => {
    const storage = memory();
    expect(writeConversationThreads(storage, scope, [thread, { ...thread, id: "t2", notes: ["Separate"] }])).toBe("saved");
    expect(readConversationThreads(storage, scope)).toEqual({ status: "ready", threads: [thread, { ...thread, id: "t2", notes: ["Separate"] }] });
    for (const other of [{ ...scope, userId: "u2" }, { ...scope, workspaceId: "w2" }, { ...scope, locationId: "l2" }]) expect(readConversationThreads(storage, other).threads).toEqual([]);
    expect(conversationScopeKey({ userId: "a:b", workspaceId: "c", locationId: "d" })).not.toBe(conversationScopeKey({ userId: "a", workspaceId: "b:c", locationId: "d" }));
  });
  it("returns honest unavailable and corrupt states without throwing or overwriting", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(readConversationThreads(blocked, scope)).toEqual({ status: "unavailable", threads: [] });
    expect(writeConversationThreads(blocked, scope, [thread])).toBe("unavailable");
    const storage = memory();
    storage.setItem(conversationScopeKey(scope), "broken");
    expect(readConversationThreads(storage, scope)).toEqual({ status: "corrupt", threads: [] });
    expect(storage.getItem(conversationScopeKey(scope))).toBe("broken");
  });
  it("rejects malformed, duplicate and oversized records instead of silently claiming persistence", () => {
    const storage = memory();
    for (const threads of [[{ ...thread, notes: ["x".repeat(4001)] }], [{ ...thread, title: "x".repeat(141) }], [thread, thread], Array.from({ length: 51 }, (_, i) => ({ ...thread, id: String(i) })), [{ ...thread, notes: Array(41).fill("note") }]]) {
      expect(writeConversationThreads(storage, scope, threads)).toBe("invalid");
    }
    storage.setItem(conversationScopeKey(scope), JSON.stringify({ version: 1, threads: [{ ...thread, actionIds: [5] }] }));
    expect(readConversationThreads(storage, scope).status).toBe("corrupt");
    expect(readConversationThreads(storage, { ...scope, userId: "" }).status).toBe("unavailable");
  });
});

it("merges changed threads with the latest stored threads without losing another tab's work", async () => {
  const { saveConversationChanges } = await import("./conversation-store");
  const storage = memory();
  writeConversationThreads(storage, scope, [thread]);
  const changed = { ...thread, id: "t2", notes: ["Other tab"] };
  expect(saveConversationChanges(storage, scope, [changed])).toEqual({ status: "saved", threads: [changed, thread] });
  expect(readConversationThreads(storage, scope).threads).toEqual([changed, thread]);
});
it("refuses to replace corrupt, unreadable or over-limit stores during a merge", async () => {
  const { saveConversationChanges } = await import("./conversation-store");
  const storage = memory();
  storage.setItem(conversationScopeKey(scope), "broken");
  expect(saveConversationChanges(storage, scope, [thread]).status).toBe("corrupt");
  expect(storage.getItem(conversationScopeKey(scope))).toBe("broken");
  const full = Array.from({ length: 50 }, (_, i) => ({ ...thread, id: String(i) }));
  writeConversationThreads(storage, scope, full);
  expect(saveConversationChanges(storage, scope, [thread]).status).toBe("invalid");
  expect(readConversationThreads(storage, scope).threads).toEqual(full);
  expect(saveConversationChanges({ getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("must not write"); } }, scope, [thread]).status).toBe("unavailable");
});

it("persists document version references without document or private action contents",()=>{
  const storage={getItem:vi.fn().mockReturnValue(null),setItem:vi.fn()};
  const scope={userId:"u",workspaceId:"w",locationId:"l"};
  const thread={id:"t",title:"note",notes:["private note"],actionIds:[],documentVersionIds:["version-one"],createdAt:"2026-10-27T00:00:00Z",updatedAt:"2026-10-27T00:00:00Z"};
  expect(saveConversationChanges(storage,scope,[thread]).status).toBe("saved");
  const raw=storage.setItem.mock.calls[0][1];expect(JSON.parse(raw).threads[0].documentVersionIds).toEqual(["version-one"]);
  storage.getItem.mockReturnValue(raw);expect(readConversationThreads(storage,scope).threads[0].documentVersionIds).toEqual(["version-one"]);
  expect(saveConversationChanges(storage,scope,[{...thread,documentVersionIds:Array(21).fill("v")}]).status).toBe("invalid");
});

describe("browser-local confirmed post drafts", () => {
  const draft: LocalConfirmedPostDraft = { id: "d1", title: "本週末營業時間", body: "星期六 11:00 – 19:00", channel: "instagram", confirmedAt: "2026-11-02T00:00:00.000Z" };
  it("saves and lists confirmed drafts only in the same scope without touching local note threads", () => {
    const storage = memory();
    writeConversationThreads(storage, scope, [thread]);
    expect(saveConfirmedPostDraft(storage, scope, draft)).toBe("saved");
    expect(readConfirmedPostDrafts(storage, scope)).toEqual([draft]);
    expect(readConversationThreads(storage, scope).threads).toEqual([thread]);
    expect(readConfirmedPostDrafts(storage, { ...scope, userId: "other" })).toEqual([]);
  });
  it("keeps one record per id and refuses malformed drafts", () => {
    const storage = memory();
    saveConfirmedPostDraft(storage, scope, draft);
    saveConfirmedPostDraft(storage, scope, { ...draft, title: "Updated" });
    expect(readConfirmedPostDrafts(storage, scope)).toEqual([{ ...draft, title: "Updated" }]);
    expect(saveConfirmedPostDraft(storage, scope, { ...draft, body: "" })).toBe("invalid");
    expect(saveConfirmedPostDraft(storage, scope, { ...draft, confirmedAt: "not-a-date" })).toBe("invalid");
  });
});
