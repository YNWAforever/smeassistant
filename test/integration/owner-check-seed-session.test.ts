import { describe, expect, it } from "vitest";
import { createOwnerCheckSeedSession } from "./owner-check-seed-session";

describe("one owned fixture survives a failed custom seed attempt", () => {
  it("returns the setup failure, then explicitly retries on the same fixture", async () => {
    const fixture = { containerId: "same-owned-container" };
    let attempts = 0;
    const failure = new Error("synthetic missing required column");
    const session = createOwnerCheckSeedSession(async () => {
      if (++attempts === 1) throw failure;
      return fixture;
    });
    await expect(session.attempt()).resolves.toEqual({ ok: false, error: failure });
    expect(session.target).toBeUndefined();
    expect(attempts).toBe(1); // No automatic retry or replacement resource.
    await expect(session.attempt()).resolves.toEqual({ ok: true, target: fixture });
    expect(session.target).toBe(fixture);
    expect(attempts).toBe(2);
  });

  it("does not reseed after a successful commit", async () => {
    let attempts = 0;
    const session = createOwnerCheckSeedSession(async () => ({ attempt: ++attempts }));
    const first = await session.attempt();
    expect(await session.attempt()).toEqual(first);
    expect(attempts).toBe(1);
  });

  it("coalesces simultaneous seed requests instead of creating duplicate fixture rows", async () => {
    let attempts = 0;
    let release!: (value: string) => void;
    const session = createOwnerCheckSeedSession(() => {
      attempts++;
      return new Promise<string>(done => { release = done; });
    });
    const first = session.attempt(), second = session.attempt();
    await Promise.resolve();
    expect(attempts).toBe(1);
    release("same-seed");
    expect(await first).toEqual({ ok: true, target: "same-seed" });
    expect(await second).toEqual(await first);
  });
});
