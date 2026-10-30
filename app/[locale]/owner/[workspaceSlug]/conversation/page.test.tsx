// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), actions: vi.fn(), brief: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not_found"); } }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.load, ownerPageMetadata: vi.fn() }));
vi.mock("@/lib/workspace/queries-pages", () => ({ listActions: mocks.actions, getHomeBrief: mocks.brief }));
vi.mock("@/components/workspace/conversation-view", () => ({ ConversationView: (props: unknown) => <pre>{JSON.stringify(props)}</pre> }));
import Page from "./page";
const props = { params: Promise.resolve({ locale: "en", workspaceSlug: "shop" }) };
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL_ENV", undefined); vi.stubEnv("VERCEL", undefined); vi.clearAllMocks();
  mocks.load.mockResolvedValue({ locale: "en", workspaceSlug: "shop", locationSlug: "branch", membership: { userId: "user" }, query: { thread: "t1" }, ctx: { workspace: { id: "ws", name: "Shop", timezone: "Asia/Singapore" }, locations: [{ id: "loc", slug: "branch", name: "Branch" }] } });
  mocks.brief.mockResolvedValue({ openActionCount: 12, openActions: [], month: { awaitingApproval: 3, completed: 2 } });
  mocks.actions.mockResolvedValue({ actions: [{ id: "a1", title: { en: "Real action" }, latestVersion: { id: "v1" } }], hasMore: false });
});
afterEach(() => vi.unstubAllEnvs());
it("returns not found before reading workspace data when flag is off or Production", async () => {
  await expect(Page(props)).rejects.toThrow("not_found");
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true"); vi.stubEnv("VERCEL_ENV", "production");
  await expect(Page(props)).rejects.toThrow("not_found");
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.actions).not.toHaveBeenCalled(); expect(mocks.brief).not.toHaveBeenCalled();
});
it("loads membership-scoped actions and passes only reference labels plus the account/workspace/location scope", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  const html = renderToStaticMarkup(await Page(props));
  expect(mocks.load).toHaveBeenCalledWith(props);
  expect(mocks.actions).toHaveBeenCalledWith(expect.objectContaining({ workspace: { id: "ws", name: "Shop", timezone: "Asia/Singapore" } }), { location: "branch", pageSize: 50 });
  expect(html).toContain("userId"); expect(html).toContain("loc"); expect(html).toContain("Real action"); expect(html).toContain("v1");
});
it("propagates membership failure before reading actions", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true"); mocks.load.mockRejectedValue(new Error("denied"));
  await expect(Page(props)).rejects.toThrow("denied"); expect(mocks.actions).not.toHaveBeenCalled(); expect(mocks.brief).not.toHaveBeenCalled();
});

it("reuses the location-scoped Today brief and passes only task activity counts", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  const element = await Page(props);
  expect(mocks.brief).toHaveBeenCalledWith(expect.objectContaining({ workspace: { id: "ws", name: "Shop", timezone: "Asia/Singapore" } }), "branch");
  expect(element.props.today).toEqual({ open: 12, drafts: 3, completed: 2 });
  expect(element.props.timezone).toBe("Asia/Singapore");
});

it("keeps local work available without substituting zero when the Today brief fails", async () => {
  vi.stubEnv("CONVERSATION_HOME_ENABLED", "true");
  mocks.brief.mockRejectedValue(new Error("unavailable"));
  const element = await Page(props);
  expect(element.props.today).toBeUndefined();
  expect(element.props.actions).toEqual([{ id: "a1", title: "Real action", versionId: "v1" }]);
});
