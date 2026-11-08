import { beforeEach, describe, expect, it, vi } from "vitest";

// Every test injects a fake executor; the default database is never reached.
vi.mock("../db/client", () => ({
  getPool: () => {
    throw new Error("default_database_forbidden");
  },
}));

// appendMessage must run its statements on one injected transaction client.
// The fake transaction hands the same mock to the repository, so the test can
// assert statement order, scope columns and every bound parameter.
const { transactionQuery } = vi.hoisted(() => ({ transactionQuery: vi.fn() }));
vi.mock("../db/transaction", () => ({
  withTransaction: (run: (client: { query: typeof transactionQuery }) => Promise<unknown>) =>
    run({ query: transactionQuery }),
}));

import {
  STUDIO_CONVERSATION_ARCHIVED,
  STUDIO_CONVERSATION_NOT_FOUND,
  StudioConversationArchivedError,
  StudioConversationNotFoundError,
  toStudioConversation,
  toStudioMessage,
  studioRepository,
} from "./studio";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OTHER_ACTOR = "33333333-3333-4333-8333-333333333333";
const CONVERSATION = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";
const MESSAGE = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;
type Handler = (sql: string, values: unknown[]) => { rows: Row[] | unknown[] };
type ReadExecutor = NonNullable<Parameters<typeof studioRepository>[0]>;

const CONVERSATION_ROW: Row = {
  id: CONVERSATION,
  workspace_id: WORKSPACE,
  location_id: null,
  created_by: ACTOR,
  title: "",
  status: "active",
  created_at: "2026-11-08T12:00:00.000000Z",
  updated_at: "2026-11-08T12:00:00.000000Z",
  last_message_at: "2026-11-08T12:00:00.000000Z",
};

const MESSAGE_ROW: Row = {
  id: MESSAGE,
  conversation_id: CONVERSATION,
  workspace_id: WORKSPACE,
  seq: 1,
  role: "user",
  author_id: ACTOR,
  content: "What should I do first?",
  parts: [{ kind: "text", text: "What should I do first?" }],
  intent: null,
  model: null,
  prompt_version: null,
  input_tokens: null,
  output_tokens: null,
  cost_usd: null,
  created_at: "2026-11-08T12:00:01.000000Z",
};

function executor(handler: Handler): ReadExecutor & { query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => handler(sql, values));
  return { query } as unknown as ReadExecutor & { query: ReturnType<typeof vi.fn> };
}

function conversationRow(overrides: Row = {}): Row {
  return { ...CONVERSATION_ROW, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("studioRepository.listConversations", () => {
  it("filters by workspace and creator, active only, newest first, and defaults to 40", async () => {
    const db = executor((sql, values) => {
      expect(sql).toContain("FROM studio_conversations c");
      expect(sql).toContain("c.workspace_id=$1 AND c.created_by=$2 AND c.status='active'");
      expect(sql).toContain("ORDER BY c.last_message_at DESC,c.id DESC");
      // A null location filter means the whole workspace; a location also admits
      // workspace-wide conversations, exactly like owner actions do.
      expect(sql).toContain("($3::uuid IS NULL OR c.location_id=$3 OR c.location_id IS NULL)");
      expect(values).toEqual([WORKSPACE, ACTOR, null, 40]);
      return { rows: [conversationRow()] };
    });
    const rows = await studioRepository(db).listConversations({ workspaceId: WORKSPACE, actorId: ACTOR });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: CONVERSATION, workspace_id: WORKSPACE, created_by: ACTOR });
  });

  it("passes an explicit location and clamps the limit to the rail window", async () => {
    const db = executor((_sql, values) => {
      expect(values).toEqual([WORKSPACE, ACTOR, LOCATION, 100]);
      return { rows: [] };
    });
    await studioRepository(db).listConversations({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      locationId: LOCATION,
      limit: 500,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("never returns another member's row because created_by is a bound parameter", async () => {
    const db = executor((_sql, values) => {
      expect(values[1]).toBe(ACTOR);
      expect(values[1]).not.toBe(OTHER_ACTOR);
      return { rows: [] };
    });
    await expect(
      studioRepository(db).listConversations({ workspaceId: WORKSPACE, actorId: ACTOR }),
    ).resolves.toEqual([]);
  });
});

describe("studioRepository.getConversation", () => {
  it("scopes by id, workspace and creator", async () => {
    const db = executor((sql, values) => {
      expect(sql).toContain("WHERE id=$1 AND workspace_id=$2 AND created_by=$3");
      expect(values).toEqual([CONVERSATION, WORKSPACE, ACTOR]);
      return { rows: [conversationRow()] };
    });
    const row = await studioRepository(db).getConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
    });
    expect(row?.title).toBe("");
  });

  it("returns archived rows so the orchestrator can report 'archived', not 'not found'", async () => {
    const db = executor(() => ({ rows: [conversationRow({ status: "archived" })] }));
    const row = await studioRepository(db).getConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
    });
    expect(toStudioConversation(row!)).toMatchObject({ status: "archived" });
  });

  it("returns null for a missing or foreign row without leaking existence", async () => {
    const db = executor(() => ({ rows: [] }));
    await expect(
      studioRepository(db).getConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: CONVERSATION }),
    ).resolves.toBeNull();
  });

  it("returns null for a malformed id without querying the database", async () => {
    const db = executor(() => {
      throw new Error("should not query");
    });
    await expect(
      studioRepository(db).getConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: "not-a-uuid" }),
    ).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("studioRepository.createConversation", () => {
  it("binds the workspace, optional location, creator and a normalized empty title", async () => {
    const db = executor((sql, values) => {
      expect(sql).toContain("INSERT INTO studio_conversations(workspace_id,location_id,created_by,title)");
      // The insert can only succeed when a supplied location belongs to this workspace.
      expect(sql).toContain("EXISTS(");
      expect(sql).toContain("l.id=$2::uuid AND l.workspace_id=$1::uuid");
      expect(values).toEqual([WORKSPACE, null, ACTOR, ""]);
      return { rows: [conversationRow()] };
    });
    const row = await studioRepository(db).createConversation({ workspaceId: WORKSPACE, actorId: ACTOR });
    expect(row.id).toBe(CONVERSATION);
  });

  it("normalizes and bounds a supplied title", async () => {
    const db = executor((_sql, values) => {
      expect(values[3]).toBe("Review replies plan");
      return { rows: [conversationRow({ title: "Review replies plan" })] };
    });
    await studioRepository(db).createConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      title: "  Review\n replies \t plan  ",
    });
  });

  it("throws the typed location error when the insert-select matches no row", async () => {
    const db = executor(() => ({ rows: [] }));
    await expect(
      studioRepository(db).createConversation({
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        locationId: LOCATION,
      }),
    ).rejects.toMatchObject({ code: "studio_location_not_found" });
  });
});

describe("studioRepository.renameConversation / archiveConversation", () => {
  it("updates only the caller's own row and returns null otherwise", async () => {
    const db = executor((sql, values) => {
      if (sql.startsWith("UPDATE studio_conversations SET title")) {
        expect(sql).toContain("WHERE id=$1 AND workspace_id=$2 AND created_by=$3");
        expect(values).toEqual([CONVERSATION, WORKSPACE, ACTOR, "Launch week"]);
        return { rows: [conversationRow({ title: "Launch week" })] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const repo = studioRepository(db);
    await expect(
      repo.renameConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: CONVERSATION, title: "Launch week" }),
    ).resolves.toMatchObject({ title: "Launch week" });
  });

  it("returns null instead of throwing for a missing/foreign conversation", async () => {
    const db = executor(() => ({ rows: [] }));
    const repo = studioRepository(db);
    await expect(
      repo.renameConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: CONVERSATION, title: "x" }),
    ).resolves.toBeNull();
    await expect(
      repo.archiveConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: CONVERSATION }),
    ).resolves.toBeNull();
  });

  it("archives by setting status and touching updated_at", async () => {
    const db = executor((sql) => {
      expect(sql).toContain("SET status='archived',updated_at=now()");
      return { rows: [conversationRow({ status: "archived" })] };
    });
    await expect(
      studioRepository(db).archiveConversation({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: CONVERSATION }),
    ).resolves.toMatchObject({ status: "archived" });
  });
});

describe("studioRepository.listMessages", () => {
  it("proves scope through the conversation join and returns the window oldest-first", async () => {
    const db = executor((sql, values) => {
      expect(sql).toContain("JOIN studio_conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id AND c.created_by=$3");
      expect(sql).toContain("m.workspace_id=$1 AND m.conversation_id=$2");
      expect(sql).toContain("ORDER BY m.seq DESC LIMIT $5");
      expect(values).toEqual([WORKSPACE, CONVERSATION, ACTOR, null, 50]);
      // The database returns the newest window descending; the method returns ascending.
      return {
        rows: [
          { ...MESSAGE_ROW, id: "msg-2", seq: 2 },
          { ...MESSAGE_ROW, id: "msg-1", seq: 1 },
        ],
      };
    });
    const rows = await studioRepository(db).listMessages({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
    });
    expect(rows.map((row) => row.seq)).toEqual([1, 2]);
  });

  it("passes beforeSeq exclusively and clamps the limit", async () => {
    const db = executor((_sql, values) => {
      expect(values).toEqual([WORKSPACE, CONVERSATION, ACTOR, 10, 200]);
      return { rows: [] };
    });
    await studioRepository(db).listMessages({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
      beforeSeq: 10,
      limit: 1000,
    });
  });

  it("returns [] for a malformed conversation id", async () => {
    const db = executor(() => {
      throw new Error("should not query");
    });
    await expect(
      studioRepository(db).listMessages({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: "nope" }),
    ).resolves.toEqual([]);
  });
});

describe("studioRepository.appendMessage", () => {
  type Statement = { sql: string; values: unknown[] };

  /** One fake transaction client: replies to the four statements in order. */
  function statements(overrides: { conversation?: Row | null; maxSeq?: number; message?: Row; conversationAfter?: Row } = {}) {
    const seen: Statement[] = [];
    const conversation = overrides.conversation === undefined ? conversationRow() : overrides.conversation;
    transactionQuery.mockImplementation(async (sql: string, values: unknown[] = []) => {
      seen.push({ sql, values });
      if (sql.includes("FOR UPDATE")) return { rows: conversation ? [conversation] : [] };
      if (sql.includes("COALESCE(max(seq),0)+1")) return { rows: [{ seq: overrides.maxSeq ?? 1 }] };
      if (sql.startsWith("INSERT INTO studio_messages")) {
        return { rows: [overrides.message ?? { ...MESSAGE_ROW, seq: overrides.maxSeq ?? 1 }] };
      }
      if (sql.startsWith("UPDATE studio_conversations")) {
        return { rows: [overrides.conversationAfter ?? conversationRow({ title: "What should I do first?", last_message_at: "2026-11-08T12:00:02.000000Z" })] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    return seen;
  }

  it("locks the conversation, allocates seq and derives the title from the first user message", async () => {
    const seen = statements({ maxSeq: 3 });
    const result = await studioRepository(executor(() => ({ rows: [] }))).appendMessage({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
      role: "user",
      content: "What should I do first?",
      parts: [{ kind: "text", text: "What should I do first?" }],
      titleSuggestion: "What should I do first?",
    });
    expect(seen).toHaveLength(4);
    expect(seen[0].sql).toMatch(/^SELECT [\s\S]*FROM studio_conversations[\s\S]*FOR UPDATE/);
    expect(seen[1].sql).toContain("COALESCE(max(seq),0)+1");
    expect(seen[2].sql).toMatch(/^INSERT INTO studio_messages/);
    expect(seen[3].sql).toMatch(/^UPDATE studio_conversations/);
    const lock = seen[0];
    expect(lock.sql).toContain("WHERE id=$1 AND workspace_id=$2 AND created_by=$3 FOR UPDATE");
    expect(lock.values).toEqual([CONVERSATION, WORKSPACE, ACTOR]);
    const insert = seen[2];
    expect(insert.values).toEqual([
      CONVERSATION,
      WORKSPACE,
      3,
      "user",
      ACTOR,
      "What should I do first?",
      JSON.stringify([{ kind: "text", text: "What should I do first?" }]),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const touch = seen[3];
    // Only an empty stored title is set; the WHERE/CASE guard lives in the SQL.
    expect(touch.sql).toContain("title=CASE WHEN title='' AND $4::text<>'' THEN $4::text ELSE title END");
    expect(touch.values[3]).toBe("What should I do first?");
    expect(result.message.seq).toBe(3);
    expect(result.conversation.title).toBe("What should I do first?");
  });

  it("names an assistant turn with author_id null and never derives a title from its content", async () => {
    const seen = statements({ maxSeq: 2, message: { ...MESSAGE_ROW, role: "assistant", author_id: null, seq: 2 } });
    await studioRepository(executor(() => ({ rows: [] }))).appendMessage({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
      role: "assistant",
      content: "Start with review replies.",
      parts: [{ kind: "text", text: "Start with review replies." }],
      intent: "explain_priority",
      model: "test-model",
      promptVersion: "studio-1",
      usage: { inputTokens: 12, outputTokens: 34, costUsd: 0.00042 },
    });
    expect(seen[2].values.slice(3, 6)).toEqual(["assistant", null, "Start with review replies."]);
    expect(seen[2].values[6]).toBe(JSON.stringify([{ kind: "text", text: "Start with review replies." }]));
    expect(seen[2].values.slice(7, 13)).toEqual(["explain_priority", "test-model", "studio-1", 12, 34, 0.00042]);
    expect(seen[3].values[3]).toBe("");
  });

  it("sanitizes impossible usage to null instead of guessing zero", async () => {
    const seen = statements();
    await studioRepository(executor(() => ({ rows: [] }))).appendMessage({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      conversationId: CONVERSATION,
      role: "assistant",
      content: "answer",
      parts: [],
      usage: { inputTokens: -1, outputTokens: Number.NaN, costUsd: -0.5 },
    });
    expect(seen[2].values.slice(10, 13)).toEqual([null, null, null]);
  });

  it("writes nothing and throws the typed not-found error when the conversation is missing or foreign", async () => {
    const seen = statements({ conversation: null });
    const error = await studioRepository(executor(() => ({ rows: [] })))
      .appendMessage({
        workspaceId: WORKSPACE,
        actorId: OTHER_ACTOR,
        conversationId: CONVERSATION,
        role: "user",
        content: "hello",
        parts: [],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StudioConversationNotFoundError);
    expect(error).toMatchObject({ code: STUDIO_CONVERSATION_NOT_FOUND, message: STUDIO_CONVERSATION_NOT_FOUND });
    expect(seen).toHaveLength(1);
  });

  it("writes nothing and throws the typed archived error for an archived conversation", async () => {
    const seen = statements({ conversation: conversationRow({ status: "archived" }) });
    const error = await studioRepository(executor(() => ({ rows: [] })))
      .appendMessage({
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        conversationId: CONVERSATION,
        role: "user",
        content: "hello",
        parts: [],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StudioConversationArchivedError);
    expect(error).toMatchObject({ code: STUDIO_CONVERSATION_ARCHIVED });
    expect(seen).toHaveLength(1);
  });

  it("rejects a malformed id before opening a transaction", async () => {
    const error = await studioRepository(executor(() => ({ rows: [] })))
      .appendMessage({ workspaceId: WORKSPACE, actorId: ACTOR, conversationId: "bad", role: "user", content: "x", parts: [] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StudioConversationNotFoundError);
    expect(transactionQuery).not.toHaveBeenCalled();
  });

  it("hides driver failures behind one stable operation error", async () => {
    transactionQuery.mockRejectedValue(Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }));
    await expect(
      studioRepository(executor(() => ({ rows: [] }))).appendMessage({
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        conversationId: CONVERSATION,
        role: "user",
        content: "x",
        parts: [],
      }),
    ).rejects.toThrow("studio_operation_failed");
  });
});

describe("studioRepository.importConversation (convergence bridge)", () => {
  it("creates the conversation and every local note as user turns in one transaction", async () => {
    transactionQuery
      .mockResolvedValueOnce({ rows: [conversationRow({ id: CONVERSATION, title: "Local idea" })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [conversationRow({ id: CONVERSATION, title: "Local idea" })] });

    const result = await studioRepository().importConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      locationId: LOCATION,
      title: "Local idea",
      notes: ["First note", "Second note", "   "],
    });

    expect(result.messageCount).toBe(2);
    const calls = transactionQuery.mock.calls;
    expect(String(calls[0][0])).toContain("INSERT INTO studio_conversations");
    expect(calls[0][1]).toEqual([WORKSPACE, LOCATION, ACTOR, "Local idea"]);
    expect(String(calls[1][0])).toContain("INSERT INTO studio_messages");
    expect(calls[1][1]).toEqual([CONVERSATION, WORKSPACE, 1, ACTOR, "First note"]);
    expect(calls[2][1]).toEqual([CONVERSATION, WORKSPACE, 2, ACTOR, "Second note"]);
    expect(String(calls[3][0])).toContain("UPDATE studio_conversations");
  });

  it("rejects an empty import without opening a transaction", async () => {
    await expect(studioRepository().importConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      title: "Empty",
      notes: ["   "],
    })).rejects.toThrow("studio_import_empty");
    expect(transactionQuery).not.toHaveBeenCalled();
  });

  it("rejects a location outside the workspace without inserting anything", async () => {
    transactionQuery.mockResolvedValueOnce({ rows: [] });
    await expect(studioRepository().importConversation({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      locationId: LOCATION,
      title: "Moved shop",
      notes: ["note"],
    })).rejects.toMatchObject({ name: "StudioLocationNotFoundError" });
    expect(transactionQuery).toHaveBeenCalledTimes(1);
  });
});

describe("wire mappers", () => {
  it("maps a conversation row to the camelCase contract", () => {
    expect(toStudioConversation(conversationRow({ location_id: LOCATION }) as unknown as Parameters<typeof toStudioConversation>[0])).toEqual({
      id: CONVERSATION,
      title: "",
      status: "active",
      locationId: LOCATION,
      createdAt: "2026-11-08T12:00:00.000000Z",
      updatedAt: "2026-11-08T12:00:00.000000Z",
      lastMessageAt: "2026-11-08T12:00:00.000000Z",
    });
  });

  it("parses and validates persisted parts, dropping unknown shapes", () => {
    const row = {
      ...MESSAGE_ROW,
      intent: "explain_priority",
      parts: [
        { kind: "text", text: "Start here." },
        {
          kind: "evidence",
          refs: [
            { evidenceId: "ev:1", scanId: "scan-1", factType: "Observed", label: "Score", value: "78", observedAt: "2026-11-01", source: "scan" },
            { evidenceId: "ev:bad", factType: "Invented" },
          ],
        },
        {
          kind: "artifact",
          actionId: "action-1",
          actionTitle: "Review replies",
          artifactType: "review_reply",
          title: "Draft",
          body: "Thanks",
          acceptanceCriteria: ["Tone"],
          draftRunId: null,
          requiresApproval: true,
        },
        { kind: "next_step", step: { kind: "open_action", actionId: "action-1" } },
        { kind: "warning", code: "ai_unavailable", text: "Unavailable" },
        { kind: "mystery", text: "drop me" },
        null,
      ],
    } as unknown as Parameters<typeof toStudioMessage>[0];
    const message = toStudioMessage(row);
    expect(message.intent).toBe("explain_priority");
    expect(message.parts.map((part) => part.kind)).toEqual(["text", "evidence", "artifact", "next_step", "warning"]);
    expect(message.parts[1]).toEqual({
      kind: "evidence",
      refs: [
        { evidenceId: "ev:1", scanId: "scan-1", factType: "Observed", label: "Score", value: "78", observedAt: "2026-11-01", source: "scan" },
      ],
    });
    expect(message.parts[2]).toMatchObject({ requiresApproval: true });
  });

  it("parses a JSON-string parts value and tolerates malformed stored json", () => {
    expect(toStudioMessage({ ...MESSAGE_ROW, parts: '[{"kind":"text","text":"hi"}]' } as never).parts).toEqual([
      { kind: "text", text: "hi" },
    ]);
    expect(toStudioMessage({ ...MESSAGE_ROW, parts: "{not json" } as never).parts).toEqual([]);
    expect(toStudioMessage({ ...MESSAGE_ROW, parts: { kind: "text" } } as never).parts).toEqual([]);
  });

  it("drops an unknown stored intent rather than widening the wire union", () => {
    expect(toStudioMessage({ ...MESSAGE_ROW, intent: "make_up_intent" } as never).intent).toBeNull();
  });
});
