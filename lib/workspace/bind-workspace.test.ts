import { describe, expect, it, vi } from "vitest";
import { bindWorkspaceToUser, type BindWorkspaceInput } from "./bind-workspace";

/**
 * Binding is what turns a staff assignment into a real owner. It runs on every
 * verified sign-in, not only the first, so a merchant who signs in before BD
 * assigns them is picked up on their next visit rather than being stuck in a
 * state nothing re-checks.
 */

function harness(overrides: Partial<BindWorkspaceInput> = {}): BindWorkspaceInput {
  return {
    userId: "user-1",
    verifiedEmail: "owner@example.com",
    bindByEmail: async () => "ws-1",
    ...overrides,
  };
}

describe("bindWorkspaceToUser", () => {
  it("binds the workspace assigned to this verified email", async () => {
    await expect(bindWorkspaceToUser(harness())).resolves.toEqual({
      kind: "bound",
      workspaceId: "ws-1",
    });
  });

  it("passes a normalised email to the write", async () => {
    const bindByEmail = vi.fn(async () => "ws-1");

    await bindWorkspaceToUser(harness({ verifiedEmail: "  Owner@Example.COM ", bindByEmail }));

    // The unique index is on lower(owner_email); a mixed-case session email
    // would otherwise never match the row staff created.
    expect(bindByEmail).toHaveBeenCalledWith("user-1", "owner@example.com");
  });

  it("is a quiet no-op when no workspace is assigned to that email", async () => {
    // The ordinary state of a user with no assignment. Not an error.
    await expect(
      bindWorkspaceToUser(harness({ bindByEmail: async () => null })),
    ).resolves.toEqual({ kind: "none" });
  });

  it("is idempotent across repeated sign-ins, and never throws", async () => {
    // Second sign-in matches zero rows because owner_user_id is no longer null.
    // This is also the lost-race case: when two tabs bind concurrently the
    // loser's conditional update matches nothing and takes exactly this path,
    // which is why losing a race is not an error.
    const bindByEmail = vi.fn(async () => null);
    const input = harness({ bindByEmail });

    await expect(bindWorkspaceToUser(input)).resolves.toEqual({ kind: "none" });
    await expect(bindWorkspaceToUser(input)).resolves.toEqual({ kind: "none" });
    expect(bindByEmail).toHaveBeenCalledTimes(2);
  });

  it("refuses a session with no verified email", async () => {
    const bindByEmail = vi.fn(async () => "ws-1");

    await expect(
      bindWorkspaceToUser(harness({ verifiedEmail: null, bindByEmail })),
    ).resolves.toEqual({ kind: "none" });
    expect(bindByEmail).not.toHaveBeenCalled();
  });

  it("refuses a session with no user id", async () => {
    const bindByEmail = vi.fn(async () => "ws-1");

    await expect(bindWorkspaceToUser(harness({ userId: "  ", bindByEmail }))).resolves.toEqual({
      kind: "none",
    });
    expect(bindByEmail).not.toHaveBeenCalled();
  });

  it("fails closed when the write throws", async () => {
    await expect(
      bindWorkspaceToUser(
        harness({
          bindByEmail: async () => {
            throw new Error("db down");
          },
        }),
      ),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
