import { describe, expect, it, vi } from "vitest";

import { retryableLoad } from "./retryable-load";

describe("retryableLoad", () => {
  it("loads once while it succeeds", async () => {
    const load = vi.fn().mockResolvedValue("panel");
    const get = retryableLoad(load);
    await expect(get()).resolves.toBe("panel");
    await expect(get()).resolves.toBe("panel");
    expect(load).toHaveBeenCalledTimes(1);
  });

  // A failed hover prefetch used to stay cached, so the next click failed too.
  it("retries after a failed load instead of replaying the failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("chunk failed")).mockResolvedValue("panel");
    const get = retryableLoad(load);
    await expect(get()).rejects.toThrow("chunk failed");
    await expect(get()).resolves.toBe("panel");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
