import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
import { reserveLoopbackPort } from "./reserved-port";

async function bind(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function close(server: Server): Promise<void> {
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("owned fixture app port reservation", () => {
  it("prevents another fixture service from taking the selected port before Next starts", async () => {
    const lease = await reserveLoopbackPort();
    const companion = createServer();
    try {
      await expect(bind(companion, lease.port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await close(companion);
      await lease.release();
    }
  });

  it("releases the selected port for the owned Next listener and tolerates repeated cleanup", async () => {
    const lease = await reserveLoopbackPort();
    const next = createServer();
    try {
      await lease.release();
      await lease.release();
      await bind(next, lease.port);
      expect(next.listening).toBe(true);
    } finally {
      await close(next);
      await lease.release();
    }
  });

  it("fails when the requested port is already owned without closing that listener", async () => {
    const other = createServer();
    await bind(other, 0);
    try {
      const port = (other.address() as { port: number }).port;
      await expect(reserveLoopbackPort(port)).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(other.listening).toBe(true);
    } finally {
      await close(other);
    }
  });
});
