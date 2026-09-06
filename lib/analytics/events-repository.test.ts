import { expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { eventRepository } from "../repositories/events";
const row = {
  job_id: null,
  anonymous_session_id: "session",
  event_name: "full_report_viewed",
  properties: { access: "viewer" },
  dedupe_key: null,
} as const;
it("does not acquire for an already aborted operation", async () => {
  const pool = { connect: vi.fn() };
  const controller = new AbortController();
  controller.abort();
  await expect(
    eventRepository(pool as unknown as Pool).insert(row, controller.signal),
  ).rejects.toThrow();
  expect(pool.connect).not.toHaveBeenCalled();
});
it("rejects promptly while acquiring and releases a late connection without SQL", async () => {
  let acquired!: (client: PoolClient) => void;
  const pool = {
    connect: vi.fn(
      () =>
        new Promise<PoolClient>((resolve) => {
          acquired = resolve;
        }),
    ),
  };
  const controller = new AbortController();
  const pending = eventRepository(pool as unknown as Pool).insert(
    row,
    controller.signal,
  );
  const rejected = expect(pending).rejects.toThrow();
  controller.abort();
  await rejected;
  const client = { query: vi.fn(), release: vi.fn() };
  acquired(client as unknown as PoolClient);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(client.query).not.toHaveBeenCalled();
  expect(client.release).toHaveBeenCalledTimes(1);
});
