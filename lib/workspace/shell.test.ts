import { describe, expect, it } from "vitest";

import type { WorkspaceContext } from "./queries";
import { buildShellWorkspace } from "./shell";

/**
 * The shell data assembly must forward the Conversation Studio flag. The page
 * itself reads `CONVERSATION_STUDIO_ENABLED` directly, so a missing forwarding
 * here renders the Studio while hiding its navigation entry — a bug only a
 * real page (and this test) catches, because rendering the shell with the flag
 * already set is covered by components/studio/navigation-entry.test.tsx.
 */
const context: WorkspaceContext = {
  workspace: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "example",
    name: "Example",
    market: "hk",
    tier: "lite",
    timezone: "Asia/Hong_Kong",
    isDemo: false,
    instagramHandle: null,
    industry: null,
    district: null,
  },
  locations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "branch",
      name: "Branch",
      address: null,
      district: null,
      isPrimary: true,
      placeId: null,
    },
  ],
  usage: { period: "2026-11", approvedDeliveries: 0, allowance: 3 },
  unreadNotifications: 0,
  membership: {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workspaceSlug: "example",
    userId: "33333333-3333-4333-8333-333333333333",
    email: "owner@example.test",
    role: "owner",
    locationScope: null,
  },
  account: { name: "Owner", email: "owner@example.test" },
};

describe("buildShellWorkspace", () => {
  it("forwards studioEnabled so the shell can render the Studio entry", () => {
    expect(buildShellWorkspace(context, "en", { studioEnabled: true }).studioEnabled).toBe(true);
  });

  it("omits studioEnabled entirely when the flag is off", () => {
    expect(buildShellWorkspace(context, "en", { studioEnabled: false }).studioEnabled).toBeUndefined();
    expect("studioEnabled" in buildShellWorkspace(context, "en")).toBe(false);
  });

  it("keeps the workspace ids the live assistant needs", () => {
    expect(buildShellWorkspace(context, "en").assistant).toEqual({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
