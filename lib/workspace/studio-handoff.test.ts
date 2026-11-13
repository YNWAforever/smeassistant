import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStudioReturn } from "./studio-handoff";

const chat = "00000000-0000-4000-8000-000000000001";
const location = { id: "location-one", slug: "primary" };
function page(): Parameters<typeof resolveStudioReturn>[0] {
  return {
    membership: { workspaceId: "workspace", workspaceSlug: "shop", userId: "member", email: "owner@example.test", role: "owner", locationScope: null },
    ctx: { workspace: { id: "workspace" }, locations: [location] },
    locationSlug: "primary", query: { from: "studio", chat },
  };
}
const row = { id: chat, workspace_id: "workspace", location_id: location.id, status: "active" };
beforeEach(() => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  vi.stubEnv("CONVERSATION_STUDIO_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("authorized task-to-conversation return", () => {
  it.each(["owner", "manager", "viewer"] as const)("resolves an authorized private/shared conversation for %s", async role => {
    const context = page();
    context.membership.role = role;
    const read = vi.fn().mockResolvedValue(row);
    await expect(resolveStudioReturn(context, location, read)).resolves.toEqual({ conversationId: chat, locationSlug: "primary" });
    expect(read).toHaveBeenCalledWith({ workspaceId: "workspace", actorId: "member", conversationId: chat });
  });
  it.each([undefined, "", "not-a-uuid", "https://other.example/chat"])("does not read malformed chat %s", async value => {
    const context = page(); context.query.chat = value;
    const read = vi.fn();
    expect(await resolveStudioReturn(context, location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["CONVERSATION_HOME_ENABLED", "CONVERSATION_STUDIO_ENABLED"])("does not read while %s is off", async flag => {
    vi.stubEnv(flag, "false"); const read = vi.fn();
    expect(await resolveStudioReturn(page(), location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("does not read without a Studio handoff", async () => {
    const context = page(); delete context.query.from; const read = vi.fn();
    expect(await resolveStudioReturn(context, location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...row, status: "archived" },
    { ...row, workspace_id: "foreign" },
    { ...row, id: "other" },
    { ...row, location_id: "other-branch" },
  ])("rejects missing, revoked, archived or mismatched rows: %j", async value => {
    expect(await resolveStudioReturn(page(), location, vi.fn().mockResolvedValue(value))).toBeNull();
  });
  it("falls back when the repository is unavailable", async () => {
    expect(await resolveStudioReturn(page(), location, vi.fn().mockRejectedValue(new Error("unavailable")))).toBeNull();
  });
  it("resolves all-locations to the task location for a workspace-wide chat", async () => {
    const context = page(); context.locationSlug = "all";
    expect(await resolveStudioReturn(context, location, vi.fn().mockResolvedValue({ ...row, location_id: null })))
      .toEqual({ conversationId: chat, locationSlug: "primary" });
  });
  it("returns to a secondary-location conversation from the all-locations view", async () => {
    const context = page(); context.locationSlug = "all";
    const secondary = { id: "location-two", slug: "secondary" };
    context.ctx.locations.push(secondary);
    expect(await resolveStudioReturn(context, secondary, vi.fn().mockResolvedValue({ ...row, location_id: secondary.id })))
      .toEqual({ conversationId: chat, locationSlug: "secondary" });
  });
  it("rejects a different selected branch before lookup", async () => {
    const context = page(); context.locationSlug = "other-branch"; const read = vi.fn();
    expect(await resolveStudioReturn(context, location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("uses the generic entry for a task without a concrete location", async () => {
    const read = vi.fn();
    expect(await resolveStudioReturn(page(), { id: null, slug: "all" }, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects a task location no longer in the workspace before lookup", async () => {
    const context = page(); context.ctx.locations = []; const read = vi.fn();
    expect(await resolveStudioReturn(context, location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("checks current scoped-manager access and rejects global conversations", async () => {
    const context = page(); context.membership.role = "manager"; context.membership.locationScope = [location.id];
    expect(await resolveStudioReturn(context, location, vi.fn().mockResolvedValue(row))).not.toBeNull();
    expect(await resolveStudioReturn(context, location, vi.fn().mockResolvedValue({ ...row, location_id: null }))).toBeNull();
    context.membership.locationScope = ["other"];
    const read = vi.fn();
    expect(await resolveStudioReturn(context, location, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
