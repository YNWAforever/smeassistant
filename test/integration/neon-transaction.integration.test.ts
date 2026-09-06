import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPool } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";

describe.runIf(process.env.NEON_INTEGRATION === "1")("PostgreSQL transaction boundary", () => {
  beforeAll(async () => {
    await getPool().query("CREATE TABLE task2_transaction_probe (value text NOT NULL)");
  });

  afterAll(async () => {
    await getPool().query("DROP TABLE task2_transaction_probe");
    await getPool().end();
  });

  it("rolls back work on the same connection before another connection observes it", async () => {
    let transactionBackendPid: number | undefined;

    await expect(
      withTransaction(async (client) => {
        transactionBackendPid = Number((await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid);
        await client.query("INSERT INTO task2_transaction_probe (value) VALUES ($1)", ["rolled-back"]);
        throw new Error("force_rollback");
      }),
    ).rejects.toThrow("force_rollback");

    const observer = await getPool().connect();
    try {
      const result = await observer.query<{ count: string }>("SELECT count(*)::text AS count FROM task2_transaction_probe");
      expect(result.rows[0]?.count).toBe("0");
      expect(transactionBackendPid).toBeTypeOf("number");
    } finally {
      observer.release();
    }
  });

  it("does not leak transaction-local context to the next pool borrower", async () => {
    await withTransaction(async (client) => {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", ["task-2-user"]);
      const inside = await client.query<{ value: string }>("SELECT current_setting('app.current_user_id', true) AS value");
      expect(inside.rows[0]?.value).toBe("task-2-user");
    });

    const borrower = await getPool().connect();
    try {
      const after = await borrower.query<{ value: string | null }>(
        "SELECT nullif(current_setting('app.current_user_id', true), '') AS value",
      );
      expect(after.rows[0]?.value).toBeNull();
    } finally {
      borrower.release();
    }
  });
});
