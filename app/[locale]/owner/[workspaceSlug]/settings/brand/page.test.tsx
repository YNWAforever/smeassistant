import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ loadOwnerPage: vi.fn(), getBrand: vi.fn() }));
vi.mock("@/lib/workspace/page-context", () => ({ loadOwnerPage: mocks.loadOwnerPage, ownerPageMetadata: vi.fn() }));
vi.mock("@/lib/workspace/brand", () => ({ getBrand: mocks.getBrand }));
vi.mock("@/components/workspace/brand-view", () => ({ BrandView: () => null }));
import Page from "./page";

afterEach(() => vi.clearAllMocks());
it("binds the form identity to the server-authorized actor and workspace", async () => {
  mocks.loadOwnerPage.mockResolvedValue({
    locale: "en", membership: { userId: "server-owner", role: "owner" },
    ctx: { workspace: { id: "server-workspace", timezone: "Asia/Hong_Kong" } },
  });
  mocks.getBrand.mockResolvedValue({ workspaceId: "server-workspace" });
  const element = await Page({ params: Promise.resolve({ locale: "en", workspaceSlug: "untrusted-slug" }) });
  expect(element.props).toMatchObject({ actorId: "server-owner", workspaceId: "server-workspace", role: "owner" });
  expect(mocks.getBrand).toHaveBeenCalledWith("server-workspace");
});
