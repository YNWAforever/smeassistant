import { execFileSync } from "node:child_process";
import type { BrowserContext } from "@playwright/test";

export type Role = "owner" | "manager" | "viewer";
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
export interface VisualStack {
  app: string; container: string; database: string; slug: string; workspaceId: string; jobId: string;
  ids: { approved: string; draft: string; needsInput: string; completed: string };
  sessions: Record<Role, StorageState>;
}

export const VISUAL_DIR = "test-results/visual";
export const STACK_FILE = `${VISUAL_DIR}/stack.json`;
// Loopback only, like the acceptance suite: any external request fails instead of leaving the machine.
export const BROWSER_ARGS = ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=localhost;127.0.0.1;[::1]"];

/** SQL against the stack's own labelled container and database only. */
export function stackSql(stack: VisualStack, query: string): string {
  if (!/^sme-neon-it-db-[\w-]+$/.test(stack.container)) throw new Error("Refusing SQL outside the visual stack's container");
  return execFileSync("docker", ["exec", "-i", stack.container, "psql", "-U", "postgres", "-d", stack.database, "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query, encoding: "utf8", timeout: 30_000 }).trim();
}
