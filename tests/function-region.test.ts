import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Functions run beside the database. Production Neon (and its Auth endpoint)
 * is in AWS ap-southeast-1 (Singapore). Without a region Vercel ran every
 * function in iad1 (Washington DC): `x-vercel-id` read `sin1::iad1::…`, every
 * query crossed the Pacific, and owner pages took 4–7 s (browser QA,
 * 2026-10-14). If the database moves, move this with it in the same PR.
 */
const vercelConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"),
) as { regions?: string[] };

describe("function region", () => {
  it("pins functions to sin1, next to the ap-southeast-1 database", () => {
    expect(vercelConfig.regions).toEqual(["sin1"]);
  });
});
