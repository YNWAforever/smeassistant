import { expect, it } from "vitest";
import config from "../../vitest.owner-check.config";

it("selects only the owned SQL acceptance spec without a container-creating global setup", () => {
  expect(config.test?.include).toEqual(["test/integration/owner-check-real.acceptance.ts"]);
  expect(config.test?.globalSetup).toBeUndefined();
  expect(config.test?.retry).toBe(0);
  expect(config.test?.maxWorkers).toBe(1);
});
