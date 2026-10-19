import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

import { prepareFixtureDocument, workspaceReadTarget } from "./page-readiness";

// Only replace the upstream runner's waiting boundary for the status decision.
// Real hydration/network timing is exercised by the browser regressions.
vi.mock("@playwright/test", () => ({
  expect: { poll: () => ({ toBe: async () => undefined }) },
}));

describe("owned fixture document precompilation scope", () => {
  const origin = "http://localhost:3100";
  const current = `${origin}/en/owner/acceptance-hk-deadbeef`;
  it.each([
    "/en/owner/acceptance-hk-deadbeef/actions/00000000-0000-4000-8000-000000000001",
    "/zh-HK/owner/acceptance-hk-deadbeef/actions?view=completed",
    "/en/owner/acceptance-tw-1234abcd/settings/billing",
  ])("allows a GET document read for %s in the owned app", target => {
    expect(workspaceReadTarget(origin, current, target)).toBe(origin + target);
  });
  it.each([
    "/api/auth/verify?token=fixture-one-use",
    "/auth/callback?code=fixture-one-use",
    "/en/owner/sign-in/complete",
    "/en/owner/onboarding?claim=fixture-claim",
    "/api/versions/00000000-0000-4000-8000-000000000001/export",
    "http://localhost:3101/en/owner/acceptance-hk-deadbeef/actions",
    "http://fixture-user@localhost:3100/en/owner/acceptance-hk-deadbeef/actions",
    "https://outside.invalid/en/owner/acceptance-hk-deadbeef/actions",
    "/en/owner/another-merchant/actions",
    "/en/owner/acceptance-hk-deadbeef/actions?token=fixture-one-use",
  ])("never pre-reads an Auth/API/foreign target: %s", target => {
    expect(workspaceReadTarget(origin, current, target)).toBeNull();
  });
  it("does not warm from a blank/foreign page or a non-fixture origin", () => {
    const target = "/en/owner/acceptance-hk-deadbeef/actions";
    expect(workspaceReadTarget(origin, "about:blank", target)).toBeNull();
    expect(workspaceReadTarget(origin, "https://outside.invalid/", target)).toBeNull();
    expect(workspaceReadTarget("https://production.invalid", current, target)).toBeNull();
  });
});

function responsePage(status: number) {
  let disposed = false;
  const page = {
    url: () => "http://localhost:3100/en/owner/acceptance-hk-deadbeef",
    request: {
      get: async () => ({
        status: () => status,
        body: async () => Buffer.from("Synthetic response; never included in errors"),
        dispose: async () => { disposed = true; },
      }),
    },
    on: () => undefined,
    once: () => undefined,
  } as unknown as Page;
  return { page, disposed: () => disposed };
}

describe("document pre-read failures", () => {
  it("does not conceal a server failure behind a later browser GET and disposes its body", async () => {
    const fixture = responsePage(503);
    await expect(prepareFixtureDocument(fixture.page, "http://localhost:3100",
      "/en/owner/acceptance-hk-deadbeef/actions")).rejects.toThrow(
      "fixture_document_precompile_failed:503:/en/owner/acceptance-hk-deadbeef/actions",
    );
    expect(fixture.disposed()).toBe(true);
  });
  it("leaves intentional authorization denials for the real browser assertions", async () => {
    const fixture = responsePage(403);
    await expect(prepareFixtureDocument(fixture.page, "http://localhost:3100",
      "/en/owner/acceptance-hk-deadbeef/actions")).resolves.toBeUndefined();
    expect(fixture.disposed()).toBe(true);
  });
});
