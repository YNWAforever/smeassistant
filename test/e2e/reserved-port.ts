import { createServer } from "node:net";

export interface ReservedLoopbackPort {
  port: number;
  release(): Promise<void>;
}

export async function reserveLoopbackPort(requested = 0): Promise<ReservedLoopbackPort> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requested, "127.0.0.1", resolve);
  });
  const port = (server.address() as { port: number }).port;
  let released: Promise<void> | undefined;
  return {
    port,
    release() {
      return released ??= new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}
