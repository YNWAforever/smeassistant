import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Vercel project is now on the Pro plan (confirmed 2026-09-13), and this
 * app's own runtime resolver hard-blocks the `scheduled`/`cloudflare` modes
 * that would reach the legacy Cloudflare scheduler -- nothing in this app
 * defers to it anymore, whether or not it still runs elsewhere
 * (docs/integration/NEON-RUNNER-COMPATIBILITY.md). `app/api/cron/dispatch` is
 * now this app's own retained, authorized scheduler (design doc:
 * docs/superpowers/specs/2026-09-13-scan-scheduler-trigger-design.md).
 * This test still guards the "one scheduler" principle: it fails loudly if a
 * second cron is ever added, rather than silently allowing an unbounded list.
 */
const vercelConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"),
) as { crons?: { path: string; schedule: string }[] };

describe("cron registration", () => {
  it("registers exactly the one authorized dispatch cron, on a 5-minute schedule", () => {
    expect(vercelConfig.crons ?? []).toEqual([
      { path: "/api/cron/dispatch", schedule: "*/5 * * * *" },
    ]);
  });
});
