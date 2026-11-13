import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), detail: vi.fn(), resolve: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not_found"); } }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.load, ownerPageMetadata: vi.fn() }));
vi.mock("@/lib/workspace/action-detail-props", () => ({ loadActionDetailProps: mocks.detail }));
vi.mock("@/lib/workspace/studio-handoff", () => ({ resolveStudioReturn: mocks.resolve }));
vi.mock("@/components/workspace/action-detail-view", () => ({ ActionDetailView: () => null }));
import Page from "./page";

const location = { id: "location", slug: "primary" };
const context = { query: { from: "studio", chat: "chat" } };
const props = {
  params: Promise.resolve({ locale: "en", workspaceSlug: "shop", actionId: "action" }),
  searchParams: Promise.resolve({ from: ["studio", "ignored"], version: ["version", "ignored"], chat: ["chat", "ignored"] }),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue(context);
  mocks.detail.mockResolvedValue({ detail: { action: { location } } });
  mocks.resolve.mockResolvedValue({ conversationId: "chat", locationSlug: "primary" });
});
it("passes only resolved return context after loading the exact version and authorized action", async () => {
  const element = await Page(props);
  expect(mocks.detail).toHaveBeenCalledWith(context, "action", "version");
  expect(mocks.resolve).toHaveBeenCalledWith(context, location);
  expect(element.props).toMatchObject({ studioHandoff: true, studioReturn: { conversationId: "chat", locationSlug: "primary" } });
});
it("keeps the generic handoff when authorization supplies no return context", async () => {
  mocks.resolve.mockResolvedValue(null);
  expect((await Page(props)).props).toMatchObject({ studioHandoff: true, studioReturn: null });
});
it("never resolves conversation context for an unavailable action", async () => {
  mocks.detail.mockResolvedValue(null);
  await expect(Page(props)).rejects.toThrow("not_found");
  expect(mocks.resolve).not.toHaveBeenCalled();
});
it("never loads action or chat context when current membership is denied", async () => {
  mocks.load.mockRejectedValue(new Error("membership_denied"));
  await expect(Page(props)).rejects.toThrow("membership_denied");
  expect(mocks.detail).not.toHaveBeenCalled();
  expect(mocks.resolve).not.toHaveBeenCalled();
});
