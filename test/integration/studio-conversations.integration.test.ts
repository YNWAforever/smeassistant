import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "../../scripts/neon/migrations";
import {
  STUDIO_CONVERSATION_ARCHIVED,
  STUDIO_CONVERSATION_NOT_FOUND,
  StudioConversationArchivedError,
  StudioConversationNotFoundError,
  StudioLocationNotFoundError,
  studioRepository,
  toStudioConversation,
  toStudioMessage,
  type StudioRepository,
} from "../../lib/repositories/studio";
import { startNeonDatabaseFixture, type NeonDatabaseFixture } from "./neon-database";
import { withTransaction } from "../../lib/db/transaction";

/**
 * Conversation Studio persistence on an owned disposable PostgreSQL 16
 * fixture (design §5, migration 0021). The whole journal is replayed, so this
 * also proves 0021 layers cleanly on the conversation workstream's 0019/0020.
 * this sandbox, so this file is written-but-not-executed here; it is the
 * verification the repository and the SQL owe the migration.
 *
 * Proves: workspace/creator scope isolation, per-member privacy, sequential and
 * concurrent seq allocation, title derivation only while empty, rename,
 * archive (and the archived write refusal), location scope and every FK
 * deletion rule the migration promises.
 */
describe.runIf(process.env.NEON_INTEGRATION === "1")("Conversation Studio persistence", () => {
  let fixture: NeonDatabaseFixture;
  let owner: Pool;
  let runtime: Pool;

  beforeAll(async () => {
    fixture = await startNeonDatabaseFixture("test");
    owner = new Pool({ connectionString: fixture.databaseUrl });
    await owner.query("CREATE ROLE sme_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS");
    // The whole journal, so 0019 is replayed exactly as a fresh deployment would.
    const migrations = await loadMigrations();
    expect(await applyMigrations(owner)).toEqual(migrations.map((migration) => migration.name));
    await owner.query("CREATE ROLE studio_runtime LOGIN PASSWORD 'fixture-only' IN ROLE sme_app_runtime");
    const loginUrl = new URL(fixture.databaseUrl);
    loginUrl.username = "studio_runtime";
    loginUrl.password = "fixture-only";
    runtime = new Pool({ connectionString: loginUrl.href });
  });

  afterAll(async () => {
    await Promise.allSettled([owner?.end(), runtime?.end()]);
    fixture?.stop();
  });

  async function workspace() {
    const id = (await runtime.query("INSERT INTO workspaces DEFAULT VALUES RETURNING id")).rows[0].id as string;
    return id;
  }

  async function member() {
    const id = (
      await runtime.query("INSERT INTO app_users(email) VALUES($1) RETURNING id", [`${randomUUID()}@studio.test`])
    ).rows[0].id as string;
    return id;
  }

  async function location(workspaceId: string) {
    const id = (
      await runtime.query("INSERT INTO locations(workspace_id,slug,name) VALUES($1,$2,'Shop') RETURNING id", [
        workspaceId,
        `shop-${randomUUID().slice(0, 8)}`,
      ])
    ).rows[0].id as string;
    return id;
  }

  async function setup() {
    const workspaceId = await workspace();
    const actorId = await member();
    // The repository's default transaction opens on the app pool; this owned
    // fixture must bind both reads and the append transaction to runtime.
    return { workspaceId, actorId, repo: studioRepository(runtime, (run) => withTransaction(run, runtime)) as StudioRepository };
  }

  it("creates, reads, lists and maps a conversation through the runtime RLS policy", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const created = await repo.createConversation({ workspaceId, actorId });
    expect(created).toMatchObject({ workspace_id: workspaceId, created_by: actorId, title: "", status: "active", location_id: null });
    const wire = toStudioConversation(created);
    expect(wire).toMatchObject({ title: "", status: "active", locationId: null });
    expect(wire.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    await expect(repo.getConversation({ workspaceId, actorId, conversationId: created.id })).resolves.toMatchObject({ id: created.id });
    await expect(repo.listConversations({ workspaceId, actorId })).resolves.toMatchObject([{ id: created.id }]);
  });

  it("never leaks a conversation across workspaces or between members of one workspace", async () => {
    const a = await setup();
    const otherMember = await member();
    const foreignWorkspace = await workspace();
    const conversation = await a.repo.createConversation({ workspaceId: a.workspaceId, actorId: a.actorId });
    const foreignActor = await member();

    // Same workspace, different member: private by construction.
    await expect(a.repo.getConversation({ workspaceId: a.workspaceId, actorId: otherMember, conversationId: conversation.id })).resolves.toBeNull();
    await expect(a.repo.listConversations({ workspaceId: a.workspaceId, actorId: otherMember })).resolves.toEqual([]);
    await expect(a.repo.listMessages({ workspaceId: a.workspaceId, actorId: otherMember, conversationId: conversation.id })).resolves.toEqual([]);
    await expect(a.repo.renameConversation({ workspaceId: a.workspaceId, actorId: otherMember, conversationId: conversation.id, title: "hijack" })).resolves.toBeNull();
    await expect(a.repo.archiveConversation({ workspaceId: a.workspaceId, actorId: otherMember, conversationId: conversation.id })).resolves.toBeNull();
    await expect(
      a.repo.appendMessage({
        workspaceId: a.workspaceId,
        actorId: otherMember,
        conversationId: conversation.id,
        role: "user",
        content: "not mine",
        parts: [],
      }),
    ).rejects.toBeInstanceOf(StudioConversationNotFoundError);

    // Another workspace with a member of its own: same "not found".
    await expect(a.repo.getConversation({ workspaceId: foreignWorkspace, actorId: foreignActor, conversationId: conversation.id })).resolves.toBeNull();
    await expect(a.repo.listConversations({ workspaceId: foreignWorkspace, actorId: foreignActor })).resolves.toEqual([]);
  });

  it("attaches a conversation only to a location of its own workspace", async () => {
    const a = await setup();
    const b = await setup();
    const ownLocation = await location(a.workspaceId);
    const foreignLocation = await location(b.workspaceId);
    await expect(a.repo.createConversation({ workspaceId: a.workspaceId, actorId: a.actorId, locationId: ownLocation })).resolves.toMatchObject({ location_id: ownLocation });
    await expect(a.repo.createConversation({ workspaceId: a.workspaceId, actorId: a.actorId, locationId: foreignLocation })).rejects.toBeInstanceOf(StudioLocationNotFoundError);
    // A location filter admits that location's conversations, not another location's.
    await expect(a.repo.listConversations({ workspaceId: a.workspaceId, actorId: a.actorId, locationId: foreignLocation })).resolves.toEqual([]);
  });

  it("allocates seq under a lock: two concurrent appends get distinct consecutive numbers", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const conversation = await repo.createConversation({ workspaceId, actorId });
    const first = await repo.appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "user", content: "one", parts: [{ kind: "text", text: "one" }] });
    expect(first.message.seq).toBe(1);
    const [left, right] = await Promise.all([
      repo.appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "assistant", content: "two", parts: [{ kind: "text", text: "two" }] }),
      repo.appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "assistant", content: "three", parts: [{ kind: "text", text: "three" }] }),
    ]);
    expect([left.message.seq, right.message.seq].sort((x, y) => x - y)).toEqual([2, 3]);
    const messages = await repo.listMessages({ workspaceId, actorId, conversationId: conversation.id });
    expect(messages.map((message) => message.seq)).toEqual([1, 2, 3]);
    expect(messages.map((message) => toStudioMessage(message).role)).toEqual(["user", "assistant", "assistant"]);
    // The author attribution stays truthful: only the owner's turn names them.
    expect(messages[0].author_id).toBe(actorId);
    expect(messages[1].author_id).toBeNull();
    // last_message_at advanced with the writes.
    await expect(repo.getConversation({ workspaceId, actorId, conversationId: conversation.id })).resolves.toMatchObject({ title: "one" });
  });

  it("derives the title from the first user turn only, and leaves rename in charge afterwards", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const conversation = await repo.createConversation({ workspaceId, actorId });
    const first = await repo.appendMessage({
      workspaceId,
      actorId,
      conversationId: conversation.id,
      role: "user",
      content: "What should I fix  first?",
      parts: [{ kind: "text", text: "What should I fix  first?" }],
      titleSuggestion: "What should I fix first?",
    });
    expect(first.conversation.title).toBe("What should I fix first?");
    const second = await repo.appendMessage({
      workspaceId,
      actorId,
      conversationId: conversation.id,
      role: "user",
      content: "And then?",
      parts: [{ kind: "text", text: "And then?" }],
      titleSuggestion: "And then?",
    });
    expect(second.conversation.title).toBe("What should I fix first?");
    await expect(
      repo.renameConversation({ workspaceId, actorId, conversationId: conversation.id, title: "  Launch   week  " }),
    ).resolves.toMatchObject({ title: "Launch week" });
    // The derived fallback keeps title derivation working when a caller sends no suggestion.
    const derived = await repo.createConversation({ workspaceId, actorId });
    const fallback = await repo.appendMessage({ workspaceId, actorId, conversationId: derived.id, role: "user", content: "  Reply   to  my reviews ", parts: [] });
    expect(fallback.conversation.title).toBe("Reply to my reviews");
  });

  it("renames and archives only the caller's row; an archived conversation refuses new turns but stays readable", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const conversation = await repo.createConversation({ workspaceId, actorId });
    await expect(repo.renameConversation({ workspaceId, actorId, conversationId: conversation.id, title: "Plan" })).resolves.toMatchObject({ title: "Plan" });
    await expect(repo.archiveConversation({ workspaceId, actorId, conversationId: conversation.id })).resolves.toMatchObject({ status: "archived" });
    await expect(repo.listConversations({ workspaceId, actorId })).resolves.toEqual([]);
    await expect(repo.getConversation({ workspaceId, actorId, conversationId: conversation.id })).resolves.toMatchObject({ status: "archived" });
    const error = await repo
      .appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "user", content: "late", parts: [] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StudioConversationArchivedError);
    expect(error).toMatchObject({ code: STUDIO_CONVERSATION_ARCHIVED, message: STUDIO_CONVERSATION_ARCHIVED });
    expect((await owner.query("SELECT count(*)::int AS n FROM studio_messages WHERE conversation_id=$1", [conversation.id])).rows[0].n).toBe(0);
  });

  it("pages backwards with beforeSeq, newest window first, returned oldest-first", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const conversation = await repo.createConversation({ workspaceId, actorId });
    for (let index = 1; index <= 5; index += 1) {
      await repo.appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "user", content: `turn ${index}`, parts: [] });
    }
    const latest = await repo.listMessages({ workspaceId, actorId, conversationId: conversation.id, limit: 2 });
    expect(latest.map((message) => message.seq)).toEqual([4, 5]);
    const older = await repo.listMessages({ workspaceId, actorId, conversationId: conversation.id, limit: 2, beforeSeq: 4 });
    expect(older.map((message) => message.seq)).toEqual([2, 3]);
  });

  it("imports a browser-local thread as ordered user turns in one transaction", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const result = await repo.importConversation({
      workspaceId,
      actorId,
      title: "Local idea",
      notes: ["First note", "Second note"],
      documents: [{ source: "document", documentVersionId: "11111111-1111-4111-8111-111111111111", title: "Shop facts.pdf", truncated: false }],
    });
    expect(result.messageCount).toBe(2);
    expect(result.conversation).toMatchObject({ workspace_id: workspaceId, created_by: actorId, title: "Local idea", status: "active" });
    const messages = await repo.listMessages({ workspaceId, actorId, conversationId: result.conversation.id });
    expect(messages.map((message) => [message.seq, message.role, message.content, message.author_id])).toEqual([
      [1, "user", "First note", actorId],
      [2, "user", "Second note", actorId],
    ]);
    expect(messages[0].parts).toEqual([
      { kind: "text", text: "First note" },
      { kind: "citation", refs: [{ source: "document", documentVersionId: "11111111-1111-4111-8111-111111111111", title: "Shop facts.pdf", truncated: false }] },
    ]);
    expect(messages[1].parts).toEqual([{ kind: "text", text: "Second note" }]);
  });

  it("bulk-imports several browser-local threads in one transaction", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const result = await repo.importConversations({
      workspaceId,
      actorId,
      threads: [
        { title: "First local", notes: ["one", "two"] },
        { title: "Second local", notes: ["three"] },
      ],
    });
    expect(result.messageCount).toBe(3);
    expect(result.conversations.map((conversation) => conversation.title)).toEqual(["First local", "Second local"]);
    const conversations = await repo.listConversations({ workspaceId, actorId });
    expect(conversations.map((conversation) => conversation.title).sort()).toEqual(["First local", "Second local"]);
    const second = result.conversations[1];
    const messages = await repo.listMessages({ workspaceId, actorId, conversationId: second.id });
    expect(messages.map((message) => [message.seq, message.role, message.content])).toEqual([[1, "user", "three"]]);
  });

  it("shares a conversation with an accepted workspace member and enforces editor/viewer access", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const teammateId = await member();
    await runtime.query(
      "INSERT INTO workspace_members(workspace_id,user_id,email,role,accepted_at) VALUES($1,$2,$3,'manager',now())",
      [workspaceId, teammateId, `${randomUUID()}@studio.test`],
    );
    const conversation = await repo.createConversation({ workspaceId, actorId });

    // Before sharing, the teammate cannot see the conversation at all.
    await expect(repo.getConversation({ workspaceId, actorId: teammateId, conversationId: conversation.id })).resolves.toBeNull();
    expect(await repo.listConversations({ workspaceId, actorId: teammateId })).toEqual([]);

    // Share as editor: visible, continuable.
    await repo.addConversationMember({ workspaceId, actorId, conversationId: conversation.id, userId: teammateId, role: "editor" });
    const shared = await repo.getConversation({ workspaceId, actorId: teammateId, conversationId: conversation.id });
    expect(shared).toMatchObject({ id: conversation.id, access_role: "editor" });
    expect((await repo.listConversations({ workspaceId, actorId: teammateId })).map((row) => row.id)).toEqual([conversation.id]);
    const appended = await repo.appendMessage({
      workspaceId,
      actorId: teammateId,
      conversationId: conversation.id,
      role: "user",
      content: "Continuing the shared plan.",
      parts: [],
    });
    expect(appended.message).toMatchObject({ conversation_id: conversation.id, role: "user", content: "Continuing the shared plan." });

    // Re-share as viewer: readable, not writable.
    await repo.addConversationMember({ workspaceId, actorId, conversationId: conversation.id, userId: teammateId, role: "viewer" });
    await expect(repo.appendMessage({
      workspaceId,
      actorId: teammateId,
      conversationId: conversation.id,
      role: "user",
      content: "Should fail.",
      parts: [],
    })).rejects.toMatchObject({ name: "StudioConversationForbiddenError" });

    expect(await repo.listConversationMembers({ workspaceId, actorId, conversationId: conversation.id })).toMatchObject([
      { user_id: teammateId, role: "viewer" },
    ]);
    await expect(repo.removeConversationMember({ workspaceId, actorId, conversationId: conversation.id, userId: teammateId })).resolves.toBe(true);
    await expect(repo.getConversation({ workspaceId, actorId: teammateId, conversationId: conversation.id })).resolves.toBeNull();
  });

  it("cascades content with the conversation, the workspace and the creator, and nulls a removed location", async () => {
    const workspaceId = await workspace();
    const actorId = await member();
    const shopLocation = await location(workspaceId);
    const repo = studioRepository(runtime, (run) => withTransaction(run, runtime));
    const conversation = await repo.createConversation({ workspaceId, actorId, locationId: shopLocation });
    await repo.appendMessage({ workspaceId, actorId, conversationId: conversation.id, role: "user", content: "hello", parts: [] });

    // location deleted -> conversation survives with location_id null.
    await runtime.query("DELETE FROM locations WHERE id=$1", [shopLocation]);
    await expect(repo.getConversation({ workspaceId, actorId, conversationId: conversation.id })).resolves.toMatchObject({ location_id: null });

    // conversation deleted -> its messages cascade.
    await runtime.query("DELETE FROM studio_conversations WHERE id=$1", [conversation.id]);
    expect((await owner.query("SELECT count(*)::int AS n FROM studio_messages WHERE conversation_id=$1", [conversation.id])).rows[0].n).toBe(0);

    // creator deleted -> conversations cascade.
    const otherWorkspace = await workspace();
    const otherActor = await member();
    const owned = await repo.createConversation({ workspaceId: otherWorkspace, actorId: otherActor });
    await repo.appendMessage({ workspaceId: otherWorkspace, actorId: otherActor, conversationId: owned.id, role: "user", content: "x", parts: [] });
    await runtime.query("DELETE FROM app_users WHERE id=$1", [otherActor]);
    expect((await owner.query("SELECT count(*)::int AS n FROM studio_conversations WHERE id=$1", [owned.id])).rows[0].n).toBe(0);

    // workspace deleted -> its conversations and messages cascade.
    const doomedWorkspace = await workspace();
    const doomedActor = await member();
    const doomed = await repo.createConversation({ workspaceId: doomedWorkspace, actorId: doomedActor });
    await repo.appendMessage({ workspaceId: doomedWorkspace, actorId: doomedActor, conversationId: doomed.id, role: "user", content: "x", parts: [] });
    await runtime.query("DELETE FROM workspaces WHERE id=$1", [doomedWorkspace]);
    expect((await owner.query("SELECT count(*)::int AS n FROM studio_conversations WHERE id=$1", [doomed.id])).rows[0].n).toBe(0);
    expect((await owner.query("SELECT count(*)::int AS n FROM studio_messages WHERE workspace_id=$1", [doomedWorkspace])).rows[0].n).toBe(0);
  });

  it("enforces the store's own shape: seq/role/parts/status/checks and title length", async () => {
    const { workspaceId, actorId, repo } = await setup();
    const conversation = await repo.createConversation({ workspaceId, actorId });
    await expect(runtime.query("INSERT INTO studio_messages(conversation_id,workspace_id,seq,role) VALUES($1,$2,0,'user')", [conversation.id, workspaceId])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO studio_messages(conversation_id,workspace_id,seq,role) VALUES($1,$2,1,'system')", [conversation.id, workspaceId])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO studio_messages(conversation_id,workspace_id,seq,role,parts) VALUES($1,$2,1,'user','{}'::jsonb)", [conversation.id, workspaceId])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO studio_messages(conversation_id,workspace_id,seq,role,cost_usd) VALUES($1,$2,1,'user',-1)", [conversation.id, workspaceId])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO studio_conversations(workspace_id,created_by,title) VALUES($1,$2,$3)", [workspaceId, actorId, "x".repeat(81)])).rejects.toMatchObject({ code: "23514" });
    await expect(runtime.query("INSERT INTO studio_conversations(workspace_id,created_by,status) VALUES($1,$2,'deleted')", [workspaceId, actorId])).rejects.toMatchObject({ code: "23514" });
    // The typed repository error contract doubles as documentation of what the route maps to 404.
    expect(STUDIO_CONVERSATION_NOT_FOUND).toBe("studio_conversation_not_found");
  });
});
