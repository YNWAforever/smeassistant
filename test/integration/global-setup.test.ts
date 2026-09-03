import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dockerAvailable: vi.fn(),
  startContainers: vi.fn(),
  applySchema: vi.fn(),
}));

vi.mock("./docker", () => ({
  dockerAvailable: mocks.dockerAvailable,
  startContainers: mocks.startContainers,
}));

vi.mock("./schema", () => ({
  applySchema: mocks.applySchema,
}));

import setup from "./global-setup";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RATE_LIMIT_SECRET",
] as const;

describe("integration global setup", () => {
  const stop = vi.fn();
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // reset, not clear: clearAllMocks keeps implementations, so the throwing
    // applySchema from one case would leak into the next.
    vi.resetAllMocks();
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    mocks.dockerAvailable.mockReturnValue(true);
    mocks.startContainers.mockResolvedValue({
      postgrestUrl: "http://127.0.0.1:54321",
      postgresUri: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
      stop,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("stops the containers when the schema fails to apply", async () => {
    mocks.applySchema.mockImplementation(() => {
      throw new Error("migration 0001_v0_1_schema.sql failed to apply: syntax error");
    });

    await expect(setup()).rejects.toThrow(/failed to apply/);
    // startContainers cleans up only the failures it raises itself. Once it has
    // returned, the teardown this function returns is the sole thing that stops
    // the containers — and a throw means Vitest never receives it. Without an
    // explicit stop here, a bad migration strands postgres and postgrest on the
    // developer's machine, to be removed by hand.
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("returns a teardown that stops the containers on success", async () => {
    const teardown = await setup();

    expect(stop).not.toHaveBeenCalled();
    teardown();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("never starts containers when Docker is unavailable", async () => {
    mocks.dockerAvailable.mockReturnValue(false);

    await expect(setup()).rejects.toThrow(/Docker/);
    expect(mocks.startContainers).not.toHaveBeenCalled();
  });
});
