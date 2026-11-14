import { afterEach, describe, expect, it, vi } from "vitest";
import { assertExecutionBudget, currentExecutionBudget } from "@/lib/jobs/execution-budget";
import type { StudioRepository } from "@/lib/repositories/studio";
import { createStudioDeadline } from "@/lib/studio/deadline";
import type { StudioTurnSession } from "@/lib/studio/turn-session";
import { studioDraftPersistence, studioTurnStore } from "./studio-turn";

const writes = vi.hoisted(() => ({ queue: vi.fn(), start: vi.fn(), beginProviderAttempt: vi.fn(), observeProviderAttempt: vi.fn(), finishAssistantDraft: vi.fn() }));
vi.mock("@/lib/repositories/artifacts", () => ({ actionRunRepository: () => writes }));
vi.mock("@/lib/repositories/studio", () => ({ studioRepository: vi.fn(), toStudioMessage: (row: unknown) => row, toStudioConversation: (row: unknown) => row }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("Studio persistence reserve", () => {
  it("can save the assistant message after work expires using the original final cutoff", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    const appendMessage = vi.fn(async () => {
      assertExecutionBudget();
      expect(currentExecutionBudget()).toBe(deadline.finalization);
      return { message: { id: "saved" }, conversation: { id: "conversation" } };
    });
    const repository = { appendMessage } as unknown as StudioRepository;
    const store = studioTurnStore(repository, deadline);
    await vi.advanceTimersByTimeAsync(50_000);
    const input = { workspaceId: "workspace", actorId: "actor", conversationId: "conversation", role: "assistant" as const,
      content: "Partial answer", parts: [{ kind: "text" as const, text: "Partial answer" }] };
    expect((await store.appendMessage(input)).message.id).toBe("saved");
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(store.appendMessage(input)).rejects.toThrow("execution_budget_exhausted");
    deadline.dispose();
  });

  it("reserves finalization for observations and terminal draft writes, not new attempts", async () => {
    vi.useFakeTimers();
    const deadline = createStudioDeadline();
    for (const write of Object.values(writes)) write.mockImplementation(async () => { assertExecutionBudget(); });
    const session = { transaction: vi.fn() } as unknown as StudioTurnSession;
    const persistence = studioDraftPersistence(session, deadline);
    await persistence.queue({} as Parameters<typeof persistence.queue>[0]);
    await persistence.start({} as Parameters<typeof persistence.start>[0]);
    await persistence.beginProviderAttempt({} as Parameters<typeof persistence.beginProviderAttempt>[0]);
    await vi.advanceTimersByTimeAsync(50_000);
    await expect(persistence.queue({} as Parameters<typeof persistence.queue>[0])).rejects.toThrow("execution_budget_exhausted");
    await expect(persistence.beginProviderAttempt({} as Parameters<typeof persistence.beginProviderAttempt>[0])).rejects.toThrow("execution_budget_exhausted");
    await persistence.observeProviderAttempt({} as Parameters<typeof persistence.observeProviderAttempt>[0]);
    await persistence.finishAssistantDraft({} as Parameters<typeof persistence.finishAssistantDraft>[0]);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(persistence.observeProviderAttempt({} as Parameters<typeof persistence.observeProviderAttempt>[0])).rejects.toThrow("execution_budget_exhausted");
    deadline.dispose();
  });
});
